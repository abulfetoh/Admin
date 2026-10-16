"use client";
import { useActionState } from "react";
import { editJobAction } from "../actions";

const c = "w-full rounded border border-slate-300 px-3 py-2";
export interface JobDefaults { id: number; title: string; description: string; location: string; city: string; country: string; remote: boolean; employment_type: string; apply_url: string; valid_through: string }

export function EditForm({ j }: { j: JobDefaults }) {
  const [s, action, pending] = useActionState(editJobAction, {});
  return (
    <form action={action} className="max-w-xl space-y-3">
      <input type="hidden" name="id" value={j.id} />
      <label className="block text-sm">Title<input name="title" required defaultValue={j.title} className={c} /></label>
      <label className="block text-sm">Description<textarea name="description" required rows={8} defaultValue={j.description} className={c} /></label>
      <div className="flex gap-2">
        <label className="block flex-1 text-sm">City<input name="city" defaultValue={j.city} className={c} /></label>
        <label className="block flex-1 text-sm">Country<input name="country" defaultValue={j.country} className={c} /></label>
      </div>
      <label className="block text-sm">Location text<input name="location" defaultValue={j.location} className={c} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remote" defaultChecked={j.remote} /> Remote</label>
      <label className="block text-sm">Employment type
        <select name="employment_type" className={c} defaultValue={j.employment_type}><option value="">—</option>{["full_time", "part_time", "contract", "internship", "temporary"].map((x) => <option key={x}>{x}</option>)}</select>
      </label>
      <label className="block text-sm">Apply URL<input name="apply_url" type="url" required defaultValue={j.apply_url} className={c} /></label>
      <label className="block text-sm">Valid through<input name="valid_through" type="date" defaultValue={j.valid_through} className={c} /></label>
      {s.error && <p role="alert" className="text-sm text-red-700">{s.error}</p>}
      <button disabled={pending} className="rounded bg-slate-900 px-4 py-2 text-white">Save changes</button>
    </form>
  );
}
