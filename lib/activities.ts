// Cleans a resident's activity answers and decides whether the activity is complete.
// Pure: the server action loads the data and saves the result.
import { ActivityBlock, ModuleContent, findActivity, mindsetStatements, wordCount, WorksheetField } from "./content";
import { personaNames, scorePersonaQuiz, PersonaResult } from "./persona";

const MAX_TEXT = 20_000;

export type ActivityPayload = { answers: Record<string, string>; photos?: Record<string, string>; result?: PersonaResult };

export function cleanFields(fields: WorksheetField[], raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = String(raw[f.id] ?? "").slice(0, MAX_TEXT);
    if (f.kind === "checkbox") out[f.id] = v === "yes" ? "yes" : "";
    else out[f.id] = f.options && v && !f.options.includes(v) ? "" : v;
  }
  return out;
}

export function fieldsComplete(fields: WorksheetField[], answers: Record<string, string>): boolean {
  return fields.every((f) => {
    if (f.kind === "checkbox" || f.optional) return true;
    const v = (answers[f.id] ?? "").trim();
    if (!v) return false;
    return !f.minWords || wordCount(v) >= f.minWords;
  });
}

export function evaluateActivity(
  m: ModuleContent,
  act: ActivityBlock,
  raw: Record<string, unknown>,
  existing: ActivityPayload | null,
  ctx: { residentName: string; personaLine?: string },
): { payload: ActivityPayload; complete: boolean } {
  switch (act.type) {
    case "matching": {
      const answers: Record<string, string> = {};
      for (const c of act.cards) if (typeof raw[c.id] === "string" && act.categories.includes(raw[c.id] as string)) answers[c.id] = raw[c.id] as string;
      return { payload: { answers }, complete: act.cards.every((c) => answers[c.id] === c.answer) };
    }
    case "scenario": {
      const answers: Record<string, string> = {};
      for (const p of act.prompts) answers[p.id] = String(raw[p.id] ?? "").slice(0, MAX_TEXT);
      return { payload: { answers }, complete: act.prompts.every((p) => answers[p.id].trim().length > 0) };
    }
    case "worksheet": {
      const answers = cleanFields(act.fields, raw);
      return { payload: { answers }, complete: fieldsComplete(act.fields, answers) };
    }
    case "mindset": {
      const answers: Record<string, string> = {};
      const statements = mindsetStatements(m, act);
      for (const st of statements) if (/^[1-5]$/.test(String(raw[st.id] ?? ""))) answers[st.id] = String(raw[st.id]);
      return { payload: { answers }, complete: statements.length > 0 && statements.every((st) => answers[st.id]) };
    }
    case "persona_quiz": {
      const answers: Record<string, string> = {};
      for (const q of [...act.questions, ...act.tiebreakers]) {
        const v = String(raw[q.id] ?? "");
        if (q.options.some((o) => o.id === v)) answers[q.id] = v;
      }
      const result = scorePersonaQuiz(act, answers);
      return { payload: { answers, result }, complete: result.complete };
    }
    case "intro_slide": {
      const answers = cleanFields(act.fields, raw);
      for (const f of act.fields) {
        if (answers[f.id].trim()) continue;
        if (f.prefill === "residentName") answers[f.id] = ctx.residentName;
        if (f.prefill === "persona" && ctx.personaLine) answers[f.id] = ctx.personaLine;
      }
      const photos = { ...(existing?.photos ?? {}) };
      const complete = fieldsComplete(act.fields, answers) && act.photos.every((p) => p.optional || !!photos[p.id]);
      return { payload: { answers, photos }, complete };
    }
  }
}

/** "Engineer" or "Engineer + Coach" from a saved quiz result, for the intro slide. */
export function personaLineFrom(m: ModuleContent, quizActivityId: string | undefined, payload: ActivityPayload | null): string | undefined {
  if (!quizActivityId || !payload) return undefined;
  const quiz = findActivity(m, quizActivityId);
  if (quiz?.type !== "persona_quiz") return undefined;
  const result = scorePersonaQuiz(quiz, payload.answers ?? {});
  return result.complete ? personaNames(quiz, result.primary) : undefined;
}
