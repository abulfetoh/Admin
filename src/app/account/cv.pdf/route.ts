import { NextResponse } from "next/server";
import { buildCvPdf, UnsupportedTextError } from "@/lib/cv-pdf";
import { getDb } from "@/lib/db";
import { getProfile } from "@/lib/profile";
import { currentUser } from "@/lib/session";

export async function GET() {
  const user = await currentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const pdf = await buildCvPdf(user, await getProfile(await getDb(), user));
    return new NextResponse(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="cv.pdf"', "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof UnsupportedTextError) return new NextResponse("This CV contains non-Latin characters; use the printable view (Print → Save as PDF).", { status: 422 });
    throw e;
  }
}
