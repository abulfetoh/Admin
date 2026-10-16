import { unsubscribe } from "@/lib/alerts";
import { getDb } from "@/lib/db";

export const metadata = { title: "Unsubscribe", robots: { index: false } };

async function confirm(fd: FormData) {
  "use server";
  await unsubscribe(await getDb(), String(fd.get("token")));
}

// POST-only (button) so email-scanner link prefetching can't silently unsubscribe people.
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <form action={confirm} className="space-y-3">
      <h1 className="text-xl font-bold">Stop job alerts?</h1>
      <input type="hidden" name="token" value={token} />
      <button className="rounded bg-slate-900 px-4 py-2 text-white">Unsubscribe</button>
    </form>
  );
}
