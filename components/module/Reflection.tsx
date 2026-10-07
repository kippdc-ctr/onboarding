"use client";

import { useEffect, useRef, useState } from "react";
import { saveReflection } from "@/app/actions/resident";
import { useModuleProgress } from "./ProgressContext";

export function Reflection({ moduleSlug, promptId, prompt, initial, rows = 6 }: { moduleSlug: string; promptId: string; prompt: string; initial: string; rows?: number }) {
  const [text, setText] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(initial ? "saved" : "idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(text);
  const { report } = useModuleProgress();
  const id = `refl-${promptId}`;

  async function save(value: string) {
    setStatus("saving");
    try {
      const res = await saveReflection(moduleSlug, promptId, value);
      if (!res.ok) throw new Error();
      if (latest.current === value) {
        setStatus("saved");
        setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
        report(`refl:${promptId}`, value.trim().length > 0);
      }
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function onChange(v: string) {
    setText(v);
    latest.current = v;
    setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(v), 1200);
  }

  return (
    <div className="rounded-2xl border-2 border-yellow bg-yellow-wash p-4">
      <label htmlFor={id} className="label text-lg">
        Reflect: {prompt}
      </label>
      <textarea
        id={id}
        className="input mt-2 min-h-32"
        rows={rows}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (status === "idle" && timer.current) {
            clearTimeout(timer.current);
            save(latest.current);
          }
        }}
      />
      <p className="mt-2 text-sm" aria-live="polite">
        {status === "saving" && <span className="text-muted">Saving…</span>}
        {status === "saved" && <span className="font-semibold text-teal-ink">✓ Saved{savedAt ? ` at ${savedAt}` : ""}</span>}
        {status === "error" && <span className="font-semibold text-coral-ink">Couldn&apos;t save. Check your connection; we&apos;ll try again when you type.</span>}
        {status === "idle" && text !== initial && <span className="text-muted">Unsaved changes…</span>}
      </p>
    </div>
  );
}
