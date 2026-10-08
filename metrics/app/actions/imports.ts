"use server";

// Every action re-checks the signed-in user: server actions are public endpoints.
import { revalidatePath } from "next/cache";
import { can, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getGoals, getSources, getYear } from "@/lib/data";
import { ImportKind, Mapping, suggestMapping } from "@/lib/mapping";
import {
  AggregatePreview,
  commitAggregate,
  commitResults,
  commitRoster,
  getSavedMapping,
  parseWithHeader,
  previewAggregate,
  previewResults,
  previewRoster,
  ResultsOptions,
  ResultsPreview,
  RosterPreview,
} from "@/lib/imports";
import { errMsg, ISO_DATE } from "./util";

const MAX_CSV = 1_500_000;

async function importer() {
  const u = await requireUser("owner", "team");
  if (!can.runImports(u)) throw new Error("You can't run imports.");
  const year = await getYear();
  return { u, year };
}

function checkSize(csv: string) {
  if (csv.length > MAX_CSV) throw new Error("That file is too large (1.5 MB limit). Remove extra tabs or columns and try again.");
}

export async function analyzeCsv(kind: ImportKind, csv: string): Promise<{ headers: string[]; mapping: Mapping; rowCount: number; error?: string }> {
  await importer();
  checkSize(csv);
  const { headers, rows } = parseWithHeader(csv);
  if (!headers.length) return { headers: [], mapping: {}, rowCount: 0, error: "The file looks empty." };
  return { headers, mapping: suggestMapping(kind, headers, await getSavedMapping(kind)), rowCount: rows.length };
}

// ---------- Roster ----------

export async function previewRosterAction(csv: string, mapping: Mapping): Promise<RosterPreview> {
  const { year } = await importer();
  checkSize(csv);
  return previewRoster(year.id, csv, mapping);
}

export async function commitRosterAction(csv: string, mapping: Mapping, fileName: string | null): Promise<{ message?: string; error?: string }> {
  const { u, year } = await importer();
  try {
    checkSize(csv);
    const r = await commitRoster(year.id, csv, mapping, fileName, u.email);
    await audit(u, "import", "roster", { file: fileName, saved: r.saved, failed: r.failed });
    revalidatePath("/", "layout");
    return { message: `Saved ${r.saved} resident${r.saved === 1 ? "" : "s"} to the ${year.id} roster. ${r.failed} row${r.failed === 1 ? "" : "s"} skipped.` };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// ---------- Resident results ----------

export async function previewResultsAction(csv: string, mapping: Mapping, o: ResultsOptions): Promise<ResultsPreview> {
  const { year } = await importer();
  checkSize(csv);
  return previewResults(year.id, csv, mapping, o);
}

export async function commitResultsAction(
  csv: string,
  mapping: Mapping,
  o: ResultsOptions & { dataThrough: string; fileName: string | null },
): Promise<{ message?: string; error?: string }> {
  const { u, year } = await importer();
  try {
    checkSize(csv);
    if (!ISO_DATE.test(o.dataThrough)) throw new Error("Enter the data-through date.");
    const r = await commitResults(year.id, csv, mapping, o, u.email);
    const goal = (await getGoals(year.id)).find((g) => g.id === o.goalId)!;
    await audit(u, "import", `goal ${goal.number}`, { period: o.period, file: o.fileName, saved: r.saved, failed: r.failed });
    revalidatePath("/", "layout");
    return { message: `Saved goal ${goal.number}, ${o.period}: ${r.numerator} of ${r.denominator} met. ${r.failed} row${r.failed === 1 ? "" : "s"} skipped.` };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// ---------- Aggregate numbers ----------

export async function previewAggregateAction(csv: string, mapping: Mapping, source: string): Promise<AggregatePreview> {
  const { year } = await importer();
  checkSize(csv);
  return previewAggregate(year.id, csv, mapping, source);
}

export async function commitAggregateAction(
  csv: string,
  mapping: Mapping,
  o: { source: string; dataThrough: string; fileName: string | null },
): Promise<{ message?: string; error?: string }> {
  const { u, year } = await importer();
  try {
    checkSize(csv);
    if (!ISO_DATE.test(o.dataThrough)) throw new Error("Enter the data-through date.");
    if (!(await getSources()).some((s) => s.key === o.source)) throw new Error("Choose a source.");
    const r = await commitAggregate(year.id, csv, mapping, o, u.email);
    await audit(u, "import", "aggregate", { source: o.source, file: o.fileName, saved: r.saved, failed: r.failed });
    revalidatePath("/", "layout");
    return { message: `Saved ${r.saved} row${r.saved === 1 ? "" : "s"}. ${r.failed} skipped.` };
  } catch (e) {
    return { error: errMsg(e) };
  }
}
