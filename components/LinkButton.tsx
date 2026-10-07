import type { LinkKind } from "@/lib/content";

const KIND_ICON: Record<LinkKind, string> = { video: "▶", article: "📄", audio: "🎧", form: "✎" };

/** External link that degrades to a disabled "Link coming soon" button when the URL is blank. */
export function LinkButton({
  href,
  label,
  kind,
  variant = "secondary",
}: {
  href: string | null | undefined;
  label: string;
  kind?: LinkKind;
  variant?: "primary" | "secondary" | "small";
}) {
  const cls = variant === "primary" ? "btn-primary" : variant === "small" ? "btn-small" : "btn-secondary";
  if (!href) {
    return (
      <span className={`${cls} cursor-not-allowed opacity-60`} aria-disabled="true" title="Link coming soon">
        {label} <span className="text-sm font-semibold">(link coming soon)</span>
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {kind && <span aria-hidden="true">{KIND_ICON[kind]}</span>}
      {label}
      <span className="sr-only"> (opens in a new tab)</span>
      <span aria-hidden="true">↗</span>
    </a>
  );
}
