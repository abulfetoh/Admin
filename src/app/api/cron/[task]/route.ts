import { NextRequest, NextResponse } from "next/server";
import { authorised, isTask, runTask } from "@/lib/cron";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Call from any scheduler: curl -H "Authorization: Bearer $CRON_SECRET" https://host/api/cron/ingest
async function handle(req: NextRequest, { params }: { params: Promise<{ task: string }> }) {
  if (!authorised(req.headers.get("authorization"), process.env.CRON_SECRET)) return new NextResponse("Unauthorized", { status: 401 });
  const { task } = await params;
  if (!isTask(task)) return new NextResponse("Unknown task", { status: 404 });
  return NextResponse.json({ task, result: await runTask(await getDb(), task) });
}
export { handle as GET, handle as POST };
