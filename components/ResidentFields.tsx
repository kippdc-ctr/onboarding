import type { Resident } from "@/lib/data";

/** Shared roster fields for the add and edit forms. */
export function ResidentFields({ r }: { r?: Partial<Resident> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label>
        <span className="label">First name *</span>
        <input name="first_name" required defaultValue={r?.first_name} className="input" />
      </label>
      <label>
        <span className="label">Last name *</span>
        <input name="last_name" required defaultValue={r?.last_name} className="input" />
      </label>
      <label>
        <span className="label">Preferred name</span>
        <input name="preferred_name" defaultValue={r?.preferred_name ?? ""} className="input" />
      </label>
      <label>
        <span className="label">Picker label</span>
        <input name="picker_label" defaultValue={r?.picker_label ?? ""} className="input" placeholder="Only if names match" />
      </label>
      <label>
        <span className="label">Grade band</span>
        <select name="grade_band" defaultValue={r?.grade_band ?? ""} className="input">
          <option value="">—</option>
          {["ECE", "Elementary", "Middle", "Secondary"].map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="label">Group</span>
        <select name="group_number" defaultValue={r?.group_number ?? ""} className="input">
          <option value="">—</option>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="label">School</span>
        <input name="school" defaultValue={r?.school ?? ""} className="input" />
      </label>
      <label>
        <span className="label">Email (admin only)</span>
        <input name="email" type="email" defaultValue={r?.email ?? ""} className="input" />
      </label>
    </div>
  );
}
