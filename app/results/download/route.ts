import { getConfig, loadBundle } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import { residentResponsesText } from "@/lib/residentExport";
import { currentResident } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const r = await currentResident();
  if (!r) return new Response("Please sign in first.", { status: 401 });
  const cfg = await getConfig(todayISO());
  const text = residentResponsesText(cfg, r, await loadBundle(r.id));
  return new Response(text, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="ctr-my-responses.txt"`,
      "cache-control": "no-store",
    },
  });
}
