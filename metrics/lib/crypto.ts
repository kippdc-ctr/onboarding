import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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

export function randomToken(): string {
  return randomBytes(24).toString("base64url");
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
