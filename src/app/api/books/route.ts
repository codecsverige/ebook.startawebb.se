import { requireUser, adminClient } from "@/lib/supabase";
import { assertOrigin, readJson, apiError, json, dbError } from "@/lib/http";
import { briefSchema, type Book } from "@/lib/domain";
import { withCover, takeRate } from "@/lib/books";

export async function GET() {
  try {
    const { user, db } = await requireUser();
    const [{ data: books, error }, { data: profile, error: pError }] =
      await Promise.all([
        db
          .from("books")
          .select("*")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(30),
        db
          .from("profiles")
          .select("credits,free_book_id")
          .eq("id", user.id)
          .single(),
      ]);
    dbError(error);
    dbError(pError);
    return json({
      books: await Promise.all(((books ?? []) as Book[]).map(withCover)),
      credits: profile?.credits ?? 0,
      free_book_id: profile?.free_book_id ?? null,
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { user } = await requireUser();
    const brief = await readJson(request, briefSchema, 6000);
    await takeRate(`create:${user.id}`, 10);
    const { data, error } = await adminClient().rpc("create_book", {
      p_user: user.id,
      p_brief: brief,
    });
    dbError(error);
    return json({ id: data }, 201);
  } catch (e) {
    return apiError(e);
  }
}
