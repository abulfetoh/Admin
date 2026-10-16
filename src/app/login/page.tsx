import Link from "next/link";
import { AuthForm } from "../auth-form";
import { loginAction } from "../auth-actions";

export const metadata = { title: "Log in", robots: { index: false } };
export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-center text-2xl font-bold">Log in</h1>
      <AuthForm action={loginAction} mode="login" />
      <p className="mt-2 text-center text-sm"><Link className="underline" href="/forgot">Forgot password?</Link></p>
      <p className="mt-4 text-center text-sm">No account? <Link className="underline" href="/register">Register</Link></p>
    </>
  );
}
