"use server";

import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { applyMigration, applyRoster, previewMigration, previewRoster, type MigrationRow, type RosterPreview } from "@/lib/importers";

export type RosterState = { preview?: RosterPreview; done?: string; error?: string };
export type MigrationState = { rows?: MigrationRow[]; done?: string; error?: string };

export async function rosterAction(_: RosterState, form: FormData): Promise<RosterState> {
  const me = await requireAdmin();
  const text = String(form.get("csv") ?? "");
  if (!text.trim()) return { error: "Choose the CSV file or paste it." };
  const preview = await previewRoster(text);
  if (preview.errors.length && !preview.changes.length) return { error: preview.errors.join(" ") };
  if (form.get("mode") !== "apply") return { preview };
  const r = await applyRoster(preview, form.get("deactivate") === "on");
  await audit(me.id, "import.roster", "residents", "", r);
  return { done: `Roster imported: ${r.added} added, ${r.updated} updated${r.deactivated ? `, ${r.deactivated} marked inactive` : ""}.` };
}

export async function migrationAction(_: MigrationState, form: FormData): Promise<MigrationState> {
  const me = await requireAdmin();
  const text = String(form.get("csv") ?? "");
  if (!text.trim()) return { error: "Choose the CSV file or paste it." };
  const { rows, errors } = await previewMigration(text);
  if (errors.length) return { error: errors.join(" ") };
  if (form.get("mode") !== "apply") return { rows };
  const r = await applyMigration(rows);
  await audit(me.id, "import.fillout", "observations", "", r);
  return { done: `Imported ${r.imported} observations. ${r.skipped} skipped (already imported or with a problem shown in the preview).` };
}
