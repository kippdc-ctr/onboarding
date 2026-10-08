"use client";

import { useActionState, useState } from "react";
import { migrationAction, rosterAction, type MigrationState, type RosterState } from "@/app/actions/imports";

function CsvField({ value, setValue }: { value: string; setValue: (s: string) => void }) {
  return (
    <div className="space-y-2">
      <input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setValue(await f.text()); }} />
      <textarea name="csv" className="input min-h-24 font-mono text-xs" placeholder="…or paste the CSV here" value={value} onChange={(e) => setValue(e.target.value)} />
    </div>
  );
}

export function RosterImport() {
  const [csv, setCsv] = useState("");
  const [state, action, pending] = useActionState<RosterState, FormData>(rosterAction, {});
  const p = state.preview;
  return (
    <form action={action} className="space-y-3">
      <CsvField value={csv} setValue={setCsv} />
      <button name="mode" value="preview" className="btn-small" disabled={pending}>Preview</button>
      {state.error && <p role="alert" className="font-semibold text-coral-ink">{state.error}</p>}
      {state.done && <p role="status" className="font-semibold text-teal-ink">{state.done}</p>}
      {p && (
        <div className="space-y-2 rounded-xl bg-sand p-3 text-sm">
          <p><b>{p.changes.filter((c) => c.action === "add").length}</b> to add, <b>{p.changes.filter((c) => c.action === "update").length}</b> to update, {p.changes.filter((c) => c.action === "same").length} unchanged.</p>
          <ul className="max-h-64 overflow-y-auto">
            {p.changes.filter((c) => c.action !== "same").map((c, i) => <li key={i}><b>{c.action === "add" ? "Add" : "Update"}</b> {c.name}{c.changes.length ? `: ${c.changes.join("; ")}` : ""}</li>)}
          </ul>
          {p.errors.map((e, i) => <p key={i} className="text-coral-ink">{e}</p>)}
          {p.missing.length > 0 && (
            <label className="flex items-start gap-2"><input type="checkbox" name="deactivate" className="mt-1" /> Mark the {p.missing.length} active residents who aren&apos;t in this file as inactive ({p.missing.map((m) => m.name).join(", ")})</label>
          )}
          <button name="mode" value="apply" className="btn-primary !min-h-10 !text-base" disabled={pending}>Import roster</button>
        </div>
      )}
    </form>
  );
}

export function MigrationImport() {
  const [csv, setCsv] = useState("");
  const [state, action, pending] = useActionState<MigrationState, FormData>(migrationAction, {});
  const rows = state.rows;
  const ready = rows?.filter((r) => !r.exists && r.residentId && r.observer && r.date) ?? [];
  return (
    <form action={action} className="space-y-3">
      <CsvField value={csv} setValue={setCsv} />
      <button name="mode" value="preview" className="btn-small" disabled={pending}>Preview</button>
      {state.error && <p role="alert" className="font-semibold text-coral-ink">{state.error}</p>}
      {state.done && <p role="status" className="font-semibold text-teal-ink">{state.done}</p>}
      {rows && (
        <div className="space-y-2 rounded-xl bg-sand p-3 text-sm">
          <p>
            <b>{ready.length}</b> ready to import · {rows.filter((r) => r.exists).length} already imported · {rows.filter((r) => !r.exists && (!r.residentId || !r.observer || !r.date)).length} can&apos;t be imported yet ·{" "}
            {rows.flatMap((r) => r.steps).filter((s) => s.legacy && !s.stepId).length} action steps kept as legacy text · {rows.flatMap((r) => r.steps).filter((s) => s.stepId).length} matched to the library
          </p>
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {rows.filter((r) => r.problems.length).map((r) => (
              <li key={r.ref}><b>{r.resident || r.ref}</b> {r.date}: <span className="text-coral-ink">{r.problems.join(" ")}</span></li>
            ))}
          </ul>
          <button name="mode" value="apply" className="btn-primary !min-h-10 !text-base" disabled={pending || !ready.length}>Import {ready.length} observations</button>
        </div>
      )}
    </form>
  );
}
