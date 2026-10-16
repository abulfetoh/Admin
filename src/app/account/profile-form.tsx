"use client";
import { useActionState } from "react";
import { saveProfileAction } from "./actions";
import type { ProfileData } from "@/lib/profile";

const c = "w-full rounded border border-slate-300 px-3 py-2";
export function ProfileForm({ p }: { p: ProfileData }) {
  const [s, action, pending] = useActionState(saveProfileAction, {} as { error?: string; ok?: boolean });
  return (
    <form action={action} className="max-w-xl space-y-3">
      <label className="block text-sm">Headline<input name="headline" defaultValue={p.headline} className={c} /></label>
      <label className="block text-sm">Summary<textarea name="summary" defaultValue={p.summary} rows={4} className={c} /></label>
      <div className="flex gap-2">
        <label className="block flex-1 text-sm">Location<input name="location" defaultValue={p.location} className={c} /></label>
        <label className="block flex-1 text-sm">Phone<input name="phone" defaultValue={p.phone} className={c} /></label>
      </div>
      <label className="block text-sm">Skills (comma separated)<input name="skills" defaultValue={p.skills.join(", ")} className={c} /></label>
      <label className="block text-sm">Experience (JSON: [{`{"title","company","from","to","details"}`}])<textarea name="experience" defaultValue={JSON.stringify(p.experience)} rows={4} className={`${c} font-mono text-xs`} /></label>
      <label className="block text-sm">Education (JSON: [{`{"school","degree","year"}`}])<textarea name="education" defaultValue={JSON.stringify(p.education)} rows={3} className={`${c} font-mono text-xs`} /></label>
      {s.error && <p role="alert" className="text-sm text-red-700">{s.error}</p>}
      {s.ok && <p role="status" className="text-sm text-green-700">Saved</p>}
      <button disabled={pending} className="rounded bg-slate-900 px-4 py-2 text-white">Save</button>
    </form>
  );
}
