// Database helper. Usage:
//   node scripts/db.mjs migrate   create/upgrade tables (safe to re-run)
//   node scripts/db.mjs seed      insert the school year, calendar, campuses, sources, settings, goals,
//                                 and OWNER_EMAILS as owners (never overwrites anything already there)
//   node scripts/db.mjs deploy    migrate + seed; runs on every Vercel build
//   node scripts/db.mjs reset     DROP the metrics schema, then migrate + seed (local dev only)
// Sample data is loaded from inside the app (Admin -> Data), so it goes through the same code as real imports.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

// POSTGRES_URL is what the Vercel <-> Supabase integration sets automatically.
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!DB_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  process.exit(1);
}
const sql = postgres(DB_URL, { prepare: false, onnotice: () => {} });
const json = (f) => JSON.parse(readFileSync(path.join(root, f), "utf8"));

async function migrate() {
  await sql.unsafe(readFileSync(path.join(root, "db/schema.sql"), "utf8"));
  console.log("Schema applied.");
}

const GOAL_DEFAULTS = {
  unit: "percent",
  direction: "at_least",
  target_count_note: null,
  measured_at: null,
  pace_by: null,
  baseline_value: null,
  baseline_n: null,
  baseline_note: null,
  doc_change: null,
  suppress_small_n: true,
  counts_withdrawn: false,
  derive_rule: null,
};

async function seed() {
  const s = json("content/seed.json");
  const year = s.school_year.id;
  await sql`insert into metrics.school_years ${sql(s.school_year)} on conflict (id) do nothing`;
  for (const [i, name] of s.campuses.entries()) {
    await sql`insert into metrics.campuses (name, sort_order) values (${name}, ${i}) on conflict (name) do nothing`;
  }
  for (const [i, p] of s.periods.entries()) {
    await sql`insert into metrics.periods ${sql({ ...p, school_year: year, sort_order: i })} on conflict (school_year, key) do nothing`;
  }
  for (const [i, src] of s.sources.entries()) {
    await sql`insert into metrics.sources ${sql({ ...src, sort_order: i })} on conflict (key) do nothing`;
  }
  for (const [key, value] of Object.entries(s.settings)) {
    await sql`insert into metrics.settings (key, value) values (${key}, ${value}) on conflict (key) do nothing`;
  }
  for (const g of s.goals) {
    const row = { ...GOAL_DEFAULTS, ...g, school_year: year };
    row.derive_rule = row.derive_rule ? sql.json(row.derive_rule) : null;
    await sql`insert into metrics.goals ${sql(row)} on conflict (school_year, number, visibility) do nothing`;
  }
  const owners = (process.env.OWNER_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  for (const email of owners) {
    await sql`insert into metrics.app_users (email, role) values (${email}, 'owner') on conflict (email) do nothing`;
  }
  console.log(`Seed data inserted (existing rows left unchanged). Owners from OWNER_EMAILS: ${owners.length}.`);
}

async function reset() {
  if (process.env.NODE_ENV === "production" || /supabase/.test(DB_URL)) {
    console.error("Refusing to reset a production/Supabase database.");
    process.exit(1);
  }
  await sql.unsafe(`drop schema if exists metrics cascade;`);
  await migrate();
  await seed();
}

const cmd = process.argv[2];
try {
  if (cmd === "migrate") await migrate();
  else if (cmd === "seed") await seed();
  else if (cmd === "reset") await reset();
  else if (cmd === "deploy") {
    await migrate();
    await seed();
  } else console.log("Commands: migrate | seed | deploy | reset");
} finally {
  await sql.end();
}
