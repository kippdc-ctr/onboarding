import type { Resident } from "@/lib/data";

const FIELDS: [keyof Resident, string][] = [
  ["full_name", "Full name"], ["preferred_first", "Preferred first"], ["last_name", "Last name"], ["pronouns", "Pronouns"],
  ["status", "Status"], ["advisor_code", "Advisor (APC, AC)"], ["school", "School"], ["campus", "Campus"],
  ["grade_band", "Grade band"], ["content", "Content"], ["grade", "Grade"], ["mentor_teacher", "Mentor teacher"],
  ["mentor_email", "Mentor email"], ["manager", "Manager"], ["email", "KIPP email"],
];

export function ResidentFields({ r }: { r?: Resident }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {FIELDS.map(([k, label]) => (
        <label key={k}>
          <span className="label text-sm">{label}</span>
          <input name={k} className="input" defaultValue={r ? String(r[k] ?? "") : ""} required={k === "full_name"} />
        </label>
      ))}
      {!r && (
        <label><span className="label text-sm">Person ID (blank = new)</span><input name="person_id" className="input" /></label>
      )}
      <label className="flex items-center gap-2 self-end pb-3"><input type="checkbox" name="active" defaultChecked={r ? r.active : true} /> Currently enrolled (active)</label>
    </div>
  );
}
