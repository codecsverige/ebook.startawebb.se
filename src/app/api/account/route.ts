import { z } from "zod";
import { requireUser, adminClient } from "@/lib/supabase";
import {
  assertOrigin,
  readJson,
  apiError,
  json,
  dbError,
  AppError,
} from "@/lib/http";

export async function DELETE(request: Request) {
  try {
    assertOrigin(request);
    const { user, db: session } = await requireUser();
    await readJson(request, z.object({ confirm: z.literal("DELETE") }), 1000);
    const db = adminClient();
    const { data: active, error } = await db
      .from("jobs")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["queued", "running"])
      .limit(1);
    dbError(error);
    if (active?.length) throw new AppError("busy", 409);
    const { data: books, error: bError } = await db
      .from("books")
      .select("id")
      .eq("user_id", user.id);
    dbError(bError);
    for (const book of books ?? []) {
      const prefix = `${user.id}/${book.id}`;
      const { data: files, error: fError } = await db.storage
        .from("covers")
        .list(prefix, { limit: 100 });
      dbError(fError);
      if (files?.length) {
        const { error: removeError } = await db.storage
          .from("covers")
          .remove(files.map((f) => `${prefix}/${f.name}`));
        dbError(removeError);
      }
    }
    const { error: deleteError } = await db.auth.admin.deleteUser(user.id);
    dbError(deleteError);
    await session.auth.signOut();
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
