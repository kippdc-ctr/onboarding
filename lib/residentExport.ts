import "server-only";
import { mindsetStatements, moduleReflectionPrompts, moduleActivities } from "./content";
import type { ActivityPayload } from "./activities";
import { personaNames, scorePersonaQuiz } from "./persona";
import type { Config, ProgressBundle, Resident } from "./data";
import { displayName } from "./data";
import { formatDate } from "./dates";
import { accuracyText, moduleState, STATUS_LABEL } from "./progress";

/** Plain-text copy of a resident's own scores and saved writing. */
export function residentResponsesText(cfg: Config, r: Resident, b: ProgressBundle): string {
  const lines: string[] = [];
  lines.push(`CTR Onboarding Hub: my responses`);
  lines.push(`${displayName(r)}${r.group_number ? `, Group ${r.group_number}` : ""}`);
  lines.push(`Downloaded ${formatDate(cfg.today)}`);
  lines.push("");
  for (const m of cfg.content) {
    const st = moduleState(cfg, r, b, m);
    lines.push("=".repeat(60));
    lines.push(`Module ${m.number}: ${m.title}`);
    lines.push(`Status: ${STATUS_LABEL[st.status]}${st.totalQuestions ? ` | Accuracy (best): ${accuracyText(st)}` : ""}`);
    lines.push("");
    for (const p of moduleReflectionPrompts(m)) {
      const text = b.reflections.find((x) => x.prompt_id === p.promptId)?.response_text?.trim();
      lines.push(`> ${p.prompt}`);
      lines.push(text || "(no response yet)");
      lines.push("");
    }
    for (const a of moduleActivities(m)) {
      const p = b.activities.find((x) => x.activity_id === a.activityId)?.payload_json as ActivityPayload | undefined;
      const ans = p?.answers ?? {};
      if (a.type === "matching") continue;
      if (a.type === "worksheet" || a.type === "intro_slide") {
        lines.push(a.type === "intro_slide" ? "Intro slide" : (a.title ?? "Final task"));
        for (const f of a.fields) {
          lines.push(`> ${f.label}`);
          lines.push(f.kind === "checkbox" ? (ans[f.id] ? "Yes" : "No") : ans[f.id]?.trim() || (f.optional ? "(left blank)" : "(no response yet)"));
        }
        lines.push("");
      } else if (a.type === "scenario") {
        lines.push(`Scenario: ${a.scenario}`);
        for (const q of a.prompts) {
          lines.push(`> ${q.prompt}`);
          lines.push(ans[q.id]?.trim() || "(no response yet)");
        }
        lines.push("");
      } else if (a.type === "mindset") {
        lines.push(`Mindset check${a.compareTo ? " (after)" : " (before)"}: 1 = strongly disagree, 5 = strongly agree`);
        for (const st of mindsetStatements(m, a)) lines.push(`> ${st.text}: ${ans[st.id] ?? "(not rated)"}`);
        lines.push("");
      } else if (a.type === "persona_quiz") {
        const r = scorePersonaQuiz(a, ans);
        lines.push(`Teacher persona: ${r?.complete ? personaNames(a, r.primary) : "(quiz not finished)"}`);
        if (r?.complete && r.secondary.length) lines.push(`Secondary: ${personaNames(a, r.secondary)}`);
        if (r?.complete && r.stretch.length) lines.push(`Stretch area: ${personaNames(a, r.stretch)}`);
        lines.push("");
      }
    }
  }
  return lines.join("\n");
}
