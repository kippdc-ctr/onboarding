import { getSettings } from "@/lib/data";
import { PraxisImport } from "./PraxisImport";

export const dynamic = "force-dynamic";

export default async function PraxisPage() {
  const settings = await getSettings();
  return (
    <div className="space-y-6">
      <h1 className="h1">Praxis upload</h1>
      <div className="card space-y-2">
        <p>
          Upload a CSV with columns <code>First, Last, Stage, Math, Reading, Writing</code> (or a single <code>Resident</code> name column instead of First/Last).
          Stage is 1 to 6. Allowed statuses: <strong>{settings["praxis.status_options"]}</strong> (edit in Settings).
        </p>
        <p className="text-muted">
          Rows are matched on first and last name. You&apos;ll see a preview and a list of unmatched rows before anything is saved. A resident whose Math, Reading, and Writing are all
          &quot;Exempt&quot; no longer sees the Praxis Registration item.
        </p>
      </div>
      <PraxisImport />
    </div>
  );
}
