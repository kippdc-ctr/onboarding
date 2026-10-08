"use client";

import { useState, useTransition } from "react";
import { FIELDS, ImportKind, Mapping, unmappedColumns } from "@/lib/mapping";
import {
  analyzeCsv,
  commitAggregateAction,
  commitResultsAction,
  commitRosterAction,
  previewAggregateAction,
  previewResultsAction,
  previewRosterAction,
} from "@/app/actions/imports";
import type { AggregatePreview, Problem, ResultsPreview, RosterPreview } from "@/lib/imports";

export type GoalOption = { id: number; number: number; text: string; resultsOk: boolean; reason: string | null; measured_at: string | null; source: string };

type Props = {
  year: string;
  goals: GoalOption[];
  periods: string[];
  sources: { key: string; label: string }[];
  today: string;
  initialKind: ImportKind;
  initialGoal: number | null;
};

const TABS: [ImportKind, string, string][] = [
  ["roster", "Roster", "Residents, campus, school, grade band, status, demographics. Matches on legal name + campus; never deletes anyone."],
  ["results", "Resident results for one goal", "One row per resident with Met / Not met (or a score). Builds every breakdown and the \"who is missing\" list."],
  ["aggregate", "Aggregate numbers", "One row per goal and period with a numerator and denominator. Use for surveys, alumni, recruitment, or anything already summarized."],
];

const TEMPLATES: Record<ImportKind, string> = {
  roster: "First,Last,Preferred,Email,Campus,School,Grade band,Group,Cohort,Role,Status,Mentor teacher,Race/ethnicity,Gender",
  results: "First,Last,Campus,Result",
  aggregate: "Goal,Period,Numerator,Denominator,Breakdown,Breakdown value,Note",
};

export function ImportWizard({ year, goals, periods, sources, today, initialKind, initialGoal }: Props) {
  const [kind, setKind] = useState<ImportKind>(initialKind);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [rowCount, setRowCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Options
  const firstGoal = goals.find((g) => g.id === initialGoal && g.resultsOk) ?? goals.find((g) => g.resultsOk);
  const [goalId, setGoalId] = useState<number | null>(firstGoal?.id ?? null);
  const [period, setPeriod] = useState<string>(firstGoal?.measured_at ?? "");
  const [threshold, setThreshold] = useState("");
  const [missingAsNotMet, setMissingAsNotMet] = useState(false);
  const [dataThrough, setDataThrough] = useState(today);
  const [source, setSource] = useState(sources[0]?.key ?? "");

  const [roster, setRoster] = useState<RosterPreview | null>(null);
  const [results, setResults] = useState<ResultsPreview | null>(null);
  const [aggregate, setAggregate] = useState<AggregatePreview | null>(null);

  function resetPreview() {
    setRoster(null);
    setResults(null);
    setAggregate(null);
    setResult(null);
    setError(null);
  }
  function resetAll() {
    resetPreview();
    setHeaders(null);
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    setFileName(f.name);
    setCsv(await f.text());
    resetAll();
  }

  const thresholdNum = threshold.trim() === "" ? null : Number(threshold);
  const resultsOpts = { goalId: goalId ?? 0, period, threshold: thresholdNum !== null && Number.isFinite(thresholdNum) ? thresholdNum : null, missingAsNotMet };

  function analyze() {
    start(async () => {
      resetPreview();
      try {
        const r = await analyzeCsv(kind, csv);
        if (r.error) setError(r.error);
        setHeaders(r.headers);
        setMapping(r.mapping);
        setRowCount(r.rowCount);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't read that file.");
      }
    });
  }

  function preview() {
    start(async () => {
      resetPreview();
      try {
        if (kind === "roster") setRoster(await previewRosterAction(csv, mapping));
        if (kind === "results") setResults(await previewResultsAction(csv, mapping, resultsOpts));
        if (kind === "aggregate") setAggregate(await previewAggregateAction(csv, mapping, source));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Preview failed.");
      }
    });
  }

  function commit() {
    start(async () => {
      let r: { message?: string; error?: string };
      if (kind === "roster") r = await commitRosterAction(csv, mapping, fileName);
      else if (kind === "results") r = await commitResultsAction(csv, mapping, { ...resultsOpts, dataThrough, fileName });
      else r = await commitAggregateAction(csv, mapping, { source, dataThrough, fileName });
      if (r.error) setError(r.error);
      else {
        resetAll();
        setCsv("");
        setFileName(null);
        setResult(r.message ?? "Saved.");
      }
    });
  }

  const unknown = headers ? unmappedColumns(mapping, headers) : [];
  const previewError = roster?.error ?? results?.error ?? aggregate?.error;
  const ready = !!(roster && !roster.error) || !!(results && !results.error) || !!(aggregate && !aggregate.error);
  const selectedGoal = goals.find((g) => g.id === goalId);

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="What are you importing?" className="flex flex-wrap gap-2">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={kind === k}
            onClick={() => {
              setKind(k);
              resetAll();
            }}
            className={`rounded-full border-2 px-4 py-1.5 font-semibold ${kind === k ? "border-teal-ink bg-teal-ink text-white" : "border-teal bg-white text-teal-ink hover:bg-teal-wash"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="card space-y-4">
        <p>{TABS.find((t) => t[0] === kind)![2]}</p>
        <p className="text-sm text-muted">
          Expected columns (names can differ; you&apos;ll match them next): <code className="rounded bg-sand px-1 break-all">{TEMPLATES[kind]}</code>
        </p>

        {kind === "results" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="sm:col-span-2">
              <span className="label">Goal</span>
              <select
                className="input"
                value={goalId ?? ""}
                onChange={(e) => {
                  const g = goals.find((x) => x.id === Number(e.target.value));
                  setGoalId(g?.id ?? null);
                  if (g?.measured_at) setPeriod(g.measured_at);
                  resetPreview();
                }}
              >
                {goals.map((g) => (
                  <option key={g.id} value={g.id} disabled={!g.resultsOk}>
                    {g.number}. {g.text.length > 70 ? g.text.slice(0, 70) + "…" : g.text}
                    {!g.resultsOk && g.reason ? ` (${g.reason})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Period</span>
              <select className="input" value={period} onChange={(e) => (setPeriod(e.target.value), resetPreview())}>
                <option value="">Choose…</option>
                {periods.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Score threshold (optional)</span>
              <input className="input" inputMode="decimal" placeholder="e.g. 3.0" value={threshold} onChange={(e) => (setThreshold(e.target.value), resetPreview())} />
            </label>
            <label className="flex items-center gap-2 sm:col-span-2 lg:col-span-4">
              <input type="checkbox" className="h-5 w-5" checked={missingAsNotMet} onChange={(e) => (setMissingAsNotMet(e.target.checked), resetPreview())} />
              <span>Count residents who aren&apos;t in the file as &quot;not met&quot; (otherwise they&apos;re listed as not counted)</span>
            </label>
          </div>
        )}

        {kind === "aggregate" && (
          <label className="block max-w-md">
            <span className="label">Source</span>
            <select className="input" value={source} onChange={(e) => (setSource(e.target.value), resetPreview())}>
              {sources.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="label">CSV file</span>
          <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={(e) => onFile(e.target.files?.[0])} className="block" />
        </label>
        <p className="text-sm text-muted">From Google Sheets: File → Download → Comma-separated values (.csv), one tab at a time. Or copy the cells and paste them below.</p>
        <label className="block">
          <span className="label">…or paste</span>
          <textarea
            className="input font-mono text-sm"
            rows={6}
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setFileName(null);
              resetAll();
            }}
          />
        </label>
        <button type="button" className="btn-small" disabled={!csv.trim() || pending} onClick={analyze}>
          Next: match columns
        </button>
      </div>

      {headers && headers.length > 0 && (
        <div className="card space-y-4">
          <h2 className="h3">Match columns ({rowCount} row{rowCount === 1 ? "" : "s"} found)</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS[kind].map((f) => (
              <label key={f.key} className="block">
                <span className="label text-sm">
                  {f.label}
                  {f.required && <span className="text-coral-ink"> *</span>}
                </span>
                <select
                  className="input min-h-10 py-1"
                  value={mapping[f.key] ?? ""}
                  onChange={(e) => {
                    setMapping({ ...mapping, [f.key]: e.target.value === "" ? null : Number(e.target.value) });
                    resetPreview();
                  }}
                >
                  <option value="">(not in this file)</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
                {f.help && <span className="mt-1 block text-xs text-muted">{f.help}</span>}
              </label>
            ))}
          </div>
          {unknown.length > 0 && (
            <p className="rounded-xl bg-yellow-wash p-3 text-sm">
              <strong>Columns that won&apos;t be imported:</strong> {unknown.join(", ")}
            </p>
          )}
          {kind === "roster" && <p className="text-sm text-muted">Columns set to &quot;not in this file&quot; leave existing values alone.</p>}
          <button type="button" className="btn-small" disabled={pending} onClick={preview}>
            Preview
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl border-2 border-coral bg-coral-wash p-3 font-semibold text-coral-ink">
          {error}
        </p>
      )}
      {previewError && (
        <p role="alert" className="rounded-xl border-2 border-coral bg-coral-wash p-3 font-semibold text-coral-ink">
          {previewError}
        </p>
      )}

      {ready && (
        <div className="card space-y-4">
          <h2 className="h3">Preview: nothing is saved yet</h2>
          {roster && !roster.error && <RosterPreviewView p={roster} />}
          {results && !results.error && <ResultsPreviewView p={results} goalNumber={selectedGoal?.number} period={period} missingAsNotMet={missingAsNotMet} />}
          {aggregate && !aggregate.error && <AggregatePreviewView p={aggregate} />}

          {kind !== "roster" && (
            <label className="block max-w-xs">
              <span className="label">Data through</span>
              <input type="date" className="input" value={dataThrough} onChange={(e) => setDataThrough(e.target.value)} />
            </label>
          )}
          <button type="button" className="btn-primary" disabled={pending} onClick={commit}>
            Save to {year}
          </button>
        </div>
      )}
      {result && (
        <p role="status" className="rounded-xl border-2 border-teal bg-teal-wash p-3 font-semibold text-teal-ink">
          {result}
        </p>
      )}
    </div>
  );
}

function Problems({ problems }: { problems: Problem[] }) {
  if (!problems.length) return null;
  return (
    <div className="rounded-xl border-2 border-coral bg-coral-wash p-3">
      <p className="font-bold text-coral-ink">
        {problems.length} row{problems.length === 1 ? "" : "s"} will be skipped
      </p>
      <ul className="mt-1 list-disc pl-6 text-sm">
        {problems.map((r) => (
          <li key={r.line}>
            Line {r.line}: {r.name}: {r.problem}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RosterPreviewView({ p }: { p: RosterPreview }) {
  const n = (a: string) => p.rows.filter((r) => r.action === a).length;
  return (
    <div className="space-y-3">
      <Problems problems={p.problems} />
      <p className="font-bold">
        {n("new")} new · {n("update")} updated · {n("same")} unchanged
      </p>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-brand/30">
              <th className="th">Line</th>
              <th className="th">Name</th>
              <th className="th">Campus</th>
              <th className="th">What happens</th>
            </tr>
          </thead>
          <tbody>
            {p.rows.map((r) => (
              <tr key={r.line} className="border-b border-gray-brand/10">
                <td className="td">{r.line}</td>
                <td className="td">{r.name}</td>
                <td className="td">{r.campus}</td>
                <td className="td">{r.action === "new" ? "Add" : r.action === "update" ? `Update: ${r.changes.join(", ")}` : "No change"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {p.notInFile.length > 0 && (
        <details className="rounded-xl bg-yellow-wash p-3 text-sm">
          <summary className="cursor-pointer font-semibold">{p.notInFile.length} resident(s) already on the roster aren&apos;t in this file (left as they are)</summary>
          <p className="mt-1">{p.notInFile.join("; ")}</p>
        </details>
      )}
    </div>
  );
}

function ResultsPreviewView({ p, goalNumber, period, missingAsNotMet }: { p: ResultsPreview; goalNumber?: number; period: string; missingAsNotMet: boolean }) {
  const pct = p.denominator ? Math.round((p.numerator / p.denominator) * 100) : null;
  return (
    <div className="space-y-3">
      <Problems problems={p.problems} />
      <p className="text-lg font-bold">
        Goal {goalNumber}, {period}: {p.numerator} of {p.denominator} met{pct !== null && ` (${pct}%)`}
      </p>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-brand/30">
              <th className="th">Line</th>
              <th className="th">In file</th>
              <th className="th">Matched resident</th>
              <th className="th">Value</th>
              <th className="th">Counts as</th>
            </tr>
          </thead>
          <tbody>
            {p.rows.map((r) => (
              <tr key={r.line} className="border-b border-gray-brand/10">
                <td className="td">{r.line}</td>
                <td className="td">{r.name}</td>
                <td className="td">
                  {r.residentName} <span className="text-muted">· {r.campus}</span>
                </td>
                <td className="td">{r.raw || "—"}</td>
                <td className="td">{!r.counted ? <span className="text-muted">Not counted: {r.reason}</span> : r.met ? "✓ Met" : <span className="font-semibold text-coral-ink">✗ Not met</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {p.missing.length > 0 && (
        <details className="rounded-xl bg-yellow-wash p-3 text-sm" open={p.missing.length <= 10}>
          <summary className="cursor-pointer font-semibold">
            {p.missing.length} resident(s) on the roster aren&apos;t in this file ({missingAsNotMet ? "counted as not met" : "listed as not counted"})
          </summary>
          <p className="mt-1">{p.missing.map((m) => `${m.name} (${m.campus ?? "—"})`).join("; ")}</p>
        </details>
      )}
    </div>
  );
}

function AggregatePreviewView({ p }: { p: AggregatePreview }) {
  return (
    <div className="space-y-3">
      <Problems problems={p.problems} />
      {p.replaces.length > 0 && (
        <p className="rounded-xl bg-yellow-wash p-3 text-sm">
          <strong>Replaces what&apos;s saved for:</strong> {p.replaces.join("; ")}
        </p>
      )}
      <p className="font-bold">
        {p.rows.length} row{p.rows.length === 1 ? "" : "s"} ready to save
      </p>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-brand/30">
              <th className="th">Line</th>
              <th className="th">Goal</th>
              <th className="th">Period</th>
              <th className="th">Breakdown</th>
              <th className="th">Value</th>
              <th className="th">Note</th>
            </tr>
          </thead>
          <tbody>
            {p.rows.map((r) => (
              <tr key={r.line} className="border-b border-gray-brand/10">
                <td className="td">{r.line}</td>
                <td className="td">{r.goalNumber}</td>
                <td className="td">{r.period}</td>
                <td className="td">{r.breakdown_type === "all" ? "All" : `${r.breakdown_type}: ${r.breakdown_value}`}</td>
                <td className="td">
                  {r.numerator}
                  {r.denominator !== null && ` / ${r.denominator}`}
                  {r.denominator ? ` (${Math.round((r.numerator / r.denominator) * 100)}%)` : ""}
                </td>
                <td className="td">
                  {r.note}
                  {r.warning && <span className="block text-xs text-coral-ink">{r.warning}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
