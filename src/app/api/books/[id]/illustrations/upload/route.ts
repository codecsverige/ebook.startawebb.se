import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/firebase-session";
import { studioStore, studioBucket } from "@/lib/firebase-admin";
import { ownedBook, illustrationPrefix, takeRate, withCover } from "@/lib/books";
import { apiError, AppError, assertOrigin, json } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
const MAX_IMAGE = 3_000_000;
const extensions: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
};
function validImageSignature(bytes: Buffer, mime: string): boolean {
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  if (mime === "image/jpeg") return bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"));
  if (mime === "image/webp") return bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";
  return false;
}
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertOrigin(request);
    const { user } = await requireUser();
    const { id } = await ctx.params;
    const params = new URL(request.url).searchParams;
    const input = z.object({
      revision: z.coerce.number().int().nonnegative(),
      chapter_id: z.string().uuid(),
      position: z.coerce.number().int().nonnegative().max(30000),
      size: z.enum(["small", "medium", "full"]).default("medium"),
      caption: z.string().trim().max(240).default(""),
    }).safeParse(Object.fromEntries(params.entries()));
    if (!input.success) throw new AppError("invalid_input");
    const book = await ownedBook(id, user.id);
    if (!book.unlocked) throw new AppError("insufficient_credits", 402);
    const mime = (request.headers.get("content-type") || "").split(";")[0].trim();
    if (!extensions[mime]) throw new AppError("invalid_input");
    if (Number(request.headers.get("content-length") || 0) > MAX_IMAGE)
      throw new AppError("too_large", 413);
    await takeRate("illustration-upload:" + user.id, 25);
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("invalid_input");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_IMAGE) {
        await reader.cancel();
        throw new AppError("too_large", 413);
      }
      chunks.push(value);
    }
    const data = Buffer.concat(chunks);
    if (data.length < 16 || !validImageSignature(data, mime))
      throw new AppError("invalid_input");
    const imageId = randomUUID();
    const path = illustrationPrefix(user.id, id) + imageId + "." + extensions[mime];
    const object = studioBucket().file(path);
    await object.save(data, { resumable: false, metadata: {
      contentType: mime, cacheControl: "private, no-store",
    } });
    try {
      return json({ book: await withCover(await studioStore().insertIllustration(
        user.id, id, input.data.revision, input.data.chapter_id, input.data.position,
        { id: imageId, source: "upload", path, alt: input.data.caption || "Book illustration",
          caption: input.data.caption, size: input.data.size },
      )) });
    } catch (error) {
      await object.delete().catch(() => {});
      throw error;
    }
  } catch (error) {
    return apiError(error);
  }
}
