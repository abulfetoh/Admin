import { listSavedSearches } from "@/lib/alerts";
import { getDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { VerifyNotice } from "@/app/verify-notice";
import { createAlertAction, deleteAlertAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Job alerts", robots: { index: false } };

export default async function Alerts() {
  const user = await requireRole("candidate");
  const list = await listSavedSearches(await getDb(), user);
  const c = "rounded border border-slate-300 px-3 py-2";
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Job alerts</h1>
      <VerifyNotice userId={user.id} />
      <form action={createAlertAction} className="flex flex-wrap gap-2">
        <input name="q" placeholder="Keywords" aria-label="Keywords" className={c} />
        <input name="location" placeholder="Location" aria-label="Location" className={c} />
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="remote" /> Remote</label>
        <button className="rounded bg-slate-900 px-4 py-2 text-white">Save alert</button>
      </form>
      <ul className="space-y-1 text-sm">{list.map((s) => (
        <li key={s.id} className="flex gap-3"><span>{[s.q, s.location, s.remote ? "remote" : ""].filter(Boolean).join(" · ")}</span>
          <form action={deleteAlertAction}><input type="hidden" name="id" value={s.id} /><button className="underline">Delete</button></form></li>))}
      </ul>
    </div>
  );
}
