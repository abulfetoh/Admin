import { NextResponse, type NextRequest } from "next/server";
import { splitLocale } from "@/lib/i18n";

/** (Next 16 "proxy", formerly middleware) /ar/* is rewritten to the same route with x-locale=ar; everything else is English. */
export function proxy(req: NextRequest) {
  const { locale, path } = splitLocale(req.nextUrl.pathname);
  const headers = new Headers(req.headers);
  headers.set("x-locale", locale);
  headers.set("x-path", path + req.nextUrl.search);
  if (locale !== "en") {
    const url = req.nextUrl.clone();
    url.pathname = path;
    return NextResponse.rewrite(url, { request: { headers } });
  }
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/|api/|favicon.ico|.*\\..*).*)"] };
