import { notFound, redirect } from "next/navigation";
import { deviceState } from "@/lib/auth";
import { getConfig } from "@/lib/data";
import { pickObserver } from "@/app/actions/access";
import { FullLogo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function WhoPage() {
  const st = await deviceState();
  if (!st.hasLink) notFound();
  if (st.required && !st.hasPasscode) redirect("/unlock");
  const cfg = await getConfig();
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <FullLogo className="mx-auto mb-6 h-28 w-28" />
      <div className="card">
        <h1 className="h2">Who is using this?</h1>
        <p className="mt-1 text-muted">This device will remember your choice. It labels your observations and decisions.</p>
        <form action={pickObserver} className="mt-4 grid gap-3">
          {cfg.observers.map((o) => (
            <button key={o.id} name="observer" value={o.id} className="btn-secondary w-full">
              {o.name}
            </button>
          ))}
        </form>
      </div>
    </main>
  );
}
