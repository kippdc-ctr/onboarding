import "server-only";
import { randomBytes } from "node:crypto";
import { sql } from "./db";
import { parseCSV } from "./csv";
import { getConfig, listResidents, listSteps, rulesFor, type Resident } from "./data";
import { cycleForDate, expectedIndicators, residentCycles } from "./rules";

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

function findHeader(rows: string[][], must: string): number {
  return rows.findIndex((r) => r.some((c) => norm(c) === norm(must)));
}

// ---------- Roster (the Info tab) ----------

const ROSTER_MAP: Record<string, keyof Resident> = {
  "full name": "full_name",
  status: "status",
  "preferred first": "preferred_first",
  "last name": "last_name",
  pronouns: "pronouns",
  advisor: "advisor_code",
  school: "school",
  "grade band": "grade_band",
  content: "content",
  grade: "grade",
  campus: "campus",
  "mentor teacher": "mentor_teacher",
  "mt email": "mentor_email",
  manager: "manager",
  "kipp email": "email",
  email: "email",
  "person id": "person_id",
};

export type RosterChange = { name: string; action: "add" | "update" | "same"; changes: string[]; row: Partial<Resident> };
export type RosterPreview = { changes: RosterChange[]; missing: { id: string; name: string }[]; errors: string[] };

/** Active unless the Status column says the person has left. */
export function activeFromStatus(status: string): boolean {
  return !/(withdr|exit|resign|inactive|released|left|dismiss|alum)/i.test(status);
}

export async function previewRoster(text: string): Promise<RosterPreview> {
  const rows = parseCSV(text);
  const h = findHeader(rows, "Full Name");
  if (h < 0) return { changes: [], missing: [], errors: ['Couldn\'t find a "Full Name" column. Export the Info tab as CSV (File → Download → CSV) and try again.'] };
  const header = rows[h].map((c) => ROSTER_MAP[norm(c)] ?? null);
  const existing = await listResidents({ includeInactive: true });
  const seen = new Set<string>();
  const changes: RosterChange[] = [];
  const errors: string[] = [];
  for (const r of rows.slice(h + 1)) {
    const row: Partial<Resident> = {};
    header.forEach((k, i) => {
      if (k && r[i] !== undefined && !(k in row && row[k])) (row as Record<string, string>)[k] = r[i].trim();
    });
    if (!row.full_name) continue;
    if (row.status !== undefined) row.active = activeFromStatus(row.status);
    const match =
      (row.person_id && existing.find((e) => e.person_id === row.person_id)) ||
      (row.email && existing.find((e) => e.email && norm(e.email) === norm(row.email!))) ||
      existing.find((e) => norm(e.full_name) === norm(row.full_name!));
    if (match) {
      if (seen.has(match.id)) {
        errors.push(`${row.full_name} appears twice in the file; the first row was used.`);
        continue;
      }
      seen.add(match.id);
      const diff = (Object.keys(row) as (keyof Resident)[]).filter((k) => k !== "person_id" && String(match[k] ?? "") !== String(row[k] ?? ""));
      changes.push({ name: row.full_name, action: diff.length ? "update" : "same", changes: diff.map((k) => `${k}: "${match[k] ?? ""}" → "${row[k]}"`), row: { ...row, id: match.id } });
    } else {
      changes.push({ name: row.full_name, action: "add", changes: [], row });
    }
  }
  const missing = existing.filter((e) => e.active && !seen.has(e.id) && !e.is_sample).map((e) => ({ id: e.id, name: e.full_name }));
  return { changes, missing, errors };
}

export async function applyRoster(p: RosterPreview, deactivateMissing: boolean): Promise<{ added: number; updated: number; deactivated: number }> {
  let added = 0;
  let updated = 0;
  await sql.begin(async (tx) => {
    for (const c of p.changes) {
      const { id, ...row } = c.row;
      if (c.action === "update" && id) {
        delete row.person_id;
        await tx`update residents set ${tx(row as never)}, updated_at = now() where id = ${id}`;
        updated++;
      } else if (c.action === "add") {
        const person_id = row.person_id || `P-${randomBytes(4).toString("hex").toUpperCase()}`;
        await tx`insert into residents ${tx({ ...row, person_id } as never)}`;
        added++;
      }
    }
    if (deactivateMissing && p.missing.length) await tx`update residents set active = false, updated_at = now() where id = any(${p.missing.map((m) => m.id)})`;
  });
  return { added, updated, deactivated: deactivateMissing ? p.missing.length : 0 };
}

// ---------- Fillout submissions (the Form tab) ----------

export type MigrationRow = {
  ref: string;
  resident: string;
  residentId: string | null;
  observer: string | null;
  date: string;
  type: string;
  involvement: string;
  scores: { indicator: string; score: number; cfs: string[]; unmatchedCfs: string }[];
  steps: { stepId: string | null; text: string; indicator: string | null; legacy: boolean }[];
  internal: string;
  affirming: string;
  adjusting: string;
  send: boolean;
  problems: string[];
  exists: boolean;
};

function parseDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

export async function previewMigration(text: string): Promise<{ rows: MigrationRow[]; errors: string[] }> {
  const rows = parseCSV(text);
  const h = findHeader(rows, "Submission ID");
  if (h < 0) return { rows: [], errors: ['Couldn\'t find a "Submission ID" column. Export the Form tab as CSV and try again.'] };
  const head = rows[h].map(norm);
  const col = (name: string) => head.indexOf(norm(name));
  const [cfg, residents, steps] = await Promise.all([getConfig(), listResidents({ includeInactive: true }), listSteps({ includeRetired: true })]);
  const existingRefs = new Set((await sql<{ import_ref: string }[]>`select import_ref from observations where import_ref is not null`).map((r) => r.import_ref));
  const stepTexts = steps.map((s) => ({ s, t: norm(s.text) })).sort((a, b) => b.t.length - a.t.length);
  const out: MigrationRow[] = [];

  for (const r of rows.slice(h + 1)) {
    const get = (name: string) => (col(name) >= 0 ? (r[col(name)] ?? "").trim() : "");
    const ref = get("Submission ID");
    if (!ref) continue;
    const problems: string[] = [];
    const name = get("Resident");
    const res = residents.find((x) => norm(x.full_name) === norm(name));
    if (!res) problems.push(`No resident named "${name}" on the roster (import the roster first).`);
    const obsName = get("Observer");
    const observer = cfg.observers.find((o) => norm(o.name) === norm(obsName) || norm(o.full_name) === norm(obsName))?.id ?? null;
    if (!observer) problems.push(`Unknown observer "${obsName}".`);
    const date = parseDate(get("Date")) ?? parseDate(get("Submission time"));
    if (!date) problems.push("No date.");

    const scores: MigrationRow["scores"] = [];
    for (const ind of cfg.scoredIndicators) {
      const raw = get(ind.code);
      if (!raw) continue;
      const score = Number(raw);
      if (![1, 2, 3, 4].includes(score)) {
        problems.push(`${ind.code} score "${raw}" isn't 1 to 4.`);
        continue;
      }
      // CFS cells are comma-joined, and the CFS texts contain commas, so match known texts instead of splitting.
      let cell = norm(get(`CFS: ${ind.code}`));
      const found: string[] = [];
      for (const c of cfg.cfs.filter((x) => x.indicator === ind.code).sort((a, b) => b.full_text.length - a.full_text.length)) {
        const t = norm(c.full_text);
        if (cell.includes(t)) {
          found.push(c.id);
          cell = cell.replace(t, "");
        }
      }
      const leftover = cell.replace(/[,\s]+/g, " ").trim();
      if (leftover) problems.push(`${ind.code}: look-for text not recognized: "${leftover.slice(0, 80)}"`);
      scores.push({ indicator: ind.code, score, cfs: found, unmatchedCfs: leftover });
    }

    const stepRaw = get("Action Step");
    const stepsOut: MigrationRow["steps"] = [];
    if (stepRaw) {
      let rest = norm(stepRaw);
      for (const { s, t } of stepTexts) {
        if (rest.includes(t)) {
          stepsOut.push({ stepId: s.id, text: s.text, indicator: s.indicator, legacy: s.is_legacy });
          rest = rest.replace(t, "");
        }
      }
      rest = rest.replace(/\b(c[ck]\.[ap]\.\d)\s*-\s*/g, "").replace(/^[,\s]+|[,\s]+$/g, "");
      if (rest.length > 8) {
        const code = stepRaw.match(/\b(C[CK]\.[AP]\.\d)\b/)?.[1] ?? null;
        stepsOut.push({ stepId: null, text: stepRaw.replace(/^\s*C[CK]\.[AP]\.\d\s*-\s*/, "").trim(), indicator: cfg.indicators.some((i) => i.code === code) ? code : null, legacy: true });
      }
    }
    out.push({
      ref,
      resident: name,
      residentId: res?.id ?? null,
      observer,
      date: date ?? "",
      type: get("Observation Type"),
      involvement: get("Level of Involvement"),
      scores,
      steps: stepsOut,
      internal: get("Internal Comments"),
      affirming: get("Affirming Feedback"),
      adjusting: get("Adjusting Feedback"),
      send: true, // Every Fillout submission went to the resident through Document Studio.
      problems,
      exists: existingRefs.has(ref),
    });
  }
  return { rows: out, errors: [] };
}

export async function applyMigration(rows: MigrationRow[]): Promise<{ imported: number; skipped: number }> {
  const cfg = await getConfig();
  const ok = rows.filter((r) => !r.exists && r.residentId && r.observer && r.date);
  const rules = await rulesFor([...new Set(ok.map((r) => r.residentId!))]);
  let imported = 0;
  await sql.begin(async (tx) => {
    for (const r of ok) {
      const rr = rules.get(r.residentId!)!;
      const cycle = cycleForDate(r.date, residentCycles(cfg.cycles, rr.cycleOverrides));
      const expected = expectedIndicators(r.date, cfg, rr);
      const observedAt = `${r.date}T12:00:00-04:00`;
      const [o] = await tx<{ id: string }[]>`
        insert into observations ${tx({
          resident_id: r.residentId!, observer_id: r.observer!, type: r.type, involvement: r.involvement, observed_at: observedAt, observed_date: r.date,
          cycle, status: "submitted", internal_comments: r.internal, affirming: r.affirming, adjusting: r.adjusting, send_flag: r.send,
          sent_at: r.send ? observedAt : null, source: "import", import_ref: r.ref, submitted_at: observedAt,
        })}
        on conflict (import_ref) do nothing returning id`;
      if (!o) continue;
      for (const s of r.scores) {
        await tx`insert into observation_scores (observation_id, indicator, score, expected_status, cfs_demonstrated, comment)
                 values (${o.id}, ${s.indicator}, ${s.score}, ${expected.has(s.indicator) ? "expected" : "early"}, ${s.cfs}, ${s.unmatchedCfs ? `Imported look-for text not matched: ${s.unmatchedCfs}` : ""})`;
      }
      for (const [i, s] of r.steps.slice(0, 5).entries()) {
        await tx`insert into observation_action_steps (observation_id, slot, step_id, custom_text, indicator, wording_snapshot, legacy_text)
                 values (${o.id}, ${i + 1}, ${s.stepId}, ${s.stepId ? null : s.text}, ${s.indicator}, ${s.text}, ${!s.stepId})`;
      }
      imported++;
    }
  });
  return { imported, skipped: rows.length - imported };
}
