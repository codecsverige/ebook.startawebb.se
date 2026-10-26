import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export function validSignature(
  body: string,
  signature: string,
  secret: string,
): boolean {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(body, "utf8").digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export const orderWebhookSchema = z.object({
  meta: z.object({
    event_name: z.enum(["order_created", "order_refunded"]),
    custom_data: z.object({
      user_id: z.string().uuid(),
      delivery_consent: z.literal("yes"),
    }),
  }),
  data: z.object({
    id: z.string().regex(/^\d+$/),
    type: z.literal("orders"),
    attributes: z.object({
      store_id: z.number().int(),
      status: z.string(),
      refunded: z.boolean(),
      test_mode: z.boolean(),
      first_order_item: z.object({
        variant_id: z.number().int(),
        quantity: z.literal(1),
      }),
    }),
  }),
});
