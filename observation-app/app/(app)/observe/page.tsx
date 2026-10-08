import { requireUser } from "@/lib/auth";
import { loadScoringData } from "@/lib/context";
import { getObservation } from "@/lib/data";
import { ObserveForm } from "@/components/observe/ObserveForm";
import { blankDraft } from "@/components/observe/helpers";
import { draftFromObservation } from "@/lib/editDraft";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

export default async function ObservePage({ searchParams }: { searchParams: Promise<{ resident?: string; draft?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const data = await loadScoringData();
  let initial = blankDraft(randomUUID(), me.id, data.today, data.cfg);
  if (sp.draft) {
    const o = await getObservation(sp.draft);
    if (o && o.status === "draft") initial = draftFromObservation(o);
  } else if (sp.resident && data.residents.some((r) => r.id === sp.resident)) {
    initial.residentId = sp.resident;
  }
  return (
    <>
      <h1 className="h1 mb-4">New observation</h1>
      <ObserveForm data={data} initial={initial} />
    </>
  );
}
