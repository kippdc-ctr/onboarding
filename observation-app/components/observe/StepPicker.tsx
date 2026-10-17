"use client";

import { useMemo, useState } from "react";
import type { ClientStep, ResidentCtx } from "@/lib/context";
import { FOLLOW_LABEL, cls } from "@/lib/ui";
import { type Cfg, latestScores, shortDate, stepHistory } from "./helpers";

type Props = {
  cfg: Cfg;
  steps: ClientStep[];
  resident: ResidentCtx | undefined;
  expected: Set<string>;
  date: string;
  recent: string[];
  exclude: string[];
  onPick: (id: string) => void;
  onClose: () => void;
};

/** Searchable library picker. Default view ranks steps for the indicators and CFS this resident is lowest on. */
export function StepPicker({ cfg, steps, resident, expected, date, recent, exclude, onPick, onClose }: Props) {
  const [q, setQ] = useState("");
  const [domain, setDomain] = useState("");
  const [indicator, setIndicator] = useState("");
  const [cfs, setCfs] = useState("");
  const [grade, setGrade] = useState("");
  const [skill, setSkill] = useState("");
  const [tag, setTag] = useState("");
  const [showAll, setShowAll] = useState(false);

  const hist = useMemo(() => (resident ? resident.history.filter((h) => h.date <= date) : []), [resident, date]);
  const latest = useMemo(() => latestScores(hist), [hist]);
  const assigned = useMemo(() => (resident ? stepHistory(resident) : {}), [resident]);

  const values = (f: (s: ClientStep) => string[]) => [...new Set(steps.flatMap(f).filter(Boolean))].sort();
  const grades = values((s) => [s.grade_band]);
  const skills = values((s) => [s.skill_level]);
  const tags = values((s) => s.tags);

  const filtering = !!(q || domain || indicator || cfs || grade || skill || tag);

  const ranked = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = steps.filter((s) => {
      if (s.retired || exclude.includes(s.id)) return false;
      if (domain && s.domain !== domain) return false;
      if (indicator && s.indicator !== indicator) return false;
      if (cfs && !(s.cfs_ids.includes(cfs) || (s.link_type === "cross_cutting" && cfs.startsWith(s.indicator + ".")))) return false;
      if (grade && s.grade_band !== grade) return false;
      if (skill && s.skill_level !== skill) return false;
      if (tag && !s.tags.includes(tag)) return false;
      if (words.length) {
        const hay = `${s.id} ${s.indicator} ${s.text} ${s.look_fors} ${s.tags.join(" ")}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      if (!filtering && !showAll && !expected.has(s.indicator)) return false;
      return true;
    });
    const score = (s: ClientStep) => {
      const l = latest[s.indicator];
      let r = expected.has(s.indicator) ? 100 : 0;
      r += (4 - (l?.score ?? 2.5)) * 20; // lower latest score ranks higher
      if (l) {
        const missingCfs = s.cfs_ids.filter((c) => !l.cfs.includes(c)).length;
        r += missingCfs * 8;
        if (s.link_type !== "cross_cutting" && s.cfs_ids.length && missingCfs === 0) r -= 10;
      }
      if (assigned[s.id]) r -= 15 * assigned[s.id].count;
      return r;
    };
    return list.map((s) => ({ s, r: score(s) })).sort((a, b) => b.r - a.r).map((x) => x.s);
  }, [steps, exclude, domain, indicator, cfs, grade, skill, tag, q, filtering, showAll, expected, latest, assigned]);

  const recentSteps = recent.map((id) => steps.find((s) => s.id === id)).filter((s): s is ClientStep => !!s && !s.retired && !exclude.includes(s.id));
  const indName = (code: string) => cfg.indicators.find((i) => i.code === code)?.short_label ?? code;
  const cfsLabel = (id: string) => cfg.cfs.find((c) => c.id === id)?.short_label ?? id;

  return (
    <div className="rounded-2xl border-2 border-teal bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-bold text-teal-ink">Action step library</h4>
        <button type="button" className="btn-small" onClick={onClose}>Close</button>
      </div>
      <label className="sr-only" htmlFor="step-search">Search steps</label>
      <input id="step-search" className="input mt-2" placeholder="Search words, e.g. narrate, think time" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select aria-label="Domain" className="input !min-h-10 !py-1 text-sm" value={domain} onChange={(e) => setDomain(e.target.value)}>
          <option value="">All domains</option>
          <option value="CC">CC: Classroom Culture</option>
          <option value="CK">CK: Content Knowledge</option>
        </select>
        <select aria-label="Indicator" className="input !min-h-10 !py-1 text-sm" value={indicator} onChange={(e) => { setIndicator(e.target.value); setCfs(""); }}>
          <option value="">All indicators</option>
          {cfg.indicators.map((i) => <option key={i.code} value={i.code}>{i.code} {i.short_label}</option>)}
        </select>
        <select aria-label="Look-for (CFS)" className="input !min-h-10 !py-1 text-sm" value={cfs} onChange={(e) => setCfs(e.target.value)}>
          <option value="">All look-fors</option>
          {cfg.cfs.filter((c) => !indicator || c.indicator === indicator).map((c) => <option key={c.id} value={c.id}>{c.id} {c.short_label}</option>)}
        </select>
        {grades.length > 0 && (
          <select aria-label="Grade band" className="input !min-h-10 !py-1 text-sm" value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">All grade bands</option>
            {grades.map((g) => <option key={g}>{g}</option>)}
          </select>
        )}
        {skills.length > 0 && (
          <select aria-label="Skill level" className="input !min-h-10 !py-1 text-sm" value={skill} onChange={(e) => setSkill(e.target.value)}>
            <option value="">All skill levels</option>
            {skills.map((g) => <option key={g}>{g}</option>)}
          </select>
        )}
        {tags.length > 0 && (
          <select aria-label="Tag" className="input !min-h-10 !py-1 text-sm" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">All tags</option>
            {tags.map((g) => <option key={g}>{g}</option>)}
          </select>
        )}
      </div>
      {recentSteps.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-muted">Recently used by you</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {recentSteps.map((s) => (
              <button key={s.id} type="button" onClick={() => onPick(s.id)} title={s.text} className="chip max-w-full border-teal bg-teal-wash text-left text-teal-ink">
                <span className="truncate">{s.indicator}: {s.text.length > 48 ? s.text.slice(0, 46) + "…" : s.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!filtering && (
        <p className="mt-2 text-xs text-muted">
          {showAll ? "Showing every active step, ranked for this resident." : "Showing steps for this resident's expected indicators, lowest scores and missing look-fors first."}{" "}
          <button type="button" className="link" onClick={() => setShowAll(!showAll)}>{showAll ? "Expected only" : "Show all indicators"}</button>
        </p>
      )}
      <ul className="mt-2 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
        {ranked.length === 0 && <li className="text-muted">No steps match. Try fewer filters, or type your own step.</li>}
        {ranked.map((s) => {
          const h = assigned[s.id];
          const alternatives = h
            ? steps.filter((x) => !x.retired && x.indicator === s.indicator && x.id !== s.id && !assigned[x.id] && !exclude.includes(x.id)).slice(0, 2)
            : [];
          return (
            <li key={s.id} className="rounded-xl border border-gray-brand/30 p-2">
              <button type="button" onClick={() => onPick(s.id)} className="w-full text-left">
                <span className="text-xs font-semibold text-teal-ink">
                  {s.id} · {s.indicator} {indName(s.indicator)}
                  {latest[s.indicator]?.score != null && <> · last score {latest[s.indicator].score}</>}
                </span>
                <span className="block font-semibold">{s.text}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {s.link_type === "cross_cutting" ? (
                    <span className="chip border-gray-brand/40 text-muted">Cross-cutting</span>
                  ) : (
                    s.cfs_ids.map((c) => (
                      <span key={c} className={cls("chip", latest[s.indicator] && !latest[s.indicator].cfs.includes(c) ? "border-coral bg-coral-wash text-coral-ink" : "border-gray-brand/40 text-muted")}>
                        {cfsLabel(c)}
                      </span>
                    ))
                  )}
                  {!s.look_fors && <span className="chip border-dashed border-gray-brand/40 text-muted">No look-fors yet</span>}
                </span>
              </button>
              {h && (
                <div role="note" className="mt-2 rounded-lg bg-yellow-wash p-2 text-xs">
                  <b>Assigned {h.count === 1 ? "once" : h.count === 2 ? "twice" : `${h.count} times`}</b>, last on {shortDate(h.lastDate)}.
                  {h.lastResult && <> Follow-through: {FOLLOW_LABEL[h.lastResult]}.</>}
                  {alternatives.length > 0 && (
                    <span className="mt-1 block">
                      Related:{" "}
                      {alternatives.map((a, i) => (
                        <span key={a.id}>
                          {i > 0 && " · "}
                          <button type="button" className="link" onClick={() => onPick(a.id)}>{a.text}</button>
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
