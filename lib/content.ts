// Module and form content lives in /content/*.json so it can be edited and redeployed.
// Question, prompt, item, and activity ids must stay stable so saved data survives edits.
import ourCity from "@/content/modules/our-city-our-schools.json";
import yourStory from "@/content/modules/your-story-matters.json";
import whatWeBelieve from "@/content/modules/what-we-believe.json";
import variable from "@/content/modules/you-are-the-variable.json";
import childDev from "@/content/modules/child-development.json";
import mentorMatch from "@/content/forms/mentor-match.json";
import settingsRegistry from "@/content/settings.json";

export type LinkKind = "video" | "article" | "audio" | "form";

export type Block =
  | { type: "text"; text: string }
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "callout"; text: string; title?: string }
  | { type: "quote"; text: string; cite?: string }
  | { type: "image"; src: string; alt: string }
  | { type: "link"; label: string; linkKey: string; kind?: LinkKind; captionsLinkKey?: string }
  | { type: "cards"; cards: { title: string; subtitle?: string; linkKey: string; kind?: LinkKind }[] }
  | { type: "table"; columns: string[]; rows: string[][]; sample?: boolean }
  | { type: "reflection"; promptId: string; prompt: string; rows?: number }
  | { type: "checklist"; items: ChecklistItem[] }
  | { type: "quiz" }
  | { type: "matching"; activityId: string; title: string; categories: string[]; cards: { id: string; text: string; answer: string }[]; sample?: boolean }
  | { type: "scenario"; activityId: string; scenario: string; prompts: { id: string; prompt: string }[]; sample?: boolean }
  | { type: "form"; formSlug: string; checklistItemId: string; label: string };

export type ChecklistItem = { id: string; label: string; description?: string; linkKey?: string; optional?: boolean };

export type SectionVideo = { title: string; url: string; captionsUrl?: string };

export type Section = {
  id: string;
  title: string;
  audioUrl?: string;
  audioTranscript?: string;
  /** Optional video added in the admin content editor, shown at the top of the section. */
  video?: SectionVideo | null;
  blocks: Block[];
};

export type Question = {
  id: string;
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
  description: string;
  estimatedMinutes: number;
  geniallyLinkKey: string;
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
  linkedChecklist?: { moduleSlug: string; itemId: string };
  questions: FormQuestion[];
};

export const MODULES: ModuleContent[] = ([ourCity, yourStory, whatWeBelieve, variable, childDev] as unknown as ModuleContent[]).sort(
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

export function moduleActivities(m: ModuleContent) {
  const out: (Extract<Block, { type: "matching" }> | Extract<Block, { type: "scenario" }>)[] = [];
  for (const s of m.sections) for (const b of s.blocks) if (b.type === "matching" || b.type === "scenario") out.push(b);
  return out;
}

/** Every link key referenced by content, with a label for the content-flags page. */
export function contentLinkKeys(): { key: string; where: string }[] {
  const out: { key: string; where: string }[] = [];
  for (const m of MODULES) {
    out.push({ key: m.geniallyLinkKey, where: `Module ${m.number}` });
    for (const s of m.sections)
      for (const b of s.blocks) {
        if (b.type === "link") {
          out.push({ key: b.linkKey, where: `Module ${m.number}: ${s.title}` });
          if (b.captionsLinkKey) out.push({ key: b.captionsLinkKey, where: `Module ${m.number}: ${s.title} (captions)` });
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
        if ((b.type === "matching" || b.type === "scenario" || b.type === "table") && b.sample)
          out.push(`Module ${m.number}: ${s.title}${b.type === "matching" ? ` (${b.title})` : ""}`);
  return out;
}
