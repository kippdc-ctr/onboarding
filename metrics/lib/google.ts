import "server-only";

// Google sign-in (OpenID Connect authorization-code flow), done entirely on the server.
// The ID token comes straight from Google's token endpoint over TLS in exchange for our client secret,
// so its claims can be trusted without a separate signature check (OIDC Core 3.1.3.7).

export const STATE_COOKIE = "ctr_metrics_oauth";

export function googleConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export function redirectUri(requestUrl: string): string {
  const base = process.env.APP_URL?.replace(/\/$/, "") || new URL(requestUrl).origin;
  return `${base}/auth/callback`;
}

export function authorizeUrl(opts: { state: string; nonce: string; redirectUri: string; domain: string }): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: opts.state,
    nonce: opts.nonce,
    hd: opts.domain, // a hint only; the callback enforces the domain
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export type GoogleClaims = { iss: string; aud: string; exp: number; email?: string; email_verified?: boolean; hd?: string; name?: string; nonce?: string };

export async function exchangeCode(code: string, redirectUri: string): Promise<GoogleClaims> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) throw new Error("Google did not return an ID token");
  const payload = body.id_token.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as GoogleClaims;
}
