-- Upgrade preserves existing data and the lifetime free-preview allowance.
begin;
create or replace function public.prepare_job(p_user uuid, p_book uuid, p_kind text, p_chapter uuid, p_request uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.books; p public.profiles; j public.jobs; v_preview_exhausted boolean;
begin
  select * into p from public.profiles where id=p_user for update;
  select * into j from public.jobs where user_id=p_user and request_id=p_request;
  if found then
    if j.book_id<>p_book or j.kind<>p_kind or j.chapter_id is distinct from p_chapter then raise exception 'invalid_input'; end if;
    return to_jsonb(j);
  end if;
  select * into b from public.books where id=p_book and user_id=p_user for update;
  if not found then raise exception 'not_found'; end if;
  if exists(select 1 from public.jobs where book_id=p_book and status in ('queued','running')) then raise exception 'busy'; end if;
  if (select count(*) from public.jobs where user_id=p_user and created_at>now()-interval '1 day') >= 30 then raise exception 'rate_limit'; end if;
  if p_kind='outline' and jsonb_array_length(b.outline)>0 then raise exception 'invalid_input'; end if;
  if p_kind<>'outline' and jsonb_array_length(b.outline)=0 then raise exception 'no_outline'; end if;
  if p_kind='sample' and b.chapters ? (b.outline->0->>'id') then raise exception 'invalid_input'; end if;
  if p_kind='chapter' and not exists(select 1 from jsonb_array_elements(b.outline) c where c->>'id'=p_chapter::text) then raise exception 'invalid_input'; end if;
  v_preview_exhausted := (select count(*) from public.ai_usage where book_id=p_book)>=8;
  if not b.unlocked then
    if p_kind in ('book','chapter','cover') or v_preview_exhausted or (p_kind='outline' and p.free_book_id is not null and p.free_book_id<>p_book) then
      if p.credits<1 then raise exception 'insufficient_credits'; end if;
      update public.profiles set credits=credits-1 where id=p_user;
      update public.books set unlocked=true,revision=revision+1,updated_at=now() where id=p_book;
    elsif p.free_book_id is null then
      update public.profiles set free_book_id=p_book where id=p_user;
    elsif p.free_book_id<>p_book then raise exception 'free_preview_used';
    end if;
  end if;
  if p_kind='cover' and (select count(*) from public.jobs where book_id=p_book and kind='cover' and status='completed')>=2 then raise exception 'rate_limit'; end if;
  if p_kind='chapter' and (select count(*) from public.jobs where book_id=p_book and kind='chapter' and chapter_id=p_chapter and status='completed')>=3 then raise exception 'rate_limit'; end if;
  if (select count(*) from public.jobs where book_id=p_book)>=50 then raise exception 'rate_limit'; end if;
  insert into public.jobs(request_id,book_id,user_id,kind,chapter_id) values(p_request,p_book,p_user,p_kind,p_chapter) returning * into j;
  return to_jsonb(j);
end;
$$;
revoke all on function public.prepare_job(uuid,uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_job(uuid,uuid,text,uuid,uuid) to service_role;
commit;
