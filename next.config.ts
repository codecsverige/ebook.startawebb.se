import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
import { firebaseWebConfig } from "./src/lib/firebase-config";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: [
    "@sparticuz/chromium",
    "puppeteer-core",
    "firebase-admin",
  ],
  outputFileTracingIncludes: {
    "/api/books/*/export": [
      "./node_modules/@sparticuz/chromium/bin/**",
      "./node_modules/@fontsource/noto-naskh-arabic/files/*arabic-400-normal.woff2",
      "./node_modules/@fontsource-variable/inter/files/*latin-wght-normal.woff2",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline' https://apis.google.com${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://${firebaseWebConfig.authDomain}${process.env.NODE_ENV === "development" ? " ws: wss:" : ""}; frame-src 'self' blob: https://${firebaseWebConfig.authDomain} https://apis.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
          },
        ],
      },
    ];
  },
};
export default withWorkflow(nextConfig);
