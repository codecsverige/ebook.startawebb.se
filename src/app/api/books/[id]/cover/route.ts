import { z } from "zod";
import { requireUser } from "@/lib/firebase-session";
import { ownedBook, coverArtwork, withCover } from "@/lib/books";
import { studioStore } from "@/lib/firebase-admin";
import { apiError, AppError, assertOrigin, readJson, json } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireUser(),
      { id } = await ctx.params;
    const params = new URL(request.url).searchParams;
    const artwork = await coverArtwork(await ownedBook(id, user.id), params.get("candidate") === "1", params.get("side") === "back" ? "back" : "front");
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

/** Author confirmation is required before new AI cover artwork replaces the existing design. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(request);
    const { user } = await requireUser();
    const { id } = await ctx.params;
    const input = await readJson(
      request,
      z.object({
        action: z.enum(["accept", "reject"]),
        side: z.enum(["front", "back"]).default("front"),
        revision: z.number().int().nonnegative(),
      }),
      500,
    );
    return json({
      book: await withCover(
        await studioStore().decideCoverCandidate(
          user.id, id, input.revision, input.action === "accept", input.side
        )
      ),
    });
  } catch (e) {
    return apiError(e);
  }
}

/** Replace an unsuitable illustration with the professional text-only cover. */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(request);
    const { id } = await ctx.params;
    const { user } = await requireUser();
    const { revision } = await readJson(
      request,
      z.object({ revision: z.number().int().nonnegative() }),
      500,
    );
    const book = await studioStore().clearCover(user.id, id, revision);
    return json({ book: await withCover(book) });
  } catch (e) {
    return apiError(e);
  }
}
