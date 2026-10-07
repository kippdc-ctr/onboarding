import "server-only";
import { MODULES, moduleReflectionPrompts, moduleActivities } from "./content";
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
  for (const m of MODULES) {
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
      if (a.type !== "scenario") continue;
      const ans = (b.activities.find((x) => x.activity_id === a.activityId)?.payload_json as { answers?: Record<string, string> })?.answers ?? {};
      lines.push(`Scenario: ${a.scenario}`);
      for (const p of a.prompts) {
        lines.push(`> ${p.prompt}`);
        lines.push(ans[p.id]?.trim() || "(no response yet)");
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}
