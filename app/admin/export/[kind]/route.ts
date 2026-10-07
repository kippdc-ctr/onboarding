import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { filtersFrom, loadCohort } from "@/lib/cohort";
import { getForm, MODULES } from "@/lib/content";
import { csvResponse, toCSV } from "@/lib/csv";
import { displayName, Resident } from "@/lib/data";
import { answerText, FormAnswers } from "@/lib/forms";
import { accuracyPercent, accuracyText, STATUS_LABEL, ModuleState } from "@/lib/progress";
import { isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

const yesNo = (b: boolean | undefined) => (b ? "Complete" : "Incomplete");

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  if (!(await isAdmin())) return new Response("Not signed in", { status: 401 });
  const { kind } = await params;
  const f = filtersFrom(Object.fromEntries(req.nextUrl.searchParams));
  const stamp = new Date().toISOString().slice(0, 10);

  if (kind === "grid") {
    const { cfg, rows } = await loadCohort(f);
    const p1 = cfg.phaseItems.filter((i) => i.phase === 1);
    const p3 = cfg.phaseItems.filter((i) => i.phase === 3);
    const header = [
      "First", "Last", "Preferred", "Label", "Group", "Grade band", "School", "Added on", "Last active",
      ...p1.map((i) => `P1: ${i.label}`),
      ...MODULES.flatMap((m) => [`M${m.number} ${m.title}: Completion`, `M${m.number}: Accuracy`, `M${m.number}: Attempts`]),
      ...p3.map((i) => `P3: ${i.label}`),
      "Praxis stage", "Math", "Reading", "Writing",
      "Phase 1", "Phase 2", "Phase 3",
    ];
    const itemText = (it: { visible: boolean; checked: boolean; verified: boolean }) => (!it.visible ? "n/a" : it.verified ? "Verified" : it.checked ? "Self-reported" : "");
    const body = rows.map(({ r, b, s }) => {
      const mods = new Map(s.modules.map((m) => [m.slug, m]));
      return [
        r.first_name, r.last_name, r.preferred_name, r.picker_label, r.group_number, r.grade_band, r.school, r.added_on,
        r.last_active_at ? new Date(r.last_active_at).toISOString() : "",
        ...s.phase1.map(itemText),
        ...MODULES.flatMap((m) => {
          const st = mods.get(m.slug);
          return st ? [STATUS_LABEL[st.status], accuracyText(st), st.attemptCount || ""] : ["", "", ""];
        }),
        ...s.phase3.map(itemText),
        b.praxis?.stage ?? "", b.praxis?.math ?? "", b.praxis?.reading ?? "", b.praxis?.writing ?? "",
        ...s.phases.map((p) => STATUS_LABEL[p.status]),
      ];
    });
    return csvResponse(`ctr-completion-${stamp}.csv`, toCSV(header, body));
  }

  if (kind === "status") {
    // Columns match last year's Prework Update email merge fields.
    const { rows } = await loadCohort(f);
    const header = [
      "First", "Completion", "Math", "Reading", "Writing",
      "1. Completion", "1. Accuracy", "2. Completion", "Personal Why", "MT Match", "Intro Slide", "Gradeband",
      "3. Completion", "3. Accuracy", "4. Completion", "4. Accuracy", "5. Completion", "5. Accuracy",
      "Last", "Email", "Group",
    ];
    const body = rows.map(({ r, b, s }) => {
      const m = (n: number) => s.modules.find((x) => x.content.number === n) as ModuleState | undefined;
      const comp = (n: number) => (m(n) ? STATUS_LABEL[m(n)!.status] : "");
      const acc = (n: number) => (m(n) ? accuracyPercent(m(n)!) : "");
      const chk = (id: string) => yesNo(m(2)?.checklist[id]?.checked);
      return [
        r.preferred_name?.trim() || r.first_name, `${s.prework}%`, b.praxis?.math ?? "", b.praxis?.reading ?? "", b.praxis?.writing ?? "",
        comp(1), acc(1), comp(2), chk("personal-why"), chk("mentor-match"), chk("intro-slide"), chk("gradeband-photo"),
        comp(3), acc(3), comp(4), acc(4), comp(5), acc(5),
        r.last_name, r.email ?? "", r.group_number ?? "",
      ];
    });
    return csvResponse(`ctr-prework-status-${stamp}.csv`, toCSV(header, body));
  }

  if (kind.startsWith("form-")) {
    const form = getForm(kind.slice(5));
    if (!form) return new Response("Unknown form", { status: 404 });
    const qs = form.questions.filter((q) => q.type !== "section");
    const rows = await sql<(Resident & { answers_json: FormAnswers; status: string; submitted_at: Date | null })[]>`
      select r.*, fr.answers_json, fr.status, fr.submitted_at from form_responses fr join residents r on r.id = fr.resident_id
      where fr.form_slug = ${form.slug} order by r.last_name, r.first_name`;
    const filtered = rows.filter(
      (r) => (!f.group || String(r.group_number) === f.group) && (!f.grade || r.grade_band === f.grade) && (!f.school || r.school === f.school),
    );
    const header = ["Resident", "Group", "Grade band", "School", "Status", "Submitted at", ...qs.map((q) => q.prompt)];
    const body = filtered.map((r) => [
      displayName(r), r.group_number, r.grade_band, r.school, r.status, r.submitted_at ? new Date(r.submitted_at).toISOString() : "",
      ...qs.map((q) => answerText(q, r.answers_json)),
    ]);
    return csvResponse(`ctr-${form.slug}-${stamp}.csv`, toCSV(header, body));
  }

  if (kind === "all") {
    // Full JSON backup of everything, for end-of-year export before deleting a cohort.
    const tables = ["groups", "residents", "phase_items", "item_checks", "praxis_status", "modules", "group_due_overrides", "module_progress", "quiz_attempts", "reflections", "checklist_items", "activity_results", "form_responses", "settings"];
    const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
    for (const t of tables) {
      const rows = await sql.unsafe(`select * from ${t}`);
      out[t] = t === "residents" ? rows.map(({ pin_encrypted: _p, ...rest }) => rest) : rows;
    }
    return new Response(JSON.stringify(out, null, 2), {
      headers: { "content-type": "application/json", "content-disposition": `attachment; filename="ctr-onboarding-backup-${stamp}.json"`, "cache-control": "no-store" },
    });
  }

  return new Response("Unknown export", { status: 404 });
}
