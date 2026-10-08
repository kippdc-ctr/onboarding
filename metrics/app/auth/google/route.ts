import { NextResponse } from "next/server";
import { allowedDomain, cookieOpts } from "@/lib/auth";
import { randomToken, signToken } from "@/lib/crypto";
import { authorizeUrl, googleConfigured, redirectUri, STATE_COOKIE } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!googleConfigured()) return NextResponse.redirect(new URL("/login?error=Google+sign-in+is+not+set+up+yet", req.url));
  const state = randomToken();
  const nonce = randomToken();
  const uri = redirectUri(req.url);
  const res = NextResponse.redirect(authorizeUrl({ state, nonce, redirectUri: uri, domain: allowedDomain() }));
  res.cookies.set(STATE_COOKIE, signToken({ state, nonce, exp: Date.now() + 10 * 60 * 1000 }), cookieOpts(10 * 60 * 1000));
  return res;
}
