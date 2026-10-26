import { requireUser } from "@/lib/supabase";
import { ownedBook } from "@/lib/books";
import { apiError, json, dbError } from "@/lib/http";

export async function GET(
  _: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { user, db } = await requireUser();
    const { id } = await ctx.params;
    await ownedBook(id, user.id);
    const { data, error } = await db
      .from("book_versions")
      .select("id,created_at,snapshot")
      .eq("book_id", id)
      .order("created_at", { ascending: false })
      .limit(20);
    dbError(error);
    return json({ versions: data ?? [] });
  } catch (e) {
    return apiError(e);
  }
}
