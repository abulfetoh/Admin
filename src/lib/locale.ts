import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./i18n";

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get("lang")?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}
export const SITE_URL = (process.env.SITE_URL ?? "https://today-jobs.com").replace(/\/$/, "");
