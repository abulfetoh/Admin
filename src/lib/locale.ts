import { headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./i18n";

export { SITE_URL } from "./locale-const";

/** Locale is determined by the URL prefix (set by middleware), never by cookie, so each URL has one language. */
export async function getLocale(): Promise<Locale> {
  const v = (await headers()).get("x-locale") ?? undefined;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}
export async function getPath(): Promise<string> {
  return (await headers()).get("x-path") ?? "/";
}
