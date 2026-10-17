"use client";

import { useActionState } from "react";
import { unlock } from "@/app/actions/access";

export function UnlockForm({ create }: { create: boolean }) {
  const [state, action, pending] = useActionState(unlock, {});
  return (
    <form action={action} className="mt-4 space-y-3">
      <label className="label" htmlFor="passcode">Passcode</label>
      <input id="passcode" name="passcode" type="password" autoComplete={create ? "new-password" : "current-password"} required className="input" autoFocus />
      {create && (
        <>
          <label className="label" htmlFor="confirm">Type it again</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="input" />
        </>
      )}
      {state.error && <p role="alert" className="font-semibold text-coral-ink">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Checking…" : create ? "Save passcode" : "Unlock"}</button>
    </form>
  );
}
