import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadScoringData, toClientStep } from "@/lib/context";
import { getConfig, getObservation, getStep } from "@/lib/data";
import { canEdit } from "@/lib/save";
import { draftFromObservation } from "@/lib/editDraft";
import { ObserveForm } from "@/components/observe/ObserveForm";

export const dynamic = "force-dynamic";

export default async function EditObservationPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const o = await getObservation(id);
  if (!o || o.status !== "submitted") notFound();
  const cfg = await getConfig();
  const windowDays = Number(cfg.settings.edit_window_days) || 7;
  if (!canEdit(o, me, windowDays)) {
    return (
      <div className="card">
        <h1 className="h2">This observation can't be edited</h1>
        <p className="mt-2">The {windowDays}-day edit window has closed. Ashley (admin) can still make changes, and they are logged.</p>
        <Link className="link mt-3 inline-block" href={`/observations/${id}`}>Back to the observation</Link>
      </div>
    );
  }
  const data = await loadScoringData();
  // Steps on this observation that are no longer active still need to display.
  for (const s of o.steps) {
    if (s.step_id && !data.steps.some((x) => x.id === s.step_id)) {
      const st = await getStep(s.step_id);
      if (st) data.steps.push(toClientStep(st));
    }
  }
  // Include an inactive resident so old observations stay editable.
  if (!data.residents.some((r) => r.id === o.resident_id)) notFound();
  const lateEdit = !canEdit(o, { ...me, is_admin: false }, windowDays);
  return (
    <>
      <h1 className="h1 mb-4">Edit observation</h1>
      <ObserveForm data={data} initial={draftFromObservation(o)} editing={{ id: o.id, lateEdit }} />
    </>
  );
}
