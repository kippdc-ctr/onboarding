"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cls } from "@/lib/ui";

const LINKS: [string, string][] = [
  ["/", "Home"],
  ["/residents", "Residents"],
  ["/observations", "Observations"],
  ["/dashboards/latest", "Latest scores"],
  ["/dashboards/pace", "Pace"],
  ["/dashboards/cfs", "CFS heatmap"],
  ["/dashboards/steps", "Step analytics"],
  ["/dashboards/closeout", "Close-out"],
  ["/onepagers", "One-pagers"],
  ["/library", "Library"],
  ["/settings", "Settings"],
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="mx-auto max-w-7xl overflow-x-auto px-2">
      <ul className="flex gap-1 whitespace-nowrap pb-1 text-sm">
        {LINKS.map(([href, label]) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cls("inline-block rounded-full px-3 py-1.5 font-semibold", active ? "bg-teal-wash text-teal-ink" : "text-muted hover:bg-sand hover:text-ink")}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
