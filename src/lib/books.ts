import "server-only";
import { createHash } from "node:crypto";
import type { Book, BookWithCover } from "./domain";
import { studioStore, studioBucket } from "./firebase-admin";
import { STUDIO_PATH } from "./firebase-config";
import { AppError } from "./http";

export const ownedBook = (id: string, userId: string) =>
  studioStore().ownedBook(id, userId);
export async function withCover(book: Book): Promise<BookWithCover> {
  // Serve artwork through an ownership-checked route. No public download token
  // or project-wide Storage permission is granted to the browser.
  return {
    ...book,
    cover_url: book.cover_path
      ? `/api/books/${book.id}/cover?r=${book.revision}`
      : null,
  };
}
export const takeRate = (key: string, limit: number, seconds = 3600) =>
  studioStore().takeRate(key, limit, seconds);
export const coverPrefix = (uid: string, bookId: string) =>
  `${STUDIO_PATH}/covers/${createHash("sha256").update(uid).digest("hex")}/${bookId}/`;
export async function coverArtwork(book: Book) {
  if (!book.cover_path) return undefined;
  if (!book.cover_path.startsWith(coverPrefix(book.user_id, book.id)))
    throw new AppError("forbidden", 403);
  const file = studioBucket().file(book.cover_path);
  const [metadata] = await file.getMetadata();
  if (
    Number(metadata.size) > 8_000_000 ||
    !["image/png", "image/jpeg", "image/webp"].includes(
      metadata.contentType || "",
    )
  )
    throw new AppError("service_error", 503);
  const [data] = await file.download();
  return { data: new Uint8Array(data), type: metadata.contentType! };
}
export async function deleteBookArtwork(uid: string, id: string) {
  try {
    await studioBucket().deleteFiles({ prefix: coverPrefix(uid, id) });
  } catch (e) {
    if (Number((e as { code?: number }).code) !== 404) throw e;
  }
}
