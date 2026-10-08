import { NextResponse } from "next/server";
import { getSettings } from "@/lib/data";
import { safeEqual } from "@/lib/crypto";
import { FEED_DATASETS, feedTable, loadDataset } from "@/lib/feed";
import { csvResponse, toCSV } from "@/lib/csv";

export const dynamic = "force-dynamic";

// Read-only feed for the Program Metrics App. Token in ?token= or "Authorization: Bearer <token>".
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const s = await getSettings();
  if (!s.feed_token || !token || !safeEqual(token, s.feed_token)) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const dataset = url.searchParams.get("dataset") ?? "";
  if (!(FEED_DATASETS as readonly string[]).includes(dataset)) return NextResponse.json({ datasets: FEED_DATASETS });
  const t = feedTable(await loadDataset(), dataset)!;
  if (url.searchParams.get("format") === "csv") return csvResponse(`ctr-obs-${dataset}.csv`, toCSV(t.header, t.rows));
  return NextResponse.json(
    { dataset, generated_at: new Date().toISOString(), rows: t.rows.map((r) => Object.fromEntries(t.header.map((h, i) => [h, r[i]]))) },
    { headers: { "cache-control": "no-store" } },
  );
}
