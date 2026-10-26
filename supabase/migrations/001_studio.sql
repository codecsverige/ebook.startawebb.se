-- Run once in a NEW Supabase project. Never run against another app's database.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  credits integer not null default 0,
  free_book_id uuid,
  created_at timestamptz not null default now()
);
create table public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea text not null check (length(idea) between 20 and 2000),
  audience text not null check (length(audience) between 3 and 300),
  kind text not null check (kind in ('guide','ebook','workbook')),
  language text not null check (language in ('en','ar','sv')),
  tone text not null check (tone in ('clear','friendly','professional')),
  author text not null default '' check (length(author) <= 100),
  chapter_count integer not null check (chapter_count between 3 and 10),
  title text not null default '' check (length(title) <= 180),
  subtitle text not null default '' check (length(subtitle) <= 240),
  outline jsonb not null default '[]'::jsonb,
  chapters jsonb not null default '{}'::jsonb,
  cover_style text not null default 'cobalt' check (cover_style in ('cobalt','sage','clay')),
  cover_path text,
  use_artwork boolean not null default true,
  unlocked boolean not null default false,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index books_user_updated on public.books(user_id, updated_at desc);
-- free_book_id deliberately has no cascade: deleting a book must not reset a free trial.
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('outline','sample','book','chapter','cover')),
  chapter_id uuid,
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  progress integer not null default 0 check (progress between 0 and 100),
  error_code text,
  run_id text,
  result_units jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, request_id)
);
create unique index one_active_job_per_book on public.jobs(book_id) where status in ('queued','running');
create index jobs_user_date on public.jobs(user_id, created_at desc);
create table public.book_versions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index versions_book_date on public.book_versions(book_id, created_at desc);
create table public.rate_limits (
  key text primary key, hits integer not null default 1, expires_at timestamptz not null
);
create index rate_expiry on public.rate_limits(expires_at);
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  operation text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index usage_book on public.ai_usage(book_id, created_at);
create table public.orders (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  credits integer not null check (credits in (1,3)),
  status text not null check (status in ('paid','refunded')),
  test_mode boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.on_signup() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles(id) values (new.id) on conflict do nothing; return new; end;
$$;
create trigger create_profile after insert on auth.users for each row execute function public.on_signup();

alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.jobs enable row level security;
alter table public.book_versions enable row level security;
alter table public.ai_usage enable row level security;
alter table public.orders enable row level security;
alter table public.rate_limits enable row level security;
-- Clients can only read their records. All writes go through authenticated server routes.
revoke all on public.profiles, public.books, public.jobs, public.book_versions, public.ai_usage, public.orders, public.rate_limits from anon, authenticated;
grant select on public.profiles, public.books, public.jobs, public.book_versions to authenticated;
create policy own_profile on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy own_books on public.books for select to authenticated using ((select auth.uid()) = user_id);
create policy own_jobs on public.jobs for select to authenticated using ((select auth.uid()) = user_id);
create policy own_versions on public.book_versions for select to authenticated using ((select auth.uid()) = user_id);
grant all on public.profiles, public.books, public.jobs, public.book_versions, public.ai_usage, public.orders, public.rate_limits to service_role;

create function public.take_rate(p_key text, p_limit integer, p_seconds integer) returns void language plpgsql security definer set search_path = public as $$
declare v_hits integer; v_key text;
begin
  v_key := p_key || ':' || floor(extract(epoch from now()) / p_seconds)::text;
  insert into public.rate_limits(key, expires_at) values (v_key, now() + make_interval(secs => p_seconds))
  on conflict(key) do update set hits = rate_limits.hits + 1 returning hits into v_hits;
  if v_hits > p_limit then raise exception 'rate_limit'; end if;
  delete from public.rate_limits where key in (select key from public.rate_limits where expires_at < now() - interval '1 day' limit 100);
end;
$$;

create function public.create_book(p_user uuid, p_brief jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform 1 from public.profiles where id = p_user for update;
  if (select count(*) from public.books where user_id = p_user) >= 30 then raise exception 'rate_limit'; end if;
  insert into public.books(user_id,idea,audience,kind,language,tone,author,chapter_count)
  values(p_user,p_brief->>'idea',p_brief->>'audience',p_brief->>'kind',p_brief->>'language',p_brief->>'tone',coalesce(p_brief->>'author',''),(p_brief->>'chapter_count')::integer)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.save_book(p_user uuid, p_book uuid, p_edit jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.books;
begin
  select * into b from public.books where id=p_book and user_id=p_user for update;
  if not found then raise exception 'not_found'; end if;
  if exists(select 1 from public.jobs where book_id=p_book and status in ('queued','running')) then raise exception 'busy'; end if;
  if b.revision <> (p_edit->>'revision')::integer then raise exception 'conflict'; end if;
  if jsonb_array_length(p_edit->'outline') <> b.chapter_count then raise exception 'invalid_input'; end if;
  if exists(select 1 from jsonb_array_elements(p_edit->'outline') c where not exists(select 1 from jsonb_array_elements(b.outline) old where old->>'id'=c->>'id')) then raise exception 'invalid_input'; end if;
  insert into public.book_versions(book_id,user_id,snapshot) values(p_book,p_user,to_jsonb(b));
  update public.books set title=p_edit->>'title',subtitle=p_edit->>'subtitle',author=p_edit->>'author',cover_style=p_edit->>'cover_style',use_artwork=(p_edit->>'use_artwork')::boolean,outline=p_edit->'outline',chapters=p_edit->'chapters',revision=revision+1,updated_at=now() where id=p_book returning * into b;
  delete from public.book_versions where id in (select id from public.book_versions where book_id=p_book order by created_at desc offset 20);
  return to_jsonb(b);
end;
$$;

create function public.prepare_job(p_user uuid, p_book uuid, p_kind text, p_chapter uuid, p_request uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.books; p public.profiles; j public.jobs; n integer;
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
  if not b.unlocked then
    if p_kind in ('book','chapter','cover') or (p_kind='outline' and p.free_book_id is not null and p.free_book_id<>p_book) then
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

-- Reserve an AI call BEFORE contacting the provider, even when a provider fails.
-- This prevents retries and failures from escaping per-book and daily quotas.
create function public.reserve_ai(p_job uuid,p_operation text,p_model text) returns uuid language plpgsql security definer set search_path=public as $$
declare j public.jobs; v_id uuid; b public.books;
begin
  select * into j from public.jobs where id=p_job;
  if not found or j.status not in ('queued','running') then raise exception 'not_found'; end if;
  perform 1 from public.profiles where id=j.user_id for update;
  select * into b from public.books where id=j.book_id;
  if (select count(*) from public.ai_usage where user_id=j.user_id and created_at>now()-interval '1 day')>=100 then raise exception 'rate_limit'; end if;
  if (select count(*) from public.ai_usage where book_id=j.book_id)>=(case when b.unlocked then 80 else 8 end) then raise exception 'rate_limit'; end if;
  perform public.take_rate('ai-global',500,86400);
  insert into public.ai_usage(user_id,book_id,job_id,operation,model) values(j.user_id,j.book_id,p_job,p_operation,p_model) returning id into v_id;
  return v_id;
end;
$$;

-- A generated update and its previous version are committed atomically.
create function public.commit_generated(p_job uuid,p_patch jsonb,p_progress integer) returns void language plpgsql security definer set search_path=public as $$
declare j public.jobs; b public.books; v_chapter text; v_unit text;
begin
  select * into j from public.jobs where id=p_job for update;
  if not found or j.status not in ('queued','running') then raise exception 'not_found'; end if;
  v_unit:=case when p_patch ? 'outline' then 'outline' when p_patch ? 'chapter_id' then p_patch->>'chapter_id' else 'cover' end;
  if j.result_units ? v_unit then return; end if;
  select * into b from public.books where id=j.book_id for update;
  insert into public.book_versions(book_id,user_id,snapshot) values(b.id,b.user_id,to_jsonb(b));
  if p_patch ? 'outline' then
    update public.books set title=p_patch->>'title',subtitle=p_patch->>'subtitle',outline=p_patch->'outline',revision=revision+1,updated_at=now() where id=b.id;
  elsif p_patch ? 'chapter_id' then
    v_chapter:=p_patch->>'chapter_id';
    update public.books set chapters=jsonb_set(chapters,array[v_chapter],p_patch->'chapter',true),revision=revision+1,updated_at=now() where id=b.id;
  elsif p_patch ? 'cover_path' then
    update public.books set cover_path=p_patch->>'cover_path',use_artwork=true,revision=revision+1,updated_at=now() where id=b.id;
  end if;
  update public.jobs set progress=p_progress,status='running',result_units=jsonb_set(result_units,array[v_unit],'true'::jsonb,true),updated_at=now() where id=p_job;
  delete from public.book_versions where id in (select id from public.book_versions where book_id=b.id order by created_at desc offset 20);
end;
$$;

create function public.claim_job(p_job uuid,p_run text) returns boolean language plpgsql security definer set search_path=public as $$
declare j public.jobs;
begin
  select * into j from public.jobs where id=p_job for update;
  if not found or j.status not in ('queued','running') then return false; end if;
  if j.run_id is not null and j.run_id<>p_run then return false; end if;
  update public.jobs set run_id=p_run,status='running',updated_at=now() where id=p_job;
  return true;
end;
$$;

create function public.apply_order(p_order text,p_user uuid,p_credits integer,p_refunded boolean,p_test boolean) returns void language plpgsql security definer set search_path=public as $$
declare o public.orders;
begin
  -- Serialize both out-of-order events and duplicate deliveries for this order.
  perform pg_advisory_xact_lock(hashtextextended(p_order,0));
  select * into o from public.orders where id=p_order for update;
  if found then
    if o.credits<>p_credits or o.test_mode<>p_test or (o.user_id is not null and o.user_id<>p_user) then raise exception 'invalid_input'; end if;
    if p_refunded and o.status='paid' then
      update public.profiles set credits=credits-o.credits where id=o.user_id;
      update public.orders set status='refunded',updated_at=now() where id=p_order;
    end if;
    return;
  end if;
  if not exists(select 1 from public.profiles where id=p_user) then raise exception 'not_found'; end if;
  insert into public.orders(id,user_id,credits,status,test_mode) values(p_order,p_user,p_credits,case when p_refunded then 'refunded' else 'paid' end,p_test);
  if not p_refunded then update public.profiles set credits=credits+p_credits where id=p_user; end if;
end;
$$;

revoke all on function public.on_signup() from public, anon, authenticated;
revoke all on function public.take_rate(text,integer,integer) from public,anon,authenticated;
revoke all on function public.create_book(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.save_book(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.prepare_job(uuid,uuid,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.reserve_ai(uuid,text,text) from public,anon,authenticated;
revoke all on function public.commit_generated(uuid,jsonb,integer) from public,anon,authenticated;
revoke all on function public.apply_order(text,uuid,integer,boolean,boolean) from public,anon,authenticated;
revoke all on function public.claim_job(uuid,text) from public,anon,authenticated;
grant execute on function public.take_rate(text,integer,integer), public.create_book(uuid,jsonb), public.save_book(uuid,uuid,jsonb), public.prepare_job(uuid,uuid,text,uuid,uuid), public.reserve_ai(uuid,text,text), public.commit_generated(uuid,jsonb,integer), public.apply_order(text,uuid,integer,boolean,boolean), public.claim_job(uuid,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('covers','covers',false,10485760,array['image/png','image/jpeg','image/webp']) on conflict do nothing;
-- No public storage policies: short-lived signed URLs are issued after ownership checks.
commit;
