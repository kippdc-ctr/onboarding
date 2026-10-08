import { notFound, redirect } from "next/navigation";
import { deviceState } from "@/lib/auth";
import { FullLogo } from "@/components/Logo";
import { UnlockForm } from "./UnlockForm";

export const dynamic = "force-dynamic";

export default async function UnlockPage() {
  const st = await deviceState();
  if (!st.hasLink) notFound();
  if (!st.required || st.hasPasscode) redirect("/");
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <FullLogo className="mx-auto mb-6 h-28 w-28" />
      <div className="card">
        <h1 className="h2">{st.passcodeSet ? "Enter the passcode" : "Create the team passcode"}</h1>
        <p className="mt-1 text-muted">
          {st.passcodeSet
            ? "This device will remember it for 90 days."
            : "Ashley and Alison will both use this passcode. Each device asks for it once every 90 days."}
        </p>
        <UnlockForm create={!st.passcodeSet} />
      </div>
    </main>
  );
}
