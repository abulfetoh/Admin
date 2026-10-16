import { NextRequest, NextResponse } from "next/server";
import { isLocale } from "@/lib/i18n";

export function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get("to") ?? undefined;
  // Only redirect to same-origin paths (prevent open redirect).
  const ref = req.headers.get("referer");
  let back = "/";
  if (ref) {
    const u = new URL(ref);
    if (u.origin === req.nextUrl.origin) back = u.pathname + u.search;
  }
  const res = NextResponse.redirect(new URL(back, req.nextUrl.origin));
  if (isLocale(to)) res.cookies.set("lang", to, { path: "/", maxAge: 31536000, sameSite: "lax" });
  return res;
}
