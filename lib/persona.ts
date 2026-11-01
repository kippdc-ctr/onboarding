// Teacher Persona Quiz scoring, following the quiz's Scoring Grid and "Reading your result" rules:
// - Primary: highest total on the 12 main questions.
// - Tiebreakers (13-15) are asked only when the top two finish within one point.
// - Tied for first: the tiebreaker total picks the primary; if still tied, it's a true blend of both.
// - Secondary: any other persona within one point of the primary's total.
// - Stretch area: the lowest-scoring persona(s).
import type { Persona, PersonaQuestion } from "./content";

export type PersonaQuizBlock = { personas: Persona[]; questions: PersonaQuestion[]; tiebreakers: PersonaQuestion[] };
export type PersonaResult = {
  totals: Record<string, number>;
  tiebreakTotals: Record<string, number>;
  answered: number;
  needsTiebreak: boolean;
  complete: boolean;
  primary: string[]; // more than one = true blend
  secondary: string[];
  stretch: string[];
};

function tally(questions: PersonaQuestion[], answers: Record<string, string>, ids: string[]) {
  const t: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const q of questions) {
    const opt = q.options.find((o) => o.id === answers[q.id]);
    if (opt && opt.persona in t) t[opt.persona]++;
  }
  return t;
}

export function scorePersonaQuiz(quiz: PersonaQuizBlock, answers: Record<string, string>): PersonaResult {
  const ids = quiz.personas.map((p) => p.id);
  const totals = tally(quiz.questions, answers, ids);
  const tiebreakTotals = tally(quiz.tiebreakers, answers, ids);
  const answered = quiz.questions.filter((q) => q.options.some((o) => o.id === answers[q.id])).length;
  const mainDone = answered === quiz.questions.length;
  const sorted = [...ids].sort((a, b) => totals[b] - totals[a]);
  const max = totals[sorted[0]] ?? 0;
  const second = totals[sorted[1]] ?? -Infinity;
  const needsTiebreak = mainDone && quiz.tiebreakers.length > 0 && second >= max - 1;
  const tbDone = quiz.tiebreakers.every((q) => q.options.some((o) => o.id === answers[q.id]));
  const complete = mainDone && (!needsTiebreak || tbDone);

  let primary: string[] = [];
  let secondary: string[] = [];
  let stretch: string[] = [];
  if (complete) {
    const leaders = ids.filter((id) => totals[id] === max);
    if (leaders.length === 1) primary = leaders;
    else {
      const tbMax = Math.max(...leaders.map((id) => tiebreakTotals[id]));
      primary = leaders.filter((id) => tiebreakTotals[id] === tbMax);
    }
    secondary = ids.filter((id) => !primary.includes(id) && totals[id] >= max - 1);
    const rest = ids.filter((id) => !primary.includes(id));
    const min = Math.min(...rest.map((id) => totals[id]));
    stretch = rest.filter((id) => totals[id] === min);
  }
  return { totals, tiebreakTotals, answered, needsTiebreak, complete, primary, secondary, stretch };
}

export function personaNames(quiz: PersonaQuizBlock, ids: string[]): string {
  return ids.map((id) => quiz.personas.find((p) => p.id === id)?.name ?? id).join(" + ");
}

/** Option text only reaches the browser; which persona each answer maps to stays on the server. */
export type PublicPersonaQuestion = { id: string; prompt: string; options: { id: string; text: string }[] };

export function toPublic(qs: PersonaQuestion[]): PublicPersonaQuestion[] {
  return qs.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options.map((o) => ({ id: o.id, text: o.text })) }));
}
