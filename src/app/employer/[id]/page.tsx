import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { ForbiddenError, getOwnJob } from "@/lib/employer";
import { requireRole } from "@/lib/session";
import { EditForm } from "./edit-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit job", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("employer");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  let j;
  try { j = await getOwnJob(await getDb(), user, +id); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  const s = (v: unknown) => (v == null ? "" : String(v));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Edit job</h1>
      <EditForm j={{ id: +id, title: s(j.title), description: s(j.description), location: s(j.location), city: s(j.city), country: s(j.country), remote: !!j.remote, employment_type: s(j.employment_type), apply_url: s(j.apply_url), valid_through: j.valid_through instanceof Date ? j.valid_through.toISOString().slice(0, 10) : "" }} />
    </div>
  );
}
