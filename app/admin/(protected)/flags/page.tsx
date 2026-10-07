import Link from "next/link";
import { contentLinkKeys, LINK_SETTINGS, sampleContent, VALUE_SETTINGS } from "@/lib/content";
import { getSettings } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Flags() {
  const v = await getSettings();
  const usedIn = new Map<string, string[]>();
  for (const { key, where } of contentLinkKeys()) usedIn.set(key, [...(usedIn.get(key) ?? []), where]);
  const emptyLinks = LINK_SETTINGS.filter((d) => !v[d.key]);
  const emptyValues = VALUE_SETTINGS.filter((d) => d.group !== "Hidden" && !v[d.key]);
  const samples = sampleContent();
  return (
    <div className="space-y-6">
      <h1 className="h1">Content flags</h1>
      <p className="text-muted">Everything still missing before launch. Fill links in <Link className="link" href="/admin/settings">Settings</Link>.</p>
      <section className="card">
        <h2 className="h2">Empty links ({emptyLinks.length})</h2>
        {emptyLinks.length === 0 ? (
          <p className="mt-2 font-semibold text-teal-ink">✓ Every link is filled in.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {emptyLinks.map((d) => (
              <li key={d.key} className="rounded-xl border border-gray-brand/30 p-3">
                <strong>{d.label}</strong> <span className="text-sm text-muted">({d.group})</span>
                {usedIn.get(d.key) && <div className="text-sm text-muted">Shown in: {[...new Set(usedIn.get(d.key))].join("; ")}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card">
        <h2 className="h2">Empty settings ({emptyValues.length})</h2>
        <ul className="mt-3 list-disc pl-6">
          {emptyValues.map((d) => (
            <li key={d.key}>
              {d.label} <span className="text-sm text-muted">({d.group})</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h2 className="h2">Draft or sample content ({samples.length})</h2>
        <p className="mt-1 text-muted">These are marked &quot;sample, replace&quot; or &quot;CTR to confirm&quot; for residents. Ask Claude Code to update the matching file in /content/modules.</p>
        <ul className="mt-3 list-disc pl-6">
          {samples.map((s) => (
            <li key={s}>{s}</li>
          ))}
          <li>Answer keys for Modules 1, 3, and 4 are inferred (confirm), and the Module 5 knowledge check is newly drafted (approve, edit, or delete).</li>
        </ul>
      </section>
    </div>
  );
}
