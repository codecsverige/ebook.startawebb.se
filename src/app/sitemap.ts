import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/config";
import { locales } from "@/lib/domain";
export default function sitemap(): MetadataRoute.Sitemap {
  return locales.flatMap((l) =>
    [
      "",
      "/examples",
      "/examples/guide",
      "/examples/ebook",
      "/examples/workbook",
      "/privacy",
      "/terms",
    ].map((path) => ({
      url: `${appUrl()}/${l}${path}`,
      alternates: {
        languages: {
          en: `${appUrl()}/en${path}`,
          ar: `${appUrl()}/ar${path}`,
          sv: `${appUrl()}/sv${path}`,
        },
      },
    })),
  );
}
