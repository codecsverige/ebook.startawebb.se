import { z } from "zod";

const catalogSchema = z.object({
  currency: z.literal("EUR"),
  category: z.literal("one_time"),
  scheme: z.literal("standard"),
  unit_price: z.number().int(),
  variant_id: z.number().int(),
});
export function matchesPackCatalog(
  store: unknown,
  price: unknown,
  variant: string,
  pack: "one" | "three",
): boolean {
  const parsed = catalogSchema.safeParse({
    ...(price && typeof price === "object" ? price : {}),
    currency:
      store && typeof store === "object" && "currency" in store
        ? store.currency
        : undefined,
  });
  return (
    parsed.success &&
    String(parsed.data.variant_id) === variant &&
    parsed.data.unit_price === (pack === "one" ? 900 : 1900)
  );
}
