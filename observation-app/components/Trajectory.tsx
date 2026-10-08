import type { Cycle, Indicator } from "@/lib/rules";

type Point = { date: string; score: number; early: boolean };
type Mark = { date: string; label: string };

const W = 640;
const H = 74;
const PAD_L = 8;
const PAD_R = 8;

function x(date: string, start: number, end: number) {
  const t = Date.parse(date + "T12:00:00Z");
  return PAD_L + ((t - start) / Math.max(1, end - start)) * (W - PAD_L - PAD_R);
}
function y(score: number) {
  return 8 + (4 - score) * ((H - 16) / 3);
}

/** Small multiples: one row per indicator, scores over time, cycle bands behind, action steps marked as triangles. */
export function Trajectory({ cycles, indicators, points, marks }: { cycles: Cycle[]; indicators: Indicator[]; points: Record<string, Point[]>; marks: Record<string, Mark[]> }) {
  const sorted = [...cycles].sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (!sorted.length) return null;
  const start = Date.parse(sorted[0].start_date + "T00:00:00Z");
  const end = Date.parse(sorted[sorted.length - 1].end_date + "T23:59:59Z");
  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${W} 18`} className="w-full" aria-hidden>
        {sorted.map((c) => (
          <text key={c.number} x={(x(c.start_date, start, end) + x(c.end_date, start, end)) / 2} y={13} textAnchor="middle" fontSize={11} fill="#5C5655">C{c.number}</text>
        ))}
      </svg>
      {indicators.map((ind) => {
        const pts = points[ind.code] ?? [];
        const mk = marks[ind.code] ?? [];
        return (
          <figure key={ind.code} className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
            <figcaption className="text-xs font-semibold" title={ind.name}>{ind.code}<span className="block font-normal text-muted">{ind.short_label}</span></figcaption>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded bg-white" role="img"
              aria-label={`${ind.code}: ${pts.length ? pts.map((p) => `${p.date} ${p.score}${p.early ? " early" : ""}`).join(", ") : "no scores"}${mk.length ? `. Action steps on ${mk.map((m) => m.date).join(", ")}` : ""}`}>
              {sorted.map((c, i) => (
                <rect key={c.number} x={x(c.start_date, start, end)} y={0} width={Math.max(0, x(c.end_date, start, end) - x(c.start_date, start, end))} height={H} fill={i % 2 ? "#F3F1EF" : "#FAF8F6"} />
              ))}
              {[1, 2, 3, 4].map((s) => (
                <g key={s}>
                  <line x1={PAD_L} x2={W - PAD_R} y1={y(s)} y2={y(s)} stroke={s === 3 ? "#8D8685" : "#E4E1DF"} strokeDasharray={s === 3 ? "4 3" : undefined} strokeWidth={1} />
                  <text x={W - 2} y={y(s) + 3} fontSize={8} textAnchor="end" fill="#8D8685">{s}</text>
                </g>
              ))}
              {pts.length > 1 && (
                <polyline fill="none" stroke="#2C6A74" strokeWidth={2} points={pts.filter((p) => !p.early).map((p) => `${x(p.date, start, end)},${y(p.score)}`).join(" ")} />
              )}
              {pts.map((p, i) => (
                <circle key={i} cx={x(p.date, start, end)} cy={y(p.score)} r={4} fill={p.early ? "white" : "#2C6A74"} stroke="#2C6A74" strokeWidth={1.5}>
                  <title>{`${p.date}: ${p.score}${p.early ? " (early / practice)" : ""}`}</title>
                </circle>
              ))}
              {mk.map((m, i) => {
                const cx = x(m.date, start, end);
                return (
                  <path key={i} d={`M${cx - 5},${H - 1} L${cx + 5},${H - 1} L${cx},${H - 9} Z`} fill="#ED4D44">
                    <title>{`Action step ${m.date}: ${m.label}`}</title>
                  </path>
                );
              })}
            </svg>
          </figure>
        );
      })}
      <p className="text-xs text-muted">Filled dot = counted score, open dot = early / practice. Red triangle = action step assigned on that indicator. Dashed line = 3 (meets).</p>
    </div>
  );
}
