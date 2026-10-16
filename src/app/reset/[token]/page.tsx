import { ResetForm } from "./form";
export const metadata = { title: "Reset password", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (<><h1 className="mb-4 text-center text-2xl font-bold">Choose a new password</h1><ResetForm token={token} /></>);
}
