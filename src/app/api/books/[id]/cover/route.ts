import { requireUser } from "@/lib/firebase-session";
import { ownedBook, coverArtwork } from "@/lib/books";
import { apiError, AppError } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(
  _: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireUser(),
      { id } = await ctx.params;
    const artwork = await coverArtwork(await ownedBook(id, user.id));
    if (!artwork) throw new AppError("not_found", 404);
    return new Response(artwork.data, {
      headers: {
        "Content-Type": artwork.type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
