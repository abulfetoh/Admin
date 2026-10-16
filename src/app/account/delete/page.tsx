import { requireRole } from "@/lib/session";
import { DeleteForm } from "./form";

export const metadata = { title: "Delete account", robots: { index: false } };
export default async function Page() {
  await requireRole("candidate", "employer", "admin");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Delete account</h1>
      <p className="text-sm">This permanently deletes your profile, alerts and sign-in. Jobs you posted are taken down. It cannot be undone. <a className="underline" href="/account/export.json">Download your data first</a>.</p>
      <DeleteForm />
    </div>
  );
}
