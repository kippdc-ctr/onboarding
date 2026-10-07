// Applies admin content edits (content_overrides rows) on top of the original /content files.
// Pure functions: no database access, so this is easy to reason about and test.
import { createHash } from "node:crypto";
import type { Block, ModuleContent, Question, Section, SectionVideo } from "./content";

export type OverrideRow = { module_slug: string; target: string; value: Record<string, unknown>; original_hash: string; updated_at: Date };

export type ModuleOverride = {
  title?: string;
  description?: string;
  estimatedMinutes?: number;
  objectives?: string[];
  softDueNote?: string;
};
export type SectionOverride = { title?: string; audioUrl?: string; audioTranscript?: string; video?: SectionVideo | null };

export function hashOf(v: unknown): string {
  return createHash("sha1").update(JSON.stringify(v ?? null)).digest("hex").slice(0, 16);
}

/** The original (file) value a target refers to, used for hashing and "reset to original". */
export function originalFor(m: ModuleContent, target: string): unknown {
  if (target === "module") {
    const { title, description, estimatedMinutes, objectives, softDueNote } = m;
    return { title, description, estimatedMinutes, objectives, softDueNote };
  }
  const [kind, a, b] = target.split(":");
  if (kind === "section") {
    const s = m.sections.find((x) => x.id === a);
    return s ? { title: s.title, audioUrl: s.audioUrl ?? "", audioTranscript: s.audioTranscript ?? "", video: s.video ?? null } : undefined;
  }
  if (kind === "block") return m.sections.find((x) => x.id === a)?.blocks[Number(b)];
  if (kind === "question") return m.quiz?.questions.find((q) => q.id === a);
  if (kind === "activity") {
    for (const s of m.sections) for (const bl of s.blocks) if ((bl.type === "matching" || bl.type === "scenario") && bl.activityId === a) return bl;
  }
  if (kind === "reflection") {
    for (const s of m.sections) for (const bl of s.blocks) if (bl.type === "reflection" && bl.promptId === a) return bl;
  }
  return undefined;
}

export type OverrideStatus = { target: string; updatedAt: Date; stale: boolean; applied: boolean };

/** Returns a new module with every applicable override merged in, plus a status per override. */
export function applyOverrides(original: ModuleContent, rows: OverrideRow[]): { module: ModuleContent; status: OverrideStatus[] } {
  const m: ModuleContent = structuredClone(original);
  const status: OverrideStatus[] = [];
  for (const row of rows) {
    const orig = originalFor(original, row.target);
    if (orig === undefined) {
      status.push({ target: row.target, updatedAt: row.updated_at, stale: true, applied: false });
      continue;
    }
    const stale = hashOf(orig) !== row.original_hash;
    const [kind, a, b] = row.target.split(":");
    const v = row.value;
    let applied = true;
    if (kind === "module") Object.assign(m, pick(v, ["title", "description", "estimatedMinutes", "objectives", "softDueNote"]));
    else if (kind === "section") {
      const s = m.sections.find((x) => x.id === a) as Section;
      Object.assign(s, pick(v, ["title", "audioUrl", "audioTranscript", "video"]));
    } else if (kind === "block") {
      // Block edits are tied to a position, so drop them if the file's block at that position changed.
      if (stale) applied = false;
      else {
        const s = m.sections.find((x) => x.id === a)!;
        const i = Number(b);
        s.blocks[i] = { ...s.blocks[i], ...v, type: s.blocks[i].type } as Block;
      }
    } else if (kind === "question" && m.quiz) {
      const qi = m.quiz.questions.findIndex((q) => q.id === a);
      const q = m.quiz.questions[qi];
      const next = { ...q, ...pick(v, ["prompt", "explanation", "correct"]) } as Question;
      if (Array.isArray(v.options)) {
        // Option ids never change; only their text.
        const texts = new Map((v.options as { id: string; text: string }[]).map((o) => [o.id, o.text]));
        next.options = q.options.map((o) => ({ id: o.id, text: texts.get(o.id) ?? o.text }));
      }
      if (!next.options.some((o) => o.id === next.correct)) next.correct = q.correct;
      m.quiz.questions[qi] = next;
    } else if (kind === "activity" || kind === "reflection") {
      for (const s of m.sections)
        s.blocks = s.blocks.map((bl) => {
          if (kind === "activity" && (bl.type === "matching" || bl.type === "scenario") && bl.activityId === a) {
            return { ...bl, ...v, type: bl.type, activityId: bl.activityId } as Block;
          }
          if (kind === "reflection" && bl.type === "reflection" && bl.promptId === a) {
            return { ...bl, ...pick(v, ["prompt"]) } as Block;
          }
          return bl;
        });
    }
    status.push({ target: row.target, updatedAt: row.updated_at, stale, applied });
  }
  return { module: m, status };
}

function pick(v: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in v) out[k] = v[k];
  return out;
}
