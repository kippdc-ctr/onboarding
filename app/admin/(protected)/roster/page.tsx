import Link from "next/link";
import { sql } from "@/lib/db";
import { decryptPin } from "@/lib/crypto";
import { displayName, Resident } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { addResident, bulkAddResidents, resetPin, setResidentActive, unlockResident } from "@/app/actions/admin";
import { Flash } from "@/components/Flash";
import { PinCell } from "@/components/PinCell";
import { ResidentFields } from "@/components/ResidentFields";

export const dynamic = "force-dynamic";

export default async function Roster({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const showInactive = sp.inactive === "1";
  const residents = await sql<Resident[]>`select * from residents ${showInactive ? sql`` : sql`where active`} order by active desc, last_name, first_name`;
  return (
    <div className="space-y-6">
      <h1 className="h1">Roster</h1>
      <Flash ok={sp.ok} error={sp.error} />

      <details className="card" open={residents.length === 0}>
        <summary className="h3 cursor-pointer">Add one resident</summary>
        <form action={addResident} className="mt-4 space-y-4">
          <p className="text-muted">First and last name must match the offer letter exactly. Residents get all three phases right away with their group&apos;s dates.</p>
          <ResidentFields />
          <button type="submit" className="btn-primary">
            Add resident
          </button>
        </form>
      </details>

      <details className="card">
        <summary className="h3 cursor-pointer">Add many (paste a list or CSV)</summary>
        <form action={bulkAddResidents} className="mt-4 space-y-4">
          <p className="text-muted">
            One resident per line: <code>First, Last, Grade band</code>. Optional extra columns: <code>Group, School, Preferred name, Email</code>. A header row is
            skipped automatically. If a name is already on the roster, the new resident gets a label (their school, or last initial) so the picker can tell them apart.
          </p>
          <label className="block">
            <span className="label">Residents</span>
            <textarea name="bulk" rows={8} className="input font-mono" placeholder={"Jordan, Lee, Elementary\nSam, Rivera, Middle, 2, Aim"} required />
          </label>
          <label className="block max-w-xs">
            <span className="label">Group (if not in the list)</span>
            <select name="default_group" className="input">
              <option value="">—</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn-primary">
            Add residents
          </button>
        </form>
      </details>

      <section className="card overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">
            {residents.filter((r) => r.active).length} active resident{residents.filter((r) => r.active).length === 1 ? "" : "s"}
          </h2>
          <Link className="link text-sm" href={showInactive ? "/admin/roster" : "/admin/roster?inactive=1"}>
            {showInactive ? "Hide deactivated" : "Show deactivated"}
          </Link>
        </div>
        <table className="mt-3 w-full min-w-[60rem] text-left text-sm">
          <thead>
            <tr className="border-b-2 border-gray-brand/30">
              <th className="p-2">Name (as shown in picker)</th>
              <th className="p-2">Grade band</th>
              <th className="p-2">Group</th>
              <th className="p-2">School</th>
              <th className="p-2">Added</th>
              <th className="p-2">PIN</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {residents.map((r) => (
              <tr key={r.id} className={`border-b border-gray-brand/20 ${r.active ? "" : "opacity-60"}`}>
                <td className="p-2">
                  <Link href={`/admin/residents/${r.id}`} className="link">
                    {displayName(r)}
                  </Link>
                  {r.picker_label && <span className="ml-1 text-muted">({r.picker_label})</span>}
                  {r.is_sample && <span className="ml-2 rounded bg-yellow px-1 text-xs font-bold">sample</span>}
                  {!r.active && <span className="ml-2 rounded bg-gray-brand px-1 text-xs font-bold text-white">deactivated</span>}
                </td>
                <td className="p-2">{r.grade_band ?? "—"}</td>
                <td className="p-2">{r.group_number ?? "—"}</td>
                <td className="p-2">{r.school ?? "—"}</td>
                <td className="p-2">{formatDate(r.added_on)}</td>
                <td className="p-2">
                  <PinCell pin={decryptPin(r.pin_encrypted)} />
                  {r.locked && <span className="ml-2 rounded bg-coral px-1.5 text-xs font-bold text-white">Locked</span>}
                </td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-2">
                    {r.locked && (
                      <form action={unlockResident.bind(null, r.id)}>
                        <button className="btn-small !min-h-8 !px-3 text-sm">Unlock</button>
                      </form>
                    )}
                    {r.pin_encrypted && (
                      <form action={resetPin.bind(null, r.id)}>
                        <button className="btn-small !min-h-8 !px-3 text-sm" title="Clears the PIN; the resident creates a new one at next sign-in">
                          Reset PIN
                        </button>
                      </form>
                    )}
                    <form action={setResidentActive.bind(null, r.id, !r.active)}>
                      <button className={`${r.active ? "btn-danger" : "btn-small"} !min-h-8 !px-3 text-sm`}>{r.active ? "Deactivate" : "Reactivate"}</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
