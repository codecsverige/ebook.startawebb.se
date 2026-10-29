import { requireUser } from "@/lib/firebase-session";
import { studioStore } from "@/lib/firebase-admin";
import { ownedBook, takeRate, coverArtwork } from "@/lib/books";
import { isComplete, filename } from "@/lib/domain";
import { makePdf, makeDocx } from "@/lib/export";
import { makeEpub } from "@/lib/epub";
import { exportIllustrations } from "@/lib/illustration-export";
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
    if (format !== "pdf" && format !== "docx" && format !== "epub")
      throw new AppError("invalid_input");
    await takeRate(`export:${user.id}`, 20);
    const job = await studioStore().latestJob(id);
    if (job && ["queued", "running"].includes(job.status))
      throw new AppError("busy", 409);
    const preview = format === "pdf" && new URL(request.url).searchParams.get("preview") === "1";
    const [artwork, backArtwork, images] = await Promise.all([
      book.use_artwork ? coverArtwork(book) : Promise.resolve(undefined),
      book.back_cover_path ? coverArtwork(book, false, "back") : Promise.resolve(undefined),
      exportIllustrations(book),
    ]);
    const data =
      format === "pdf"
        ? await makePdf(book, artwork, images, backArtwork)
        : format === "docx"
          ? await makeDocx(book, artwork, images, backArtwork)
          : makeEpub(book, artwork, images, backArtwork);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type":
          format === "pdf"
            ? "application/pdf"
            : format === "docx"
              ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              : "application/epub+zip",
        "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="ebook.${format}"; filename*=UTF-8''${encodeURIComponent(filename(book.title))}.${format}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
