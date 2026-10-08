import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { FullLogo } from "@/components/Logo";
import { Flash } from "@/components/Flash";
import { signIn } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await currentUser()) redirect("/");
  const sp = await searchParams;
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-4 py-10">
      <FullLogo className="h-40 w-40" />
      <form action={signIn} className="card w-full space-y-4">
        <h1 className="h2 text-center">Program Metrics Hub</h1>
        <Flash error={sp.error} ok={sp.ok} />
        <label className="block">
          <span className="label">Email</span>
          <input name="email" type="email" autoComplete="username" required defaultValue={sp.email ?? ""} className="input" />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input name="password" type="password" autoComplete="current-password" required className="input" />
        </label>
        <button type="submit" className="btn-primary w-full">
          Sign in
        </button>
        <p className="text-center text-sm text-muted">Access is limited to people Ashley has added. Forgot your password? Ask Ashley to reset it.</p>
      </form>
    </main>
  );
}
