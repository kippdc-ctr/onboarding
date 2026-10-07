import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/session";
import { Logo } from "@/components/Logo";
import { AdminLoginForm } from "./AdminLoginForm";

export const dynamic = "force-dynamic";

export default async function AdminLogin() {
  if (await isAdmin()) redirect("/admin");
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-12">
      <Logo />
      <div className="card mt-8">
        <h1 className="h2">CTR team sign-in</h1>
        <p className="mt-2 text-muted">Enter the admin passcode. You&apos;ll stay signed in on this device for 30 days.</p>
        <AdminLoginForm />
      </div>
    </main>
  );
}
