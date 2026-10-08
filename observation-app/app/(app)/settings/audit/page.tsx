import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getConfig } from "@/lib/data";
import { sql } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page) || 0);
  const cfg = await getConfig();
  const rows = await sql<{ id: number; at: string; actor: string | null; action: string; entity: string; entity_id: string; detail: unknown }[]>`
    select id, to_json(at)#>>'{}' as at, actor, action, entity, entity_id, detail from audit_log order by at desc limit 100 offset ${page * 100}`;
  const link = (e: string, id: string) => (e === "observation" ? `/observations/${id}` : e === "resident" ? `/residents/${id}` : e === "action_step" && id ? `/library/${id}` : null);
  return (
    <div className="space-y-4">
      <p><Link className="link text-sm" href="/settings">← Settings</Link></p>
      <h1 className="h1">Audit log</h1>
      <div className="card overflow-x-auto !p-0">
        <table className="table-basic text-xs">
          <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">What</th><th scope="col">Item</th><th scope="col">Detail</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const href = link(r.entity, r.entity_id);
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{formatDateTime(r.at)}</td>
                  <td>{cfg.observers.find((o) => o.id === r.actor)?.name ?? r.actor ?? "–"}</td>
                  <td>{r.action}</td>
                  <td>{href ? <Link className="link" href={href}>{r.entity}</Link> : r.entity}</td>
                  <td className="max-w-md break-words font-mono">{r.detail ? JSON.stringify(r.detail).slice(0, 300) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        {page > 0 && <Link className="btn-small" href={`/settings/audit?page=${page - 1}`}>Newer</Link>}
        {rows.length === 100 && <Link className="btn-small" href={`/settings/audit?page=${page + 1}`}>Older</Link>}
      </div>
    </div>
  );
}
