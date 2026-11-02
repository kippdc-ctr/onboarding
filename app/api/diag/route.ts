import { sql, newClient } from "@/lib/db";
import { getConfig, getResolvedContent, getSettings } from "@/lib/data";
import { todayISO } from "@/lib/dates";

// Temporary diagnostics: timings only, no data. Remove once the hang is fixed.
export const dynamic = "force-dynamic";

async function step(name: string, fn: () => Promise<unknown>, out: string[], ms = 6000) {
  const t = Date.now();
  try {
    await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT")), ms))]);
    out.push(`${name}: ok ${Date.now() - t}ms`);
    return true;
  } catch (e) {
    out.push(`${name}: FAIL ${(e as Error).message?.slice(0, 120)} ${Date.now() - t}ms`);
    return false;
  }
}

export async function GET(req: Request) {
  const mode = new URL(req.url).searchParams.get("mode") ?? "shared";
  const out: string[] = [`mode=${mode}`];
  const db = mode === "fresh" ? newClient({ max: 1 }) : sql;
  await step("select 1", () => db`select 1`, out);
  await step("groups", () => db`select number, welcome_email_date from groups order by number`, out);
  await step("modules", () => db`select * from modules order by sort_order`, out);
  await step("phase_items", () => db`select * from phase_items order by phase, sort_order`, out);
  await step("overrides", () => db`select group_number, target, due_date from group_due_overrides`, out);
  await step("settings", () => db`select key, value from settings`, out);
  await step("content_overrides", () => db`select module_slug, target, value, original_hash, updated_at from content_overrides order by updated_at`, out);
  await step("parallel 3", () => Promise.all([db`select 1`, db`select 2`, db`select 3`]), out);
  if (mode === "shared") {
    await step("getSettings", () => getSettings(), out);
    await step("getResolvedContent", () => getResolvedContent(), out);
    await step("getConfig", () => getConfig(todayISO()), out);
  }
  if (mode === "fresh") db.end({ timeout: 1 }).catch(() => {});
  return new Response(out.join("\n"), { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
}
