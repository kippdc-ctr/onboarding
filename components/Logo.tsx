/* eslint-disable @next/next/no-img-element */

/** Header logo: the CTR circles plus the wordmark. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <img src="/brand/ctr-circles.png" alt="" width={107} height={32} className="h-8 w-auto" />
      <span className="flex flex-col leading-tight">
        <span className="font-bold text-teal-ink">Capital Teaching Residency</span>
        {!compact && <span className="hidden text-sm text-muted sm:block">Building the next generation of excellent teachers.</span>}
      </span>
    </span>
  );
}

/** Full square CTR logo, used on the landing page. */
export function FullLogo({ className = "" }: { className?: string }) {
  return <img src="/brand/ctr-logo.png" alt="Capital Teaching Residency" width={480} height={480} className={className} />;
}
