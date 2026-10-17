import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { MigrationImport, RosterImport } from "./ImportForms";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <p><Link className="link text-sm" href="/settings">← Settings</Link></p>
      <h1 className="h1">Import</h1>
      <section className="card space-y-2">
        <h2 className="h3">1. Roster (the Info tab)</h2>
        <p className="text-sm text-muted">
          In the observation workbook open the <b>Info</b> tab, then File → Download → Comma-separated values. Columns used: Full Name, Status, Preferred First, Last Name, Pronouns,
          Advisor, School, Grade Band, Content, Grade, Campus, Mentor Teacher, MT Email, Manager, KIPP Email. Residents are matched by KIPP email, then by full name. Each new resident
          gets a permanent person ID that never changes.
        </p>
        <RosterImport />
      </section>
      <section className="card space-y-2">
        <h2 className="h3">2. Existing observations (the Form tab)</h2>
        <p className="text-sm text-muted">
          Download the <b>Form</b> tab as CSV. Each Fillout submission is imported once (matched by Submission ID, so re-running is safe). Look-fors are matched to the CFS list;
          action step text is matched to the library (current or legacy wording), and anything unmatched is kept as &quot;legacy text&quot;. Imported observations are marked as already sent.
        </p>
        <MigrationImport />
      </section>
    </div>
  );
}
