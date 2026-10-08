"use client";

import { useActionState } from "react";
import { importSteps, type ImportResult } from "@/app/actions/library";

export function ImportForm() {
  const [state, action, pending] = useActionState<ImportResult | null, FormData>(importSteps, null);
  return (
    <form action={action} className="card space-y-3">
      <label className="block"><span className="label">CSV file</span><input type="file" name="file" accept=".csv,text/csv" /></label>
      <label className="block"><span className="label">…or paste</span><textarea name="paste" className="input min-h-40 font-mono text-xs" /></label>
      <button className="btn-primary" disabled={pending}>{pending ? "Importing…" : "Import"}</button>
      {state && (
        <div role="status" className="rounded-xl bg-sand p-3 text-sm">
          <p><b>{state.added}</b> added, <b>{state.updated}</b> updated.</p>
          {state.errors.length > 0 && <ul className="mt-1 list-disc pl-5 text-coral-ink">{state.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        </div>
      )}
    </form>
  );
}
