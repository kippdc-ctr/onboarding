// Module and form content lives in /content/*.json so it can be edited and redeployed.
// Question, prompt, item, and activity ids must stay stable so saved data survives edits.
import ourCity from "@/content/modules/our-city-our-schools.json";
import yourStory from "@/content/modules/your-story-matters.json";
import whatWeBelieve from "@/content/modules/what-we-believe.json";
import variable from "@/content/modules/you-are-the-variable.json";
import meetYourStudents from "@/content/modules/meet-your-students.json";
import mentorMatch from "@/content/forms/mentor-match.json";
import settingsRegistry from "@/content/settings.json";
import type { Band } from "./bands";

export type LinkKind = "video" | "article" | "audio" | "form" | "map";

export type Block =
  | { type: "text"; text: string }
  | { type: "heading"; text: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "callout"; text: string; title?: string }
  | { type: "quote"; text: string; cite?: string }
  | { type: "image"; src: string; alt: string; caption?: string; sourceNote?: string }
  | { type: "link"; label: string; linkKey: string; kind?: LinkKind; captionsLinkKey?: string }
  | { type: "cards"; cards: { title: string; subtitle?: string; linkKey: string; kind?: LinkKind }[] }
  | { type: "table"; columns: string[]; rows: string[][]; sample?: boolean }
  | { type: "reflection"; promptId: string; prompt: string; rows?: number }
  | { type: "checklist"; items: ChecklistItem[] }
  | { type: "quiz" }
  | { type: "matching"; activityId: string; title: string; categories: string[]; cards: { id: string; text: string; answer: string }[]; sample?: boolean }
  | { type: "scenario"; activityId: string; scenario: string; prompts: { id: string; prompt: string }[]; sample?: boolean }
  | { type: "form"; formSlug: string; checklistItemId: string; label: string }
  | {
      /** A card for an outside resource: "Required · Listen · 31 min" + source, title, description, button. */
      type: "resource";
      linkKey: string;
      kind: LinkKind;
      title: string;
      description?: string;
      source?: string;
      minutes?: number;
      required?: boolean;
      /** Settings key for a captions or transcript link (videos). */
      captionsLinkKey?: string;
    }
  | { type: "worksheet"; activityId: string; title?: string; fields: WorksheetField[] }
  | {
      /** Ungraded 1-5 agreement ratings. An "after" check sets compareTo and reuses the "before" statements. */
      type: "mindset";
      activityId: string;
      statements?: { id: string; text: string }[];
      compareTo?: string;
      /** Five labels for the 1-5 scale (default: Strongly disagree ... Strongly agree). */
      labels?: string[];
      sample?: boolean;
    }
  | { type: "persona_quiz"; activityId: string; personas: Persona[]; questions: PersonaQuestion[]; tiebreakers: PersonaQuestion[] }
  | { type: "persona_results"; quizActivityId: string; note?: string }
  | {
      /** Shows the resident's grade band (from About You) or lets them choose one. Drives band sections and questions. */
      type: "band_picker";
      activityId: string;
    }
  | {
      /** A neighborhood card: title, short description, a video that plays in the page, and a map link. */
      type: "place";
      title: string;
      description?: string;
      videoLinkKey: string;
      mapLinkKey: string;
    }
  | {
      /** Ungraded practice: read a statement, think, then reveal one possible version. */
      type: "reveal";
      items: { statement: string; reveal: string }[];
      revealLabel?: string;
      /** Label above the resident's own try (default "Your reframe"). */
      inputLabel?: string;
      sample?: boolean;
    }
  | {
      /** A one-page reference residents can print or save as PDF (e.g. the PLT Starter Sheet). */
      type: "printable";
      title: string;
      intro?: string;
      items: string[];
      note?: string;
    }
  | {
      /** Intro slide: text fields + photo uploads, with a live slide preview. */
      type: "intro_slide";
      activityId: string;
      quizActivityId?: string;
      fields: WorksheetField[];
      photos: { id: string; label: string; help?: string; optional?: boolean }[];
    };

/**
 * One answer box in a worksheet. `options` makes it a dropdown; kind "checkbox" makes it a tick box.
 * minWords/maxWords show a word counter (minWords is required for completion); `sample` adds a "Show a sample" toggle.
 */
export type WorksheetField = {
  id: string;
  label: string;
  help?: string;
  options?: string[];
  optional?: boolean;
  rows?: number;
  kind?: "text" | "checkbox";
  minWords?: number;
  maxWords?: number;
  /** maxWords is a hard limit (needed to finish), not just a target. */
  hardMax?: boolean;
  sample?: string;
  sampleLabel?: string;
  /** Intro slide only: prefill from the resident's name or quiz result. */
  prefill?: "residentName" | "persona";
};

export type Persona = { id: string; name: string; move: string; strength?: string; watchFor?: string; symbol?: string };
export type PersonaQuestion = { id: string; prompt: string; options: { id: string; text: string; persona: string }[] };

export type ChecklistItem = { id: string; label: string; description?: string; linkKey?: string; optional?: boolean };

export type SectionVideo = { title: string; url: string; captionsUrl?: string };

export type Section = {
  id: string;
  title: string;
  /** Grade-band branch: shown only to residents in this band (Section 4). */
  band?: Band;
  audioUrl?: string;
  audioTranscript?: string;
  /** Optional video added in the admin content editor, shown at the top of the section. */
  video?: SectionVideo | null;
  blocks: Block[];
};

export type Question = {
  id: string;
  /** Grade-band question: asked only of residents in this band. Untagged questions are for everyone. */
  band?: Band;
  prompt: string;
  options: { id: string; text: string }[];
  correct: string;
  explanation: string;
};

export type ModuleContent = {
  slug: string;
  number: number;
  title: string;
  badge?: string;
  /** Evaluation indicator this module supports, e.g. "EP.P.2". */
  indicator?: string;
  description: string;
  estimatedMinutes: number;
  geniallyLinkKey?: string;
  geniallyLabel?: string;
  softDueNote?: string;
  objectives: string[];
  sections: Section[];
  quiz: { questions: Question[] } | null;
  completion: { allQuestions: boolean; reflections: string[]; checklist: string[]; activities: string[] };
};

export type FormQuestion = {
  id: string;
  type: "short_text" | "long_text" | "single_choice" | "multi_select" | "scale" | "section";
  prompt: string;
  help?: string;
  required?: boolean;
  options?: string[];
  optionsSetting?: string;
  allowOther?: boolean;
  minLabel?: string;
  maxLabel?: string;
  prefill?: "residentName";
};

export type FormContent = {
  slug: string;
  title: string;
  intro: string;
  visibilityNotice: string;
  links?: { label: string; linkKey: string }[];
  linkedChecklist?: { moduleSlug: string; itemId: string };
  questions: FormQuestion[];
};

export const MODULES: ModuleContent[] = ([ourCity, yourStory, whatWeBelieve, meetYourStudents, variable] as unknown as ModuleContent[]).sort(
  (a, b) => a.number - b.number,
);

export const FORMS: FormContent[] = [mentorMatch as unknown as FormContent];

export function getModule(slug: string): ModuleContent | undefined {
  return MODULES.find((m) => m.slug === slug);
}

export function getForm(slug: string): FormContent | undefined {
  return FORMS.find((f) => f.slug === slug);
}

/** Every checklist item a module defines, including form-linked ones. */
export function moduleChecklistItems(m: ModuleContent): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  for (const s of m.sections)
    for (const b of s.blocks) {
      if (b.type === "checklist") out.push(...b.items);
      if (b.type === "form") out.push({ id: b.checklistItemId, label: b.label });
    }
  return out;
}

export function moduleReflectionPrompts(m: ModuleContent): { promptId: string; prompt: string }[] {
  const out: { promptId: string; prompt: string }[] = [];
  for (const s of m.sections) for (const b of s.blocks) if (b.type === "reflection") out.push({ promptId: b.promptId, prompt: b.prompt });
  return out;
}

export type ActivityBlock = Extract<Block, { type: "matching" | "scenario" | "worksheet" | "mindset" | "persona_quiz" | "intro_slide" | "band_picker" }>;
const ACTIVITY_TYPES = new Set(["matching", "scenario", "worksheet", "mindset", "persona_quiz", "intro_slide", "band_picker"]);
export function isActivity(b: Block): b is ActivityBlock {
  return ACTIVITY_TYPES.has(b.type);
}

export function moduleActivities(m: ModuleContent) {
  const out: ActivityBlock[] = [];
  for (const s of m.sections) for (const b of s.blocks) if (isActivity(b)) out.push(b);
  return out;
}

/** Every link key referenced by content, with a label for the content-flags page. */
export function contentLinkKeys(): { key: string; where: string }[] {
  const out: { key: string; where: string }[] = [];
  for (const m of MODULES) {
    if (m.geniallyLinkKey) out.push({ key: m.geniallyLinkKey, where: `Module ${m.number}` });
    for (const s of m.sections)
      for (const b of s.blocks) {
        if (b.type === "link") {
          out.push({ key: b.linkKey, where: `Module ${m.number}: ${s.title}` });
          if (b.captionsLinkKey) out.push({ key: b.captionsLinkKey, where: `Module ${m.number}: ${s.title} (captions)` });
        }
        if (b.type === "resource") {
          out.push({ key: b.linkKey, where: `Module ${m.number}: ${s.title}` });
          if (b.captionsLinkKey) out.push({ key: b.captionsLinkKey, where: `Module ${m.number}: ${s.title} (captions)` });
        }
        if (b.type === "place") {
          out.push({ key: b.videoLinkKey, where: `Module ${m.number}: ${s.title} (${b.title} video)` });
          out.push({ key: b.mapLinkKey, where: `Module ${m.number}: ${s.title} (${b.title} map)` });
        }
        if (b.type === "cards") for (const c of b.cards) out.push({ key: c.linkKey, where: `Module ${m.number}: ${s.title}` });
        if (b.type === "checklist") for (const i of b.items) if (i.linkKey) out.push({ key: i.linkKey, where: `Module ${m.number}: ${s.title}` });
      }
  }
  return out;
}

export type SettingDef = { key: string; group: string; label: string; default: string; type?: string };
export const LINK_SETTINGS: SettingDef[] = settingsRegistry.links;
export const VALUE_SETTINGS: SettingDef[] = settingsRegistry.values;

/** Content still marked "sample, replace" (placeholder activities and tables). */
export function sampleContent(modules: ModuleContent[] = MODULES): string[] {
  const out: string[] = [];
  for (const m of modules)
    for (const s of m.sections)
      for (const b of s.blocks)
        if ((b.type === "matching" || b.type === "scenario" || b.type === "table" || b.type === "mindset" || b.type === "reveal") && b.sample)
          out.push(`Module ${m.number}: ${s.title}${b.type === "matching" ? ` (${b.title})` : b.type === "mindset" ? " (sample statements)" : ""}`);
        else if (b.type === "persona_quiz" && b.personas.some((p) => !p.strength || !p.watchFor))
          out.push(`Module ${m.number}: ${s.title}: persona descriptions (strength and watch-for) still needed`);
        else if (b.type === "image" && !b.src) out.push(`Module ${m.number}: ${s.title}: image still needed (${b.caption ?? b.alt})`);
  return out;
}

/** The activity block with this id anywhere in the module. */
export function findActivity(m: ModuleContent, activityId: string): ActivityBlock | undefined {
  for (const s of m.sections) for (const b of s.blocks) if (isActivity(b) && b.activityId === activityId) return b;
  return undefined;
}

/** Mindset statements, following compareTo for an "after" check. */
export function mindsetStatements(m: ModuleContent, b: Extract<Block, { type: "mindset" }>): { id: string; text: string }[] {
  if (b.statements?.length) return b.statements;
  const src = b.compareTo ? findActivity(m, b.compareTo) : undefined;
  return src?.type === "mindset" ? (src.statements ?? []) : [];
}

export function wordCount(s: string): number {
  return (s.trim().match(/\S+/g) ?? []).length;
}

/** The quiz questions a resident in this band answers (shared questions plus their band's). */
export function questionsFor(m: ModuleContent, band: Band | null): Question[] {
  return (m.quiz?.questions ?? []).filter((q) => !q.band || q.band === band);
}
