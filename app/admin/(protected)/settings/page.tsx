import { LINK_SETTINGS, VALUE_SETTINGS, SettingDef } from "@/lib/content";
import { getConfig } from "@/lib/data";
import { TIME_ZONE, todayISO } from "@/lib/dates";
import { saveSettings } from "@/app/actions/admin";
import { Flash } from "@/components/Flash";

export const dynamic = "force-dynamic";

function localDateTime(d: Date | null): string {
  if (!d) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(d))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function groupBy(defs: SettingDef[]) {
  const m = new Map<string, SettingDef[]>();
  for (const d of defs) m.set(d.group, [...(m.get(d.group) ?? []), d]);
  return [...m.entries()];
}

export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const cfg = await getConfig(todayISO());
  const v = cfg.settings;

  return (
    <form action={saveSettings} className="space-y-6">
      <input type="hidden" name="_return" value="/admin/settings" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Settings</h1>
        <button type="submit" className="btn-primary">
          Save all settings
        </button>
      </div>
      <Flash ok={sp.ok} error={sp.error} />

      <section className="card space-y-4">
        <h2 className="h2">Module due dates</h2>
        <p className="text-muted">Same for every group unless a group override is set on the Groups page.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {cfg.modules.map((m) => (
            <fieldset key={m.slug} className="rounded-xl border border-gray-brand/30 p-3">
              <legend className="px-1 font-bold">
                {m.sort_order}. {m.title}
              </legend>
              <label className="block">
                <span className="label">Due date</span>
                <input type="date" name={`mod_due__${m.slug}`} defaultValue={m.due_date ?? ""} className="input" />
              </label>
              {(m.soft_due_date || m.slug === "your-story-matters") && (
                <label className="mt-2 block">
                  <span className="label">Soft deadline (intro and why submissions)</span>
                  <input type="datetime-local" name={`mod_soft__${m.slug}`} defaultValue={localDateTime(m.soft_due_date)} className="input" />
                </label>
              )}
            </fieldset>
          ))}
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="h2">Phase 1 and Phase 3 item dates</h2>
        <ul className="space-y-3">
          {cfg.phaseItems.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3">
              <span className="min-w-72 flex-1">
                <strong>Phase {i.phase}:</strong> {i.label}
              </span>
              {i.due_rule === "fixed" ? (
                <input type="date" name={`item_due__${i.id}`} defaultValue={i.due_date ?? ""} className="input max-w-52" aria-label={`${i.label} due date`} />
              ) : (
                <label className="flex items-center gap-2">
                  <input type="number" min={0} max={365} name={`item_days__${i.id}`} defaultValue={i.due_days ?? 14} className="input max-w-24" aria-label={`${i.label}: days after welcome email`} />
                  <span>days after the group&apos;s welcome email</span>
                </label>
              )}
            </li>
          ))}
        </ul>
      </section>

      {groupBy(VALUE_SETTINGS.filter((d) => d.group !== "Hidden")).map(([group, defs]) => (
        <section key={group} className="card space-y-4">
          <h2 className="h2">{group}</h2>
          {defs.map((d) => (
            <label key={d.key} className="block">
              <span className="label">{d.label}</span>
              {d.type === "longtext" || d.type === "list" ? (
                <textarea name={`set__${d.key}`} defaultValue={v[d.key] ?? ""} rows={d.type === "list" ? 3 : 2} className="input" />
              ) : (
                <input
                  name={`set__${d.key}`}
                  type={d.type === "date" ? "date" : d.type === "email" ? "email" : d.type === "number" ? "number" : "text"}
                  defaultValue={v[d.key] ?? ""}
                  className="input max-w-xl"
                />
              )}
            </label>
          ))}
        </section>
      ))}

      <section className="card space-y-4">
        <h2 className="h2">Links</h2>
        <p className="text-muted">Leave a link blank and residents see a disabled &quot;link coming soon&quot; button. The Content flags page lists every blank link.</p>
        {groupBy(LINK_SETTINGS).map(([group, defs]) => (
          <fieldset key={group} className="rounded-xl border border-gray-brand/30 p-3">
            <legend className="px-1 font-bold">{group}</legend>
            <div className="space-y-3">
              {defs.map((d) => (
                <label key={d.key} className="block">
                  <span className="label">
                    {d.label} {!v[d.key] && <span className="ml-1 rounded bg-yellow px-1 text-xs font-bold">empty</span>}
                  </span>
                  <input name={`set__${d.key}`} type="url" defaultValue={v[d.key] ?? ""} placeholder="https://" className="input" />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </section>

      <section className="card">
        <h2 className="h2">Admin passcode</h2>
        <p className="mt-2">
          The admin passcode lives only in the hosting environment, as the <code>ADMIN_PASSCODE</code> environment variable. To change it: in Vercel, open the
          project, go to Settings → Environment Variables, edit <code>ADMIN_PASSCODE</code>, then redeploy. Changing it signs every admin out.
        </p>
      </section>

      <button type="submit" className="btn-primary">
        Save all settings
      </button>
    </form>
  );
}
