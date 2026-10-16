"use client";
import { useActionState } from "react";
import { deleteAccountAction } from "./actions";

export function DeleteForm() {
  const [s, action, pending] = useActionState(deleteAccountAction, {});
  return (
    <form action={action} className="max-w-sm space-y-3">
      <label className="block text-sm">Confirm with your password<input name="password" type="password" required autoComplete="current-password" className="w-full rounded border border-slate-300 px-3 py-2" /></label>
      {s.error && <p role="alert" className="text-sm text-red-700">{s.error}</p>}
      <button disabled={pending} className="rounded bg-red-700 px-4 py-2 text-white">Permanently delete my account</button>
    </form>
  );
}
