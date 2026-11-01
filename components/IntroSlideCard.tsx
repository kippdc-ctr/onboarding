/* eslint-disable @next/next/no-img-element */

export type SlideData = {
  name: string;
  persona: string;
  college: string;
  hometown: string;
  oneThing: string;
  whyDc: string;
  headshot?: string;
  gradeBand?: string;
  cohortYear: number;
};

/** The intro slide shared during onboarding week. Used in the live preview and the admin slide gallery. */
export function IntroSlideCard({ d }: { d: SlideData }) {
  const dots = ["bg-coral", "bg-teal-light", "bg-yellow", "bg-teal"];
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-gray-brand/30 bg-white shadow-sm @container">
      <div className="flex h-full gap-[4%] p-[4%]">
        <div className="relative w-[34%] shrink-0">
          <div className="aspect-[4/5] w-full overflow-hidden rounded-xl bg-sand ring-4 ring-teal-light">
            {d.headshot ? (
              <img src={d.headshot} alt={`Headshot of ${d.name || "the resident"}`} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full items-center justify-center p-2 text-center text-[3cqw] text-muted">Your headshot</span>
            )}
          </div>
          {d.gradeBand && (
            <figure className="absolute -bottom-[6%] -right-[22%] w-[62%] rotate-6 bg-white p-[4%] pb-[10%] shadow-lg">
              <img src={d.gradeBand} alt="In the grade band" className="aspect-square w-full object-cover" />
              <figcaption className="mt-[4%] text-center text-[2cqw] text-muted">Future me, grade band</figcaption>
            </figure>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-[2.5%] pl-[4%] text-[2.6cqw] leading-snug">
          <div className="flex gap-[1.5%]" aria-hidden="true">
            {dots.map((c) => (
              <span key={c} className={`h-[2.2cqw] w-[2.2cqw] rounded-full ${c}`} />
            ))}
          </div>
          <p className="text-[2.1cqw] font-semibold uppercase tracking-wide text-muted">Capital Teaching Residency · {d.cohortYear} cohort</p>
          <p className="text-[5cqw] font-bold leading-tight text-teal-ink">{d.name || "Your name"}</p>
          <p>
            <strong>My teacher persona:</strong> {d.persona || "pending quiz"}
          </p>
          <p>
            <strong>College:</strong> {d.college || "…"} · <strong>Hometown:</strong> {d.hometown || "…"}
          </p>
          <p>
            <strong>One thing to know:</strong> {d.oneThing || "…"}
          </p>
          <p>
            <strong>Why DC:</strong> {d.whyDc || "…"}
          </p>
        </div>
      </div>
    </div>
  );
}
