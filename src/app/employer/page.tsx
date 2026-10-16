import { getDb } from "@/lib/db";
import { listOwnJobs } from "@/lib/employer";
import { requireRole } from "@/lib/session";
import { VerifyNotice } from "@/app/verify-notice";
import { closeJobAction } from "./actions";
import Link from "next/link";
import { PostForm } from "./post-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Employer portal", robots: { index: false } };

export default async function Employer() {
  const user = await requireRole("employer");
  const jobs = await listOwnJobs(await getDb(), user);
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Employer portal</h1>
      <VerifyNotice userId={user.id} />
      <p className="text-sm"><a className="underline" href="/account/export.json">Export my data</a> · <Link className="underline" href="/account/delete">Delete account</Link></p>
      <section><h2 className="mb-2 font-semibold">Your jobs</h2>
        {jobs.length === 0 && <p className="text-sm">No jobs yet.</p>}
        <ul className="space-y-1 text-sm">{jobs.map((j) => (
          <li key={j.id} className="flex gap-3"><a className="underline" href={`/jobs/${j.id}/x`}>{j.title}</a> <span>{j.status}</span>
            {j.status === "active" && <form action={closeJobAction}><input type="hidden" name="id" value={j.id} /><button className="underline">Close</button></form>}
          </li>))}
        </ul>
      </section>
      <section><h2 className="mb-2 font-semibold">Post a job</h2><PostForm /></section>
    </div>
  );
}
