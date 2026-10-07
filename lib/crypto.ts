import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function pinKey(): Buffer {
  return createHash("sha256").update("ctr-pin:" + requireEnv("PIN_ENCRYPTION_KEY")).digest();
}

/** AES-256-GCM. Output: iv.tag.ciphertext, base64url. */
export function encryptPin(pin: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", pinKey(), iv);
  const enc = Buffer.concat([c.update(pin, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decryptPin(stored: string | null): string | null {
  if (!stored) return null;
  try {
    const [iv, tag, enc] = stored.split(".").map((s) => Buffer.from(s, "base64url"));
    const d = createDecipheriv("aes-256-gcm", pinKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
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
