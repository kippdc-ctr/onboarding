import "server-only";
import { databaseUrl } from "./db";

export type MissingSetting = { name: string; why: string };

/** Required environment variables that are missing (names only; values are never shown). */
export function missingSettings(): MissingSetting[] {
  const out: MissingSetting[] = [];
  if (!databaseUrl())
    out.push({ name: "DATABASE_URL or POSTGRES_URL", why: "The database connection. Connecting Supabase in Vercel (Storage → Supabase) sets POSTGRES_URL for you." });
  if (!process.env.SESSION_SECRET) out.push({ name: "SESSION_SECRET", why: "Signs sign-in cookies. Any long random string (40+ characters)." });
  if (!process.env.PIN_ENCRYPTION_KEY) out.push({ name: "PIN_ENCRYPTION_KEY", why: "Encrypts resident PINs. A different long random string. Never change it once residents have PINs." });
  if (!process.env.ADMIN_PASSCODE) out.push({ name: "ADMIN_PASSCODE", why: "The CTR team passcode for /admin." });
  return out;
}

/** Turns a database error into a plain-language hint, without echoing hostnames or user names. */
export function explainDbError(e: unknown): { code: string; hint: string } {
  const err = e as { code?: string; message?: string };
  const code = err?.code ?? "unknown";
  const msg = (err?.message ?? "").toLowerCase();
  let hint = "The app couldn't use the database.";
  if (msg.includes("no database connection")) hint = "No database connection string is set.";
  else if (code === "28P01" || msg.includes("password authentication")) hint = "The database password in the connection string is wrong.";
  else if (code === "42P01" || msg.includes("does not exist")) hint = "The database is reachable but its tables haven't been created. Redeploy so the build can set them up (check the build log for \"Schema applied\").";
  else if (code === "ENOTFOUND" || code === "EAI_AGAIN") hint = "The database address in the connection string can't be found. Copy the connection string again from Supabase.";
  else if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "CONNECT_TIMEOUT" || msg.includes("timeout"))
    hint = "The database didn't answer. If the Supabase project is paused (free projects pause after a week without traffic), restore it in Supabase, then try again.";
  else if (code === "XX000" && msg.includes("tenant or user not found")) hint = "Supabase didn't recognize the database user. Use the connection string exactly as Supabase or Vercel provides it.";
  else if (code === "TIMEOUT") hint = "The database is answering too slowly. It may be restoring from a pause, or overloaded.";
  else if (code === "25006" || msg.includes("read-only")) hint = "The database is read-only, usually because it is over the 500 MB free limit.";
  else if (code === "42704" || msg.includes("unrecognized configuration parameter")) hint = "The connection string has an extra setting the database rejects.";
  return { code, hint };
}
