/* eslint-disable @next/next/no-img-element */
import { requireUser } from "@/lib/auth";
import { loadDataset } from "@/lib/data";
import { latestByIndicator, type Latest } from "@/lib/summary";
import { addDays, formatDate, todayISO } from "@/lib/dates";
import { average, cycleForDate, fmtAvg } from "@/lib/rules";
import { cls } from "@/lib/ui";
import { CfsDots, ScorePill } from "@/components/Score";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

const LE = ["CC.A.4", "CC.A.5", "CC.A.6", "CC.A.7"];
const MIN_GROUP = 5;

function monthEnd(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return addDays(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`, -1);
}
function prevMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export default async function OnePagers({ searchParams }: { searchParams: Promise<{ month?: string; campus?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const ds = await loadDataset();
  const { cfg } = ds;
  const today = todayISO();
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const end = monthEnd(month) < today ? monthEnd(month) : today;
  const prevEnd = monthEnd(prevMonth(month));
  const cycle = cycleForDate(end, cfg.cycles);
  const campuses = sp.campus ? [sp.campus] : cfg.campuses;
  const inds = cfg.indicators.filter((i) => LE.includes(i.code));
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(month + "-15T12:00:00Z"));

  const enrolled = ds.residents.filter((r) => r.active);
  const latestAt = (rid: string, d: string) => latestByIndicator((ds.byResident.get(rid) ?? []).filter((o) => o.observed_date <= d));

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Campus one-pagers</h1>
          <p className="text-sm text-muted">Learning Environment (CC.A.4 to CC.A.7) for currently enrolled residents, latest scores as of {formatDate(end)}. Percentages are hidden for groups under {MIN_GROUP}. No demographic data. Use Download PDF and choose &quot;Save as PDF&quot; (one page per campus).</p>
        </div>
        <form className="flex flex-wrap gap-2">
          <input type="month" name="month" defaultValue={month} className="input sm:!w-auto" aria-label="Month" />
          <select name="campus" defaultValue={sp.campus ?? ""} className="input sm:!w-auto" aria-label="Campus"><option value="">All campuses</option>{cfg.campuses.map((c) => <option key={c}>{c}</option>)}</select>
          <button className="btn-small">Show</button>
          <PrintButton />
        </form>
      </div>

      {campuses.map((campus) => {
        const rs = enrolled.filter((r) => r.campus === campus).sort((a, b) => a.full_name.localeCompare(b.full_name));
        const now = new Map(rs.map((r) => [r.id, latestAt(r.id, end)]));
        const before = new Map(rs.map((r) => [r.id, latestAt(r.id, prevEnd)]));
        const observedThisCycle = (rid: string) => (ds.byResident.get(rid) ?? []).some((o) => o.cycle === cycle && o.observed_date <= end);
        const scored = (m: Map<string, Map<string, Latest>>, code: string) => rs.map((r) => m.get(r.id)!.get(code)).filter((l): l is Latest => !!l && !l.early && l.score !== null);
        const cfsRows = inds.flatMap((i) => cfg.cfs.filter((c) => c.indicator === i.code).map((c) => {
          const s = scored(now, i.code);
          return { c, n: s.length, p: s.length ? Math.round((100 * s.filter((l) => l.cfs.includes(c.id)).length) / s.length) : null };
        }));
        const priority = cfsRows.filter((x) => x.p !== null && x.n >= MIN_GROUP).sort((a, b) => a.p! - b.p!).slice(0, 3);
        return (
          <article key={campus} className="onepager card mx-auto max-w-[8.5in] bg-white">
            <header className="text-center">
              <img src="/brand/ctr-logo.png" alt="Capital Teaching Residency" className="mx-auto h-16 w-16" />
              <h2 className="mt-1 text-2xl font-bold text-teal-ink">{campus}: Learning Environment</h2>
              <p className="text-sm text-muted">{monthLabel} · Cycle {cycle} · {rs.length} resident{rs.length === 1 ? "" : "s"} currently enrolled</p>
            </header>

            <section className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Overview">
              {inds.map((i) => {
                const s = scored(now, i.code);
                const p = scored(before, i.code);
                const avg = average(s.map((l) => l.score));
                const prevAvg = average(p.map((l) => l.score));
                const hidden = s.length < MIN_GROUP;
                return (
                  <div key={i.code} className="rounded-xl border border-gray-brand/30 p-2 text-center">
                    <p className="text-xs font-bold">{i.code}</p>
                    <p className="text-xs text-muted">{i.short_label}</p>
                    {hidden ? <p className="mt-1 text-xs text-muted">Fewer than {MIN_GROUP} scored</p> : (
                      <>
                        <p className="text-2xl font-bold text-teal-ink">{fmtAvg(avg, 1)}</p>
                        <p className="text-xs">{Math.round((100 * s.filter((l) => l.score! >= 3).length) / s.length)}% at 3+</p>
                        {prevAvg !== null && avg !== null && p.length >= MIN_GROUP && (
                          <p className={cls("text-xs font-semibold", avg - prevAvg > 0 ? "text-teal-ink" : avg - prevAvg < 0 ? "text-coral-ink" : "text-muted")}>
                            {avg - prevAvg > 0 ? "↑" : avg - prevAvg < 0 ? "↓" : "→"} {Math.abs(avg - prevAvg).toFixed(1)} vs last month
                          </p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </section>

            <section className="mt-4" aria-label="Residents">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b-2 border-gray-brand/40">
                    <th scope="col" className="py-1 text-left">Resident</th>
                    <th scope="col" className="py-1 text-left">School</th>
                    {inds.map((i) => <th key={i.code} scope="col" className="py-1 text-center">{i.code}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rs.map((r) => {
                    const l = now.get(r.id)!;
                    const seen = observedThisCycle(r.id);
                    return (
                      <tr key={r.id} className="border-b border-gray-brand/20">
                        <td className="py-1 pr-2 font-semibold">{r.full_name}</td>
                        <td className="py-1 pr-2">{r.school}</td>
                        {!seen && !inds.some((i) => l.get(i.code)) ? (
                          <td colSpan={inds.length} className="py-1 text-center italic text-muted">Not yet observed this cycle</td>
                        ) : inds.map((i) => {
                          const x = l.get(i.code);
                          return (
                            <td key={i.code} className="py-1 text-center">
                              {x ? <span className="inline-flex flex-col items-center gap-0.5"><ScorePill size="sm" score={x.score} early={x.early} /><CfsDots items={cfg.cfs.filter((c) => c.indicator === i.code)} demonstrated={x.cfs} /></span> : <span className="text-muted">–</span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-[0.65rem] text-muted">Pills: 1 Area of concern · 2 Approaches · 3 Meets · 4 Exceeds. Dots: filled = look-for demonstrated, ring = not yet seen. Scores are a single moment in time and do not impact program standing.</p>
            </section>

            <section className="mt-3 grid gap-3 sm:grid-cols-[1fr_14rem]">
              <div aria-label="Percent demonstrating each look-for">
                <h3 className="text-sm font-bold text-teal-ink">% demonstrating each look-for</h3>
                <ul className="mt-1 grid gap-x-4 text-xs sm:grid-cols-2">
                  {cfsRows.map((x) => (
                    <li key={x.c.id} className="flex justify-between gap-2 border-b border-gray-brand/10 py-0.5">
                      <span>{x.c.id.slice(0, 6)} {x.c.short_label}</span>
                      <span className={cls("font-bold", x.p !== null && x.n >= MIN_GROUP && x.p < 50 && "text-coral-ink")}>{x.p === null || x.n < MIN_GROUP ? "–" : `${x.p}%`}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl bg-coral-wash p-2" aria-label="Priority look-fors">
                <h3 className="text-sm font-bold text-coral-ink">Priority Look-Fors</h3>
                {priority.length === 0 ? <p className="text-xs text-muted">Not enough scored residents to name priorities.</p> : (
                  <ol className="mt-1 list-decimal pl-4 text-xs">{priority.map((x) => <li key={x.c.id}><b>{x.c.short_label}</b> ({x.p}%): {x.c.full_text}</li>)}</ol>
                )}
              </div>
            </section>
          </article>
        );
      })}
    </div>
  );
}
