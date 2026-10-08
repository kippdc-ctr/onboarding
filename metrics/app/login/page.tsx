import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { allowedDomain, currentUser, devLoginEnabled, ROLE_LABEL, Role } from "@/lib/auth";
import { googleConfigured } from "@/lib/google";
import { FullLogo } from "@/components/Logo";
import { Flash } from "@/components/Flash";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await currentUser()) redirect("/");
  const sp = await searchParams;
  const dev = devLoginEnabled();
  const users = dev ? await sql<{ email: string; role: Role; campus: string | null }[]>`select email, role, campus from metrics.app_users where active order by role, email` : [];
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-4 py-10">
      <FullLogo className="h-40 w-40" />
      <div className="card w-full space-y-4 text-center">
        <h1 className="h2">Program Metrics Hub</h1>
        <Flash error={sp.error} />
        {googleConfigured() ? (
          <a href="/auth/google" className="btn-primary w-full">
            Sign in with Google
          </a>
        ) : (
          <p className="text-muted">Google sign-in isn&apos;t set up yet (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).</p>
        )}
        <p className="text-sm text-muted">Use your @{allowedDomain()} account. Access is limited to people Ashley has added.</p>
      </div>
      {dev && (
        <form action="/auth/dev" method="post" className="card w-full space-y-3">
          <h2 className="h3">Local development sign-in</h2>
          <p className="text-sm text-muted">Only available when DEV_LOGIN=true and not on Vercel.</p>
          <select name="email" className="input">
            {users.map((u) => (
              <option key={u.email} value={u.email}>
                {u.email} ({ROLE_LABEL[u.role]}{u.campus ? `, ${u.campus}` : ""})
              </option>
            ))}
          </select>
          <button className="btn-small" type="submit">
            Sign in
          </button>
        </form>
      )}
    </main>
  );
}
