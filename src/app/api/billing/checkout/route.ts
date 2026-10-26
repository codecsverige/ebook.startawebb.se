import { z } from "zod";
import { requireUser } from "@/lib/supabase";
import { takeRate } from "@/lib/books";
import { assertOrigin, readJson, apiError, json, AppError } from "@/lib/http";
import { appUrl, configuration } from "@/lib/config";
import { matchesPackCatalog } from "@/lib/commerce";

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { user } = await requireUser();
    if (!configuration().billing) throw new AppError("not_configured", 503);
    const { pack, locale } = await readJson(
      request,
      z.object({
        pack: z.enum(["one", "three"]),
        locale: z.enum(["en", "ar", "sv"]),
        consent: z.literal(true),
      }),
      2000,
    );
    await takeRate(`checkout:${user.id}`, 10);
    const variant =
      pack === "one"
        ? process.env.LEMON_SQUEEZY_VARIANT_ONE!
        : process.env.LEMON_SQUEEZY_VARIANT_THREE!;
    const authorization = {
      Authorization: `Bearer ${process.env.LEMON_SQUEEZY_API_KEY}`,
      Accept: "application/vnd.api+json",
    };
    const catalog = await Promise.all([
      fetch(
        `https://api.lemonsqueezy.com/v1/stores/${process.env.LEMON_SQUEEZY_STORE_ID}`,
        {
          headers: authorization,
          signal: AbortSignal.timeout(15000),
          cache: "no-store",
        },
      ),
      fetch(
        `https://api.lemonsqueezy.com/v1/prices?filter%5Bvariant_id%5D=${variant}&page%5Bsize%5D=1`,
        {
          headers: authorization,
          signal: AbortSignal.timeout(15000),
          cache: "no-store",
        },
      ),
    ]);
    if (catalog.some((r) => !r.ok)) throw new AppError("service_error", 503);
    const [store, prices] = await Promise.all(catalog.map((r) => r.json()));
    if (
      !matchesPackCatalog(
        store?.data?.attributes,
        prices?.data?.[0]?.attributes,
        variant,
        pack,
      )
    )
      throw new AppError("not_configured", 503);
    const result = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Bearer ${process.env.LEMON_SQUEEZY_API_KEY}`,
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            product_options: {
              redirect_url: `${appUrl()}/${locale}/studio?checkout=returned`,
              enabled_variants: [Number(variant)],
            },
            checkout_options: {
              embed: false,
              locale: locale === "ar" ? "en" : locale,
            },
            checkout_data: {
              email: user.email,
              custom: { user_id: user.id, delivery_consent: "yes" },
              variant_quantities: [
                { variant_id: Number(variant), quantity: 1 },
              ],
            },
            test_mode: process.env.LEMON_SQUEEZY_TEST_MODE === "true",
            expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          },
          relationships: {
            store: {
              data: { type: "stores", id: process.env.LEMON_SQUEEZY_STORE_ID },
            },
            variant: { data: { type: "variants", id: variant } },
          },
        },
      }),
    });
    if (!result.ok) throw new AppError("service_error", 503);
    const data = await result.json();
    const parsed = z.string().url().safeParse(data?.data?.attributes?.url);
    if (
      !parsed.success ||
      !new URL(parsed.data).hostname.endsWith(".lemonsqueezy.com")
    )
      throw new AppError("service_error", 503);
    return json({ url: parsed.data });
  } catch (e) {
    return apiError(e);
  }
}
