"use client";
import { usePathname, useRouter } from "next/navigation";
import { Globe2 } from "lucide-react";
import { languageNames, locales, type Locale } from "@/lib/domain";
import { allowStudioNavigation } from "@/lib/navigation";
export function LanguageSwitch({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <label className="language-switch">
      <Globe2 size={16} />
      <span className="sr-only">Language / اللغة / Språk</span>
      <select
        value={locale}
        onChange={(e) => {
          if (!allowStudioNavigation()) {
            e.currentTarget.value = locale;
            return;
          }
          const parts = pathname.split("/");
          parts[1] = e.target.value;
          router.push(parts.join("/"));
        }}
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {languageNames[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
