import { formatValue } from "@/lib/status";

export type TrendPoint = { period: string; value: number | null; label: string };

/**
 * Single-series trend across cycles / sprints with a dashed target line. Server-rendered SVG;
 * each point has a native tooltip, and the measurement table below the chart is the table view.
 */
export function TrendChart({ points, target, unit, title }: { points: TrendPoint[]; target: number; unit: "percent" | "count"; title: string }) {
  const W = 640;
  const H = 220;
  const pad = { l: 44, r: 16, t: 16, b: 34 };
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  const max = unit === "percent" ? 100 : Math.max(target, ...values, 1);
  const x = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (points.length - 1));
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const ticks = unit === "percent" ? [0, 25, 50, 75, 100] : [0, Math.round(max / 2), max];
  const drawn = points.map((p, i) => ({ ...p, i })).filter((p) => p.value !== null) as (TrendPoint & { i: number; value: number })[];
  const path = drawn.map((p, k) => `${k ? "L" : "M"}${x(p.i)},${y(p.value)}`).join(" ");

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title}: ${drawn.map((p) => `${p.period} ${p.label}`).join(", ")}. Target ${formatValue(unit, target)}.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#8d8685" strokeOpacity={0.2} />
            <text x={pad.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="12" fill="#5c5655">
              {unit === "percent" ? `${t}%` : t}
            </text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} stroke="#b8312a" strokeWidth={2} strokeDasharray="6 5" />
        <text x={W - pad.r} y={y(target) - 6} textAnchor="end" fontSize="12" fontWeight="700" fill="#b8312a">
          Target {formatValue(unit, target)}
        </text>
        {path && <path d={path} fill="none" stroke="#2c6a74" strokeWidth={2} strokeLinejoin="round" />}
        {drawn.map((p) => (
          <g key={p.period}>
            <circle cx={x(p.i)} cy={y(p.value)} r={14} fill="transparent">
              <title>{`${p.period}: ${p.label}`}</title>
            </circle>
            <circle cx={x(p.i)} cy={y(p.value)} r={5} fill="#2c6a74" stroke="white" strokeWidth={2} pointerEvents="none" />
          </g>
        ))}
        {drawn.length > 0 && (
          <text x={x(drawn.at(-1)!.i)} y={y(drawn.at(-1)!.value) - 12} textAnchor="middle" fontSize="12" fontWeight="700" fill="#1f2a2e">
            {drawn.at(-1)!.label}
          </text>
        )}
        {points.map((p, i) => (
          <text key={p.period} x={x(i)} y={H - 10} textAnchor="middle" fontSize="12" fill="#5c5655">
            {p.period}
          </text>
        ))}
      </svg>
    </figure>
  );
}
