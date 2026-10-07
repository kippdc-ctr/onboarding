/** Placeholder until the CTR logo file arrives: four brand circles plus the wordmark. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <span className="inline-flex -space-x-1.5" aria-hidden="true">
        <span className="h-5 w-5 rounded-full bg-coral" />
        <span className="h-5 w-5 rounded-full bg-teal-light" />
        <span className="h-5 w-5 rounded-full bg-yellow" />
        <span className="h-5 w-5 rounded-full bg-teal" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-bold text-teal-ink">Capital Teaching Residency</span>
        {!compact && <span className="hidden text-sm text-muted sm:block">Building the next generation of excellent teachers.</span>}
      </span>
    </span>
  );
}
