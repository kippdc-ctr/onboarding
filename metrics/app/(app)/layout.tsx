import Link from "next/link";
import { requireUser, ROLE_LABEL, can } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { signOut } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const nav: [string, string][] = [["/", "Scorecard"]];
  if (can.viewRoster(u)) nav.push(["/residents", u.role === "rdl" ? `${u.campus} residents` : "Residents"]);
  nav.push(["/health", "Data health"]);
  if (can.runImports(u)) nav.push(["/import", "Import"]);
  if (u.role === "owner") nav.push(["/admin", "Admin"]);
  return (
    <div className="min-h-screen bg-sand">
      <header className="border-b border-gray-brand/30 bg-white">
        <div className="mx-auto flex max-w-[96rem] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">
              {u.name || u.email} · <span className="font-semibold text-ink">{ROLE_LABEL[u.role]}</span>
            </span>
            <Link href="/password" className="link text-sm">
              Change password
            </Link>
            <form action={signOut}>
              <button type="submit" className="link text-sm">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <nav aria-label="Main" className="mx-auto max-w-[96rem] overflow-x-auto px-4">
          <ul className="flex gap-1 pb-2">
            {nav.map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="block whitespace-nowrap rounded-full px-3 py-1.5 font-semibold text-teal-ink hover:bg-teal-wash">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-[96rem] px-4 py-6">
        {children}
      </main>
    </div>
  );
}
