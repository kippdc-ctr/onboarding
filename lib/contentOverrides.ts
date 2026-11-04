// Applies admin content edits (content_overrides rows) on top of the original /content files.
// Pure functions: no database access, so this is easy to reason about and test.
import { createHash } from "node:crypto";
import { isActivity, type Block, type ModuleContent, type Question, type Section, type SectionVideo } from "./content";

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
  if (kind === "block" || kind === "narration") return m.sections.find((x) => x.id === a)?.blocks[Number(b)];
  if (kind === "layout") return defaultLayout(m);
  if (kind === "question") return m.quiz?.questions.find((q) => q.id === a);
  if (kind === "activity") {
    for (const s of m.sections) for (const bl of s.blocks) if (isActivity(bl) && bl.activityId === a) return bl;
  }
  if (kind === "reflection") {
    for (const s of m.sections) for (const bl of s.blocks) if (bl.type === "reflection" && bl.promptId === a) return bl;
  }
  return undefined;
}

/** Section order and, per section, the blocks it shows (by their place in the file, "sectionId:index"). */
export type Layout = { sections: { id: string; blocks: string[] }[] };

export function defaultLayout(m: ModuleContent): Layout {
  return { sections: m.sections.map((s) => ({ id: s.id, blocks: s.blocks.map((_, i) => `${s.id}:${i}`) })) };
}

/**
 * Rearranges sections and blocks. Anything the layout doesn't mention (e.g. added to the file later) stays
 * in its original section, after the arranged blocks, so nothing ever disappears.
 */
export function applyLayout(m: ModuleContent, layout: Layout): void {
  const byOrigin = new Map<string, Block>();
  for (const s of m.sections) for (const b of s.blocks) byOrigin.set(b.origin!, b);
  const byId = new Map(m.sections.map((s) => [s.id, s]));
  const used = new Set<string>();
  const placed = new Map<string, Block[]>();
  for (const ls of layout.sections ?? []) {
    if (!byId.has(ls.id) || placed.has(ls.id)) continue;
    const list: Block[] = [];
    for (const o of ls.blocks ?? []) {
      const b = byOrigin.get(o);
      if (b && !used.has(o)) {
        used.add(o);
        list.push(b);
      }
    }
    placed.set(ls.id, list);
  }
  const order = [...placed.keys(), ...m.sections.filter((s) => !placed.has(s.id)).map((s) => s.id)];
  m.sections = order.map((id) => {
    const s = byId.get(id)!;
    const leftovers = s.blocks.filter((b) => !used.has(b.origin!));
    return { ...s, blocks: [...(placed.get(id) ?? []), ...leftovers] };
  });
}

export type OverrideStatus = { target: string; updatedAt: Date; stale: boolean; applied: boolean };

/** Returns a new module with every applicable override merged in, plus a status per override. */
export function applyOverrides(original: ModuleContent, rows: OverrideRow[]): { module: ModuleContent; status: OverrideStatus[] } {
  const m: ModuleContent = structuredClone(original);
  for (const s of m.sections) s.blocks.forEach((b, i) => (b.origin = `${s.id}:${i}`));
  const status: OverrideStatus[] = [];
  let layout: { layout: Layout; row: OverrideRow; stale: boolean } | null = null;
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
    if (kind === "layout") {
      // Applied last, after every edit that is tied to a block's original position.
      layout = { layout: v as unknown as Layout, row, stale };
      continue;
    }
    if (kind === "narration") {
      // A recording belongs to the exact text it was made for; hide it if the file's text changed.
      if (stale) applied = false;
      else m.sections.find((x) => x.id === a)!.blocks[Number(b)].narrationUrl = String(v.url ?? "") || undefined;
    } else if (kind === "module") Object.assign(m, pick(v, ["title", "description", "estimatedMinutes", "objectives", "softDueNote"]));
    else if (kind === "section") {
      const s = m.sections.find((x) => x.id === a) as Section;
      Object.assign(s, pick(v, ["title", "audioUrl", "audioTranscript", "video"]));
    } else if (kind === "block") {
      // Block edits are tied to a position, so drop them if the file's block at that position changed.
      if (stale) applied = false;
      else {
        const s = m.sections.find((x) => x.id === a)!;
        const i = Number(b);
        s.blocks[i] = { ...s.blocks[i], ...v, type: s.blocks[i].type, origin: s.blocks[i].origin } as Block;
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
          if (kind === "activity" && isActivity(bl) && bl.activityId === a) {
            return { ...bl, ...v, type: bl.type, activityId: bl.activityId, origin: bl.origin } as Block;
          }
          if (kind === "reflection" && bl.type === "reflection" && bl.promptId === a) {
            return { ...bl, ...pick(v, ["prompt"]) } as Block;
          }
          return bl;
        });
    }
    status.push({ target: row.target, updatedAt: row.updated_at, stale, applied });
  }
  if (layout) {
    applyLayout(m, layout.layout);
    status.push({ target: "layout", updatedAt: layout.row.updated_at, stale: layout.stale, applied: true });
  }
  return { module: m, status };
}

function pick(v: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in v) out[k] = v[k];
  return out;
}
