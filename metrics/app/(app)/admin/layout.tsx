import Link from "next/link";
import { requireUser } from "@/lib/auth";

const NAV = [
  ["/admin/goals", "Goals"],
  ["/admin/users", "Users"],
  ["/admin/calendar", "Calendar"],
  ["/admin/settings", "Settings"],
  ["/admin/years", "School years & data"],
  ["/admin/audit", "Audit log"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireUser("owner");
  return (
    <div className="space-y-6">
      <nav aria-label="Admin" className="flex flex-wrap gap-2">
        {NAV.map(([href, label]) => (
          <Link key={href} href={href} className="rounded-full border-2 border-teal bg-white px-3 py-1 text-sm font-semibold text-teal-ink hover:bg-teal-wash">
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
