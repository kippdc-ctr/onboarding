import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "./db";
import { signToken, verifyToken } from "./crypto";

export type Role = "owner" | "team" | "rdl";

export type AppUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  campus: string | null;
  active: boolean;
  created_at: Date;
  last_login_at: Date | null;
  version: number;
};

export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", team: "CTR team", rdl: "RDL / campus leader" };

const COOKIE = "ctr_metrics";
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

export const cookieOpts = (maxAgeMs: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: Math.floor(maxAgeMs / 1000),
});

export function allowedDomain(): string {
  return (process.env.ALLOWED_EMAIL_DOMAIN || "kippdc.org").toLowerCase();
}

/** Local-only shortcut that skips Google. Never available on Vercel. */
export function devLoginEnabled(): boolean {
  return process.env.DEV_LOGIN === "true" && process.env.VERCEL !== "1";
}

type Token = { uid: string; v: number; exp: number };

export async function startSession(u: Pick<AppUser, "id" | "version">) {
  const token = signToken({ uid: u.id, v: u.version, exp: Date.now() + TWELVE_HOURS });
  (await cookies()).set(COOKIE, token, cookieOpts(TWELVE_HOURS));
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in user, re-checked against the allow-list on every request. */
export async function currentUser(): Promise<AppUser | null> {
  const t = verifyToken<Token>((await cookies()).get(COOKIE)?.value);
  if (!t) return null;
  const [u] = await sql<AppUser[]>`select * from metrics.app_users where id = ${t.uid}`;
  if (!u || !u.active || u.version !== t.v) return null;
  return u;
}

/** Call at the top of every page AND every server action / route handler. */
export async function requireUser(...roles: Role[]): Promise<AppUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (roles.length && !roles.includes(u.role)) redirect("/?error=" + encodeURIComponent("You don't have access to that page."));
  return u;
}

// ---------- Permissions (spec section 3) ----------

export const can = {
  manageUsers: (u: AppUser) => u.role === "owner",
  editGoals: (u: AppUser) => u.role === "owner",
  editCalendar: (u: AppUser) => u.role === "owner",
  manageYear: (u: AppUser) => u.role === "owner",
  viewAudit: (u: AppUser) => u.role === "owner",
  runImports: (u: AppUser) => u.role === "owner" || u.role === "team",
  enterMeasurements: (u: AppUser) => u.role === "owner" || u.role === "team",
  viewRoster: (u: AppUser) => u.role !== "rdl" || !!u.campus,
  viewDemographics: (u: AppUser) => u.role === "owner",
  /** Demographic breakdowns (aggregate, small-n suppressed for non-owners). Never for RDLs. */
  viewDemographicBreakdowns: (u: AppUser) => u.role === "owner" || u.role === "team",
  seeSmallN: (u: AppUser) => u.role === "owner",
};

/** RDLs only see residents on their own campus. Returns null when every campus is visible. */
export function campusScope(u: AppUser): string | null {
  return u.role === "rdl" ? u.campus ?? "__none__" : null;
}
