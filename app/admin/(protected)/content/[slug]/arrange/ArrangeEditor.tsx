"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { resetLayout, saveLayout } from "@/app/actions/content";
import { BackToTop } from "@/components/BackToTop";

export type ArrangeBlock = { origin: string; label: string; snippet: string; home: string };
export type ArrangeSection = { id: string; title: string; band?: string; blocks: ArrangeBlock[] };

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

const key = (s: ArrangeSection[]) => JSON.stringify(s.map((x) => [x.id, x.blocks.map((b) => b.origin)]));

export function ArrangeEditor({ slug, initial, custom }: { slug: string; initial: ArrangeSection[]; custom: boolean }) {
  const router = useRouter();
  const [sections, setSections] = useState(initial);
  const [saved, setSaved] = useState(key(initial));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = key(sections) !== saved;
  const titles = new Map(initial.map((s) => [s.id, s.title]));

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Keep the moved item in view and briefly highlighted, so it's easy to follow.
  useEffect(() => {
    if (!flash) return;
    document.getElementById(`arr-${flash}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const t = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(t);
  }, [flash, sections]);

  function moveSection(i: number, d: number) {
    setSections((s) => move(s, i, i + d));
    setFlash(sections[i].id);
    setMsg(null);
  }
  function moveBlock(si: number, bi: number, d: number) {
    setSections((all) => all.map((s, i) => (i === si ? { ...s, blocks: move(s.blocks, bi, bi + d) } : s)));
    setFlash(sections[si].blocks[bi].origin);
    setMsg(null);
  }
  function sendTo(si: number, bi: number, targetId: string) {
    const b = sections[si].blocks[bi];
    setSections((all) =>
      all.map((s, i) => {
        if (i === si) return { ...s, blocks: s.blocks.filter((_, j) => j !== bi) };
        if (s.id === targetId) return { ...s, blocks: [...s.blocks, b] };
        return s;
      }),
    );
    setFlash(b.origin);
    setMsg(null);
  }

  function save() {
    start(async () => {
      const res = await saveLayout(slug, { sections: sections.map((s) => ({ id: s.id, blocks: s.blocks.map((b) => b.origin) })) });
      if (res.ok) {
        setSaved(key(sections));
        setMsg({ ok: true, text: "Saved. Residents see the new order right away." });
        router.refresh();
      } else setMsg({ ok: false, text: res.error ?? "Couldn't save. Reload the page and try again." });
    });
  }
  function reset() {
    if (!confirm("Go back to the original order for this whole module?")) return;
    start(async () => {
      await resetLayout(slug);
      setMsg({ ok: true, text: "Back to the original order." });
      router.refresh();
      // The server sends the original order; reload so the list matches it.
      window.location.reload();
    });
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-3 rounded-xl border-2 border-teal bg-white p-3 shadow">
        <button type="button" onClick={save} disabled={!dirty || pending} className="btn-small disabled:opacity-50">
          {pending ? "Saving…" : "Save order"}
        </button>
        <button
          type="button"
          onClick={() => {
            setSections(JSON.parse(JSON.stringify(initial)));
            setMsg(null);
          }}
          disabled={!dirty || pending}
          className="link text-sm disabled:opacity-50"
        >
          Undo unsaved moves
        </button>
        {custom && (
          <button type="button" onClick={reset} disabled={pending} className="link text-sm">
            Reset to original order
          </button>
        )}
        <span aria-live="polite" className="text-sm">
          {dirty && !msg && <span className="font-semibold text-coral-ink">Unsaved changes</span>}
          {msg && <span className={`font-semibold ${msg.ok ? "text-teal-ink" : "text-coral-ink"}`}>{msg.text}</span>}
        </span>
        <Link href={`/module/${slug}`} target="_blank" className="link ml-auto text-sm">
          Preview as a resident ↗
        </Link>
      </div>

      {sections.map((s, si) => (
        <section
          key={s.id}
          id={`arr-${s.id}`}
          className={`card space-y-2 transition-colors ${flash === s.id ? "!bg-yellow-wash" : ""}`}
          aria-label={`Section ${si + 1}: ${s.title}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex gap-1">
              <button type="button" onClick={() => moveSection(si, -1)} disabled={si === 0} className="btn-small !min-h-9 !px-3 disabled:opacity-30" aria-label={`Move section ${s.title} up`}>
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveSection(si, 1)}
                disabled={si === sections.length - 1}
                className="btn-small !min-h-9 !px-3 disabled:opacity-30"
                aria-label={`Move section ${s.title} down`}
              >
                ↓
              </button>
            </span>
            <h2 className="h3">
              {si + 1}. {s.title}
            </h2>
            {s.band && <span className="rounded-full bg-yellow px-2 py-0.5 text-xs font-bold">Only for {s.band}</span>}
          </div>
          {s.blocks.length === 0 && <p className="rounded-lg border-2 border-dashed border-gray-brand/40 p-3 text-sm text-muted">Empty section (residents will see just the title).</p>}
          <ol className="space-y-2">
            {s.blocks.map((b, bi) => (
              <li
                key={b.origin}
                id={`arr-${b.origin}`}
                className={`flex flex-wrap items-center gap-2 rounded-lg border border-gray-brand/30 p-2 transition-colors sm:flex-nowrap ${flash === b.origin ? "bg-yellow-wash" : "bg-white"}`}
              >
                <span className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => moveBlock(si, bi, -1)} disabled={bi === 0} className="rounded-full border-2 border-teal px-2 font-bold text-teal-ink disabled:opacity-30" aria-label={`Move ${b.label} up`}>
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveBlock(si, bi, 1)}
                    disabled={bi === s.blocks.length - 1}
                    className="rounded-full border-2 border-teal px-2 font-bold text-teal-ink disabled:opacity-30"
                    aria-label={`Move ${b.label} down`}
                  >
                    ↓
                  </button>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted">{b.label}</span>
                  {b.home !== s.id && <span className="ml-2 rounded bg-teal-wash px-1 text-xs text-teal-ink">moved from {titles.get(b.home)}</span>}
                  <span className="block truncate">{b.snippet || <span className="text-muted">(no text)</span>}</span>
                </span>
                <select
                  value=""
                  onChange={(e) => e.target.value && sendTo(si, bi, e.target.value)}
                  className="input !min-h-9 w-full text-sm sm:w-44"
                  aria-label={`Move ${b.label} to another section`}
                >
                  <option value="">Move to section…</option>
                  {sections
                    .filter((x) => x.id !== s.id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.title}
                        {x.band ? ` (${x.band} only)` : ""}
                      </option>
                    ))}
                </select>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <BackToTop />
    </div>
  );
}
