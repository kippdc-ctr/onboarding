import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { switchObserver } from "@/app/actions/access";
import { Logo } from "@/components/Logo";
import { NavLinks } from "@/components/NavLinks";
import { OfflineQueue } from "@/components/OfflineQueue";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-30 border-b border-gray-brand/30 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
          <Link href="/" className="shrink-0" aria-label="Home">
            <Logo compact />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/observe" className="btn-primary !min-h-10 !px-4 !text-base">+ Observe</Link>
            <form action={switchObserver}>
              <button className="chip border-gray-brand/50 bg-white text-ink" title="Switch user">
                {me.name} <span aria-hidden>⇄</span><span className="sr-only">switch user</span>
              </button>
            </form>
          </div>
        </div>
        <NavLinks />
      </header>
      <OfflineQueue />
      <main id="main" className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
