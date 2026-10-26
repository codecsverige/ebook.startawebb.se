import { studioStore } from "@/lib/firebase-admin";
import { validSignature, orderWebhookSchema } from "@/lib/webhook";
import { apiError, json, AppError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
    if (!secret) throw new AppError("not_configured", 503);
    // Bound the raw stream before signature validation; JSON must not be reserialized.
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("invalid_input");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 100_000) {
        await reader.cancel();
        throw new AppError("too_large", 413);
      }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    if (!validSignature(body, request.headers.get("x-signature") ?? "", secret))
      throw new AppError("forbidden", 403);
    const raw = JSON.parse(body);
    if (!["order_created", "order_refunded"].includes(raw?.meta?.event_name))
      return json({ ignored: true });
    const result = orderWebhookSchema.safeParse(raw);
    if (!result.success) throw new AppError("invalid_input");
    const event = result.data;
    const a = event.data.attributes;
    if (
      String(a.store_id) !== process.env.LEMON_SQUEEZY_STORE_ID ||
      a.test_mode !== (process.env.LEMON_SQUEEZY_TEST_MODE === "true")
    )
      throw new AppError("forbidden", 403);
    const variant = String(a.first_order_item.variant_id);
    const credits =
      variant === process.env.LEMON_SQUEEZY_VARIANT_ONE
        ? 1
        : variant === process.env.LEMON_SQUEEZY_VARIANT_THREE
          ? 3
          : 0;
    if (!credits) throw new AppError("invalid_input");
    if (!a.refunded && !["paid", "partial_refund"].includes(a.status))
      return json({ ignored: true });
    await studioStore().applyOrder(
      `${a.store_id}:${event.data.id}`,
      event.meta.custom_data.user_id,
      credits as 1 | 3,
      a.refunded,
      a.test_mode,
    );
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
