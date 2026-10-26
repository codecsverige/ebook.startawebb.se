import { requireUser } from "@/lib/firebase-session";
import { studioStore } from "@/lib/firebase-admin";
import { ownedBook, takeRate, coverArtwork } from "@/lib/books";
import { isComplete, filename } from "@/lib/domain";
import { makePdf, makeDocx } from "@/lib/export";
import { apiError, AppError } from "@/lib/http";
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
    const job = await studioStore().latestJob(id);
    if (job && ["queued", "running"].includes(job.status))
      throw new AppError("busy", 409);
    const artwork = book.use_artwork ? await coverArtwork(book) : undefined;
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
