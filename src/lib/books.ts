import "server-only";
import type { Book, BookWithCover } from "./domain";
import { adminClient } from "./supabase";
import { AppError, dbError } from "./http";

export async function ownedBook(id: string, userId: string): Promise<Book> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("not_found", 404);
  const { data, error } = await adminClient()
    .from("books")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  dbError(error);
  if (!data) throw new AppError("not_found", 404);
  return data as Book;
}
export async function withCover(book: Book): Promise<BookWithCover> {
  if (!book.cover_path) return { ...book, cover_url: null };
  const { data } = await adminClient()
    .storage.from("covers")
    .createSignedUrl(book.cover_path, 3600);
  return { ...book, cover_url: data?.signedUrl ?? null };
}
export async function takeRate(key: string, limit: number, seconds = 3600) {
  const { error } = await adminClient().rpc("take_rate", {
    p_key: key,
    p_limit: limit,
    p_seconds: seconds,
  });
  dbError(error);
}
