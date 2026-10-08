import { sql } from "@/lib/db";
import { AppUser, allowedDomain, requireUser, ROLE_LABEL } from "@/lib/auth";
import { getCampuses } from "@/lib/data";
import { fmtDateTime } from "@/lib/dates";
import { Flash, flashFrom } from "@/components/Flash";
import { addUser, resetPassword, updateUser } from "@/app/actions/admin";
import { MIN_PASSWORD } from "@/lib/password";

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser("owner");
  const sp = await searchParams;
  const [users, campuses] = await Promise.all([sql<AppUser[]>`select * from metrics.app_users order by active desc, role, email`, getCampuses()]);
  return (
    <div className="space-y-6">
      <Flash {...flashFrom(sp)} />
      <div>
        <h1 className="h1">Users</h1>
        <p className="text-muted">
          Only people on this list can sign in, with their email and their own password. When you add someone or reset their password, you set a temporary password;
          they choose their own the first time they sign in. Changing someone&apos;s role signs them out so it applies right away.
        </p>
      </div>
      <div className="card text-sm">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Owner:</strong> everything, including small-group numbers, demographics, goal editing, calendar, users, and the audit log.
          </li>
          <li>
            <strong>CTR team:</strong> every shared goal and resident list, demographic breakdowns with groups under 5 hidden, imports and typed-in numbers. No users, goal editing, or
            demographics on resident rows.
          </li>
          <li>
            <strong>RDL / campus leader:</strong> the scorecard, plus only their campus&apos;s residents and campus breakdown. No demographic breakdowns, imports, or other campuses&apos;
            residents.
          </li>
        </ul>
      </div>

      <div className="space-y-3">
        {users.map((u) => (
          <div key={u.id} className="space-y-2">
          <form action={updateUser} className={`card grid gap-3 p-4 sm:p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_11rem_10rem_auto_auto] md:items-end ${u.active ? "" : "opacity-70"}`}>
            <input type="hidden" name="id" value={u.id} />
            <div>
              <p className="font-semibold break-all">
                {u.email}
                {u.id === me.id && <span className="ml-1 text-xs text-muted">(you)</span>}
              </p>
              <p className="text-xs text-muted">
                Last sign-in: {fmtDateTime(u.last_login_at)}
                {!u.password_hash && <strong className="text-coral-ink"> · no password yet: set one below</strong>}
                {u.password_hash && u.must_change_password && " · temporary password"}
                {u.locked_until && new Date(u.locked_until).getTime() > Date.now() && <strong className="text-coral-ink"> · locked (too many wrong tries)</strong>}
              </p>
            </div>
            <label>
              <span className="label text-sm">Name</span>
              <input name="name" defaultValue={u.name ?? ""} className="input min-h-10 py-1" />
            </label>
            <label>
              <span className="label text-sm">Role</span>
              <select name="role" defaultValue={u.role} className="input min-h-10 py-1">
                {Object.entries(ROLE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label text-sm">Campus (RDLs)</span>
              <select name="campus" defaultValue={u.campus ?? ""} className="input min-h-10 py-1">
                <option value="">—</option>
                {campuses.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pb-2">
              <input type="checkbox" name="active" defaultChecked={u.active} className="h-5 w-5" />
              <span>Active</span>
            </label>
            <button className="btn-small">Save</button>
          </form>
          <details className="px-4 text-sm">
            <summary className="cursor-pointer font-semibold text-teal-ink">{u.password_hash ? "Reset password" : "Set a password"}</summary>
            <form action={resetPassword} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={u.id} />
              <label>
                <span className="label text-sm">Temporary password</span>
                <input name="temp_password" type="text" autoComplete="off" required minLength={MIN_PASSWORD} className="input min-h-10 py-1" />
              </label>
              <button className="btn-small">Set temporary password</button>
            </form>
          </details>
          </div>
        ))}
      </div>

      <form action={addUser} className="card grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_11rem_10rem_minmax(0,1fr)_auto] md:items-end">
        <h2 className="h3 md:col-span-6">Add someone</h2>
        <label>
          <span className="label text-sm">Email</span>
          <input name="email" type="email" required className="input min-h-10 py-1" placeholder={`name@${allowedDomain() ?? "kippdc.org"}`} />
        </label>
        <label>
          <span className="label text-sm">Name</span>
          <input name="name" className="input min-h-10 py-1" />
        </label>
        <label>
          <span className="label text-sm">Role</span>
          <select name="role" defaultValue="team" className="input min-h-10 py-1">
            {Object.entries(ROLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label text-sm">Campus (RDLs)</span>
          <select name="campus" className="input min-h-10 py-1">
            <option value="">—</option>
            {campuses.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="label text-sm">Temporary password</span>
          <input name="temp_password" type="text" autoComplete="off" required minLength={MIN_PASSWORD} className="input min-h-10 py-1" placeholder={`${MIN_PASSWORD}+ characters`} />
        </label>
        <button className="btn-small">Add</button>
      </form>
    </div>
  );
}
