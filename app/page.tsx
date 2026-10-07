import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { getSettings, pickerName } from "@/lib/data";
import { currentResident } from "@/lib/session";
import { ResidentHeader } from "@/components/ResidentHeader";
import { NamePicker } from "@/components/NamePicker";

export const dynamic = "force-dynamic";

export default async function Landing() {
  if (await currentResident()) redirect("/home");
  // Only display names of active residents reach the browser.
  const rows = await sql<{ id: string; first_name: string; last_name: string; preferred_name: string | null; picker_label: string | null }[]>`
    select id, first_name, last_name, preferred_name, picker_label from residents
    where active order by coalesce(nullif(preferred_name, ''), first_name), last_name`;
  const names = rows.map((r) => ({ id: r.id, name: pickerName(r) }));
  const settings = await getSettings();
  const contact = settings.contact_email;

  return (
    <>
      <ResidentHeader />
      <main id="main" className="mx-auto max-w-xl px-4 py-8 sm:py-12">
        <div className="mb-6 flex gap-2" aria-hidden="true">
          <span className="h-3 w-12 rounded-full bg-coral" />
          <span className="h-3 w-12 rounded-full bg-teal-light" />
          <span className="h-3 w-12 rounded-full bg-yellow" />
          <span className="h-3 w-12 rounded-full bg-teal" />
        </div>
        <h1 className="h1">Welcome to the Team!</h1>
        <p className="mt-3 text-xl">We&apos;re so happy you&apos;re joining us.</p>
        <p className="mt-1 text-lg font-semibold text-teal-ink">Together, a future without limits.</p>

        <section className="card mt-8" aria-labelledby="signin-h">
          <h2 id="signin-h" className="h3 mb-4">
            Find your name to get started
          </h2>
          <NamePicker names={names} />
          <p className="mt-6 text-base text-muted">
            Don&apos;t see your name?{" "}
            {contact ? (
              <a className="link" href={`mailto:${contact}?subject=${encodeURIComponent("CTR Onboarding Hub: my name is missing")}`}>
                Email the CTR team
              </a>
            ) : (
              <span>Email the CTR team.</span>
            )}
          </p>
        </section>

        <p className="mt-6 text-sm text-muted">
          Reflections and survey answers here are visible to the CTR team.
        </p>
      </main>
    </>
  );
}
