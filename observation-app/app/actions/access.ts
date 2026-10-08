"use server";

import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { hashPasscode } from "@/lib/crypto";
import { clearObserver, deviceState, grantPasscode, refreshDevice, requireUser, setObserver } from "@/lib/auth";
import { getConfig, getSettings } from "@/lib/data";
import { audit } from "@/lib/audit";

const MAX_FAILS = 10;
const LOCK_MINUTES = 15;

export async function unlock(_: unknown, form: FormData): Promise<{ error?: string }> {
  const st = await deviceState();
  if (!st.hasLink) redirect("/");
  const passcode = String(form.get("passcode") ?? "").trim();
  const s = await getSettings();

  // First visit with no passcode configured: create it.
  if (!st.passcodeSet) {
    const confirm = String(form.get("confirm") ?? "").trim();
    if (passcode.length < 6) return { error: "Choose a passcode of at least 6 characters." };
    if (passcode !== confirm) return { error: "The two passcodes don't match." };
    const hash = hashPasscode(passcode);
    const [row] = await sql`update settings set value = ${hash} where key = 'passcode_hash' and value = '' returning key`;
    if (!row) return { error: "A passcode was just set on another device. Enter that passcode." };
    await refreshDevice({ ...s, passcode_hash: hash });
    await audit(null, "passcode.created", "settings");
    redirect("/");
  }

  const lockedUntil = Number(s.unlock_locked_until || 0);
  if (lockedUntil > Date.now()) return { error: `Too many wrong tries. Try again after ${new Date(lockedUntil).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })}.` };
  if (await grantPasscode(passcode)) {
    await sql`insert into settings (key, value) values ('unlock_fails', '0') on conflict (key) do update set value = '0'`;
    redirect("/");
  }
  const [r] = await sql<{ value: string }[]>`
    insert into settings (key, value) values ('unlock_fails', '1')
    on conflict (key) do update set value = (coalesce(nullif(settings.value, ''), '0')::int + 1)::text returning value`;
  if (Number(r.value) >= MAX_FAILS) {
    await sql`insert into settings (key, value) values ('unlock_locked_until', ${String(Date.now() + LOCK_MINUTES * 60_000)}), ('unlock_fails', '0')
              on conflict (key) do update set value = excluded.value`;
    await audit(null, "passcode.locked", "settings");
  }
  await new Promise((res) => setTimeout(res, 600));
  return { error: "That passcode isn't right." };
}

export async function pickObserver(form: FormData) {
  const st = await deviceState();
  if (!st.hasLink || (st.required && !st.hasPasscode)) redirect("/");
  const id = String(form.get("observer") ?? "");
  const cfg = await getConfig();
  if (!cfg.observers.some((o) => o.id === id)) redirect("/who");
  await setObserver(id);
  redirect("/");
}

export async function switchObserver() {
  await requireUser();
  await clearObserver();
  redirect("/who");
}
