import Link from "next/link";
import { getDb } from "@/lib/db";
import { searchJobs, jobPath } from "@/lib/jobs";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export const dynamic = "force-dynamic";

type SP = { q?: string; location?: string; remote?: string; page?: string };

export default async function Home({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const locale = await getLocale();
  const s = t(locale);
  const page = Math.max(Number(sp.page) || 1, 1);
  const res = await searchJobs(await getDb(), { q: sp.q, location: sp.location, remote: sp.remote === "1", page });
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (sp.q) u.set("q", sp.q);
    if (sp.location) u.set("location", sp.location);
    if (sp.remote) u.set("remote", sp.remote);
    u.set("page", String(p));
    return `/?${u}`;
  };

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">{s.tagline}</h1>
      <form role="search" className="mb-6 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder={s.searchPlaceholder} aria-label={s.searchPlaceholder} className="min-w-48 flex-1 rounded border border-slate-300 px-3 py-2" />
        <input name="location" defaultValue={sp.location} placeholder={s.locationPlaceholder} aria-label={s.locationPlaceholder} className="min-w-40 rounded border border-slate-300 px-3 py-2" />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="remote" value="1" defaultChecked={sp.remote === "1"} /> {s.remoteOnly}
        </label>
        <button className="rounded bg-slate-900 px-4 py-2 text-white">{s.search}</button>
      </form>
      <p className="mb-3 text-sm text-slate-600">{res.total} {s.results}</p>
      {res.fuzzy && res.total > 0 && <p className="mb-3 text-sm text-amber-700">{s.didYouMean}</p>}
      {res.total === 0 && <p>{s.noResults}</p>}
      <ul className="divide-y divide-slate-200">
        {res.jobs.map((j) => (
          <li key={j.id} className="py-3">
            <Link href={jobPath(j)} className="font-semibold text-blue-700 hover:underline">{j.title}</Link>
            <div className="text-sm text-slate-700">
              {j.company_name}{j.location ? ` · ${j.location}` : ""}{j.remote ? ` · ${s.remote}` : ""}
            </div>
          </li>
        ))}
      </ul>
      <nav className="mt-6 flex gap-4 text-sm">
        {page > 1 && <Link href={qs(page - 1)}>{s.prev}</Link>}
        {page * 20 < res.total && <Link href={qs(page + 1)}>{s.next}</Link>}
      </nav>
    </>
  );
}
