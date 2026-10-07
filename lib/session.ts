import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { sql } from "./db";
import { signToken, verifyToken } from "./crypto";
import { getResidentById, Resident } from "./data";

const RESIDENT_COOKIE = "ctr_session";
const ADMIN_COOKIE = "ctr_admin";
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

const cookieOpts = (maxAgeMs: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: Math.floor(maxAgeMs / 1000),
});

// ---------- Residents ----------

type ResidentToken = { rid: string; v: number; exp: number };

/** The session is tied to when the PIN was set, so an admin PIN reset signs the resident out everywhere. */
function pinVersion(r: Pick<Resident, "pin_set_at">): number {
  return r.pin_set_at ? new Date(r.pin_set_at).getTime() : 0;
}

export async function startResidentSession(r: Pick<Resident, "id" | "pin_set_at">) {
  const token = signToken({ rid: r.id, v: pinVersion(r), exp: Date.now() + THIRTY_DAYS });
  (await cookies()).set(RESIDENT_COOKIE, token, cookieOpts(THIRTY_DAYS));
}

export async function endResidentSession() {
  (await cookies()).delete(RESIDENT_COOKIE);
}

/** The signed-in resident, from the cookie only. Never trust ids sent by the browser. */
export async function currentResident(): Promise<Resident | null> {
  const t = verifyToken<ResidentToken>((await cookies()).get(RESIDENT_COOKIE)?.value);
  if (!t) return null;
  const r = await getResidentById(t.rid);
  if (!r || !r.active || r.locked || !r.pin_encrypted || pinVersion(r) !== t.v) return null;
  return r;
}

export async function requireResident(): Promise<Resident> {
  const r = await currentResident();
  if (!r) redirect("/");
  // Cheap activity stamp (at most once a minute).
  if (!r.last_active_at || Date.now() - new Date(r.last_active_at).getTime() > 60_000) {
    await sql`update residents set last_active_at = now() where id = ${r.id}`;
  }
  return r;
}

// ---------- Admin ----------

type AdminToken = { adm: 1; ph: string; exp: number };

/** Changing ADMIN_PASSCODE invalidates every existing admin cookie. */
function passcodeHash(): string {
  const p = process.env.ADMIN_PASSCODE;
  if (!p) throw new Error("ADMIN_PASSCODE is not set");
  return createHash("sha256").update("ctr-admin:" + p).digest("base64url").slice(0, 22);
}

export async function startAdminSession() {
  const token = signToken({ adm: 1, ph: passcodeHash(), exp: Date.now() + THIRTY_DAYS });
  (await cookies()).set(ADMIN_COOKIE, token, cookieOpts(THIRTY_DAYS));
}

export async function endAdminSession() {
  (await cookies()).delete(ADMIN_COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const t = verifyToken<AdminToken>((await cookies()).get(ADMIN_COOKIE)?.value);
  return !!t && t.adm === 1 && t.ph === passcodeHash();
}

/** Call at the top of every admin page AND every admin server action. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}
