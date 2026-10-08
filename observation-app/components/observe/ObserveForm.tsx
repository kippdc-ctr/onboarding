"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ScoringData } from "@/lib/context";
import { type Draft, type DraftStep, enqueue, newClientId, listLocalDrafts, postObservation, removeLocalDraft, saveLocalDraft } from "@/lib/draft";
import { buildEmail } from "@/lib/email";
import { SCORE_LABELS, SCORE_MEANINGS } from "@/lib/rules";
import { cls, scoreClass } from "@/lib/ui";
import { ScorePill } from "@/components/Score";
import { ContextPanel } from "./ContextPanel";
import { StepPicker } from "./StepPicker";
import { autoCycle, blankDraft, dateLabel, expectedFor, historyBefore, latestScores, shortDate } from "./helpers";

type Props = {
  data: ScoringData;
  initial: Draft;
  editing?: { id: string; lateEdit: boolean };
};

const FOLLOW_OPTIONS: [Draft["follow"][string]["result"], string][] = [
  ["yes", "Yes"],
  ["partially", "Partially"],
  ["no", "No"],
  ["not_observed", "Not observed today"],
];

export function ObserveForm({ data, initial, editing }: Props) {
  const router = useRouter();
  const { cfg, residents, steps } = data;
  const [d, setD] = useState<Draft>(initial);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState<"" | "draft" | "submit">("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picker, setPicker] = useState<number | null>(null);
  const [legend, setLegend] = useState(false);
  const [showCtx, setShowCtx] = useState(false);
  const [search, setSearch] = useState("");
  const [localDrafts, setLocalDrafts] = useState<Draft[]>([]);
  const dirty = useRef(false);

  const r = residents.find((x) => x.id === d.residentId);
  const hist = useMemo(() => (r ? historyBefore(r, d.date, editing?.id) : []), [r, d.date, editing?.id]);
  const expected = useMemo(() => (r ? expectedFor(r, cfg, d.date) : new Set<string>()), [r, cfg, d.date]);
  const latest = useMemo(() => latestScores(hist), [hist]);
  const prev = hist[hist.length - 1];
  const priorSteps = prev?.steps ?? [];
  const cycle = autoCycle(r, cfg, d.date);
  const maxSteps = cfg.maxSteps;
  const shown = cfg.indicators.filter((i) => i.scored && (expected.has(i.code) || d.extra.includes(i.code) || d.scores[i.code]));
  const addable = cfg.indicators.filter((i) => i.scored && !shown.includes(i));

  const recentIds = useMemo(() => {
    const all = residents.flatMap((x) => x.history.filter((h) => h.observer === d.observerId)).sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    const ids: string[] = [];
    for (const h of all) for (const s of h.steps) if (s.stepId && !ids.includes(s.stepId)) ids.push(s.stepId);
    return ids.slice(0, 6);
  }, [residents, d.observerId]);

  const recentResidents = useMemo(() => {
    const seen = new Map<string, string>();
    for (const x of residents) for (const h of x.history) if (h.observer === d.observerId && (seen.get(x.id) ?? "") < h.observedAt) seen.set(x.id, h.observedAt);
    return [...seen.entries()].sort((a, b) => b[1].localeCompare(a[1])).slice(0, 6).map(([id]) => residents.find((x) => x.id === id)!);
  }, [residents, d.observerId]);

  const update = (patch: Partial<Draft> | ((x: Draft) => Partial<Draft>)) => {
    dirty.current = true;
    setD((x) => ({ ...x, ...(typeof patch === "function" ? patch(x) : patch) }));
  };

  // Autosave to this device every few seconds while there are changes.
  useEffect(() => {
    const t = setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      setD((x) => {
        saveLocalDraft({ ...x, residentName: residents.find((y) => y.id === x.residentId)?.name });
        return x;
      });
      setSavedAt(Date.now());
    }, 3000);
    return () => clearInterval(t);
  }, [residents]);

  useEffect(() => {
    if (!editing) setLocalDrafts(listLocalDrafts().filter((x) => x.clientId !== d.clientId && x.residentId));
  }, [editing, d.clientId]);

  const setScore = (code: string, patch: Partial<Draft["scores"][string]>) =>
    update((x) => ({ scores: { ...x.scores, [code]: { ...(x.scores[code] ?? { score: null, cfs: [], comment: "" }), ...patch } } }));

  const setStep = (i: number, s: DraftStep | null) =>
    update((x) => {
      const next = [...x.steps];
      if (s) next[i] = s;
      else next.splice(i, 1);
      return { steps: next };
    });

  const chooseResident = (id: string) => {
    update({ residentId: id, follow: {}, cycleOverride: null });
    setSearch("");
    setShowCtx(true);
  };

  const validate = (): string | null => {
    if (!d.residentId) return "Pick a resident.";
    if (!d.type) return "Choose the observation type.";
    if (priorSteps.some((s) => !d.follow[s.assignmentId]?.result)) return "Record follow-through on the last action step (or choose Not observed today).";
    const real = d.steps.filter((s) => (s.kind === "library" ? s.stepId : s.text.trim()));
    if (!real.length) return "Choose at least one action step.";
    return null;
  };

  const submit = async (status: "draft" | "submitted") => {
    setError(null);
    setNotice(null);
    if (status === "submitted") {
      const v = validate();
      if (v) return setError(v);
    } else if (!d.residentId) return setError("Pick a resident before saving a draft.");
    setBusy(status === "draft" ? "draft" : "submit");
    const payload = { draft: { ...d, residentName: r?.name }, status };
    saveLocalDraft(payload.draft);
    const res = await postObservation(payload);
    setBusy("");
    if (res.ok) {
      if (status === "draft") {
        setNotice("Draft saved to the app. You can finish it from any device.");
        return;
      }
      removeLocalDraft(d.clientId);
      router.push(`/observations/${res.id}?saved=1`);
      router.refresh();
    } else if (res.offline && status === "submitted") {
      enqueue(payload);
      // Stay on this screen (navigation may not work offline) and start a fresh observation.
      setD(blankDraft(newClientId(), d.observerId, data.today, cfg));
      setLocalDrafts([]);
      window.scrollTo({ top: 0 });
      setNotice(`You're offline. The observation for ${r?.name ?? "this resident"} is saved on this device and will send automatically when you reconnect.`);
    } else {
      setError(res.error);
    }
  };

  // Email preview
  const email = useMemo(() => {
    if (!r) return null;
    const chosen = d.steps
      .map((s) => {
        if (s.kind === "library") {
          const st = steps.find((x) => x.id === s.stepId);
          return st ? { text: st.text, lookFors: st.look_fors, practice: st.practice_rep, resourceUrl: st.resource_url, note: s.note } : null;
        }
        return s.text.trim() ? { text: s.text, lookFors: s.lookFors, practice: s.practice, resourceUrl: "", note: s.note } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    const snapshot = cfg.indicators
      .filter((i) => d.scores[i.code]?.score)
      .map((i) => {
        const s = d.scores[i.code];
        const all = cfg.cfs.filter((c) => c.indicator === i.code);
        return {
          code: i.code,
          name: i.short_label,
          score: s.score!,
          label: SCORE_LABELS[s.score!],
          demonstrated: all.filter((c) => s.cfs.includes(c.id)).map((c) => c.full_text),
          toBuild: all.filter((c) => !s.cfs.includes(c.id)).map((c) => c.full_text),
        };
      });
    return buildEmail({
      firstName: r.first,
      observerName: cfg.observers.find((o) => o.id === d.observerId)?.full_name || "",
      dateLabel: dateLabel(d.date),
      affirming: d.affirming,
      adjusting: d.adjusting,
      steps: chosen,
      includeSnapshot: d.includeSnapshot,
      snapshot,
      nextNote: d.nextNote,
      rubricNote: cfg.rubricNote,
    });
  }, [r, d, steps, cfg]);

  const matches = search.trim()
    ? residents.filter((x) => x.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8)
    : [];

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6">
      <div className="space-y-4 pb-28">
        {editing && (
          <p className={cls("rounded-xl border-2 p-3 text-sm font-semibold", editing.lateEdit ? "border-coral bg-coral-wash text-coral-ink" : "border-teal bg-teal-wash text-teal-ink")}>
            {editing.lateEdit ? "Admin edit after the 7-day window. This change is logged." : "Editing a saved observation. Changes are logged."}
          </p>
        )}
        {!editing && !d.residentId && localDrafts.length > 0 && (
          <div className="card !p-4">
            <h2 className="font-bold">Unfinished on this device</h2>
            <ul className="mt-2 space-y-1">
              {localDrafts.slice(0, 5).map((x) => (
                <li key={x.clientId} className="flex items-center justify-between gap-2">
                  <span>{x.residentName ?? "Resident"} · {shortDate(x.date)}</span>
                  <span className="flex gap-2">
                    <button type="button" className="btn-small" onClick={() => { setD(x); setShowCtx(true); }}>Resume</button>
                    <button type="button" className="btn-danger" onClick={() => { removeLocalDraft(x.clientId); setLocalDrafts((l) => l.filter((y) => y.clientId !== x.clientId)); }}>Discard</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 1. Setup */}
        <section className="card !p-4" aria-labelledby="setup-h">
          <h2 id="setup-h" className="h3">1. Setup</h2>
          {r ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-lg font-bold">{r.name}</p>
              {!editing && <button type="button" className="btn-small" onClick={() => update({ residentId: "", follow: {} })}>Change resident</button>}
            </div>
          ) : (
            <div className="mt-2">
              <label className="label" htmlFor="res-search">Resident</label>
              <input id="res-search" className="input" placeholder="Start typing a name" autoComplete="off" value={search} onChange={(e) => setSearch(e.target.value)} />
              {matches.length > 0 && (
                <ul className="mt-1 divide-y divide-gray-brand/20 rounded-xl border border-gray-brand/30 bg-white" role="listbox" aria-label="Matching residents">
                  {matches.map((x) => (
                    <li key={x.id}>
                      <button type="button" className="w-full px-3 py-2 text-left hover:bg-teal-wash" onClick={() => chooseResident(x.id)}>
                        <span className="font-semibold">{x.name}</span> <span className="text-sm text-muted">{x.school} · {x.campus}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!search && recentResidents.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-muted">Recent</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {recentResidents.map((x) => (
                      <button key={x.id} type="button" className="btn-small" onClick={() => chooseResident(x.id)}>{x.name}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <fieldset>
              <legend className="label">Observer</legend>
              <div className="flex gap-2">
                {cfg.observers.map((o) => (
                  <button key={o.id} type="button" aria-pressed={d.observerId === o.id} onClick={() => update({ observerId: o.id })}
                    className={cls("btn-small", d.observerId === o.id && "!bg-teal-ink !text-white")}>{o.name}</button>
                ))}
              </div>
            </fieldset>
            <div>
              <label className="label" htmlFor="obs-date">Date</label>
              <input id="obs-date" type="date" className="input" value={d.date} max={data.today} onChange={(e) => update({ date: e.target.value || data.today, cycleOverride: null })} />
              <p className="mt-1 text-xs text-muted">
                Counts toward <b>Cycle {d.cycleOverride ?? cycle}</b>{d.cycleOverride !== null ? " (changed by you)" : " (from the date)"}.{" "}
                <label className="inline">
                  <span className="sr-only">Count toward cycle</span>
                  <select className="ml-1 rounded border border-gray-brand/50 bg-white px-1 text-xs" value={d.cycleOverride ?? ""} onChange={(e) => update({ cycleOverride: e.target.value === "" ? null : Number(e.target.value) })}>
                    <option value="">Use date</option>
                    {cfg.cycles.map((c) => <option key={c.number} value={c.number}>Cycle {c.number}</option>)}
                  </select>
                </label>
              </p>
            </div>
          </div>
          <fieldset className="mt-3">
            <legend className="label">Observation type</legend>
            <div className="flex flex-wrap gap-2">
              {cfg.types.map((t) => (
                <button key={t} type="button" aria-pressed={d.type === t} onClick={() => update({ type: t })} className={cls("btn-small", d.type === t && "!bg-teal-ink !text-white")}>{t}</button>
              ))}
            </div>
          </fieldset>
          <div className="mt-3">
            <label className="label" htmlFor="involve">Level of involvement</label>
            <select id="involve" className="input" value={d.involvement} onChange={(e) => update({ involvement: e.target.value })}>
              <option value="">Choose…</option>
              {cfg.involvement.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </section>

        {r && (
          <div className="lg:hidden">
            <button type="button" className="btn-secondary w-full !text-base" aria-expanded={showCtx} onClick={() => setShowCtx(!showCtx)}>
              {showCtx ? "Hide" : "Show"} resident context
            </button>
            {showCtx && <div className="card mt-2 !p-4"><ContextPanel r={r} cfg={cfg} date={d.date} editingId={editing?.id} /></div>}
          </div>
        )}

        {/* 2. Follow-through */}
        {r && priorSteps.length > 0 && (
          <section className="card !p-4" aria-labelledby="follow-h">
            <h2 id="follow-h" className="h3">2. Follow-through on the last step</h2>
            <p className="text-sm text-muted">Assigned {shortDate(prev!.date)}. Did you see it today?</p>
            {priorSteps.map((s) => {
              const f = d.follow[s.assignmentId] ?? { result: "", note: "" };
              return (
                <fieldset key={s.assignmentId} className="mt-3">
                  <legend className="font-semibold">{s.indicator ? `${s.indicator}: ` : ""}{s.text}</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {FOLLOW_OPTIONS.map(([v, label]) => (
                      <button key={v} type="button" aria-pressed={f.result === v}
                        onClick={() => update((x) => ({ follow: { ...x.follow, [s.assignmentId]: { ...f, result: v } } }))}
                        className={cls("btn-small !px-2", f.result === v && "!bg-teal-ink !text-white")}>{label}</button>
                    ))}
                  </div>
                  <label className="sr-only" htmlFor={`fn-${s.assignmentId}`}>Note</label>
                  <input id={`fn-${s.assignmentId}`} className="input mt-2 !min-h-10" placeholder="Optional one-line note" value={f.note}
                    onChange={(e) => update((x) => ({ follow: { ...x.follow, [s.assignmentId]: { ...f, note: e.target.value } } }))} />
                </fieldset>
              );
            })}
          </section>
        )}

        {/* 3. Scores */}
        {r && (
          <section className="card !p-4" aria-labelledby="scores-h">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="scores-h" className="h3">{priorSteps.length ? "3" : "2"}. Scores</h2>
              <button type="button" className="btn-small" aria-expanded={legend} onClick={() => setLegend(!legend)}>Rubric scale</button>
            </div>
            {legend && (
              <div className="mt-2 rounded-xl bg-sand p-3 text-sm">
                <ul className="space-y-1">
                  {[4, 3, 2, 1].map((n) => (
                    <li key={n} className="flex gap-2"><ScorePill size="sm" score={n} /> <span><b>{SCORE_LABELS[n]}.</b> {SCORE_MEANINGS[n]}.</span></li>
                  ))}
                </ul>
                <p className="mt-2 italic text-muted">{cfg.rubricNote}</p>
              </div>
            )}
            {shown.length === 0 && <p className="mt-2 text-muted">No indicators are expected for this resident on this date yet. Add one below to score it as early / practice.</p>}
            <div className="mt-3 space-y-5">
              {shown.map((ind) => {
                const s = d.scores[ind.code] ?? { score: null, cfs: [], comment: "" };
                const last = latest[ind.code];
                const early = !expected.has(ind.code);
                const delta = s.score && last?.score ? s.score - last.score : null;
                return (
                  <fieldset key={ind.code} className="border-t border-gray-brand/20 pt-3 first:border-0 first:pt-0">
                    <legend className="w-full">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-bold">{ind.code}</span>
                        <span>{ind.name}</span>
                        {early && <span className="chip border-dashed border-gray-brand text-muted">Extra / early: not counted</span>}
                      </span>
                    </legend>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {[1, 2, 3, 4].map((n) => (
                        <button key={n} type="button" aria-pressed={s.score === n} aria-label={`${n}: ${SCORE_LABELS[n]}`} title={SCORE_LABELS[n]}
                          onClick={() => setScore(ind.code, { score: s.score === n ? null : n })}
                          className={cls("h-12 w-12 rounded-xl border-2 text-lg font-bold", s.score === n ? cls(scoreClass(n), "border-ink ring-2 ring-ink ring-offset-1") : "border-gray-brand/50 bg-white")}>{n}</button>
                      ))}
                      <span className="ml-1 text-sm text-muted">
                        Last: {last ? <><ScorePill size="sm" score={last.score} early={last.early} /> {shortDate(last.date)}</> : "none"}
                      </span>
                      {delta !== null && (
                        <span className={cls("chip", delta > 0 ? "border-teal bg-teal-wash text-teal-ink" : delta < 0 ? "border-coral bg-coral-wash text-coral-ink" : "border-gray-brand/40 text-muted")}>
                          {delta > 0 ? `↑ +${delta}` : delta < 0 ? `↓ ${delta}` : "→ same"} from last time
                        </span>
                      )}
                    </div>
                    <div className="mt-2 grid gap-1">
                      {cfg.cfs.filter((c) => c.indicator === ind.code).map((c) => {
                        const on = s.cfs.includes(c.id);
                        const wasOn = last?.cfs.includes(c.id);
                        return (
                          <label key={c.id} className={cls("flex cursor-pointer items-start gap-2 rounded-lg p-1.5", on && "bg-teal-wash")}>
                            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[#2c6a74]" checked={on}
                              onChange={() => setScore(ind.code, { cfs: on ? s.cfs.filter((x) => x !== c.id) : [...s.cfs, c.id] })} />
                            <span className="text-sm">
                              {c.full_text}
                              {last && <span className="ml-1 text-xs text-muted">{wasOn ? "· seen last time" : "· not seen last time"}</span>}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <label className="sr-only" htmlFor={`cm-${ind.code}`}>Comment on {ind.code}</label>
                    <input id={`cm-${ind.code}`} className="input mt-2 !min-h-10 text-sm" placeholder="Optional comment" value={s.comment} onChange={(e) => setScore(ind.code, { comment: e.target.value })} />
                    {(early && d.extra.includes(ind.code) && !s.score && !s.comment && !s.cfs.length) && (
                      <button type="button" className="link mt-1 text-sm" onClick={() => update((x) => ({ extra: x.extra.filter((c) => c !== ind.code) }))}>Remove</button>
                    )}
                  </fieldset>
                );
              })}
            </div>
            {addable.length > 0 && (
              <div className="mt-4">
                <label className="label text-sm" htmlFor="add-ind">Add another indicator (saved as extra / early)</label>
                <select id="add-ind" className="input" value="" onChange={(e) => e.target.value && update((x) => ({ extra: [...x.extra, e.target.value] }))}>
                  <option value="">Choose an indicator…</option>
                  {addable.map((i) => <option key={i.code} value={i.code}>{i.code} {i.name}</option>)}
                </select>
              </div>
            )}
          </section>
        )}

        {/* 4. Action steps */}
        {r && (
          <section className="card !p-4" aria-labelledby="steps-h">
            <h2 id="steps-h" className="h3">{priorSteps.length ? "4" : "3"}. Action step{maxSteps > 1 ? "s" : ""}</h2>
            <p className="text-sm text-muted">At least one, at most {maxSteps}. The text is exactly what the resident will see.</p>
            <div className="mt-3 space-y-4">
              {Array.from({ length: Math.min(maxSteps, d.steps.length + 1) }).map((_, i) => {
                const s = d.steps[i];
                if (!s) {
                  return picker === i ? (
                    <StepPicker key={i} cfg={cfg} steps={steps} resident={r} expected={expected} date={d.date} recent={recentIds}
                      exclude={d.steps.flatMap((x) => (x.kind === "library" ? [x.stepId] : []))}
                      onPick={(id) => { setStep(i, { kind: "library", stepId: id, note: "" }); setPicker(null); }}
                      onClose={() => setPicker(null)} />
                  ) : (
                    <div key={i} className="flex flex-wrap gap-2">
                      <button type="button" className="btn-secondary !text-base" onClick={() => setPicker(i)}>{i === 0 ? "Choose a step from the library" : "Add a second step (optional)"}</button>
                      <button type="button" className="btn-small" onClick={() => setStep(i, { kind: "custom", text: "", indicator: "", lookFors: "", practice: "", note: "" })}>Type a step</button>
                    </div>
                  );
                }
                if (s.kind === "library") {
                  const st = steps.find((x) => x.id === s.stepId);
                  return (
                    <div key={i} className="rounded-xl border-l-4 border-coral bg-coral-wash p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-coral-ink">Step {i + 1} · {st?.id} · {st?.indicator}</p>
                        <span className="flex gap-2">
                          <button type="button" className="link text-sm" onClick={() => { setStep(i, null); setPicker(i); }}>Change</button>
                          <button type="button" className="link text-sm" onClick={() => setStep(i, null)}>Remove</button>
                        </span>
                      </div>
                      <p className="font-semibold">{st?.text ?? "This step is no longer in the library."}</p>
                      {st?.look_fors && <p className="mt-1 text-sm"><b>Look-fors:</b> {st.look_fors}</p>}
                      {st?.practice_rep && <p className="mt-1 text-sm"><b>Practice:</b> {st.practice_rep}</p>}
                      <label className="sr-only" htmlFor={`pn-${i}`}>Personalization note</label>
                      <input id={`pn-${i}`} className="input mt-2 !min-h-10 text-sm" placeholder="Optional short personalization note for the resident" value={s.note}
                        onChange={(e) => setStep(i, { ...s, note: e.target.value })} />
                    </div>
                  );
                }
                return (
                  <div key={i} className="rounded-xl border-l-4 border-coral bg-coral-wash p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-coral-ink">Step {i + 1} · typed step</p>
                      <button type="button" className="link text-sm" onClick={() => setStep(i, null)}>Remove</button>
                    </div>
                    <label className="label text-sm" htmlFor={`ct-${i}`}>Step text</label>
                    <textarea id={`ct-${i}`} className="input min-h-20" value={s.text} onChange={(e) => setStep(i, { ...s, text: e.target.value })} />
                    <label className="label mt-2 text-sm" htmlFor={`ci-${i}`}>Indicator</label>
                    <select id={`ci-${i}`} className="input" value={s.indicator} onChange={(e) => setStep(i, { ...s, indicator: e.target.value })}>
                      <option value="">Choose…</option>
                      {cfg.indicators.map((x) => <option key={x.code} value={x.code}>{x.code} {x.short_label}</option>)}
                    </select>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-semibold text-teal-ink">Add look-fors or a practice rep (optional)</summary>
                      <label className="label mt-2 text-sm" htmlFor={`cl-${i}`}>What it looks like when it's working</label>
                      <textarea id={`cl-${i}`} className="input min-h-16" value={s.lookFors} onChange={(e) => setStep(i, { ...s, lookFors: e.target.value })} />
                      <label className="label mt-2 text-sm" htmlFor={`cp-${i}`}>Practice this week</label>
                      <textarea id={`cp-${i}`} className="input min-h-16" value={s.practice} onChange={(e) => setStep(i, { ...s, practice: e.target.value })} />
                    </details>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 5. Feedback */}
        {r && (
          <section className="card !p-4" aria-labelledby="fb-h">
            <h2 id="fb-h" className="h3">{priorSteps.length ? "5" : "4"}. Feedback</h2>
            <label className="label mt-2" htmlFor="aff">Affirming feedback</label>
            <textarea id="aff" className="input min-h-24" value={d.affirming} onChange={(e) => update({ affirming: e.target.value })} />
            <label className="label mt-3" htmlFor="adj">Adjusting feedback</label>
            <textarea id="adj" className="input min-h-24" value={d.adjusting} onChange={(e) => update({ adjusting: e.target.value })} />
            <label className="label mt-3" htmlFor="int">Internal comments <span className="font-normal text-muted">(private; never in the email)</span></label>
            <textarea id="int" className="input min-h-20" value={d.internal} onChange={(e) => update({ internal: e.target.value })} />
          </section>
        )}

        {/* 6. Email */}
        {r && (
          <section className="card !p-4" aria-labelledby="em-h">
            <h2 id="em-h" className="h3">{priorSteps.length ? "6" : "5"}. Send to resident?</h2>
            <label className="mt-2 flex items-center gap-2 font-semibold">
              <input type="checkbox" className="h-5 w-5 accent-[#2c6a74]" checked={d.sendFlag} onChange={(e) => update({ sendFlag: e.target.checked })} />
              Prepare the feedback email for {r.first}
            </label>
            {d.sendFlag && (
              <>
                <label className="mt-2 flex items-center gap-2">
                  <input type="checkbox" className="h-5 w-5 accent-[#2c6a74]" checked={d.includeSnapshot} onChange={(e) => update({ includeSnapshot: e.target.checked })} />
                  Include the indicator snapshot
                </label>
                <label className="label mt-3 text-sm" htmlFor="next">What happens next</label>
                <textarea id="next" className="input min-h-16" value={d.nextNote} onChange={(e) => update({ nextNote: e.target.value })} />
                <details className="mt-3">
                  <summary className="cursor-pointer font-semibold text-teal-ink">Preview the email</summary>
                  {email && (
                    <div className="mt-2 rounded-xl border border-gray-brand/30 bg-white p-3">
                      <p className="text-sm"><b>To:</b> {r.email || "(no email on the roster)"} · <b>Subject:</b> {email.subject}</p>
                      <div className="mt-2 border-t pt-2" dangerouslySetInnerHTML={{ __html: email.html }} />
                    </div>
                  )}
                  <p className="mt-1 text-xs text-muted">After you submit, the observation page has Copy email and Open in mail buttons.</p>
                </details>
              </>
            )}
          </section>
        )}
      </div>

      {r && (
        <aside className="hidden lg:block" aria-label="Resident context">
          <div className="card sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto !p-4">
            <ContextPanel r={r} cfg={cfg} date={d.date} editingId={editing?.id} />
          </div>
        </aside>
      )}

      {/* Sticky footer */}
      <div className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-gray-brand/30 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2">
          <div className="min-w-0 flex-1 text-xs text-muted" aria-live="polite">
            {error ? <span role="alert" className="font-semibold text-coral-ink">{error}</span> : notice ? <span className="font-semibold text-teal-ink">{notice}</span> : savedAt ? `Saved on this device at ${new Date(savedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : "Drafts save on this device as you go."}
          </div>
          {!editing && (
            <button type="button" className="btn-small" disabled={!!busy} onClick={() => submit("draft")}>{busy === "draft" ? "Saving…" : "Save draft"}</button>
          )}
          <button type="button" className="btn-primary !min-h-11 !text-base" disabled={!!busy} onClick={() => submit("submitted")}>{busy === "submit" ? "Submitting…" : editing ? "Save changes" : "Submit"}</button>
        </div>
      </div>
    </div>
  );
}
