import { z } from "zod";
import { requireUser } from "@/lib/firebase-session";
import { studioStore } from "@/lib/firebase-admin";
import { withCover } from "@/lib/books";
import { assertOrigin, readJson, apiError, json } from "@/lib/http";

export const runtime = "nodejs";
/** The author must review an AI suggestion before any change reaches the manuscript. */
export async function POST(request: Request, ctx: { params: Promise<{id:string}> }) {
  try {
    assertOrigin(request);
    const {user} = await requireUser();
    const {id} = await ctx.params;
    const input = await readJson(request, z.object({
      revision: z.number().int().nonnegative(),
      accept: z.boolean(),
    }), 400);
    const updated = await studioStore().decideTextEdit(user.id,id,input.revision,input.accept);
    return json({book:await withCover(updated)});
  } catch (e) {return apiError(e);}
}
