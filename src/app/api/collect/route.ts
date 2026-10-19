import { NextRequest, NextResponse } from "next/server";
import { recordPageview } from "@/lib/analytics";
import { parseConsent, CONSENT_COOKIE, gpcOptOut } from "@/lib/consent";
import { getDb } from "@/lib/db";
import { allow, clientIp } from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  // Server re-checks consent: the client check alone is not enough.
  const consent = parseConsent(req.cookies.get(CONSENT_COOKIE)?.value);
  if (!consent?.analytics || gpcOptOut(req.headers)) return new NextResponse(null, { status: 204 });
  // The consent cookie is client-set, so it is NOT an abuse control: cap volume and size per client.
  const db = await getDb();
  if (!(await allow(db, `collect:${clientIp(req.headers)}`, 120, 60))) return new NextResponse(null, { status: 429 });
  const raw = await req.text();
  if (raw.length > 2048) return new NextResponse(null, { status: 413 });
  let body: { path?: unknown; locale?: unknown; referrer?: unknown } | null = null;
  try { body = JSON.parse(raw); } catch { /* handled below */ }
  if (!body || typeof body !== "object") return new NextResponse(null, { status: 400 });
  await recordPageview(db, { path: body.path, locale: body.locale, referrer: body.referrer, userAgent: req.headers.get("user-agent") });
  return new NextResponse(null, { status: 204 });
}
