import Link from "next/link";
import { AuthForm } from "../auth-form";
import { registerAction } from "../auth-actions";

export const metadata = { title: "Create account", robots: { index: false } };
export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-center text-2xl font-bold">Create account</h1>
      <AuthForm action={registerAction} mode="register" />
      <p className="mt-4 text-center text-sm">Have an account? <Link className="underline" href="/login">Log in</Link></p>
    </>
  );
}
