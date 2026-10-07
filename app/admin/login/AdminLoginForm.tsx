"use client";

import { useActionState } from "react";
import { adminSignIn } from "@/app/actions/auth";

export function AdminLoginForm() {
  const [state, action, pending] = useActionState(adminSignIn, undefined);
  return (
    <form action={action} className="mt-4 space-y-4">
      <div>
        <label htmlFor="passcode" className="label">
          Admin passcode
        </label>
        <input id="passcode" name="passcode" type="password" autoComplete="current-password" required className="input" autoFocus />
      </div>
      {state?.error && (
        <p role="alert" className="font-semibold text-coral-ink">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
