import { requireUser } from "@/lib/firebase-session";
import { studioStore } from "@/lib/firebase-admin";
import { ownedBook, takeRate, coverArtwork } from "@/lib/books";
import { isComplete, filename } from "@/lib/domain";
import { makePdf, makeDocx, makeCoverImages } from "@/lib/export";
import { makeEpub } from "@/lib/epub";
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
    const format = new URL(request.url).searchParams.get("format");
    if (
      format !== "pdf" &&
      format !== "docx" &&
      format !== "epub" &&
      format !== "cover" &&
      format !== "back-cover"
    )
      throw new AppError("invalid_input");
    const coverOnly = format === "cover" || format === "back-cover";
    if (!book.unlocked || (coverOnly ? !book.title : !isComplete(book)))
      throw new AppError("incomplete");
    if (format === "back-cover" && !book.settings?.back_cover)
      throw new AppError("invalid_input");
    await takeRate(`export:${user.id}`, 20);
    const job = await studioStore().latestJob(id);
    if (job && ["queued", "running"].includes(job.status))
      throw new AppError("busy", 409);
    const artwork = book.use_artwork ? await coverArtwork(book) : undefined;
    const data = coverOnly
      ? (await makeCoverImages(book, artwork))[format === "back-cover" ? 1 : 0]
      : format === "pdf"
        ? await makePdf(book, artwork)
        : format === "docx"
          ? await makeDocx(book, artwork)
          : makeEpub(book, artwork, await makeCoverImages(book, artwork));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": coverOnly
          ? "image/png"
          : format === "pdf"
            ? "application/pdf"
            : format === "docx"
              ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              : "application/epub+zip",
        "Content-Disposition": `attachment; filename="ebook.${coverOnly ? "png" : format}"; filename*=UTF-8''${encodeURIComponent(filename(book.title) + (coverOnly ? "-" + format : ""))}.${coverOnly ? "png" : format}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
