// Database helper. Usage:
//   node scripts/db.mjs migrate   create/upgrade tables (safe to re-run)
//   node scripts/db.mjs seed      insert groups, modules, phase items, settings (never overwrites)
//   node scripts/db.mjs samples   add the 10 clearly fake sample residents
//   node scripts/db.mjs deploy    migrate + seed (+ samples if SEED_SAMPLE_RESIDENTS=true); runs on every Vercel build
//   node scripts/db.mjs reset     DROP EVERYTHING, then migrate + seed (local dev only)
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

async function seed() {
  const s = json("content/seed.json");
  for (const g of s.groups) {
    await sql`insert into groups ${sql(g)} on conflict (number) do nothing`;
  }
  for (const m of s.modules) {
    await sql`insert into modules ${sql(m)} on conflict (slug) do nothing`;
  }
  for (const it of s.phase_items) {
    await sql`insert into phase_items ${sql(it)} on conflict (id) do nothing`;
  }
  const reg = json("content/settings.json");
  for (const r of [...reg.links, ...reg.values]) {
    await sql`insert into settings (key, value) values (${r.key}, ${r.default ?? ""}) on conflict (key) do nothing`;
  }
  console.log("Seed data inserted (existing rows left unchanged).");
}

async function samples() {
  const s = json("content/seed.json");
  for (const r of s.sample_residents) {
    const [exists] = await sql`select 1 from residents where first_name = ${r.first_name} and last_name = ${r.last_name} and is_sample`;
    if (exists) continue;
    await sql`insert into residents ${sql({ ...r, is_sample: true, picker_label: "sample" })}`;
  }
  console.log("Sample residents added. Remove them in Admin -> Data before launch.");
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
  else if (cmd === "setup") { await migrate(); await seed(); }
  else if (cmd === "deploy") {
    await migrate();
    await seed();
    if (process.env.SEED_SAMPLE_RESIDENTS === "true") await samples();
  }
  else console.log("Commands: migrate | seed | samples | setup | reset");
} finally {
  await sql.end();
}
