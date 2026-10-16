import { listRuns, listSources, listUsers, stats } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { removeJobAction, roleAction, sourceAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin", robots: { index: false } };

export default async function Admin() {
  const admin = await requireRole("admin");
  const db = await getDb();
  const [s, users, runs, sources] = await Promise.all([stats(db, admin), listUsers(db, admin), listRuns(db, admin), listSources(db, admin)]);
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Admin</h1>
      <p className="text-sm">Active jobs: {s.activeJobs} · Users: {s.users} · Companies: {s.companies}</p>

      <section><h2 className="mb-2 font-semibold">Sources</h2>
        <ul className="space-y-1 text-sm">{sources.map((x) => (
          <li key={x.id} className="flex items-center gap-3">
            <span>{x.key} ({x.adapter}) {x.enabled ? "enabled" : "disabled"}</span>
            <form action={sourceAction}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="enabled" value={x.enabled ? "0" : "1"} /><button className="underline">{x.enabled ? "Disable" : "Enable"}</button></form>
          </li>))}
        </ul>
      </section>

      <section><h2 className="mb-2 font-semibold">Recent ingestion runs</h2>
        <table className="w-full text-start text-sm"><thead><tr><th>#</th><th>Source</th><th>Fetched</th><th>New</th><th>Upd</th><th>Dup</th><th>Exp</th><th>Error</th></tr></thead>
          <tbody>{runs.map((r) => (<tr key={r.id}><td>{r.id}</td><td>{r.source}{r.dry_run ? " (dry)" : ""}</td><td>{r.fetched}</td><td>{r.inserted}</td><td>{r.updated}</td><td>{r.duplicates}</td><td>{r.expired}</td><td className="text-red-700">{r.error}</td></tr>))}</tbody>
        </table>
      </section>

      <section><h2 className="mb-2 font-semibold">Users</h2>
        <ul className="space-y-1 text-sm">{users.map((u) => (
          <li key={u.id} className="flex items-center gap-2">
            <span>{u.email} — {u.role}</span>
            {u.id !== admin.id && (
              <form action={roleAction} className="flex gap-1">
                <input type="hidden" name="id" value={u.id} />
                <select name="role" defaultValue={u.role} aria-label={`Role for ${u.email}`} className="border">{["candidate", "employer", "admin"].map((r) => <option key={r}>{r}</option>)}</select>
                <button className="underline">Set</button>
              </form>)}
          </li>))}
        </ul>
      </section>

      <section><h2 className="mb-2 font-semibold">Remove a job</h2>
        <form action={removeJobAction} className="flex gap-2"><input name="id" type="number" required placeholder="Job id" aria-label="Job id" className="border px-2 py-1" /><button className="underline">Remove</button></form>
      </section>
    </div>
  );
}
