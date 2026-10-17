import "server-only";
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

/** Same format as scripts/db.mjs: scrypt$salt$hash */
export function hashPasscode(p: string): string {
  const salt = randomBytes(16).toString("base64url");
  return `scrypt$${salt}$${scryptSync(p, salt, 32).toString("base64url")}`;
}

export function checkPasscode(p: string, stored: string): boolean {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  return safeEqual(scryptSync(p, salt, 32).toString("base64url"), hash);
}

/** A short fingerprint of a secret, so cookies stop working when the secret changes. */
export function fingerprint(s: string): string {
  return createHash("sha256").update("ctr-obs:" + s).digest("base64url").slice(0, 16);
}

function sign(data: string): string {
  return createHmac("sha256", requireEnv("SESSION_SECRET")).update(data).digest("base64url");
}

export function signToken(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyToken<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig || !safeEqual(sig, sign(body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof p.exp === "number" && p.exp < Date.now()) return null;
    return p as T;
  } catch {
    return null;
  }
}
