"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeModule } from "@/app/actions/resident";
import { useModuleProgress } from "./ProgressContext";

export function CompleteButton({ moduleSlug, completed }: { moduleSlug: string; completed: boolean }) {
  const { reqs } = useModuleProgress();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [missing, setMissing] = useState<string[]>([]);
  const remaining = reqs.filter((r) => !r.done);

  if (completed) {
    return (
      <div className="card border-teal bg-teal-wash text-center">
        <p className="text-xl font-bold text-teal-ink">✓ You completed this module.</p>
        <p className="mt-1">You can come back any time to review or retake the knowledge check.</p>
      </div>
    );
  }

  return (
    <div className="card text-center">
      {remaining.length > 0 ? (
        <>
          <p className="font-semibold">Still to do before you can mark this module complete:</p>
          <ul className="mx-auto mt-2 max-w-md list-disc text-left">
            {remaining.map((r) => (
              <li key={r.key}>{r.label}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="font-semibold text-teal-ink">Everything is done. Nice work!</p>
      )}
      <button
        type="button"
        className="btn-primary mt-4"
        disabled={remaining.length > 0 || pending}
        onClick={() =>
          start(async () => {
            const res = await completeModule(moduleSlug);
            if (res.ok) router.push("/home");
            else setMissing(res.missing);
          })
        }
      >
        {pending ? "Saving…" : "Mark module complete"}
      </button>
      {missing.length > 0 && (
        <p role="alert" className="mt-2 text-coral-ink">
          Not quite yet: {missing.join("; ")}
        </p>
      )}
    </div>
  );
}
