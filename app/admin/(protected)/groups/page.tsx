import { getConfig } from "@/lib/data";
import { formatDate, todayISO } from "@/lib/dates";
import { moduleDue, phase1Due, phaseItemDue } from "@/lib/progress";
import { saveGroups } from "@/app/actions/admin";
import { Flash } from "@/components/Flash";

export const dynamic = "force-dynamic";

export default async function Groups({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const cfg = await getConfig(todayISO());
  const p3 = cfg.phaseItems.filter((i) => i.phase === 3);
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8];
  const ov = (g: number, t: string) => cfg.overrides.find((o) => o.group_number === g && o.target === t)?.due_date ?? "";

  const warnings = numbers
    .filter((n) => cfg.groups.some((g) => g.number === n && g.welcome_email_date))
    .flatMap((n) => {
      const p1 = phase1Due(cfg, n);
      if (!p1) return [];
      const p2 = cfg.modules.filter((m) => m.enabled).map((m) => moduleDue(cfg, m.slug, n)).filter((d): d is string => !!d).sort()[0];
      const p3d = p3.map((i) => phaseItemDue(cfg, i, n)).filter((d): d is string => !!d).sort()[0];
      const out: string[] = [];
      if (p2 && p1 > p2) out.push(`Group ${n}: Phase 1 is due ${formatDate(p1)}, after the first Phase 2 due date (${formatDate(p2)}).`);
      if (p3d && p1 > p3d) out.push(`Group ${n}: Phase 1 is due ${formatDate(p1)}, after the Phase 3 due date (${formatDate(p3d)}).`);
      return out;
    });

  return (
    <div className="space-y-6">
      <h1 className="h1">Groups</h1>
      <Flash ok={sp.ok} error={sp.error} />
      {warnings.length > 0 && (
        <div role="alert" className="rounded-2xl border-2 border-coral bg-coral-wash p-4">
          <p className="font-bold text-coral-ink">Due dates out of order (late-group rule needs a decision)</p>
          <ul className="mt-2 list-disc pl-6">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm">Use the per-group overrides below to set different dates for that group. Blank means the standard date.</p>
        </div>
      )}
      <form action={saveGroups} className="space-y-4">
        <div className="card overflow-x-auto">
          <p className="text-muted">Phase 1 is due 14 days after the group&apos;s welcome email date (the hiring-complete date). Leave a group blank if it isn&apos;t used.</p>
          <table className="mt-3 w-full min-w-[36rem] text-left">
            <thead>
              <tr className="border-b-2 border-gray-brand/30">
                <th className="p-2">Group</th>
                <th className="p-2">Welcome email date</th>
                <th className="p-2">Phase 1 due (calculated)</th>
              </tr>
            </thead>
            <tbody>
              {numbers.map((n) => {
                const g = cfg.groups.find((x) => x.number === n);
                const p1 = phase1Due(cfg, n);
                return (
                  <tr key={n} className="border-b border-gray-brand/20">
                    <th scope="row" className="p-2">
                      Group {n}
                    </th>
                    <td className="p-2">
                      <input type="date" name={`group_${n}`} defaultValue={g?.welcome_email_date ?? ""} className="input max-w-52" aria-label={`Group ${n} welcome email date`} />
                    </td>
                    <td className="p-2">
                      {g?.welcome_email_date ? formatDate(p1, { weekday: true }) : "—"}
                      {ov(n, "phase1") && <span className="ml-2 text-sm font-semibold text-coral-ink">(override)</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="card space-y-3">
          <h2 className="h2">Per-group due date overrides</h2>
          <p className="text-muted">Blank = use the standard date. Set a date only for groups that need something different (for example Group 6).</p>
          {numbers
            .filter((n) => cfg.groups.some((g) => g.number === n && g.welcome_email_date))
            .map((n) => {
              const count = cfg.overrides.filter((o) => o.group_number === n).length;
              return (
                <details key={n} className="rounded-xl border border-gray-brand/30 p-3" open={count > 0}>
                  <summary className="cursor-pointer font-bold">
                    Group {n} {count > 0 && <span className="text-sm text-coral-ink">({count} override{count === 1 ? "" : "s"})</span>}
                  </summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label>
                      <span className="label">Phase 1 (all items)</span>
                      <input type="date" name={`ov__${n}__phase1`} defaultValue={ov(n, "phase1")} className="input" />
                    </label>
                    {cfg.modules.map((m) => (
                      <label key={m.slug}>
                        <span className="label">
                          Module: {m.title} <span className="font-normal text-muted">(std {formatDate(m.due_date, { year: false })})</span>
                        </span>
                        <input type="date" name={`ov__${n}__module:${m.slug}`} defaultValue={ov(n, `module:${m.slug}`)} className="input" />
                      </label>
                    ))}
                    {p3.map((i) => (
                      <label key={i.id}>
                        <span className="label">
                          Phase 3: {i.label} <span className="font-normal text-muted">(std {formatDate(i.due_date, { year: false })})</span>
                        </span>
                        <input type="date" name={`ov__${n}__item:${i.id}`} defaultValue={ov(n, `item:${i.id}`)} className="input" />
                      </label>
                    ))}
                  </div>
                </details>
              );
            })}
        </div>
        <button type="submit" className="btn-primary">
          Save groups
        </button>
      </form>
    </div>
  );
}
