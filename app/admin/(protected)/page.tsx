import Link from "next/link";
import { filterQuery, filtersFrom, loadCohort } from "@/lib/cohort";
import { formatDate, isPast } from "@/lib/dates";
import { accuracyText, ItemState, ModuleState, Status, STATUS_LABEL } from "@/lib/progress";
import { setItemVerified } from "@/app/actions/admin";
import { displayName } from "@/lib/data";

export const dynamic = "force-dynamic";

const CELL: Record<Status, string> = {
  not_started: "bg-white text-muted",
  in_progress: "bg-yellow-wash text-ink",
  complete: "bg-teal-wash text-teal-ink",
  overdue: "bg-coral text-white",
};
const ITEM_SHORT: Record<string, string> = {
  "p1-info-form": "Info form",
  "p1-praxis-exemption": "Praxis exemption",
  "p1-welcome-call": "Welcome call",
  "p1-praxis-registration": "Praxis reg.",
  "p3-background": "Background",
  "p3-workday": "Workday",
  "p3-contact-info": "Contact info (opt.)",
  "p3-webinar": "Webinar (opt.)",
  "p3-summer-schedule": "SA schedule",
};
const MODULE_SHORT: Record<number, string> = { 1: "Our City", 2: "Your Story", 3: "What We Believe", 4: "The Variable", 5: "Child Dev." };
const SHORT: Record<Status, string> = { not_started: "—", in_progress: "In prog.", complete: "Done", overdue: "Overdue" };

function ItemCell({ rid, it, today }: { rid: string; it: ItemState; today: string }) {
  if (!it.visible) return <td className="border border-gray-brand/20 bg-sand p-1 text-center text-xs text-muted">n/a</td>;
  if (!it.checked) {
    const overdue = it.required && isPast(it.due, today);
    return (
      <td className={`border border-gray-brand/20 p-1 text-center text-xs ${overdue ? "bg-coral font-bold text-white" : "text-muted"}`} title={overdue ? "Overdue" : "Not done"}>
        {overdue ? "Overdue" : "—"}
      </td>
    );
  }
  return (
    <td className={`border border-gray-brand/20 p-0 text-center text-xs ${it.verified ? "bg-teal-ink text-white" : "bg-teal-wash text-teal-ink"}`}>
      <form action={setItemVerified.bind(null, rid, it.item.id, !it.verified)}>
        <button type="submit" className="h-full w-full p-1 font-bold" title={it.verified ? "Verified. Click to clear." : "Self-reported. Click to mark Verified."}>
          {it.verified ? "✓ Verified" : "✓ Verify?"}
        </button>
      </form>
    </td>
  );
}

function ModuleCell({ m }: { m: ModuleState }) {
  return (
    <td className={`border border-gray-brand/20 p-1 text-center text-xs font-semibold ${CELL[m.status]}`} title={`${STATUS_LABEL[m.status]}${m.attemptCount ? `, ${m.attemptCount} attempt(s)` : ""}`}>
      <div>{SHORT[m.status]}</div>
      {m.totalQuestions > 0 && <div className="font-normal">{accuracyText(m)}</div>}
    </td>
  );
}

function praxisCell(v: string | null | undefined) {
  const s = (v ?? "").toLowerCase();
  const cls = s === "passed" || s === "exempt" ? "bg-teal-wash text-teal-ink" : s === "not passed" ? "bg-coral-wash text-coral-ink" : s === "registered" ? "bg-yellow-wash" : "text-muted";
  return <td className={`border border-gray-brand/20 p-1 text-center text-xs ${cls}`}>{v || "—"}</td>;
}

export default async function CompletionGrid({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = filtersFrom(await searchParams);
  const { cfg, rows, schools } = await loadCohort(f);
  const p1 = cfg.phaseItems.filter((i) => i.phase === 1);
  const p3 = cfg.phaseItems.filter((i) => i.phase === 3);
  const total = rows.length;
  const fully = rows.filter((x) => x.s.phases.every((p) => p.status === "complete")).length;
  const overdue = rows.filter((x) => x.s.anyOverdue).length;
  const notStarted = rows.filter((x) => x.s.nothingStarted).length;
  const q = filterQuery(f);
  const modules = rows[0]?.s.modules.map((m) => m.content) ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Completion</h1>
          <p className="text-muted">Today is {formatDate(cfg.today, { weekday: true })}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-small" href={`/admin/export/grid${q}`}>
            Export grid CSV
          </a>
          <a className="btn-small" href={`/admin/export/status${q}`}>
            Prework status export (email merge)
          </a>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Residents", total, ""],
          ["Fully complete", total ? `${Math.round((100 * fully) / total)}%` : "—", `${fully} of ${total}`],
          ["Overdue", overdue, "at least one phase overdue"],
          ["Not started", notStarted, "nothing done yet"],
        ].map(([label, value, sub]) => (
          <div key={String(label)} className="card !p-4">
            <dt className="text-sm font-semibold text-muted">{label}</dt>
            <dd className="text-3xl font-bold text-teal-ink">{value}</dd>
            {sub && <dd className="text-sm text-muted">{sub}</dd>}
          </div>
        ))}
      </dl>

      <form className="card mt-4 flex flex-wrap items-end gap-3 !p-4" method="get">
        <label className="text-sm">
          <span className="label">Search</span>
          <input name="q" defaultValue={f.q} className="input !min-h-10 w-44" placeholder="Name" />
        </label>
        <label className="text-sm">
          <span className="label">Group</span>
          <select name="group" defaultValue={f.group ?? ""} className="input !min-h-10 w-28">
            <option value="">All</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Grade band</span>
          <select name="grade" defaultValue={f.grade ?? ""} className="input !min-h-10 w-36">
            <option value="">All</option>
            {["ECE", "Elementary", "Middle", "Secondary"].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">School</span>
          <select name="school" defaultValue={f.school ?? ""} className="input !min-h-10 w-44">
            <option value="">All</option>
            {schools.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Status</span>
          <select name="status" defaultValue={f.status ?? ""} className="input !min-h-10 w-40">
            <option value="">All</option>
            <option value="overdue">Overdue</option>
            <option value="not_started">Not started</option>
            <option value="incomplete">Not fully complete</option>
            <option value="complete">Fully complete</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Added on/after</span>
          <input type="date" name="added_after" defaultValue={f.added_after} className="input !min-h-10 w-44" />
        </label>
        <label className="text-sm">
          <span className="label">Sort</span>
          <select name="sort" defaultValue={f.sort ?? ""} className="input !min-h-10 w-44">
            <option value="">Name</option>
            <option value="done">Most complete first</option>
            <option value="done_asc">Least complete first</option>
          </select>
        </label>
        <button type="submit" className="btn-small">
          Apply
        </button>
        {q && (
          <Link href="/admin" className="link text-sm">
            Clear
          </Link>
        )}
      </form>

      <p className="mt-4 text-sm text-muted">
        Ticked items show <span className="rounded bg-teal-wash px-1 font-bold text-teal-ink">✓ Verify?</span> (self-reported). Click to mark{" "}
        <span className="rounded bg-teal-ink px-1 font-bold text-white">✓ Verified</span>; click again to clear. Module cells show Completion and Accuracy.
      </p>

      <div className="mt-2 overflow-x-auto rounded-2xl border border-gray-brand/30 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-teal-wash">
            <tr>
              <th rowSpan={2} className="sticky left-0 z-10 border border-gray-brand/20 bg-teal-wash p-2 text-left">
                Resident
              </th>
              <th rowSpan={2} className="border border-gray-brand/20 p-2">
                Grp
              </th>
              <th colSpan={p1.length} className="border border-gray-brand/20 p-1">
                Phase 1
              </th>
              <th colSpan={modules.length} className="border border-gray-brand/20 p-1">
                Phase 2 modules
              </th>
              <th colSpan={p3.length} className="border border-gray-brand/20 p-1">
                Phase 3
              </th>
              <th colSpan={3} className="border border-gray-brand/20 p-1">
                Praxis Core
              </th>
            </tr>
            <tr className="text-xs">
              {p1.map((i) => (
                <th key={i.id} className="border border-gray-brand/20 p-1 font-semibold" title={i.label}>
                  {ITEM_SHORT[i.id] ?? i.label.slice(0, 20)}
                </th>
              ))}
              {modules.map((m) => (
                <th key={m.slug} className="border border-gray-brand/20 p-1 font-semibold" title={m.title}>
                  {m.number}. {MODULE_SHORT[m.number] ?? m.title}
                </th>
              ))}
              {p3.map((i) => (
                <th key={i.id} className="border border-gray-brand/20 p-1 font-semibold" title={i.label}>
                  {ITEM_SHORT[i.id] ?? i.label.slice(0, 20)}
                </th>
              ))}
              <th className="border border-gray-brand/20 p-1">Math</th>
              <th className="border border-gray-brand/20 p-1">Reading</th>
              <th className="border border-gray-brand/20 p-1">Writing</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={99} className="p-6 text-center text-muted">
                  No residents match these filters.
                </td>
              </tr>
            )}
            {rows.map(({ r, b, s }) => (
              <tr key={r.id} className="hover:bg-sand">
                <th scope="row" className="sticky left-0 z-10 border border-gray-brand/20 bg-white p-2 text-left font-semibold whitespace-nowrap">
                  <Link href={`/admin/residents/${r.id}`} className="link">
                    {displayName(r)}
                  </Link>
                  {r.picker_label && <span className="ml-1 text-xs text-muted">({r.picker_label})</span>}
                  {r.locked && <span className="ml-1 rounded bg-coral px-1 text-xs text-white">Locked</span>}
                  <div className="text-xs font-normal text-muted">
                    {r.grade_band ?? "—"}
                    {r.school ? ` · ${r.school}` : ""}
                  </div>
                </th>
                <td className="border border-gray-brand/20 p-1 text-center">{r.group_number ?? "—"}</td>
                {s.phase1.map((it) => (
                  <ItemCell key={it.item.id} rid={r.id} it={it} today={cfg.today} />
                ))}
                {s.modules.map((m) => (
                  <ModuleCell key={m.slug} m={m} />
                ))}
                {s.phase3.map((it) => (
                  <ItemCell key={it.item.id} rid={r.id} it={it} today={cfg.today} />
                ))}
                {praxisCell(b.praxis?.math)}
                {praxisCell(b.praxis?.reading)}
                {praxisCell(b.praxis?.writing)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
