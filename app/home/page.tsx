import Link from "next/link";
import { getConfig, loadBundle } from "@/lib/data";
import { formatDate, formatDateTime, todayISO } from "@/lib/dates";
import { accuracyText, PHASE_TITLES, summarize, welcomeDate, ItemState } from "@/lib/progress";
import { requireResident } from "@/lib/session";
import { ResidentHeader } from "@/components/ResidentHeader";
import { StatusChip } from "@/components/StatusChip";
import { CheckItem } from "@/components/CheckItem";
import { LinkButton } from "@/components/LinkButton";
import { PraxisPanel } from "@/components/PraxisPanel";
import { displayName } from "@/lib/data";

export const dynamic = "force-dynamic";

function Dues({ dues }: { dues: string[] }) {
  if (!dues.length) return <span className="text-muted">Due date TBD</span>;
  return <span>Due {dues.map((d) => formatDate(d, { weekday: true })).join(" and ")}</span>;
}

function PhaseItems({ items, settings }: { items: ItemState[]; settings: Record<string, string> }) {
  return (
    <ul>
      {items
        .filter((i) => i.visible)
        .map((i) => (
          <CheckItem
            key={i.item.id}
            target={{ kind: "phase", itemId: i.item.id }}
            label={i.item.label}
            description={
              i.item.id === "p3-contact-info"
                ? settings["p3.contact_update_text"]
                : i.item.id === "p3-webinar" && settings["p3.webinar_datetime"]
                  ? `${settings["p3.webinar_datetime"]}`
                  : i.item.id === "p3-background" && settings["p3.background_results_due"]
                    ? `${i.item.description ?? ""} Cleared results are due ${formatDate(settings["p3.background_results_due"], { weekday: true })} (the week before your start date).`
                    : i.item.id === "p3-background"
                      ? `${i.item.description ?? ""} Cleared results are due the week before your start date.`
                      : i.item.description
            }
            note={i.note}
            checked={i.checked}
            verified={i.verified}
          >
            {i.item.link_key && <LinkButton href={settings[i.item.link_key]} label="Open" variant="small" />}
          </CheckItem>
        ))}
    </ul>
  );
}

export default async function Home() {
  const r = await requireResident();
  const cfg = await getConfig(todayISO());
  const b = await loadBundle(r.id);
  const s = summarize(cfg, r, b);
  const settings = cfg.settings;
  const firstName = r.preferred_name?.trim() || r.first_name;
  const wd = welcomeDate(cfg, r.group_number);

  return (
    <>
      <ResidentHeader name={displayName(r)} />
      <main id="main" className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:py-10">
        <section>
          <h1 className="h1">Welcome, {firstName}!</h1>
          <p className="mt-2 text-lg">
            {r.group_number ? (
              <>
                You are in <strong>Group {r.group_number}</strong>
                {wd && <> (welcome email {formatDate(wd)})</>}.
              </>
            ) : (
              <>Your group hasn&apos;t been assigned yet.</>
            )}
          </p>
          <p className="mt-1 text-sm text-muted">Reflections and survey answers here are visible to the CTR team.</p>
        </section>

        <nav aria-label="Phases" className="grid gap-3 sm:grid-cols-3">
          {s.phases.map((p) => (
            <a key={p.phase} href={`#phase-${p.phase}`} className="card flex flex-col gap-2 !p-4 hover:border-teal">
              <span className="text-sm font-bold uppercase tracking-wide text-muted">Phase {p.phase}</span>
              <span className="font-bold">{PHASE_TITLES[p.phase]}</span>
              <StatusChip status={p.status} className="self-start" />
            </a>
          ))}
        </nav>

        <PraxisPanel praxis={b.praxis} settings={settings} />

        {/* Phase 1 */}
        <section id="phase-1" className="card scroll-mt-24" aria-labelledby="p1-h">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="p1-h" className="h2">
              Phase 1: {PHASE_TITLES[1]}
            </h2>
            <StatusChip status={s.phases[0].status} />
          </div>
          <p className="mt-1 text-muted">
            <Dues dues={s.phases[0].dues} />. Tick each item when you&apos;ve done it; the CTR team will verify.
          </p>
          <PhaseItems items={s.phase1} settings={settings} />
        </section>

        {/* Phase 2 */}
        <section id="phase-2" className="card scroll-mt-24" aria-labelledby="p2-h">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="p2-h" className="h2">
              Phase 2: {PHASE_TITLES[2]}
            </h2>
            <StatusChip status={s.phases[1].status} />
          </div>
          <p className="mt-1 text-muted">
            <Dues dues={s.phases[1].dues} />.
          </p>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {s.modules.map((m) => {
              const meta = cfg.modules.find((x) => x.slug === m.slug);
              return (
                <li key={m.slug} className="flex flex-col rounded-2xl border-2 border-gray-brand/25 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-bold uppercase tracking-wide text-muted">Module {m.content.number}</span>
                    <StatusChip status={m.status} />
                  </div>
                  <h3 className="h3 mt-1">
                    {m.content.title}
                    {m.content.badge && <span className="ml-2 rounded-full bg-yellow px-2 py-0.5 align-middle text-xs font-bold text-ink">{m.content.badge}</span>}
                  </h3>
                  <p className="mt-1 text-base text-muted">{m.content.description}</p>
                  <dl className="mt-3 space-y-1 text-base">
                    <div>
                      <dt className="inline font-semibold">Due: </dt>
                      <dd className="inline">{formatDate(m.due, { weekday: true })}</dd>
                    </div>
                    {meta?.soft_due_date && m.content.softDueNote && (
                      <div className="text-sm">{m.content.softDueNote.replace("{softDue}", formatDateTime(meta.soft_due_date))}</div>
                    )}
                    <div>
                      <dt className="inline font-semibold">Time: </dt>
                      <dd className="inline">about {m.content.estimatedMinutes} minutes</dd>
                    </div>
                    {m.totalQuestions > 0 && (
                      <div>
                        <dt className="inline font-semibold">Accuracy: </dt>
                        <dd className="inline">{accuracyText(m)}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="mt-auto pt-4">
                    <Link href={`/module/${m.slug}`} className={m.status === "complete" ? "btn-secondary w-full" : "btn-primary w-full"}>
                      {m.status === "complete" ? "Review" : m.status === "not_started" ? "Start" : "Continue"}
                      <span className="sr-only"> {m.content.title}</span>
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Phase 3 */}
        <section id="phase-3" className="card scroll-mt-24" aria-labelledby="p3-h">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="p3-h" className="h2">
              Phase 3: {PHASE_TITLES[3]}
            </h2>
            <StatusChip status={s.phases[2].status} />
          </div>
          <p className="mt-1 text-muted">
            <Dues dues={s.phases[2].dues} />. HR has the final word on HR items.
          </p>
          <PhaseItems items={s.phase3} settings={settings} />
        </section>

        <section className="card" aria-labelledby="links-h">
          <h2 id="links-h" className="h2">
            Helpful links
          </h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <LinkButton href={settings["url.p3.summer_academy_schedule"]} label="Summer Academy schedule" kind="article" />
            <LinkButton href={settings["url.praxis_info"]} label="Praxis info" kind="article" />
            <LinkButton href={settings["url.hr_action_items"]} label="HR action items" kind="article" />
          </div>
          <p className="mt-5">
            <Link href="/results" className="link">
              See my scores and saved reflections
            </Link>
          </p>
        </section>
      </main>
    </>
  );
}
