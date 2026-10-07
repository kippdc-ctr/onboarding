import type { FormContent, FormQuestion } from "./content";

/** text and single choice: string; multi-select: string[]; scale: number. "Other" text lives under `${id}__other`. */
export type FormAnswers = Record<string, string | string[] | number>;

export const OTHER = "Other";

export function splitList(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function questionOptions(q: FormQuestion, settings: Record<string, string>): string[] {
  const base = q.optionsSetting ? splitList(settings[q.optionsSetting]) : (q.options ?? []);
  return q.allowOther ? [...base, OTHER] : base;
}

export function validateAnswers(form: FormContent, raw: FormAnswers, settings: Record<string, string>) {
  const clean: FormAnswers = {};
  const errors: Record<string, string> = {};
  for (const q of form.questions) {
    if (q.type === "section") continue;
    const v = raw?.[q.id];
    const opts = questionOptions(q, settings);
    let empty = true;
    if (q.type === "short_text" || q.type === "long_text") {
      const s = typeof v === "string" ? v.slice(0, 10_000) : "";
      clean[q.id] = s;
      empty = !s.trim();
    } else if (q.type === "single_choice") {
      const s = typeof v === "string" && opts.includes(v) ? v : "";
      clean[q.id] = s;
      empty = !s;
      if (s === OTHER) {
        const other = typeof raw[`${q.id}__other`] === "string" ? (raw[`${q.id}__other`] as string).slice(0, 1000) : "";
        clean[`${q.id}__other`] = other;
        if (!other.trim()) empty = true;
      }
    } else if (q.type === "multi_select") {
      const arr = Array.isArray(v) ? v.filter((x) => opts.includes(x)) : [];
      clean[q.id] = arr;
      empty = arr.length === 0;
    } else if (q.type === "scale") {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 1 && n <= 5) {
        clean[q.id] = n;
        empty = false;
      }
    }
    if (q.required && empty) errors[q.id] = "This question is required.";
  }
  return { clean, errors };
}

/** Human-readable answer for tables and CSV. */
export function answerText(q: FormQuestion, answers: FormAnswers): string {
  const v = answers?.[q.id];
  if (v === undefined || v === null || v === "") return "";
  if (Array.isArray(v)) return v.join("; ");
  if (q.type === "single_choice" && v === OTHER) return `Other: ${answers[`${q.id}__other`] ?? ""}`;
  return String(v);
}
