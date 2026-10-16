import type { Metadata } from "next";
import { LOCALES, localePath, type Locale } from "./i18n";
import { SITE_URL } from "./locale-const";

/** canonical + hreflang alternates for a locale-independent `path`. */
export function alternatesFor(locale: Locale, path: string): NonNullable<Metadata["alternates"]> {
  return {
    canonical: `${SITE_URL}${localePath(locale, path)}`,
    languages: {
      ...Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}${localePath(l, path)}`])),
      "x-default": `${SITE_URL}${localePath("en", path)}`,
    },
  };
}
