"use client";
import { useActionState } from "react";
import { resetAction } from "../../auth-actions";

export function ResetForm({ token }: { token: string }) {
  const [s, action, pending] = useActionState(resetAction, {});
  return (
    <form action={action} className="mx-auto max-w-sm space-y-3">
      <input type="hidden" name="token" value={token} />
      <label className="block text-sm">New password<input name="password" type="password" required minLength={10} autoComplete="new-password" className="w-full rounded border border-slate-300 px-3 py-2" /></label>
      {s.error && <p role="alert" className="text-sm text-red-700">{s.error}</p>}
      <button disabled={pending} className="w-full rounded bg-slate-900 px-4 py-2 text-white">Set password</button>
    </form>
  );
}
