import Link from "next/link";
import { getResolvedContent } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ContentIndex() {
  const { modules, status } = await getResolvedContent();
  return (
    <div className="space-y-6">
      <h1 className="h1">Module content</h1>
      <p className="max-w-3xl text-lg">
        Edit wording, quiz questions and answer keys, reflection prompts, practice activities, videos, and audio. Changes go live for residents as soon as you
        save. Every edited item has a <strong>Reset to original</strong> button.
      </p>
      <ul className="grid gap-4 md:grid-cols-2">
        {modules.map((m) => {
          const st = status.get(m.slug) ?? [];
          const stale = st.filter((s) => s.stale).length;
          return (
            <li key={m.slug} className="card flex flex-col gap-2">
              <span className="text-sm font-bold uppercase tracking-wide text-muted">Module {m.number}</span>
              <h2 className="h3">{m.title}</h2>
              <p className="text-muted">{m.description}</p>
              <p className="text-sm">
                {st.length ? `${st.length} edit${st.length === 1 ? "" : "s"}` : "No edits yet"}
                {stale > 0 && <span className="ml-2 font-semibold text-coral-ink">· {stale} need{stale === 1 ? "s" : ""} review</span>}
              </p>
              <div className="mt-auto flex flex-wrap gap-2 pt-2">
                <Link href={`/admin/content/${m.slug}`} className="btn-small">
                  Edit
                </Link>
                <Link href={`/module/${m.slug}`} className="btn-small" target="_blank">
                  Preview ↗
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
