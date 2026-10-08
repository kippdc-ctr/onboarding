import Link from "next/link";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDateTime } from "@/lib/dates";

type Row = { id: number; at: Date; user_email: string; action: string; target: string | null; detail: Record<string, unknown> };

const ACTIONS = ["sign_in", "view_members", "import", "measurement", "goal_edit", "user_change", "export", "year_change", "settings"];

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser("owner");
  const sp = await searchParams;
  const action = sp.action && ACTIONS.includes(sp.action) ? sp.action : null;
  const who = sp.who?.trim().toLowerCase() || null;
  const rows = await sql<Row[]>`
    select * from metrics.audit_log
    where true ${action ? sql`and action = ${action}` : sql``} ${who ? sql`and user_email like ${"%" + who + "%"}` : sql``}
    order by at desc limit 500`;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Audit log</h1>
        <p className="text-muted">Who signed in, viewed resident lists, ran imports, typed in numbers, edited goals, changed users, and exported data. Latest 500.</p>
      </div>
      <form className="card flex flex-wrap items-end gap-3 p-4 sm:p-4">
        <label>
          <span className="label text-sm">Action</span>
          <select name="action" defaultValue={action ?? ""} className="input min-h-10 w-auto py-1">
            <option value="">All</option>
            {ACTIONS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="label text-sm">Person</span>
          <input name="who" defaultValue={sp.who ?? ""} className="input min-h-10 py-1" />
        </label>
        <button className="btn-small">Filter</button>
        {(action || who) && (
          <Link href="/admin/audit" className="link text-sm">
            Clear
          </Link>
        )}
      </form>
      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-brand/30">
              <th className="th">When</th>
              <th className="th">Who</th>
              <th className="th">Action</th>
              <th className="th">Target</th>
              <th className="th">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-brand/10 align-top">
                <td className="td whitespace-nowrap">{fmtDateTime(r.at)}</td>
                <td className="td">{r.user_email}</td>
                <td className="td">{r.action}</td>
                <td className="td">{r.target}</td>
                <td className="td font-mono text-xs break-all text-muted">{Object.keys(r.detail).length ? JSON.stringify(r.detail) : ""}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="td text-muted">
                  Nothing logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
