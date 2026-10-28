import { z } from "zod";
import { requireUser } from "@/lib/firebase-session";
import { studioStore } from "@/lib/firebase-admin";
import { apiError, json, assertOrigin, readJson } from "@/lib/http";
import { withCover, takeRate } from "@/lib/books";
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireUser(),
      { id } = await ctx.params,
      store = studioStore();
    const versionId = new URL(request.url).searchParams.get("version");
    return json(
      versionId
        ? { snapshot: await store.version(user.id, id, versionId) }
        : { versions: await store.versions(user.id, id) },
    );
  } catch (e) {
    return apiError(e);
  }
}

/** Restore an archived snapshot without relying on edit-form outline IDs. */
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
        version_id: z.string().uuid(),
        revision: z.number().int().nonnegative(),
      }),
      500,
    );
    await takeRate(`restore:${user.id}`, 25);
    return json({
      book: await withCover(await studioStore().restoreBookVersion(
        user.id, id, input.version_id, input.revision
      )),
    });
  } catch (e) {
    return apiError(e);
  }
}
