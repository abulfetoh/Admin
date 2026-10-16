import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { dirOf, t } from "@/lib/i18n";
import { getLocale, SITE_URL } from "@/lib/locale";
import { currentUser } from "@/lib/session";
import { logoutAction } from "./auth-actions";

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
  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        <header className="border-b border-slate-200">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold">{s.siteName}</Link>
            <nav className="flex items-center gap-4 text-sm">
              {user ? (
                <>
                  <Link href={user.role === "admin" ? "/admin" : user.role === "employer" ? "/employer" : "/account"} className="underline">{user.name}</Link>
                  <form action={logoutAction}><button className="underline">Log out</button></form>
                </>
              ) : (
                <><Link href="/login" className="underline">Log in</Link><Link href="/register" className="underline">Register</Link></>
              )}
              <a href={`/lang?to=${other}`} className="underline" lang={other}>{s.language}</a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
