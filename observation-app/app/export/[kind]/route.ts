import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { csvResponse, toCSV } from "@/lib/csv";
import { feedTable, latestTable, loadDataset } from "@/lib/feed";
import { todayISO } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ kind: string }> }) {
  const me = await apiUser();
  if (!me) return new NextResponse("Page not found", { status: 404 });
  const { kind } = await params;
  const ds = await loadDataset();
  const day = todayISO();
  if (kind === "latest") {
    const t = latestTable(ds);
    return csvResponse(`ctr-latest-${day}.csv`, toCSV(t.header, t.rows));
  }
  if (kind === "observations") {
    const res = new Map(ds.residents.map((r) => [r.id, r]));
    const inds = ds.cfg.scoredIndicators.map((i) => i.code);
    const header = ["observation_id", "date", "resident", "person_id", "observer", "type", "involvement", "cycle", ...inds.flatMap((c) => [c, `CFS ${c}`]), "action_steps", "affirming", "adjusting", "internal_comments", "sent_at"];
    const rows = ds.observations.map((o) => [
      o.id, o.observed_date, res.get(o.resident_id)?.full_name, res.get(o.resident_id)?.person_id, o.observer_id, o.type, o.involvement, o.cycle,
      ...inds.flatMap((c) => {
        const s = o.scores.find((x) => x.indicator === c);
        return [s?.score ?? "", s ? s.cfs_demonstrated.map((id) => ds.cfg.cfs.find((x) => x.id === id)?.full_text ?? id).join("; ") : ""];
      }),
      o.steps.map((s) => s.wording_snapshot).join(" | "), o.affirming, o.adjusting, o.internal_comments, o.sent_at ?? "",
    ]);
    return csvResponse(`ctr-observations-${day}.csv`, toCSV(header, rows));
  }
  if (kind === "backup") {
    const tables = ["observers", "cycles", "indicators", "cfs", "tiers", "tracks", "residents", "resident_track", "resident_indicator_override", "resident_cycle_override", "resident_priorities", "action_steps", "action_step_history", "observations", "observation_scores", "observation_action_steps", "step_followthrough", "audit_log"];
    const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
    for (const t of tables) out[t] = await sql.unsafe(`select * from ${t}`);
    return new NextResponse(JSON.stringify(out, null, 1), {
      headers: { "content-type": "application/json", "content-disposition": `attachment; filename="ctr-observations-backup-${day}.json"`, "cache-control": "no-store" },
    });
  }
  const t = feedTable(ds, kind);
  if (!t) return new NextResponse("Unknown export", { status: 404 });
  return csvResponse(`ctr-${kind}-${day}.csv`, toCSV(t.header, t.rows));
}
