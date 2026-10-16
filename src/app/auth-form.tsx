"use client";
import { useActionState } from "react";
import type { FormState } from "./auth-actions";

const input = "w-full rounded border border-slate-300 px-3 py-2";

export function AuthForm({ action, mode }: { action: (s: FormState, fd: FormData) => Promise<FormState>; mode: "login" | "register" }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="mx-auto max-w-sm space-y-3">
      {mode === "register" && (
        <>
          <label className="block text-sm">Name<input name="name" required className={input} autoComplete="name" /></label>
          <label className="block text-sm">I am a
            <select name="role" className={input} defaultValue="candidate">
              <option value="candidate">Job seeker</option>
              <option value="employer">Employer</option>
            </select>
          </label>
        </>
      )}
      <label className="block text-sm">Email<input name="email" type="email" required className={input} autoComplete="email" /></label>
      <label className="block text-sm">Password<input name="password" type="password" required minLength={mode === "register" ? 10 : undefined} className={input} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <button disabled={pending} className="w-full rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-60">{mode === "login" ? "Log in" : "Create account"}</button>
    </form>
  );
}
