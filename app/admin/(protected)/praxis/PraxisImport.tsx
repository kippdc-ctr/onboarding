"use client";

import { useState, useTransition } from "react";
import { commitPraxis, previewPraxis, PraxisPreviewRow } from "@/app/actions/admin";

export function PraxisImport() {
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<PraxisPreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function onFile(f: File | undefined) {
    if (!f) return;
    setCsv(await f.text());
    setRows(null);
    setResult(null);
  }

  const good = rows?.filter((r) => !r.problem) ?? [];
  const bad = rows?.filter((r) => r.problem) ?? [];

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <label className="block">
          <span className="label">CSV file</span>
          <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="block" />
        </label>
        <label className="block">
          <span className="label">…or paste CSV</span>
          <textarea className="input font-mono" rows={6} value={csv} onChange={(e) => { setCsv(e.target.value); setRows(null); setResult(null); }} />
        </label>
        <button
          type="button"
          className="btn-small"
          disabled={!csv.trim() || pending}
          onClick={() =>
            start(async () => {
              const res = await previewPraxis(csv);
              setError(res.error ?? null);
              setRows(res.rows);
            })
          }
        >
          Preview
        </button>
        {error && <p role="alert" className="font-semibold text-coral-ink">{error}</p>}
      </div>

      {rows && (
        <div className="card space-y-4">
          {bad.length > 0 && (
            <div className="rounded-xl border-2 border-coral bg-coral-wash p-3">
              <p className="font-bold text-coral-ink">{bad.length} row{bad.length === 1 ? "" : "s"} will be skipped</p>
              <ul className="mt-1 list-disc pl-6">
                {bad.map((r) => (
                  <li key={r.line}>
                    Line {r.line}: {r.name || "(no name)"}: {r.problem}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="font-bold">{good.length} row{good.length === 1 ? "" : "s"} ready to save</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b-2 border-gray-brand/30">
                  <th className="p-1">Line</th><th className="p-1">CSV name</th><th className="p-1">Matched resident</th><th className="p-1">Stage</th><th className="p-1">Math</th><th className="p-1">Reading</th><th className="p-1">Writing</th>
                </tr>
              </thead>
              <tbody>
                {good.map((r) => (
                  <tr key={r.line} className="border-b border-gray-brand/10">
                    <td className="p-1">{r.line}</td><td className="p-1">{r.name}</td><td className="p-1">{r.matchedName}</td><td className="p-1">{r.stage ?? "—"}</td><td className="p-1">{r.math || "—"}</td><td className="p-1">{r.reading || "—"}</td><td className="p-1">{r.writing || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={!good.length || pending}
            onClick={() =>
              start(async () => {
                const res = await commitPraxis(csv);
                setResult(`Saved ${res.saved} resident${res.saved === 1 ? "" : "s"}. Skipped ${res.skipped}.`);
                setRows(null);
              })
            }
          >
            Save {good.length} row{good.length === 1 ? "" : "s"}
          </button>
        </div>
      )}
      {result && <p role="status" className="rounded-xl border-2 border-teal bg-teal-wash p-3 font-semibold text-teal-ink">{result}</p>}
    </div>
  );
}
