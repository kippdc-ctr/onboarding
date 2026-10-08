import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { Flash, flashFrom } from "@/components/Flash";
import { saveSettings } from "@/app/actions/admin";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser("owner");
  const sp = await searchParams;
  const s = await getSettings();
  return (
    <div className="space-y-6">
      <Flash {...flashFrom(sp)} />
      <h1 className="h1">Settings</h1>
      <form action={saveSettings} className="card grid max-w-2xl gap-4">
        <label>
          <span className="label">&quot;Close&quot; means within this many points below target</span>
          <input name="close_points" type="number" step="any" min={0} defaultValue={s.closePoints} className="input" />
        </label>
        <label>
          <span className="label">&quot;No change&quot; vs SY25-26 means within this many points</span>
          <input name="no_change_points" type="number" step="any" min={0} defaultValue={s.noChangePoints} className="input" />
        </label>
        <label>
          <span className="label">Hide groups smaller than (for everyone but the owner)</span>
          <input name="small_n" type="number" min={1} defaultValue={s.smallN} className="input" />
        </label>
        <label>
          <span className="label">Roster status that counts as enrolled</span>
          <input name="enrolled_status" defaultValue={s.enrolledStatus} className="input" />
          <span className="mt-1 block text-sm text-muted">Only residents with exactly this status count in current-year percentages. Withdrawn residents still count in retention goals.</span>
        </label>
        <div>
          <button className="btn-primary">Save settings</button>
        </div>
      </form>
    </div>
  );
}
