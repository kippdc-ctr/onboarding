import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { adminSignOut } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

const NAV = [
  ["/admin", "Completion"],
  ["/admin/roster", "Roster"],
  ["/admin/groups", "Groups"],
  ["/admin/praxis", "Praxis upload"],
  ["/admin/forms/mentor-match", "Mentor Match"],
  ["/admin/settings", "Settings"],
  ["/admin/flags", "Content flags"],
  ["/admin/data", "Data"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="min-h-screen bg-sand">
      <header className="border-b border-gray-brand/30 bg-white">
        <div className="mx-auto flex max-w-[96rem] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/admin">
            <Logo compact />
          </Link>
          <span className="rounded-full bg-teal-ink px-3 py-1 text-sm font-bold text-white">Admin</span>
          <form action={adminSignOut}>
            <button type="submit" className="link text-sm">
              Sign out
            </button>
          </form>
        </div>
        <nav aria-label="Admin" className="mx-auto max-w-[96rem] overflow-x-auto px-4">
          <ul className="flex gap-1 pb-2">
            {NAV.map(([href, label]) => (
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
