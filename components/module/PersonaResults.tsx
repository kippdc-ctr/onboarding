import type { Block } from "@/lib/content";
import type { PersonaResult } from "@/lib/persona";

type Quiz = Extract<Block, { type: "persona_quiz" }>;

/** Results for the Teacher Persona Quiz. Server-rendered; the quiz refreshes the page when the result changes. */
export function PersonaResults({ quiz, result, note }: { quiz: Quiz; result: PersonaResult | null; note?: string }) {
  if (!result) {
    return <p className="rounded-xl bg-sand p-4 text-lg">Finish the quiz above to see your persona.</p>;
  }
  const p = (id: string) => quiz.personas.find((x) => x.id === id)!;
  const primary = result.primary.map(p);
  const blend = primary.length > 1;
  const max = Math.max(...Object.values(result.totals));
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-teal bg-teal-wash p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-teal-ink">{blend ? "You are a true blend" : "Your primary persona"}</p>
        <p className="mt-1 text-3xl font-bold text-teal-ink">
          {primary.map((x) => `${x.symbol ? x.symbol + " " : ""}The ${x.name}`).join(" + ")}
        </p>
        {primary.map((x) => (
          <div key={x.id} className="mt-3 space-y-1">
            {blend && <p className="font-bold">The {x.name}</p>}
            <p>
              <strong>Signature move:</strong> {x.move}
            </p>
            {x.strength ? (
              <p>
                <strong>Strength:</strong> {x.strength}
              </p>
            ) : null}
            {x.watchFor ? (
              <p>
                <strong>Watch for:</strong> {x.watchFor}
              </p>
            ) : null}
            {(!x.strength || !x.watchFor) && <p className="text-sm text-muted">Full persona description coming soon.</p>}
          </div>
        ))}
      </div>
      {result.secondary.length > 0 && (
        <div className="rounded-2xl border-2 border-gray-brand/30 p-4">
          <p className="font-bold">Close second: {result.secondary.map((id) => `The ${p(id).name}`).join(", ")}</p>
          <p className="text-muted">Within one point of your primary, so you lead as a blend.</p>
        </div>
      )}
      {result.stretch.length > 0 && (
        <div className="rounded-2xl border-2 border-yellow bg-yellow-wash p-4">
          <p className="font-bold">Your stretch area: {result.stretch.map((id) => `The ${p(id).name}`).join(", ")}</p>
          <p>
            {result.stretch.map((id) => p(id).move).join(" ")} {result.stretch.length > 1 ? "These are the moves" : "This is the move"} you reach for least. Read your primary persona&apos;s &quot;Watch for&quot; note to see
            where that stretch matters most.
          </p>
        </div>
      )}
      <div>
        <p className="label">Your scores (questions 1 to 12)</p>
        <ul className="space-y-1">
          {quiz.personas.map((x) => (
            <li key={x.id} className="flex items-center gap-3">
              <span className="w-24 shrink-0">{x.name}</span>
              <span className="h-3 flex-1 overflow-hidden rounded-full bg-gray-brand/20" aria-hidden="true">
                <span className="block h-full rounded-full bg-teal-light" style={{ width: `${max ? (100 * result.totals[x.id]) / quiz.questions.length : 0}%` }} />
              </span>
              <span className="w-8 text-right font-semibold">{result.totals[x.id]}</span>
            </li>
          ))}
        </ul>
      </div>
      {note && <p className="text-sm text-muted">{note}</p>}
    </div>
  );
}
