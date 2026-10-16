"use client";
import { useActionState } from "react";
import { postJobAction } from "./actions";

const c = "w-full rounded border border-slate-300 px-3 py-2";
export function PostForm() {
  const [s, action, pending] = useActionState(postJobAction, {});
  return (
    <form action={action} className="max-w-xl space-y-3">
      <label className="block text-sm">Company name<input name="company" className={c} /></label>
      <label className="block text-sm">Title<input name="title" required className={c} /></label>
      <label className="block text-sm">Description<textarea name="description" required rows={8} className={c} /></label>
      <div className="flex gap-2">
        <label className="block flex-1 text-sm">City<input name="city" className={c} /></label>
        <label className="block flex-1 text-sm">Country<input name="country" className={c} /></label>
      </div>
      <label className="block text-sm">Location text<input name="location" className={c} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remote" /> Remote</label>
      <label className="block text-sm">Employment type
        <select name="employment_type" className={c} defaultValue=""><option value="">—</option>{["full_time", "part_time", "contract", "internship", "temporary"].map((x) => <option key={x}>{x}</option>)}</select>
      </label>
      <label className="block text-sm">Apply URL<input name="apply_url" type="url" required className={c} /></label>
      <label className="block text-sm">Valid through<input name="valid_through" type="date" className={c} /></label>
      {s.error && <p role="alert" className="text-sm text-red-700">{s.error}</p>}
      <button disabled={pending} className="rounded bg-slate-900 px-4 py-2 text-white">Publish</button>
    </form>
  );
}
