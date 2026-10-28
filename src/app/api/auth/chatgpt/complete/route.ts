import { adminAuth } from "@/lib/firebase-admin";
import { consumeChatgptSignInTicket } from "@/lib/siwc";
import { assertOrigin, apiError, AppError, json } from "@/lib/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const uid = await consumeChatgptSignInTicket().catch(() => {
      throw new AppError("unauthorized", 401);
    });
    const customToken = await adminAuth().createCustomToken(uid);
    return json({ customToken });
  } catch (error) {
    return apiError(error);
  }
}
