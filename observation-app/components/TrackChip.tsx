import { cls, TRACK_STYLE } from "@/lib/ui";

export function TrackChip({ track, name, tier }: { track: string; name: string; tier?: number }) {
  return (
    <span className={cls("chip", TRACK_STYLE[track] ?? TRACK_STYLE.standard)} title={`${name} track${tier !== undefined ? `, Tier ${tier}` : ""}`}>
      {name}
      {tier !== undefined && <span className="font-semibold opacity-80">· T{tier}</span>}
    </span>
  );
}
