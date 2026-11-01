import { ActivityBlock, mindsetStatements, ModuleContent } from "@/lib/content";
import type { ActivityPayload } from "@/lib/activities";
import { personaNames, scorePersonaQuiz } from "@/lib/persona";
import { IntroSlideCard } from "../IntroSlideCard";

const TITLE: Record<ActivityBlock["type"], string> = {
  matching: "Matching",
  scenario: "Scenario practice",
  worksheet: "Worksheet",
  mindset: "Mindset check",
  persona_quiz: "Teacher Persona Quiz",
  intro_slide: "Intro slide",
};

export function slideData(payload: ActivityPayload | undefined, cohortYear: number) {
  const a = payload?.answers ?? {};
  return {
    name: a.name ?? "",
    persona: a.persona ?? "",
    college: a.college ?? "",
    hometown: a.hometown ?? "",
    oneThing: a.one_thing ?? "",
    whyDc: a.why_dc ?? "",
    headshot: payload?.photos?.headshot,
    gradeBand: payload?.photos?.grade_band,
    cohortYear,
  };
}

/** Read-only view of one resident's activity, for the admin resident page. */
export function ActivityView({
  m,
  a,
  row,
  all,
  cohortYear,
}: {
  m: ModuleContent;
  a: ActivityBlock;
  row?: { payload_json: unknown; completed_at: Date | null };
  all: { activity_id: string; payload_json: unknown }[];
  cohortYear: number;
}) {
  const p = row?.payload_json as ActivityPayload | undefined;
  const ans = p?.answers ?? {};
  const quizResult = a.type === "persona_quiz" ? scorePersonaQuiz(a, ans) : null;
  const title =
    a.type === "matching" ? a.title : a.type === "worksheet" ? (a.title ?? "Worksheet") : a.type === "mindset" ? `Mindset check (${a.compareTo ? "after" : "before"})` : TITLE[a.type];
  return (
    <div className="mt-3 rounded-xl bg-sand p-3">
      <p className="font-semibold">
        {title}: {row?.completed_at ? "Finished" : row ? "In progress" : "Not started"}
      </p>
      {a.type === "worksheet" &&
        a.fields.map((f) => (
          <div key={f.id} className="mt-1">
            <em>{f.label}:</em>{" "}
            {f.kind === "checkbox" ? (ans[f.id] ? "Yes" : "No") : <span className="whitespace-pre-wrap">{ans[f.id] || <span className="text-muted">—</span>}</span>}
          </div>
        ))}
      {a.type === "scenario" &&
        a.prompts.map((q) => (
          <p key={q.id} className="mt-1">
            <em>{q.prompt}</em> {ans[q.id] || <span className="text-muted">—</span>}
          </p>
        ))}
      {a.type === "mindset" && (
        <table className="mt-2 text-sm">
          <tbody>
            {mindsetStatements(m, a).map((st) => {
              const before = a.compareTo ? (all.find((x) => x.activity_id === a.compareTo)?.payload_json as ActivityPayload | undefined)?.answers?.[st.id] : undefined;
              return (
                <tr key={st.id}>
                  <td className="py-0.5 pr-3">{st.text}</td>
                  <td className="font-semibold">
                    {a.compareTo ? `${before ?? "–"} → ${ans[st.id] ?? "–"}` : (ans[st.id] ?? "–")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {a.type === "persona_quiz" &&
        (quizResult?.complete ? (
          <div className="mt-1 text-sm">
            <p>
              <strong>Primary:</strong> {personaNames(a, quizResult.primary)}
              {quizResult.primary.length > 1 && " (true blend)"}
              {quizResult.secondary.length > 0 && (
                <>
                  {" "}
                  · <strong>Secondary:</strong> {personaNames(a, quizResult.secondary)}
                </>
              )}{" "}
              · <strong>Stretch:</strong> {personaNames(a, quizResult.stretch)}
            </p>
            <p className="text-muted">
              Scores: {a.personas.map((x) => `${x.name} ${quizResult!.totals[x.id]}`).join(", ")}
              {quizResult.needsTiebreak && ` · Tiebreakers: ${a.personas.map((x) => `${x.name} ${quizResult!.tiebreakTotals[x.id]}`).join(", ")}`}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">{Object.keys(ans).length} answered</p>
        ))}
      {a.type === "intro_slide" && row && (
        <div className="mt-2 max-w-xl">
          <IntroSlideCard d={slideData(p, cohortYear)} />
        </div>
      )}
    </div>
  );
}
