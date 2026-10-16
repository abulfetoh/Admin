import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { dirOf, t } from "@/lib/i18n";
import { getLocale, SITE_URL } from "@/lib/locale";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Today Jobs", template: "%s | Today Jobs" },
  description: "Search jobs from verified sources.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const s = t(locale);
  const other = locale === "en" ? "ar" : "en";
  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        <header className="border-b border-slate-200">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold">{s.siteName}</Link>
            <a href={`/lang?to=${other}`} className="text-sm underline" lang={other}>{s.language}</a>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
