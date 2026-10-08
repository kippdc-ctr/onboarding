"use server";

// Every action re-checks the signed-in user: server actions are public endpoints.
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { assertYearOpen, getGoal, getPeriods } from "@/lib/data";
import { saveManual } from "@/lib/imports";
import { back, errMsg, ISO_DATE, str } from "./util";

export async function saveManualMeasurement(fd: FormData) {
  const u = await requireUser("owner", "team");
  const goal = await getGoal(Number(str(fd, "goal_id")));
  if (!goal) back("/", "Goal not found.", "error");
  const path = `/goals/${goal.id}`;
  if (!can.enterMeasurements(u)) back(path, "You can't enter numbers.", "error");
  if (goal.derive_rule) back(path, `This goal is calculated from goal ${goal.derive_rule.from}.`, "error");
  const period = str(fd, "period");
  const numerator = Number(str(fd, "numerator"));
  const denRaw = str(fd, "denominator");
  const denominator = denRaw === "" ? null : Number(denRaw);
  const dataThrough = str(fd, "data_through");
  if (!(await getPeriods(goal.school_year)).some((p) => p.key === period)) back(path, "Choose a period.", "error");
  if (str(fd, "numerator") === "" || !Number.isFinite(numerator) || numerator < 0) back(path, "Numerator must be a number, 0 or more.", "error");
  if (goal.unit === "percent" && (denominator === null || !Number.isFinite(denominator) || denominator <= 0)) back(path, "Enter a denominator above 0.", "error");
  if (denominator !== null && (!Number.isFinite(denominator) || numerator > denominator)) back(path, "Numerator can't be larger than the denominator.", "error");
  if (!ISO_DATE.test(dataThrough)) back(path, "Enter the data-through date.", "error");
  try {
    await saveManual(goal.school_year, goal, { period, numerator, denominator, dataThrough, note: str(fd, "note") || null }, u.email);
  } catch (e) {
    back(path, errMsg(e), "error");
  }
  await audit(u, "measurement", `goal ${goal.number}`, { period, numerator, denominator, dataThrough });
  revalidatePath("/", "layout");
  back(path, `Saved ${period}.`);
}

export async function deleteMeasurementPeriod(fd: FormData) {
  const u = await requireUser("owner", "team");
  const goal = await getGoal(Number(str(fd, "goal_id")));
  if (!goal) back("/", "Goal not found.", "error");
  const period = str(fd, "period");
  const path = `/goals/${goal.id}`;
  try {
    await assertYearOpen(goal.school_year);
  } catch (e) {
    back(path, errMsg(e), "error");
  }
  await sql.begin(async (tx) => {
    await tx`delete from metrics.goal_members where goal_id = ${goal.id} and period = ${period}`;
    await tx`delete from metrics.measurements where goal_id = ${goal.id} and period = ${period}`;
  });
  await audit(u, "measurement", `goal ${goal.number}`, { deleted: period });
  revalidatePath("/", "layout");
  back(path, `Deleted ${period}.`);
}
