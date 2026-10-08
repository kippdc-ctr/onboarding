import Link from "next/link";
import { sql } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { getGoals, getSources, getYear, scoreGoals } from "@/lib/data";
import { daysBetween, fmtDate, fmtDateTime, todayISO } from "@/lib/dates";
import type { Problem } from "@/lib/imports";
import { StatusChip } from "@/components/Chips";

type ImportRow = {
  id: number;
  source: string;
  kind: string;
  file_name: string | null;
  data_through: string | null;
  run_by: string;
  run_at: Date;
  rows_total: number;
  rows_saved: number;
  rows_failed: number;
  problems: Problem[];
  goal_number: number | null;
  period: string | null;
  is_sample: boolean;
};

export default async function HealthPage() {
  const u = await requireUser();
  const year = await getYear();
  const today = todayISO();
  const [sources, goals, imports, [counts]] = await Promise.all([
    getSources(),
    getGoals(year.id),
    sql<ImportRow[]>`
      select i.*, g.number as goal_number from metrics.imports i left join metrics.goals g on g.id = i.goal_id
      where i.school_year = ${year.id} order by i.run_at desc`,
    sql<{ residents: number; enrolled: number }[]>`
      select count(*)::int as residents,
             count(*) filter (where status = (select value from metrics.settings where key = 'enrolled_status'))::int as enrolled
      from metrics.residents where school_year = ${year.id}`,
  ]);
  const scored = await scoreGoals(year, goals);
  const noData = scored.filter((s) => s.ev.status === "no_data");
  const notYet = scored.filter((s) => s.ev.status === "not_yet");
  const yearStarted = year.start_date <= today;
  // RDLs see source freshness but not file names, problem rows, or who ran what.
  const details = u.role !== "rdl";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Data health</h1>
        <p className="text-muted">
          {year.id}: is the data behind the scorecard fresh? Roster: {counts.residents} residents ({counts.enrolled} enrolled).
        </p>
      </div>

      <section className="card p-0 sm:p-0" aria-labelledby="sources">
        <h2 id="sources" className="h3 border-b border-gray-brand/20 px-5 py-3">
          Sources
        </h2>
        <ul>
          {sources.map((s) => {
            const mine = imports.filter((i) => i.source === s.key);
            const last = mine[0];
            const age = last ? daysBetween(new Date(last.run_at).toISOString(), today) : null;
            const stale = s.stale_after_days !== null && yearStarted && (age === null || age > s.stale_after_days);
            const feeding = goals.filter((g) => g.source === s.key).map((g) => g.number);
            return (
              <li key={s.key} className="grid gap-2 border-b border-gray-brand/10 px-5 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_14rem_10rem]">
                <div>
                  <p className="font-semibold">{s.label}</p>
                  <p className="text-sm text-muted">
                    {s.feeds}
                    {feeding.length > 0 && ` · Goals ${feeding.filter((n) => n !== 0).join(", ")}${feeding.includes(0) ? ", Big Goal" : ""}`}
                  </p>
                </div>
                <div className="text-sm">
                  {last ? (
                    <>
                      Last import {fmtDateTime(last.run_at)}
                      {details && (
                        <span className="block text-muted">
                          {last.rows_saved} saved
                          {last.rows_failed > 0 && <strong className="text-coral-ink"> · {last.rows_failed} didn&apos;t match</strong>} · {mine.length} import{mine.length === 1 ? "" : "s"} this year
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted">Nothing imported yet</span>
                  )}
                </div>
                <div>
                  {stale ? (
                    <span className="chip border-coral bg-coral-wash text-coral-ink">
                      <span aria-hidden="true">!</span> Stale{s.stale_after_days ? ` (>${s.stale_after_days} days)` : ""}
                    </span>
                  ) : last ? (
                    <span className="chip border-teal bg-teal-wash text-teal-ink">
                      <span aria-hidden="true">✓</span> Fresh
                    </span>
                  ) : (
                    <span className="text-sm text-muted">{s.stale_after_days ? "—" : "Imported when available"}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card space-y-3" aria-labelledby="nodata">
        <h2 id="nodata" className="h3">
          Goals with an open window and no data ({noData.length})
        </h2>
        {noData.length ? (
          <ul className="space-y-1">
            {noData.map((s) => (
              <li key={s.goal.id} className="flex flex-wrap items-center gap-2">
                <StatusChip status="no_data" />
                <Link href={`/goals/${s.goal.id}`} className="link">
                  {s.goal.number}. {s.goal.text}
                </Link>
                <span className="text-sm text-muted">· {s.goal.measured_label}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">None.</p>
        )}
        <details>
          <summary className="cursor-pointer font-semibold text-teal-ink">Not yet measured ({notYet.length})</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {notYet.map((s) => (
              <li key={s.goal.id}>
                <Link href={`/goals/${s.goal.id}`} className="link">
                  {s.goal.number}.
                </Link>{" "}
                {s.goal.text} <span className="text-muted">· opens {fmtDate(s.ev.windowOpens)}</span>
              </li>
            ))}
          </ul>
        </details>
      </section>

      {details && (
        <section className="card space-y-3" aria-labelledby="log">
          <h2 id="log" className="h3">
            Import history
          </h2>
          {imports.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-brand/30">
                    <th className="th">When</th>
                    <th className="th">What</th>
                    <th className="th">File</th>
                    <th className="th">Data through</th>
                    <th className="th">Rows</th>
                    <th className="th">By</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.slice(0, 100).map((i) => (
                    <tr key={i.id} className="border-b border-gray-brand/10 align-top">
                      <td className="td whitespace-nowrap">{fmtDateTime(i.run_at)}</td>
                      <td className="td">
                        {i.kind === "roster" ? "Roster" : i.kind === "aggregate" ? "Aggregate numbers" : i.kind === "manual" ? "Typed in" : "Resident results"}
                        {i.goal_number !== null && `: goal ${i.goal_number}`}
                        {i.period && `, ${i.period}`}
                        {i.is_sample && <span className="ml-1 text-xs font-bold text-coral-ink">sample</span>}
                      </td>
                      <td className="td">{i.file_name ?? "—"}</td>
                      <td className="td whitespace-nowrap">{fmtDate(i.data_through)}</td>
                      <td className="td">
                        {i.rows_saved} saved
                        {i.rows_failed > 0 && (
                          <details>
                            <summary className="cursor-pointer font-semibold text-coral-ink">{i.rows_failed} skipped</summary>
                            <ul className="list-disc pl-5">
                              {i.problems.map((p) => (
                                <li key={p.line}>
                                  Line {p.line}: {p.name}: {p.problem}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                      <td className="td">{i.run_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted">No imports yet.{can.runImports(u) && " Start with the roster on the Import page."}</p>
          )}
        </section>
      )}
    </div>
  );
}
