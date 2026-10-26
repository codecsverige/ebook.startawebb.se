import { requireUser, adminClient } from "@/lib/supabase";
import { ownedBook, takeRate } from "@/lib/books";
import { isComplete, filename } from "@/lib/domain";
import { makePdf, makeDocx } from "@/lib/export";
import { apiError, AppError, dbError } from "@/lib/http";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireUser();
    const { id } = await ctx.params;
    const book = await ownedBook(id, user.id);
    if (!book.unlocked || !isComplete(book)) throw new AppError("incomplete");
    const format = new URL(request.url).searchParams.get("format");
    if (format !== "pdf" && format !== "docx")
      throw new AppError("invalid_input");
    await takeRate(`export:${user.id}`, 20);
    const db = adminClient();
    const { data: active, error } = await db
      .from("jobs")
      .select("id")
      .eq("book_id", id)
      .in("status", ["queued", "running"])
      .limit(1);
    dbError(error);
    if (active?.length) throw new AppError("busy", 409);
    let artwork: { data: Uint8Array; type: string } | undefined;
    if (book.cover_path && book.use_artwork) {
      const { data, error } = await db.storage
        .from("covers")
        .download(book.cover_path);
      dbError(error);
      if (data)
        artwork = {
          data: new Uint8Array(await data.arrayBuffer()),
          type: data.type,
        };
    }
    const data =
      format === "pdf"
        ? await makePdf(book, artwork)
        : await makeDocx(book, artwork);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type":
          format === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="ebook.${format}"; filename*=UTF-8''${encodeURIComponent(filename(book.title))}.${format}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
