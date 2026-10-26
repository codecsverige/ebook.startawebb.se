import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/config";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/auth/",
        "/.well-known/",
        "/en/studio",
        "/ar/studio",
        "/sv/studio",
        "/en/login",
        "/ar/login",
        "/sv/login",
      ],
    },
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
