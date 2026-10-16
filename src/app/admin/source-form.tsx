"use client";
import { useActionState } from "react";
import { createSourceAction } from "./actions";

const c = "w-full rounded border border-slate-300 px-3 py-2";
export function SourceForm() {
  const [s, action, pending] = useActionState(createSourceAction, {} as { error?: string; ok?: boolean });
  return (
    <form action={action} className="max-w-xl space-y-2">
      <label className="block text-sm">Key<input name="key" required placeholder="partner-name" className={c} /></label>
      <label className="block text-sm">Adapter<select name="adapter" className={c}><option>json_feed</option><option>greenhouse</option></select></label>
      <label className="block text-sm">Config (JSON: json_feed {`{"url":"https://…"}`}, greenhouse {`{"board":"acme"}`})<textarea name="config" required rows={2} className={`${c} font-mono text-xs`} /></label>
      <label className="block text-sm">Permission / terms URL (where you confirmed we may use this data)<input name="terms_url" type="url" required className={c} /></label>
      {s.error && <p role="alert" className="text-sm text-red-700">{s.error}</p>}
      {s.ok && <p role="status" className="text-sm text-green-700">Added (disabled — review, then enable above)</p>}
      <button disabled={pending} className="rounded bg-slate-900 px-4 py-2 text-white">Add source</button>
    </form>
  );
}
