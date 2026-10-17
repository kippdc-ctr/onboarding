import type { MissingSetting } from "@/lib/setup";
import { Logo } from "./Logo";

export function SetupNeeded({ missing }: { missing: MissingSetting[] }) {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-10">
      <Logo />
      <div className="card mt-8 space-y-4">
        <h1 className="h2">Almost there: setup isn&apos;t finished</h1>
        <p>The app is running, but these settings are missing in Vercel:</p>
        <ul className="space-y-2">
          {missing.map((m) => (
            <li key={m.name} className="rounded-xl border-2 border-coral bg-coral-wash p-3">
              <code className="font-bold">{m.name}</code>
              <p className="text-sm">{m.why}</p>
            </li>
          ))}
        </ul>
        <ol className="list-decimal space-y-1 pl-6">
          <li>In Vercel, open this project → Settings → Environment Variables.</li>
          <li>Add each one above for <strong>Production</strong> and <strong>Preview</strong>.</li>
          <li>Go to Deployments, open the ⋯ menu on the latest one, and choose <strong>Redeploy</strong>. (New settings only apply after a redeploy.)</li>
        </ol>
      </div>
    </main>
  );
}
