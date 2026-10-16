import { NextResponse } from "next/server";
import { exportUserData } from "@/lib/account";
import { getDb } from "@/lib/db";
import { currentUser } from "@/lib/session";

export async function GET() {
  const user = await currentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  return new NextResponse(JSON.stringify(await exportUserData(await getDb(), user), null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="my-data.json"', "Cache-Control": "private, no-store" },
  });
}
