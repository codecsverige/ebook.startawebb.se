import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/firebase-session";
import { studioStore } from "@/lib/firebase-admin";
import { ownedBook, takeRate, withCover } from "@/lib/books";
import { libraryIllustrations } from "@/lib/domain";
import { apiError, assertOrigin, json, readJson } from "@/lib/http";

export const runtime = "nodejs";
/** Insert a licensed, application-owned illustration without contacting AI. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertOrigin(request);
    const { user } = await requireUser();
    const { id } = await ctx.params;
    await ownedBook(id, user.id);
    const input = await readJson(request, z.object({
      revision: z.number().int().nonnegative(),
      chapter_id: z.string().uuid(),
      position: z.number().int().nonnegative().max(30000),
      preset: z.enum(libraryIllustrations),
      size: z.enum(["small", "medium", "full"]).default("medium"),
      caption: z.string().trim().max(240).default(""),
    }), 1000);
    await takeRate("illustration-library:" + user.id, 100);
    const newId = randomUUID();
    return json({ book: await withCover(await studioStore().insertIllustration(
      user.id, id, input.revision, input.chapter_id, input.position,
      { id: newId, source: "library", preset: input.preset, alt: input.caption || input.preset,
        caption: input.caption, size: input.size },
    )) });
  } catch (error) {
    return apiError(error);
  }
}
