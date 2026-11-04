import Link from "next/link";
import { notFound } from "next/navigation";
import { Block, getModule } from "@/lib/content";
import { getResolvedContent } from "@/lib/data";
import { BAND_LABEL } from "@/lib/bands";
import { formatDateTime } from "@/lib/dates";
import { ArrangeEditor, type ArrangeSection } from "./ArrangeEditor";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  text: "Paragraph",
  heading: "Subheading",
  list: "List",
  callout: "Callout",
  quote: "Quote",
  image: "Image",
  link: "Link",
  cards: "Cards",
  table: "Table",
  reflection: "Reflection",
  checklist: "Checklist",
  quiz: "Knowledge check",
  matching: "Matching activity",
  scenario: "Scenario practice",
  form: "Form link",
  resource: "Resource",
  worksheet: "Worksheet",
  mindset: "Mindset check",
  persona_quiz: "Persona quiz",
  persona_results: "Persona results",
  intro_slide: "Intro slide",
  reveal: "Reframe practice",
  printable: "Printable sheet",
  place: "Neighborhood card",
  band_picker: "Grade-band picker",
};

function snippet(b: Block): string {
  const r = b as Record<string, unknown>;
  const pick = (v: unknown) => (typeof v === "string" ? v : "");
  const text =
    pick(r.text) ||
    pick(r.title) ||
    pick(r.label) ||
    pick(r.prompt) ||
    pick(r.alt) ||
    (Array.isArray(r.items) && typeof r.items[0] === "string" ? (r.items[0] as string) : "") ||
    (b.type === "quiz" ? "All quiz questions" : "");
  const plain = text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  return plain.length > 110 ? plain.slice(0, 109).trimEnd() + "…" : plain;
}

export default async function Arrange({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getModule(slug)) notFound();
  const { modules, status } = await getResolvedContent();
  const m = modules.find((x) => x.slug === slug)!;
  const layoutStatus = (status.get(slug) ?? []).find((s) => s.target === "layout");
  const sections: ArrangeSection[] = m.sections.map((s) => ({
    id: s.id,
    title: s.title,
    band: s.band ? BAND_LABEL[s.band] : undefined,
    blocks: s.blocks.map((b) => ({ origin: b.origin!, label: TYPE_LABEL[b.type] ?? b.type, snippet: snippet(b), home: b.origin!.split(":")[0] })),
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <p>
        <Link href={`/admin/content/${slug}`} className="link">
          ← Back to editing Module {m.number}
        </Link>
      </p>
      <h1 className="h1">Move content around: {m.title}</h1>
      <p>
        Use the arrows to move sections and the pieces inside them, or send a piece to another section. Nothing changes for residents until you press{" "}
        <strong>Save order</strong>. Wording edits and recordings move with their piece.
      </p>
      {layoutStatus && (
        <p className="text-sm text-muted">
          Custom order saved {formatDateTime(layoutStatus.updatedAt)}.
          {layoutStatus.stale && " The module's files changed since then; anything new was added at the end of its original section."}
        </p>
      )}
      <ArrangeEditor slug={slug} initial={sections} custom={!!layoutStatus} />
    </div>
  );
}
