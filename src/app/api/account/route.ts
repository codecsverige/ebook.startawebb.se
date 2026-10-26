import { z } from "zod";
import { requireUser, clearSession } from "@/lib/firebase-session";
import { studioStore } from "@/lib/firebase-admin";
import { deleteBookArtwork } from "@/lib/books";
import { assertOrigin, readJson, apiError, json } from "@/lib/http";
export const maxDuration = 120;
export async function DELETE(request: Request) {
  try {
    assertOrigin(request);
    const { user } = await requireUser();
    await readJson(request, z.object({ confirm: z.literal("DELETE") }), 1000);
    const store = studioStore();
    await store.lockAccountDeletion(user.id);
    try {
      for (const id of await store.accountBooks(user.id)) {
        await store.lockBookDeletion(user.id, id);
        try {
          await deleteBookArtwork(user.id, id);
          await store.deleteBookRecords(user.id, id);
        } catch (e) {
          await store.unlockBookDeletion(user.id, id);
          throw e;
        }
      }
      await store.deleteAccountRecords(user.id);
    } catch (e) {
      await store.unlockAccountDeletion(user.id);
      throw e;
    }
    await clearSession();
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
