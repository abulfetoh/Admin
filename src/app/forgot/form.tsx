"use client";
import { useActionState } from "react";
import { forgotAction } from "../auth-actions";

export function ForgotForm() {
  const [s, action, pending] = useActionState(forgotAction, {});
  if (s.sent) return <p role="status">If an account exists for that email, a reset link is on its way.</p>;
  return (
    <form action={action} className="mx-auto max-w-sm space-y-3">
      <label className="block text-sm">Email<input name="email" type="email" required autoComplete="email" className="w-full rounded border border-slate-300 px-3 py-2" /></label>
      <button disabled={pending} className="w-full rounded bg-slate-900 px-4 py-2 text-white">Send reset link</button>
    </form>
  );
}
