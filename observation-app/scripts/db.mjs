// Database helper. Usage:
//   node scripts/db.mjs migrate   create/upgrade tables (safe to re-run)
//   node scripts/db.mjs seed      cycles, indicators, CFS, tiers, tracks, the action step library, settings (never overwrites)
//   node scripts/db.mjs samples   add clearly fake "Sample" residents with a few observations each, for testing
//   node scripts/db.mjs deploy    migrate + seed (+ samples if SEED_SAMPLE_DATA=true); runs on every Vercel build
//   node scripts/db.mjs reset     DROP EVERYTHING, then migrate + seed (local dev only)
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync } from "node:crypto";
import path from "node:path";
import postgres from "postgres";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const p = path.join(root, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!DB_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  process.exit(1);
}
const sql = postgres(DB_URL, { prepare: false, onnotice: () => {} });
const json = (f) => JSON.parse(readFileSync(path.join(root, f), "utf8"));

// Same format as lib/crypto.ts hashPasscode.
function hashPasscode(p) {
  const salt = randomBytes(16).toString("base64url");
  return `scrypt$${salt}$${scryptSync(p, salt, 32).toString("base64url")}`;
}

async function migrate() {
  await sql.unsafe(readFileSync(path.join(root, "db/schema.sql"), "utf8"));
  console.log("Schema applied.");
}

async function seed() {
  const s = json("content/seed.json");
  for (const o of s.observers) await sql`insert into observers ${sql(o)} on conflict (id) do nothing`;
  for (const c of s.cycles) await sql`insert into cycles ${sql(c)} on conflict (number) do nothing`;
  for (const i of s.indicators) await sql`insert into indicators ${sql(i)} on conflict (code) do nothing`;
  let n = 0;
  for (const c of s.cfs) await sql`insert into cfs ${sql({ ...c, sort: ++n })} on conflict (id) do nothing`;
  for (const t of s.tiers) await sql`insert into tiers ${sql(t)} on conflict (number) do nothing`;
  for (const t of s.tracks) await sql`insert into tracks ${sql(t)} on conflict (code) do nothing`;
  for (const [key, value] of Object.entries(s.settings)) {
    await sql`insert into settings (key, value) values (${key}, ${value}) on conflict (key) do nothing`;
  }

  // Library: insert current steps first, then legacy steps (they point at their replacements).
  const steps = json("content/action_steps.json");
  for (const st of [...steps.filter((x) => !x.is_legacy), ...steps.filter((x) => x.is_legacy)]) {
    const row = { replacement_id: null, ...st, retired_at: st.status === "retired" ? "2026-08-31" : null };
    const [ins] = await sql`insert into action_steps ${sql(row)} on conflict (id) do nothing returning id`;
    if (ins) await sql`insert into action_step_history (step_id, changed_by, change, after) values (${st.id}, 'seed', 'created', ${sql.json(row)})`;
  }

  // Access: the private link key, the shared passcode, and the data feed token.
  const [hasKey] = await sql`select value from settings where key = 'access_key'`;
  if (!hasKey) {
    const key = process.env.INITIAL_ACCESS_KEY || randomBytes(24).toString("base64url");
    await sql`insert into settings (key, value) values ('access_key', ${key}), ('auth_version', '1')`;
    console.log(process.env.INITIAL_ACCESS_KEY ? "Access key set from INITIAL_ACCESS_KEY." : `Access link: /enter/${key}`);
  }
  const [hasPass] = await sql`select value from settings where key = 'passcode_hash'`;
  if (!hasPass) {
    const p = process.env.INITIAL_PASSCODE || "";
    await sql`insert into settings (key, value) values ('passcode_hash', ${p ? hashPasscode(p) : ""})`;
    if (!p) console.log("No INITIAL_PASSCODE set: the passcode screen will ask you to create one on first visit.");
  }
  await sql`insert into settings (key, value) values ('feed_token', ${randomBytes(24).toString("base64url")}) on conflict (key) do nothing`;
  console.log("Seed data inserted (existing rows left unchanged).");
}

// ---------- Sample data (fake people, for trying the app) ----------

function rng(seed) {
  let x = seed;
  return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
}

async function samples() {
  const s = json("content/seed.json");
  const campuses = s.settings.campuses.split("\n");
  const schools = { Benning: "Promise", Douglass: "Honor", "High Schools": "KCP", Shaw: "WILL", Smilow: "Grow", Webb: "Spring", Wheeler: "Heights" };
  const firsts = ["Avery", "Blake", "Casey", "Devon", "Emerson", "Finley", "Harper", "Jordan", "Kendall", "Logan", "Morgan", "Parker", "Quinn", "Reese", "Rowan", "Skyler", "Taylor", "Toby"];
  const r = rng(42);
  const cfsBy = {};
  for (const c of s.cfs) (cfsBy[c.indicator] ??= []).push(c.id);
  const steps = json("content/action_steps.json").filter((x) => !x.is_legacy);
  const types = s.settings.observation_types.split("\n");

  for (let i = 0; i < firsts.length; i++) {
    const first = firsts[i];
    const full = `${first} Sample`;
    const [exists] = await sql`select id from residents where full_name = ${full} and is_sample`;
    if (exists) continue;
    const campus = campuses[i % campuses.length];
    const [res] = await sql`insert into residents ${sql({
      person_id: `SAMPLE-${String(i + 1).padStart(3, "0")}`,
      full_name: full, preferred_first: first, last_name: "Sample", status: "Enrolled - Resident",
      advisor_code: i % 2 ? "AC" : "APC", school: schools[campus], campus,
      grade_band: ["ES", "MS", "HS"][i % 3], content: ["ELA", "Math", "Science", "Gen Ed"][i % 4],
      mentor_teacher: `Mentor ${String.fromCharCode(65 + i)}`, email: `${first.toLowerCase()}.sample@example.org`, is_sample: true,
    })} returning id`;
    if (i === 3) await sql`insert into resident_track (resident_id, track, tier, effective_from, reason, decided_by, set_by, previous_track) values (${res.id}, 'accelerated', 3, '2026-09-28', 'Sample: promoted after strong Cycle 1', 'ashley', 'ashley', 'standard')`;
    if (i === 7) await sql`insert into resident_track (resident_id, track, tier, effective_from, reason, decided_by, set_by, previous_track) values (${res.id}, 'developing', 1, '2026-10-05', 'Sample: hold on Tier 1 indicators for now', 'alison', 'alison', 'standard')`;

    const dates = ["2026-08-24", "2026-09-10", "2026-09-29", "2026-10-06"].slice(0, 2 + Math.floor(r() * 3));
    if (i === firsts.length - 1) dates.length = 0; // one resident not yet observed
    let prevAssignments = [];
    let base = 1.6 + r() * 1.2;
    for (const d of dates) {
      const cycle = d < "2026-10-05" ? 1 : 2;
      const obsId = (await sql`insert into observations ${sql({
        resident_id: res.id, observer_id: i % 2 ? "alison" : "ashley", type: types[Math.floor(r() * 3)],
        involvement: "Leading Whole Group", observed_at: `${d}T14:00:00Z`, observed_date: d, cycle, status: "submitted",
        affirming: "Students responded quickly to your attention-getter.", adjusting: "Tighten the directions before independent practice.",
        source: "app", submitted_at: `${d}T15:00:00Z`, sent_at: `${d}T16:00:00Z`, sent_by: i % 2 ? "alison" : "ashley",
      })} returning id`)[0].id;
      const inds = cycle === 1 ? ["CC.A.4", "CC.A.5", "CC.A.6"] : ["CC.A.4", "CC.A.5", "CC.A.6", "CC.A.7", "CK.P.1", "CK.A.4"];
      for (const ind of inds) {
        const score = Math.max(1, Math.min(4, Math.round(base + r() * 1.2 - 0.4)));
        const cfs = cfsBy[ind].filter(() => r() < score / 4.5);
        await sql`insert into observation_scores (observation_id, indicator, score, expected_status, cfs_demonstrated) values (${obsId}, ${ind}, ${score}, 'expected', ${cfs})`;
      }
      for (const a of prevAssignments) {
        const result = ["yes", "partially", "no", "yes"][Math.floor(r() * 4)];
        await sql`insert into step_followthrough (observation_id, prior_assignment_id, result) values (${obsId}, ${a}, ${result})`;
      }
      const choice = steps.filter((x) => inds.includes(x.indicator));
      const step = choice[Math.floor(r() * choice.length)];
      const [a] = await sql`insert into observation_action_steps (observation_id, slot, step_id, indicator, wording_snapshot) values (${obsId}, 1, ${step.id}, ${step.indicator}, ${step.text}) returning id`;
      prevAssignments = [a.id];
      base += 0.35;
    }
  }
  console.log("Sample residents added. Remove them in Settings -> Data before launch.");
}

async function reset() {
  if (process.env.NODE_ENV === "production" || /supabase/.test(DB_URL)) {
    console.error("Refusing to reset a production/Supabase database.");
    process.exit(1);
  }
  await sql.unsafe(`drop schema public cascade; create schema public;`);
  await migrate();
  await seed();
}

const cmd = process.argv[2];
try {
  if (cmd === "migrate") await migrate();
  else if (cmd === "seed") await seed();
  else if (cmd === "samples") await samples();
  else if (cmd === "reset") await reset();
  else if (cmd === "deploy") {
    await migrate();
    await seed();
    if (process.env.SEED_SAMPLE_DATA === "true") await samples();
  } else console.log("Commands: migrate | seed | samples | deploy | reset");
} finally {
  await sql.end();
}
