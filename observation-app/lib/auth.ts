import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { checkPasscode, fingerprint, signToken, verifyToken } from "./crypto";
import { getConfig, getSettings, type Observer } from "./data";

// Access has three layers:
// 1. The private link (/enter/<key>) marks this device as having the link. Without it every page is a 404.
// 2. The shared passcode (recommended on), entered once per device and remembered for 90 days.
// 3. "Who is using this?" (Ashley or Alison), remembered on the device. Attribution only, not security.
// Rotating the link and passcode in Settings bumps auth_version, which signs every device out.

const DEVICE_COOKIE = "obs_device";
const USER_COOKIE = "obs_user";
const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;

type DeviceToken = { lk: string; pc: string; exp: number };

const cookieOpts = (maxAgeMs: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: Math.floor(maxAgeMs / 1000),
});

function linkFingerprint(s: Record<string, string>): string {
  return fingerprint(`${s.access_key ?? ""}:${s.auth_version ?? "1"}`);
}
function passFingerprint(s: Record<string, string>): string {
  return fingerprint(`${s.passcode_hash ?? ""}:${s.auth_version ?? "1"}`);
}

export function passcodeRequired(s: Record<string, string>): boolean {
  return s.passcode_enabled !== "false";
}

async function readDevice(): Promise<DeviceToken | null> {
  return verifyToken<DeviceToken>((await cookies()).get(DEVICE_COOKIE)?.value);
}

async function writeDevice(t: Omit<DeviceToken, "exp">) {
  (await cookies()).set(DEVICE_COOKIE, signToken({ ...t, exp: Date.now() + NINETY_DAYS }), cookieOpts(NINETY_DAYS));
}

export async function deviceState(): Promise<{ hasLink: boolean; hasPasscode: boolean; passcodeSet: boolean; required: boolean }> {
  const s = await getSettings();
  const d = await readDevice();
  const hasLink = !!d && !!s.access_key && d.lk === linkFingerprint(s);
  const hasPasscode = hasLink && !!s.passcode_hash && d!.pc === passFingerprint(s);
  return { hasLink, hasPasscode, passcodeSet: !!s.passcode_hash, required: passcodeRequired(s) };
}

/** Called by /enter/<key>. Returns false when the key is wrong. */
export async function grantLink(key: string): Promise<boolean> {
  const s = await getSettings();
  if (!s.access_key || key !== s.access_key) return false;
  const d = await readDevice();
  // Keep a passcode already entered on this device if it is still valid.
  const pc = d && d.pc === passFingerprint(s) ? d.pc : "";
  await writeDevice({ lk: linkFingerprint(s), pc });
  return true;
}

export async function grantPasscode(passcode: string): Promise<boolean> {
  const s = await getSettings();
  if (!s.passcode_hash || !checkPasscode(passcode, s.passcode_hash)) return false;
  await writeDevice({ lk: linkFingerprint(s), pc: passFingerprint(s) });
  return true;
}

/** After a passcode change by this user, keep this device signed in. */
export async function refreshDevice(settings: Record<string, string>) {
  await writeDevice({ lk: linkFingerprint(settings), pc: settings.passcode_hash ? passFingerprint(settings) : "" });
}

/** Every page and action calls this (or requireUser). Unknown devices get a plain 404. */
export async function requireAccess(): Promise<void> {
  const st = await deviceState();
  if (!st.hasLink) notFound();
  if (st.required && !st.hasPasscode) redirect("/unlock");
}

export async function currentObserverId(): Promise<string | null> {
  return (await cookies()).get(USER_COOKIE)?.value ?? null;
}

export async function setObserver(id: string) {
  (await cookies()).set(USER_COOKIE, id, cookieOpts(365 * 24 * 60 * 60 * 1000));
}

export async function clearObserver() {
  (await cookies()).delete(USER_COOKIE);
}

export async function requireUser(): Promise<Observer> {
  await requireAccess();
  const id = await currentObserverId();
  const cfg = await getConfig();
  const o = cfg.observers.find((x) => x.id === id);
  if (!o) redirect("/who");
  return o;
}

export async function requireAdmin(): Promise<Observer> {
  const o = await requireUser();
  if (!o.is_admin) redirect("/settings?error=" + encodeURIComponent("Only the admin can do that."));
  return o;
}

/** For API routes: same checks, but returns null instead of redirecting. */
export async function apiUser(): Promise<Observer | null> {
  const st = await deviceState();
  if (!st.hasLink || (st.required && !st.hasPasscode)) return null;
  const id = await currentObserverId();
  return (await getConfig()).observers.find((x) => x.id === id) ?? null;
}
