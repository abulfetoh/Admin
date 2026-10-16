"use client";
import { useActionState, useRef, useState, useTransition } from "react";
import { saveProfileAction, suggestSummaryAction } from "./actions";
import type { ProfileData } from "@/lib/profile";

const c = "w-full rounded border border-slate-300 px-3 py-2";
export function ProfileForm({ p, aiEnabled }: { p: ProfileData; aiEnabled: boolean }) {
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const [ai, setAi] = useState<{ suggestion?: string; error?: string }>({});
  const [busy, startAi] = useTransition();
  const [s, action, pending] = useActionState(saveProfileAction, {} as { error?: string; ok?: boolean });
  return (
    <form action={action} className="max-w-xl space-y-3">
      <label className="block text-sm">Headline<input name="headline" defaultValue={p.headline} className={c} /></label>
      <label className="block text-sm">Summary<textarea ref={summaryRef} name="summary" defaultValue={p.summary} rows={4} className={c} /></label>
      {aiEnabled && (
        <div className="rounded border border-slate-200 p-3 text-sm">
          <p className="mb-2 text-slate-600">AI suggestion: sends your saved headline, skills, summary and job titles to our AI provider. Nothing changes unless you accept.</p>
          <button type="button" disabled={busy} onClick={() => startAi(async () => setAi(await suggestSummaryAction()))} className="rounded border border-slate-400 px-3 py-1">{busy ? "Thinking…" : "Suggest a summary"}</button>
          {ai.error && <p role="alert" className="mt-2 text-red-700">{ai.error}</p>}
          {ai.suggestion && (<div className="mt-2"><p className="whitespace-pre-line" aria-live="polite">{ai.suggestion}</p>
            <button type="button" onClick={() => { if (summaryRef.current) summaryRef.current.value = ai.suggestion!; }} className="mt-1 underline">Use this summary</button></div>)}
        </div>
      )}
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
