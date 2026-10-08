import { currentUser, can } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getGoals, getSettings, getYear, scoreGoals, TYPE_LABEL } from "@/lib/data";
import { suppressed } from "@/lib/compute";
import { formatTarget, formatValue, STATUS_LABEL } from "@/lib/status";
import { csvResponse, toCSV } from "@/lib/csv";

export const dynamic = "force-dynamic";

/** Shared goals only, overall numbers only, small groups suppressed for non-owners. */
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return new Response("Sign in first", { status: 401 });
  const year = await getYear(new URL(req.url).searchParams.get("year") ?? undefined);
  const [goals, settings] = await Promise.all([getGoals(year.id), getSettings()]);
  const scored = await scoreGoals(year, goals);
  const rows = scored.map(({ goal: g, ev }) => {
    const c = ev.current;
    const hide = c ? suppressed(c.denominator, { suppressSmallN: g.suppress_small_n, isOwner: can.seeSmallN(u), smallN: settings.smallN }) : false;
    return [
      g.number === 0 ? "Big Goal" : g.number,
      g.category,
      g.text,
      TYPE_LABEL[g.type],
      formatTarget(g),
      c ? (hide ? "n < 5" : formatValue(g.unit, ev.value)) : "",
      c && !hide ? c.numerator : "",
      c && !hide ? c.denominator ?? "" : "",
      c?.period ?? "",
      g.baseline_value === null ? "" : formatValue(g.unit, g.baseline_value),
      c && !hide ? ev.change : "",
      STATUS_LABEL[ev.status],
      g.measured_label,
      c?.data_through ?? "",
    ];
  });
  await audit(u, "export", "scorecard", { year: year.id });
  return csvResponse(
    `ctr-scorecard-${year.id}.csv`,
    toCSV(["Goal", "Category", "Goal text", "Type", "Target", "Current", "Numerator", "Denominator", "Period", "SY25-26 actual", "Change", "Status", "Measured at", "Data through"], rows),
  );
}
