import { requireUser } from "@/lib/firebase-session";
import { illustrationArtwork, ownedBook } from "@/lib/books";
import { apiError } from "@/lib/http";

export const runtime = "nodejs";
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; imageId: string }> },
) {
  try {
    const { id, imageId } = await ctx.params;
    const { user } = await requireUser();
    const asset = await illustrationArtwork(await ownedBook(id, user.id), imageId);
    return new Response(asset.data, { headers: {
      "Content-Type": asset.type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (e) {
    return apiError(e);
  }
}
