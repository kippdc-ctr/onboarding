"use server";

import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { decryptPin, encryptPin, safeEqual } from "@/lib/crypto";
import { getResidentById, Resident } from "@/lib/data";
import { endAdminSession, endResidentSession, startAdminSession, startResidentSession } from "@/lib/session";

const MAX_ATTEMPTS = 5;
const LOCKED_MSG = "Your account is locked. Contact the CTR team.";

export type SignInState =
  | { step: "create" }
  | { step: "enter" }
  | { step: "locked"; message: string }
  | { step: "error"; message: string };

async function activeResident(id: string): Promise<Resident | null> {
  const r = await getResidentById(String(id));
  return r && r.active ? r : null;
}

export async function signInStep(residentId: string): Promise<SignInState> {
  const r = await activeResident(residentId);
  if (!r) return { step: "error", message: "We couldn't find that name. Please pick it from the list." };
  if (r.locked) return { step: "locked", message: LOCKED_MSG };
  return r.pin_encrypted ? { step: "enter" } : { step: "create" };
}

export async function createPin(residentId: string, pin: string, confirm: string): Promise<SignInState> {
  if (!/^\d{4}$/.test(pin)) return { step: "error", message: "Your PIN must be exactly 4 digits." };
  if (pin !== confirm) return { step: "error", message: "The two PINs don't match. Try again." };
  const r = await activeResident(residentId);
  if (!r) return { step: "error", message: "We couldn't find that name." };
  if (r.locked) return { step: "locked", message: LOCKED_MSG };
  // Only set if no PIN exists yet (guards against a double submit or a race).
  const [updated] = await sql<Resident[]>`
    update residents set pin_encrypted = ${encryptPin(pin)}, pin_set_at = now(), failed_pin_attempts = 0
    where id = ${r.id} and pin_encrypted is null
    returning *`;
  if (!updated) return { step: "enter" };
  await startResidentSession(updated);
  redirect("/home");
}

export async function verifyPin(residentId: string, pin: string): Promise<SignInState> {
  const r = await activeResident(residentId);
  if (!r) return { step: "error", message: "We couldn't find that name." };
  if (r.locked) return { step: "locked", message: LOCKED_MSG };
  if (!r.pin_encrypted) return { step: "create" };
  const stored = decryptPin(r.pin_encrypted);
  if (stored && /^\d{4}$/.test(pin) && safeEqual(stored, pin)) {
    await sql`update residents set failed_pin_attempts = 0 where id = ${r.id}`;
    await startResidentSession(r);
    redirect("/home");
  }
  const [row] = await sql<{ failed_pin_attempts: number; locked: boolean }[]>`
    update residents
       set failed_pin_attempts = failed_pin_attempts + 1,
           locked = (failed_pin_attempts + 1) >= ${MAX_ATTEMPTS}
     where id = ${r.id}
     returning failed_pin_attempts, locked`;
  if (row.locked) return { step: "locked", message: LOCKED_MSG };
  const left = MAX_ATTEMPTS - row.failed_pin_attempts;
  return { step: "error", message: `That PIN isn't right. ${left} attempt${left === 1 ? "" : "s"} left before your account locks.` };
}

export async function signOut() {
  await endResidentSession();
  redirect("/");
}

export async function adminSignIn(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  const passcode = String(formData.get("passcode") ?? "");
  const expected = process.env.ADMIN_PASSCODE;
  if (!expected) return { error: "ADMIN_PASSCODE is not configured on the server." };
  if (!passcode || !safeEqual(passcode, expected)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return { error: "That passcode isn't right." };
  }
  await startAdminSession();
  redirect("/admin");
}

export async function adminSignOut() {
  await endAdminSession();
  redirect("/admin/login");
}
