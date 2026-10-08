import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadDataset } from "@/lib/data";
import { summarize } from "@/lib/summary";
import { todayISO } from "@/lib/dates";
import { TrackChip } from "@/components/TrackChip";

export const dynamic = "force-dynamic";

export default async function ResidentsPage({ searchParams }: { searchParams: Promise<{ q?: string; inactive?: string; campus?: string; advisor?: string; track?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const today = todayISO();
  const ds = await loadDataset();
  const q = (sp.q ?? "").toLowerCase();
  const rows = ds.residents
    .filter((r) => sp.inactive || r.active)
    .filter((r) => !q || r.full_name.toLowerCase().includes(q))
    .filter((r) => !sp.campus || r.campus === sp.campus)
    .filter((r) => !sp.advisor || r.advisor_code === sp.advisor)
    .map((r) => summarize(r, ds.byResident.get(r.id) ?? [], ds.cfg, ds.rules.get(r.id)!, today))
    .filter((s) => !sp.track || s.standing.track === sp.track);
  const advisors = [...new Set(ds.residents.map((r) => r.advisor_code).filter(Boolean))].sort();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="h1">Residents</h1>
        <Link className="btn-small" href="/settings/import">Import roster</Link>
      </div>
      <form className="card grid gap-2 !p-4 sm:grid-cols-5">
        <input name="q" defaultValue={sp.q} placeholder="Name" className="input" aria-label="Name" />
        <select name="campus" defaultValue={sp.campus ?? ""} className="input" aria-label="Campus">
          <option value="">All campuses</option>
          {ds.cfg.campuses.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select name="advisor" defaultValue={sp.advisor ?? ""} className="input" aria-label="Advisor">
          <option value="">All advisors</option>
          {advisors.map((a) => <option key={a}>{a}</option>)}
        </select>
        <select name="track" defaultValue={sp.track ?? ""} className="input" aria-label="Track">
          <option value="">All tracks</option>
          {ds.cfg.tracks.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="inactive" value="1" defaultChecked={!!sp.inactive} /> Include inactive</label>
          <button className="btn-small">Filter</button>
        </div>
      </form>
      <div className="card overflow-x-auto !p-0">
        <table className="table-basic">
          <thead><tr><th scope="col">Resident</th><th scope="col">Track</th><th scope="col">Campus</th><th scope="col">School</th><th scope="col">Advisor</th><th scope="col">Mentor</th><th scope="col">Observations</th><th scope="col">Last</th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.resident.id} className={s.resident.active ? "" : "opacity-60"}>
                <td><Link className="link" href={`/residents/${s.resident.id}`}>{s.resident.full_name}</Link>{!s.resident.active && <span className="ml-1 text-xs">(inactive)</span>}</td>
                <td><TrackChip track={s.standing.track} name={s.standing.trackName} tier={s.standing.tier} /></td>
                <td>{s.resident.campus}</td>
                <td>{s.resident.school}</td>
                <td>{s.resident.advisor_code}</td>
                <td>{s.resident.mentor_teacher}</td>
                <td className="text-center">{(ds.byResident.get(s.resident.id) ?? []).length}</td>
                <td className="whitespace-nowrap">{s.daysSince === null ? "Never" : `${s.daysSince} days ago`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
