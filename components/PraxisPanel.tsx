import { formatDate } from "@/lib/dates";
import type { ProgressBundle } from "@/lib/data";
import { LinkButton } from "./LinkButton";

export const PRAXIS_STAGES = [
  "Resident submits exemption form",
  "CTR team creates Praxis study plan",
  "Resident studies for exam(s)",
  "Resident registers for exam(s)",
  "Resident takes exam(s)",
  "CTR team receives exam scores or resident is exempt",
];

function subtestStyle(v: string | null) {
  const s = (v ?? "").toLowerCase();
  if (s === "passed" || s === "exempt") return "bg-teal-wash border-teal text-teal-ink";
  if (s === "not passed") return "bg-coral-wash border-coral text-coral-ink";
  if (s === "registered") return "bg-yellow-wash border-yellow text-ink";
  return "bg-white border-gray-brand text-muted";
}

export function PraxisPanel({ praxis, settings }: { praxis: ProgressBundle["praxis"]; settings: Record<string, string> }) {
  const stage = praxis?.stage ?? null;
  return (
    <section className="card" aria-labelledby="praxis-h">
      <h2 id="praxis-h" className="h2">
        Praxis
      </h2>
      <p className="mt-1 text-muted">Read only. The CTR team updates this for you.</p>

      <ol className="mt-4 space-y-2">
        {PRAXIS_STAGES.map((label, i) => {
          const n = i + 1;
          const done = stage !== null && n < stage;
          const current = stage === n;
          return (
            <li key={n} className={`flex items-start gap-3 rounded-xl px-3 py-2 ${current ? "bg-yellow-wash" : ""}`} aria-current={current ? "step" : undefined}>
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 font-bold ${
                  done ? "border-teal bg-teal-ink text-white" : current ? "border-yellow bg-yellow text-ink" : "border-gray-brand bg-white text-muted"
                }`}
              >
                {done ? "✓" : n}
              </span>
              <span className={`pt-1 ${current ? "font-bold" : ""}`}>
                Stage {n}: {label}
                {current && <span className="ml-2 text-sm font-semibold text-teal-ink">(you are here)</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {stage === null && <p className="mt-2 text-sm text-muted">Your Praxis status hasn&apos;t been loaded yet.</p>}

      <dl className="mt-5 grid grid-cols-3 gap-2">
        {(["math", "reading", "writing"] as const).map((k) => (
          <div key={k} className={`rounded-xl border-2 p-3 text-center ${subtestStyle(praxis?.[k] ?? null)}`}>
            <dt className="text-sm font-semibold capitalize">Core {k}</dt>
            <dd className="font-bold">{praxis?.[k] || "Not loaded"}</dd>
          </div>
        ))}
      </dl>

      <ul className="mt-5 space-y-1">
        <li>
          Register by <strong>{formatDate(settings["praxis.register_by"], { weekday: true })}</strong>
        </li>
        <li>
          Ideal test date by <strong>{formatDate(settings["praxis.ideal_test_by"], { weekday: true })}</strong>
        </li>
        <li>
          Scores must reach CTR by <strong>{formatDate(settings["praxis.scores_by"], { weekday: true })}</strong>
        </li>
      </ul>
      <div className="mt-5 flex flex-wrap gap-3">
        <LinkButton href={settings["url.praxis_upload"]} label="Upload your Praxis documentation" kind="form" />
        {settings["url.praxis_info"] && <LinkButton href={settings["url.praxis_info"]} label="Praxis info" kind="article" />}
      </div>
    </section>
  );
}
