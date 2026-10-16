import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { dirOf, localePath, t } from "@/lib/i18n";
import { getLocale, getPath, SITE_URL } from "@/lib/locale";
import { currentUser } from "@/lib/session";
import { logoutAction } from "./auth-actions";
import { ConsentAndTracking } from "./consent-banner";
import { gpcOptOut } from "@/lib/consent";
import { headers } from "next/headers";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Today Jobs", template: "%s | Today Jobs" },
  description: "Search jobs from verified sources.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const s = t(locale);
  const user = await currentUser();
  const other = locale === "en" ? "ar" : "en";
  const path = await getPath();
  const gpc = gpcOptOut(await headers());
  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        <header className="border-b border-slate-200">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <Link href={localePath(locale, "/")} className="text-lg font-bold">{s.siteName}</Link>
            <nav className="flex items-center gap-4 text-sm">
              {user ? (
                <>
                  <Link href={user.role === "admin" ? "/admin" : user.role === "employer" ? "/employer" : "/account"} className="underline">{user.name}</Link>
                  <form action={logoutAction}><button className="underline">Log out</button></form>
                </>
              ) : (
                <><Link href="/login" className="underline">Log in</Link><Link href="/register" className="underline">Register</Link></>
              )}
              <a href={localePath(other, path)} hrefLang={other} className="underline" lang={other}>{s.language}</a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
        <ConsentAndTracking locale={locale} gpc={gpc} adsClient={process.env.ADSENSE_CLIENT} labels={{ text: s.consentText, accept: s.consentAccept, reject: s.consentReject }} />
      </body>
    </html>
  );
}
