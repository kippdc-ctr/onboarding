import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { AppUser, devLoginEnabled, startSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Local development only (DEV_LOGIN=true, never on Vercel): sign in as an allow-listed user without Google. */
export async function POST(req: Request) {
  if (!devLoginEnabled()) return new NextResponse("Not found", { status: 404 });
  const email = String((await req.formData()).get("email") ?? "").toLowerCase();
  const [u] = await sql<AppUser[]>`select * from metrics.app_users where email = ${email} and active`;
  if (!u) return NextResponse.redirect(new URL("/login?error=Unknown+user", req.url), 303);
  await startSession(u);
  await audit(u, "sign_in", null, { via: "dev" });
  return NextResponse.redirect(new URL("/", req.url), 303);
}
