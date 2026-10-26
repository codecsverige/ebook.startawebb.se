import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("PostgreSQL migration: ownership, free trial, atomic credits, jobs, versions and refunds", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
      create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    const migrationDirectory = new URL(
      "../supabase/migrations/",
      import.meta.url,
    );
    for (const name of (await readdir(migrationDirectory))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      await db.exec(await readFile(new URL(name, migrationDirectory), "utf8"));
    }
    const u = "00000000-0000-4000-8000-000000000001";
    const other = "00000000-0000-4000-8000-000000000002";
    await db.query("insert into auth.users(id) values($1),($2)", [u, other]);
    const scalar = async <T>(sql: string, params: unknown[] = []) => {
      const r = await db.query<{ v: T }>(sql, params);
      return r.rows[0]?.v;
    };
    const brief = {
      idea: "A practical guide for improving daily attention.",
      audience: "Freelancers",
      kind: "guide",
      language: "en",
      tone: "clear",
      author: "",
      chapter_count: 3,
    };
    const book = await scalar<string>(
      "select public.create_book($1,$2::jsonb) as v",
      [u, JSON.stringify(brief)],
    );
    const book2 = await scalar<string>(
      "select public.create_book($1,$2::jsonb) as v",
      [u, JSON.stringify(brief)],
    );
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${other}',false);`,
    );
    assert.equal(
      await scalar<number>("select count(*)::integer as v from public.books"),
      0,
    );
    await assert.rejects(
      db.query("update public.profiles set credits=1000 where id=$1", [other]),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        "select public.prepare_job($1,$2,'outline',null,gen_random_uuid())",
        [other, book],
      ),
      /permission denied/,
    );
    await db.exec("reset role");
    const requestId = "00000000-0000-4000-8000-000000000010";
    const j = await scalar<{ id: string }>(
      "select public.prepare_job($1,$2,'outline',null,$3) as v",
      [u, book, requestId],
    );
    assert.equal(
      await scalar("select public.claim_job($1,'run-first') as v", [j.id]),
      true,
    );
    assert.equal(
      await scalar("select public.claim_job($1,'run-duplicate') as v", [j.id]),
      false,
    );
    const outline = [1, 2, 3].map((n) => ({
      id: `00000000-0000-4000-8000-00000000002${n}`,
      title: `Chapter ${n}`,
      summary: "A specific useful summary.",
    }));
    const patch = JSON.stringify({
      title: "Test book",
      subtitle: "A subtitle",
      outline,
    });
    await db.query("select public.commit_generated($1,$2::jsonb,95)", [
      j.id,
      patch,
    ]);
    await db.query("select public.commit_generated($1,$2::jsonb,95)", [
      j.id,
      patch,
    ]);
    assert.equal(
      await scalar<number>(
        "select revision as v from public.books where id=$1",
        [book],
      ),
      1,
    );
    await db.query("update public.jobs set status='completed' where id=$1", [
      j.id,
    ]);
    await assert.rejects(
      db.query(
        "select public.prepare_job($1,$2,'outline',null,gen_random_uuid())",
        [u, book2],
      ),
      /insufficient_credits/,
    );
    await db.query("select public.apply_order('order-1',$1,3,false,false)", [
      u,
    ]);
    await db.query("select public.apply_order('order-1',$1,3,false,false)", [
      u,
    ]);
    assert.equal(
      await scalar("select credits as v from public.profiles where id=$1", [u]),
      3,
    );
    const req2 = "00000000-0000-4000-8000-000000000011";
    const paid = await scalar<{ id: string }>(
      "select public.prepare_job($1,$2,'book',null,$3) as v",
      [u, book, req2],
    );
    const repeat = await scalar<{ id: string }>(
      "select public.prepare_job($1,$2,'book',null,$3) as v",
      [u, book, req2],
    );
    assert.equal(paid.id, repeat.id);
    assert.equal(
      await scalar("select credits as v from public.profiles where id=$1", [u]),
      2,
    );
    const edit = {
      revision: 2,
      title: "Edited book",
      subtitle: "",
      author: "",
      cover_style: "sage",
      use_artwork: true,
      outline,
      chapters: {},
    };
    await assert.rejects(
      db.query("select public.save_book($1,$2,$3::jsonb)", [
        u,
        book,
        JSON.stringify(edit),
      ]),
      /busy/,
    );
    await assert.rejects(
      db.query(
        "select public.prepare_job($1,$2,'book',null,gen_random_uuid())",
        [u, book],
      ),
      /busy/,
    );
    await db.query("update public.jobs set status='failed' where id=$1", [
      paid.id,
    ]);
    await db.query("select public.save_book($1,$2,$3::jsonb)", [
      u,
      book,
      JSON.stringify(edit),
    ]);
    await assert.rejects(
      db.query("select public.save_book($1,$2,$3::jsonb)", [
        u,
        book,
        JSON.stringify(edit),
      ]),
      /conflict/,
    );
    assert.ok(
      (await scalar<number>(
        "select count(*)::integer as v from public.book_versions where book_id=$1",
        [book],
      )) >= 2,
    );
    // Reopening a failed generation uses the existing book entitlement.
    await db.query(
      "select public.prepare_job($1,$2,'book',null,gen_random_uuid())",
      [u, book],
    );
    assert.equal(
      await scalar("select credits as v from public.profiles where id=$1", [u]),
      2,
    );
    await db.query("select public.apply_order('order-1',$1,3,true,false)", [u]);
    await db.query("select public.apply_order('order-1',$1,3,true,false)", [u]);
    assert.equal(
      await scalar("select credits as v from public.profiles where id=$1", [u]),
      -1,
    );
    await db.query("select public.apply_order('order-1',$1,3,false,false)", [
      u,
    ]);
    assert.equal(
      await scalar("select credits as v from public.profiles where id=$1", [u]),
      -1,
    );
    // A refund arriving before the paid event cannot mint credits later.
    await db.query("select public.apply_order('order-2',$1,1,true,false)", [u]);
    await db.query("select public.apply_order('order-2',$1,1,false,false)", [
      u,
    ]);
    assert.equal(
      await scalar("select credits as v from public.profiles where id=$1", [u]),
      -1,
    );
    await db.query("select public.take_rate('test',1,3600)");
    await assert.rejects(
      db.query("select public.take_rate('test',1,3600)"),
      /rate_limit/,
    );
    // A purchased credit recovers the SAME draft after free provider failures.
    const exhaustedBook = await scalar<string>(
      "select public.create_book($1,$2::jsonb) as v",
      [other, JSON.stringify(brief)],
    );
    const freeJob = await scalar<{ id: string }>(
      "select public.prepare_job($1,$2,'outline',null,gen_random_uuid()) as v",
      [other, exhaustedBook],
    );
    for (let i = 0; i < 8; i++)
      await db.query("select public.reserve_ai($1,'outline','test/model')", [
        freeJob.id,
      ]);
    await assert.rejects(
      db.query("select public.reserve_ai($1,'outline','test/model')", [
        freeJob.id,
      ]),
      /rate_limit/,
    );
    await db.query("update public.jobs set status='failed' where id=$1", [
      freeJob.id,
    ]);
    await assert.rejects(
      db.query(
        "select public.prepare_job($1,$2,'outline',null,gen_random_uuid())",
        [other, exhaustedBook],
      ),
      /insufficient_credits/,
    );
    await db.query(
      "select public.apply_order('recovery-order',$1,1,false,false)",
      [other],
    );
    const recoveryRequest = "00000000-0000-4000-8000-000000000099";
    const recoveryJob = await scalar<{ id: string }>(
      "select public.prepare_job($1,$2,'outline',null,$3) as v",
      [other, exhaustedBook, recoveryRequest],
    );
    await db.query("select public.prepare_job($1,$2,'outline',null,$3)", [
      other,
      exhaustedBook,
      recoveryRequest,
    ]);
    assert.equal(
      await scalar("select credits as v from public.profiles where id=$1", [
        other,
      ]),
      0,
    );
    assert.equal(
      await scalar("select unlocked as v from public.books where id=$1", [
        exhaustedBook,
      ]),
      true,
    );
    await db.query("select public.reserve_ai($1,'outline','test/model')", [
      recoveryJob.id,
    ]);
  } finally {
    await db.close();
  }
});
