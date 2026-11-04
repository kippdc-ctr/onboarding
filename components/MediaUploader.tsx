"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { PreparedUpload } from "@/lib/storage";

export type FileInfo = { name: string; type: string; size: number };
export type UploadInfo = { storagePath: string; publicUrl: string; filename: string; contentType: string; size: number };
export type PrepareFn = (file: FileInfo) => Promise<{ ok: true; upload: PreparedUpload } | { ok: false; error: string }>;
export type FinishFn = (info: UploadInfo) => Promise<{ ok: boolean }>;

/** Asks the server where to put the file, uploads it straight there with progress, then tells the server it arrived. */
export async function uploadFile(
  file: File,
  prepare: PrepareFn,
  finish: FinishFn,
  onProgress: (pct: number) => void,
): Promise<{ ok: true; result: { ok: boolean } & Record<string, unknown> } | { ok: false; error: string }> {
  const prep = await prepare({ name: file.name, type: file.type, size: file.size });
  if (!prep.ok) return prep;
  const u = prep.upload;
  // XMLHttpRequest (not fetch) so we can show upload progress.
  const sent = await new Promise<boolean>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open(u.method, u.uploadUrl);
    for (const [k, v] of Object.entries(u.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((100 * e.loaded) / e.total));
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
  if (!sent) return { ok: false, error: "The upload didn't finish. Check your connection and try again." };
  const fin = await finish({ storagePath: u.storagePath, publicUrl: u.publicUrl, filename: file.name, contentType: u.headers["content-type"], size: file.size });
  if (!fin.ok) return { ok: false, error: "Uploaded, but couldn't attach it here. Try again." };
  return { ok: true, result: fin };
}

/** Uploads one file straight to storage with a progress bar. `prepare` and `finish` are server actions bound to the target. */
export function MediaUploader({
  prepare,
  finish,
  label,
  accept,
  successText,
  onDone,
}: {
  prepare: PrepareFn;
  finish: FinishFn;
  label: string;
  accept: string;
  successText: string;
  /** Called after a successful upload; defaults to refreshing the page. */
  onDone?: (result: { ok: boolean } & Record<string, unknown>) => void;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function upload(file: File) {
    setError(null);
    setDone(false);
    setProgress(0);
    const res = await uploadFile(file, prepare, finish, setProgress);
    setProgress(null);
    if (!res.ok) setError(res.error);
    else {
      setDone(true);
      if (input.current) input.current.value = "";
      if (onDone) onDone(res.result);
      else router.refresh();
    }
  }

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="label">{label}</span>
        <input
          ref={input}
          type="file"
          accept={accept}
          disabled={progress !== null}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          className="block w-full text-base file:mr-3 file:rounded-full file:border-2 file:border-teal file:bg-white file:px-4 file:py-2 file:font-semibold file:text-teal-ink"
        />
      </label>
      {progress !== null && (
        <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress" className="h-3 overflow-hidden rounded-full bg-gray-brand/20">
          <div className="h-full bg-teal-light transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      <p aria-live="polite" className="text-sm">
        {progress !== null && <span className="text-muted">Uploading… {progress}%</span>}
        {done && <span className="font-semibold text-teal-ink">✓ {successText}</span>}
        {error && <span className="font-semibold text-coral-ink">{error}</span>}
      </p>
    </div>
  );
}
