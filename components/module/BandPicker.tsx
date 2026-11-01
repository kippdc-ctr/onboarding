"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveActivity } from "@/app/actions/resident";
import { BAND_LABEL, BANDS, type Band, type BandSource } from "@/lib/bands";

export function BandPicker({ moduleSlug, activityId, band, source }: { moduleSlug: string; activityId: string; band: Band | null; source: BandSource | null }) {
  const [value, setValue] = useState<string>(band ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const router = useRouter();

  if (source === "about-you" && band) {
    return (
      <div className="rounded-2xl border-2 border-teal bg-teal-wash p-4">
        <p className="text-lg">
          <strong>Your track:</strong> {BAND_LABEL[band]}
        </p>
        <p className="text-sm text-muted">From the track you chose in About You (Section 2). If it isn&apos;t right, contact the CTR team.</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border-2 border-yellow bg-yellow-wash p-4">
      <label htmlFor="band-pick" className="label text-lg">
        Your track
      </label>
      <p className="mb-2 text-sm text-muted">
        {band
          ? source === "roster"
            ? "Filled in from the CTR roster. Change it if it isn't right, or finish About You in Section 2."
            : "You chose this here. Finishing About You in Section 2 will set it for you."
          : "Choose your certification track to see your grade-band branch. You can also set it in About You (Section 2)."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <select id="band-pick" className="input max-w-xs" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Choose…</option>
          {BANDS.map((x) => (
            <option key={x} value={x}>
              {BAND_LABEL[x]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-small"
          disabled={!value || value === band || pending}
          onClick={() =>
            start(async () => {
              const res = await saveActivity(moduleSlug, activityId, { answers: { band: value } });
              if (res.ok) router.refresh();
              else setError(true);
            })
          }
        >
          {pending ? "Saving…" : "Show my branch"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-coral-ink">That didn&apos;t save. Please try again.</p>}
    </div>
  );
}
