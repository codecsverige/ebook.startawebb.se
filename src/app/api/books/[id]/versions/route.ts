import { requireUser } from "@/lib/firebase-session";
import { studioStore } from "@/lib/firebase-admin";
import { apiError, json } from "@/lib/http";
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
