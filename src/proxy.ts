import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, newNonce } from "@/lib/csp";
import { splitLocale } from "@/lib/i18n";

/**
 * Next 16 "proxy" (formerly middleware):
 *  - /ar/* is rewritten to the same route with x-locale=ar; everything else is English
 *  - every page response gets a Content-Security-Policy with a fresh nonce (Next applies it to its own scripts
 *    when it sees it on the request header)
 */
export function proxy(req: NextRequest) {
  const { locale, path } = splitLocale(req.nextUrl.pathname);
  const nonce = newNonce();
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV !== "production", ads: !!process.env.ADSENSE_CLIENT });

  const headers = new Headers(req.headers);
  // Never trust client-supplied copies of our internal headers: always overwrite.
  headers.set("x-locale", locale);
  headers.set("x-path", path + req.nextUrl.search);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  let res: NextResponse;
  if (locale !== "en") {
    const url = req.nextUrl.clone();
    url.pathname = path;
    res = NextResponse.rewrite(url, { request: { headers } });
  } else {
    res = NextResponse.next({ request: { headers } });
  }
  res.headers.set("content-security-policy", csp);
  return res;
}

export const config = { matcher: ["/((?!_next/|api/|favicon.ico|.*\\..*).*)"] };
