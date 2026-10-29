import { requireUser } from "@/lib/firebase-session";
import { ownedBook, takeRate } from "@/lib/books";
import { assertOrigin, apiError, AppError, json } from "@/lib/http";
import { parseDocxManuscript } from "@/lib/docx-import";

export const runtime = "nodejs";
export const maxDuration = 25;
const MAX = 4_000_000;
export async function POST(request: Request, ctx: {params:Promise<{id:string}>}) {
  try {
    assertOrigin(request);
    const {user}=await requireUser();
    const {id}=await ctx.params;
    await ownedBook(id,user.id);
    const contentType=(request.headers.get("content-type")||"").split(";")[0];
    if(contentType!=="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
      throw new AppError("invalid_input");
    if(Number(request.headers.get("content-length")||0)>MAX)throw new AppError("too_large",413);
    await takeRate("docx-import:"+user.id,15);
    const reader=request.body?.getReader();
    if(!reader)throw new AppError("invalid_input");
    let size=0;const chunks:Uint8Array[]=[];
    for(;;){
      const {value,done}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>MAX){await reader.cancel();throw new AppError("too_large",413);}
      chunks.push(value);
    }
    try {
      return json({sections:parseDocxManuscript(Buffer.concat(chunks))});
    } catch {
      throw new AppError("invalid_input");
    }
  }catch(e){return apiError(e);}
}
