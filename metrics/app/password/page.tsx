import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { MIN_PASSWORD } from "@/lib/password";
import { FullLogo } from "@/components/Logo";
import { Flash } from "@/components/Flash";
import { changePassword, signOut } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

export default async function PasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await currentUser();
  if (!u) redirect("/login");
  const sp = await searchParams;
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-4 py-10">
      <FullLogo className="h-28 w-28" />
      <form action={changePassword} className="card w-full space-y-4">
        <h1 className="h2">{u.must_change_password ? "Choose your password" : "Change password"}</h1>
        {u.must_change_password && <p className="text-muted">You signed in with a temporary password. Choose your own to continue.</p>}
        <Flash error={sp.error} />
        <p className="text-sm text-muted">Signed in as {u.email}</p>
        <label className="block">
          <span className="label">{u.must_change_password ? "Temporary password" : "Current password"}</span>
          <input name="current" type="password" autoComplete="current-password" required className="input" />
        </label>
        <label className="block">
          <span className="label">New password</span>
          <input name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} className="input" />
          <span className="mt-1 block text-sm text-muted">At least {MIN_PASSWORD} characters. A short phrase is easiest to remember.</span>
        </label>
        <label className="block">
          <span className="label">New password again</span>
          <input name="confirm" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} className="input" />
        </label>
        <button type="submit" className="btn-primary w-full">
          Save password
        </button>
      </form>
      <div className="flex gap-4 text-sm">
        {!u.must_change_password && (
          <Link href="/" className="link">
            Back to the scorecard
          </Link>
        )}
        <form action={signOut}>
          <button className="link">Sign out</button>
        </form>
      </div>
    </main>
  );
}
