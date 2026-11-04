"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FinishFn, PrepareFn, uploadFile } from "./MediaUploader";

// Prefer .m4a (plays everywhere, including iPhones); fall back to .webm where that's all the browser can record.
const FORMATS = [
  { mime: "audio/mp4;codecs=mp4a.40.2", ext: "m4a" },
  { mime: "audio/mp4", ext: "m4a" },
  { mime: "audio/webm;codecs=opus", ext: "webm" },
  { mime: "audio/webm", ext: "webm" },
];

type Phase = "idle" | "recording" | "review" | "saving";

function clock(sec: number) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** Record narration in the browser, listen back, then save it (uploads like any other audio file). */
export function AudioRecorder({ prepare, finish, hasAudio }: { prepare: PrepareFn; finish: FinishFn; hasAudio?: boolean }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [progress, setProgress] = useState(0);
  const [take, setTake] = useState<{ blob: Blob; url: string; ext: string } | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    rec.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);
  useEffect(() => () => { if (take) URL.revokeObjectURL(take.url); }, [take]);

  async function start() {
    setError(null);
    setSaved(false);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't record audio. Try Chrome, Edge, or Safari, or upload a file instead.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError("The microphone is blocked. Click the lock or camera icon in the address bar, allow the microphone, and try again.");
      return;
    }
    const fmt = FORMATS.find((f) => MediaRecorder.isTypeSupported(f.mime)) ?? { mime: "", ext: "webm" };
    const r = new MediaRecorder(stream, fmt.mime ? { mimeType: fmt.mime, audioBitsPerSecond: 96_000 } : undefined);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: (r.mimeType || fmt.mime || "audio/webm").split(";")[0] });
      const ext = blob.type.includes("mp4") ? "m4a" : "webm";
      setTake({ blob, url: URL.createObjectURL(blob), ext });
      setPhase("review");
    };
    rec.current = r;
    r.start(1000);
    setSeconds(0);
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    setPhase("recording");
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    rec.current?.stop();
  }

  async function save() {
    if (!take) return;
    setPhase("saving");
    setProgress(0);
    const file = new File([take.blob], `recording.${take.ext}`, { type: take.blob.type });
    const res = await uploadFile(file, prepare, finish, setProgress);
    if (!res.ok) {
      setError(res.error);
      setPhase("review");
      return;
    }
    setTake(null);
    setPhase("idle");
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {phase === "idle" && (
        <button type="button" onClick={start} className="btn-small">
          🎙 {hasAudio ? "Record again" : "Record"}
        </button>
      )}
      {phase === "recording" && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 font-semibold text-coral-ink" aria-live="polite">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-coral" aria-hidden /> Recording {clock(seconds)}
          </span>
          <button type="button" onClick={stop} className="btn-small">
            ■ Stop
          </button>
        </div>
      )}
      {(phase === "review" || phase === "saving") && take && (
        <div className="space-y-2 rounded-lg bg-sand p-2">
          <p className="text-sm font-semibold">Listen back, then save or try again.</p>
          <audio controls src={take.url} className="w-full" />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={save} disabled={phase === "saving"} className="btn-small">
              {phase === "saving" ? `Saving… ${progress}%` : "Save recording"}
            </button>
            <button type="button" onClick={() => { setTake(null); setPhase("idle"); }} disabled={phase === "saving"} className="link text-sm">
              Discard
            </button>
          </div>
        </div>
      )}
      <p aria-live="polite" className="text-sm">
        {saved && <span className="font-semibold text-teal-ink">✓ Saved. Residents can listen now.</span>}
        {error && <span className="font-semibold text-coral-ink">{error}</span>}
      </p>
    </div>
  );
}
