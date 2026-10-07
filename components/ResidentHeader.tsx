import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { Logo } from "./Logo";

export function ResidentHeader({ name }: { name?: string }) {
  return (
    <header className="border-b border-gray-brand/30 bg-white">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Link href={name ? "/home" : "/"} aria-label="Capital Teaching Residency home">
          <Logo compact />
        </Link>
        {name && (
          <form action={signOut} className="flex items-center gap-2 text-sm">
            <span className="text-muted">
              Signed in as <strong className="text-ink">{name}</strong>
            </span>
            <button type="submit" className="link text-sm">
              Not you? Switch name
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
