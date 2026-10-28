import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/firebase-session";
import { studioStore, studioBucket } from "@/lib/firebase-admin";
import { ownedBook, coverPrefix, withCover, takeRate } from "@/lib/books";
import { assertOrigin, apiError, AppError, json } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
const maxBytes = 3_000_000;
const types: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
function validSignature(bytes: Buffer, mime: string): boolean {
  if (mime === "image/png")
    return bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  if (mime === "image/jpeg")
    return bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"));
  return bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";
}
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertOrigin(request);
    const { user } = await requireUser();
    const { id } = await ctx.params;
    const book = await ownedBook(id, user.id);
    if (!book.unlocked) throw new AppError("insufficient_credits", 402);
    const mime = (request.headers.get("content-type") || "").split(";")[0].trim();
    if (!types[mime]) throw new AppError("invalid_input", 400);
    const declared = Number(request.headers.get("content-length") || "0");
    if (declared > maxBytes) throw new AppError("too_large", 413);
    await takeRate("cover-upload:" + user.id, 5);
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("invalid_input", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new AppError("too_large", 413);
      }
      chunks.push(value);
    }
    const data = Buffer.concat(chunks);
    if (data.length < 16 || !validSignature(data, mime))
      throw new AppError("invalid_input", 400);
    const path = coverPrefix(user.id, id) + "upload-" + randomUUID() + "." + types[mime];
    const storageFile = studioBucket().file(path);
    await storageFile.save(data, {
      resumable: false,
      metadata: { contentType: mime, cacheControl: "private, no-store" },
    });
    try {
      const saved = await studioStore().setUploadedCover(user.id, id, path);
      return json({ book: await withCover(saved) });
    } catch (error) {
      await storageFile.delete().catch(() => {});
      throw error;
    }
  } catch (error) {
    return apiError(error);
  }
}
