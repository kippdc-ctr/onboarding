"use client";

import { useRef, useState, useTransition } from "react";
import { finishPhotoUpload, preparePhotoUpload, removePhoto, saveActivity } from "@/app/actions/resident";
import type { WorksheetField } from "@/lib/content";
import { IntroSlideCard } from "../IntroSlideCard";
import { MediaUploader } from "../MediaUploader";
import { useModuleProgress } from "./ProgressContext";
import { WorksheetInput } from "./Worksheet";

type Photo = { id: string; label: string; help?: string; optional?: boolean };

export function IntroSlide({
  moduleSlug,
  activityId,
  fields,
  photos,
  initial,
  initialPhotos,
  defaults,
  cohortYear,
}: {
  moduleSlug: string;
  activityId: string;
  fields: WorksheetField[];
  photos: Photo[];
  initial: Record<string, string>;
  initialPhotos: Record<string, string>;
  /** Prefills (resident name, persona from the quiz) shown until the resident types their own. */
  defaults: Record<string, string>;
  cohortYear: number;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  const [pics, setPics] = useState<Record<string, string>>(initialPhotos);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(Object.keys(initial).length ? "saved" : "idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, start] = useTransition();
  const { report } = useModuleProgress();
  const value = (id: string) => answers[id] || defaults[id] || "";

  function onChange(id: string, v: string) {
    const next = { ...answers, [id]: v };
    setAnswers(next);
    setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setStatus("saving");
      try {
        const res = await saveActivity(moduleSlug, activityId, { answers: next });
        if (!res.ok) throw new Error();
        setStatus("saved");
        report(`act:${activityId}`, res.complete);
      } catch {
        setStatus("error");
      }
    }, 1000);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-4 rounded-2xl border-2 border-yellow bg-yellow-wash p-4">
        {fields.map((f) => (
          <WorksheetInput key={f.id} idPrefix={activityId} field={f} value={value(f.id)} onChange={(v) => onChange(f.id, v)} />
        ))}
        {photos.map((p) => (
          <div key={p.id} className="rounded-xl bg-white p-3">
            <p className="label">
              {p.label} {p.optional ? <span className="font-normal text-muted">(optional)</span> : <span className="font-normal text-muted">(required)</span>}
            </p>
            {p.help && <p className="mb-2 text-sm text-muted">{p.help}</p>}
            {pics[p.id] && (
              <div className="mb-2 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pics[p.id]} alt={p.label} className="h-20 w-20 rounded-lg object-cover" />
                <button
                  type="button"
                  className="link text-sm"
                  onClick={() =>
                    start(async () => {
                      const res = await removePhoto(moduleSlug, activityId, p.id);
                      if (res.ok) {
                        setPics((x) => {
                          const n = { ...x };
                          delete n[p.id];
                          return n;
                        });
                        report(`act:${activityId}`, !!res.complete);
                      }
                    })
                  }
                >
                  Remove photo
                </button>
              </div>
            )}
            <MediaUploader
              prepare={preparePhotoUpload.bind(null, moduleSlug, activityId, p.id)}
              finish={finishPhotoUpload.bind(null, moduleSlug, activityId, p.id)}
              label={pics[p.id] ? "Replace photo (.jpg, .png, .webp; up to 10 MB)" : "Choose a photo (.jpg, .png, .webp; up to 10 MB)"}
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              successText="Photo added to your slide."
              onDone={(r) => {
                if (typeof r.url === "string") setPics((x) => ({ ...x, [p.id]: r.url as string }));
                report(`act:${activityId}`, !!r.complete);
              }}
            />
          </div>
        ))}
        <p className="text-sm" aria-live="polite">
          {status === "saving" && <span className="text-muted">Saving…</span>}
          {status === "saved" && <span className="font-semibold text-teal-ink">✓ Saved under your name</span>}
          {status === "error" && <span className="font-semibold text-coral-ink">Couldn&apos;t save. Please try again.</span>}
        </p>
      </div>
      <div>
        <p className="label">Your slide preview</p>
        <IntroSlideCard
          d={{
            name: value("name"),
            persona: value("persona"),
            college: value("college"),
            hometown: value("hometown"),
            oneThing: value("one_thing"),
            whyDc: value("why_dc"),
            headshot: pics.headshot,
            gradeBand: pics.grade_band,
            cohortYear,
          }}
        />
      </div>
    </div>
  );
}
