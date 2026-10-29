import { requireUser } from "@/lib/firebase-session";
import { illustrationArtwork, ownedBook, withCover } from "@/lib/books";
import { studioStore } from "@/lib/firebase-admin";
import { assertOrigin, readJson, json } from "@/lib/http";
import { z } from "zod";
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

type Context = { params: Promise<{ id: string; imageId: string }> };
export async function PATCH(request: Request, ctx: Context) {
  try {
    assertOrigin(request);
    const { user } = await requireUser();
    const { id, imageId } = await ctx.params;
    const payload = await readJson(request, z.object({
      revision: z.number().int().nonnegative(),
      size: z.enum(["small", "medium", "full"]),
      caption: z.string().trim().max(240),
    }), 800);
    return json({ book: await withCover(await studioStore().editIllustration(
      user.id, id, payload.revision, imageId,
      { size: payload.size, caption: payload.caption },
    )) });
  } catch (e) { return apiError(e); }
}
export async function DELETE(request: Request, ctx: Context) {
  try {
    assertOrigin(request);
    const { user } = await requireUser();
    const { id, imageId } = await ctx.params;
    const payload = await readJson(request, z.object({
      revision: z.number().int().nonnegative(),
    }), 500);
    return json({ book: await withCover(await studioStore().editIllustration(
      user.id, id, payload.revision, imageId, null,
    )) });
  } catch (e) { return apiError(e); }
}
