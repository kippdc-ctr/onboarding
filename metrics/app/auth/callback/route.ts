import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@/lib/db";
import { allowedDomain, AppUser, startSession } from "@/lib/auth";
import { safeEqual, verifyToken } from "@/lib/crypto";
import { exchangeCode, redirectUri, STATE_COOKIE } from "@/lib/google";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function fail(req: Request, msg: string) {
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, req.url));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const saved = verifyToken<{ state: string; nonce: string }>(jar.get(STATE_COOKIE)?.value);
  jar.delete(STATE_COOKIE);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  if (!saved || !code || !safeEqual(state, saved.state)) return fail(req, "Sign-in expired. Please try again.");

  let claims;
  try {
    claims = await exchangeCode(code, redirectUri(req.url));
  } catch {
    return fail(req, "Google sign-in failed. Please try again.");
  }
  const domain = allowedDomain();
  const email = (claims.email ?? "").toLowerCase();
  const issOk = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  if (!issOk || claims.aud !== process.env.GOOGLE_CLIENT_ID || claims.exp * 1000 < Date.now() || claims.nonce !== saved.nonce) {
    return fail(req, "Google sign-in could not be verified. Please try again.");
  }
  if (!claims.email_verified || claims.hd?.toLowerCase() !== domain || !email.endsWith(`@${domain}`)) {
    return fail(req, `Please sign in with your @${domain} Google account.`);
  }
  const [u] = await sql<AppUser[]>`select * from metrics.app_users where email = ${email} and active`;
  if (!u) return fail(req, `${email} isn't on the access list yet. Ask Ashley to add you.`);

  await sql`update metrics.app_users set last_login_at = now(), name = coalesce(name, ${claims.name ?? null}) where id = ${u.id}`;
  await startSession(u);
  await audit(u, "sign_in", null, { via: "google" });
  return NextResponse.redirect(new URL("/", req.url));
}
