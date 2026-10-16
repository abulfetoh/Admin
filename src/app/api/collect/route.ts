import { NextRequest, NextResponse } from "next/server";
import { recordPageview } from "@/lib/analytics";
import { parseConsent, CONSENT_COOKIE, gpcOptOut } from "@/lib/consent";
import { getDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  // Server re-checks consent: the client check alone is not enough.
  const consent = parseConsent(req.cookies.get(CONSENT_COOKIE)?.value);
  if (!consent?.analytics || gpcOptOut(req.headers)) return new NextResponse(null, { status: 204 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return new NextResponse(null, { status: 400 });
  await recordPageview(await getDb(), { path: body.path, locale: body.locale, referrer: body.referrer, userAgent: req.headers.get("user-agent") });
  return new NextResponse(null, { status: 204 });
}
