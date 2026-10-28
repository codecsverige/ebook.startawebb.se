import { requireUser } from "@/lib/firebase-session";
import { studioStore } from "@/lib/firebase-admin";
import { assertOrigin, readJson, apiError, json, AppError } from "@/lib/http";
import { briefSchema, bookWords, isComplete, isArabicBrief } from "@/lib/domain";
import { withCover, takeRate } from "@/lib/books";

export async function GET() {
  try {
    const { user } = await requireUser(),
      store = studioStore();
    const [books, profile] = await Promise.all([
      store.listBooks(user.id),
      store.profile(user.id),
    ]);
    return json({
      books: await Promise.all(
        books.map(async (book) => {
          const { chapters, ...summary } = await withCover(book);
          return {
            ...summary,
            word_count: bookWords(book),
            completed_chapters: Object.keys(chapters).length,
            complete: isComplete(book),
          };
        }),
      ),
      credits: profile?.credits || 0,
      free_book_id: profile?.free_book_id || null,
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
    if (isArabicBrief(brief.idea) && brief.language !== "ar")
      throw new AppError("language_mismatch");
    await takeRate(`create:${user.id}`, 10);
    return json({ id: await studioStore().createBook(user.id, brief) }, 201);
  } catch (e) {
    return apiError(e);
  }
}
