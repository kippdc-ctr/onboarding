"use server";

import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { AppUser, currentUser, endSession, startSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { back, str } from "./util";

const MAX_TRIES = 5;
const LOCK_MINUTES = 15;
// Compared against when the email isn't on the list, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA$" + "A".repeat(86);

export async function signIn(fd: FormData) {
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const wrong = () => back(`/login?email=${encodeURIComponent(email)}`, "Email or password is incorrect.", "error");
  if (!email || !password) wrong();

  const [u] = await sql<AppUser[]>`select * from metrics.app_users where email = ${email} and active`;
  if (!u || !u.password_hash) {
    await verifyPassword(password, DUMMY_HASH);
    wrong();
  }
  if (u.locked_until && new Date(u.locked_until).getTime() > Date.now()) {
    back("/login", `Too many wrong tries. Try again in ${LOCK_MINUTES} minutes, or ask Ashley to reset your password.`, "error");
  }
  if (!(await verifyPassword(password, u.password_hash))) {
    const tries = u.failed_attempts + 1;
    if (tries >= MAX_TRIES) {
      await sql`update metrics.app_users set failed_attempts = 0, locked_until = now() + ${`${LOCK_MINUTES} minutes`}::interval where id = ${u.id}`;
      await audit(u, "sign_in", null, { failed: true, locked: true });
    } else {
      await sql`update metrics.app_users set failed_attempts = ${tries} where id = ${u.id}`;
    }
    wrong();
  }
  await sql`update metrics.app_users set failed_attempts = 0, locked_until = null, last_login_at = now() where id = ${u.id}`;
  await startSession(u);
  await audit(u, "sign_in", null, {});
  redirect(u.must_change_password ? "/password" : "/");
}

export async function changePassword(fd: FormData) {
  const u = await currentUser();
  if (!u) redirect("/login");
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("password") ?? "");
  if (!(await verifyPassword(current, u.password_hash))) back("/password", "Your current password is incorrect.", "error");
  const problem = passwordProblem(next);
  if (problem) back("/password", problem, "error");
  if (next !== String(fd.get("confirm") ?? "")) back("/password", "The new passwords don't match.", "error");
  if (next === current) back("/password", "Choose a password different from the current one.", "error");
  // Bumping the version signs out every other device.
  const [updated] = await sql<AppUser[]>`
    update metrics.app_users set password_hash = ${await hashPassword(next)}, must_change_password = false, version = version + 1
    where id = ${u.id} returning *`;
  await startSession(updated);
  await audit(u, "user_change", u.email, { changed_own_password: true });
  redirect("/?ok=" + encodeURIComponent("Password changed."));
}

export async function signOut() {
  await endSession();
  redirect("/login");
}
