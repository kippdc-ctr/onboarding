"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { finishAudioUpload, prepareAudioUpload } from "@/app/actions/content";

export function AudioUploader({ slug, sectionId, hasAudio }: { slug: string; sectionId: string; hasAudio: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function upload(file: File) {
    setError(null);
    setDone(false);
    setProgress(0);
    const prep = await prepareAudioUpload(slug, sectionId, { name: file.name, type: file.type, size: file.size });
    if (!prep.ok) {
      setError(prep.error);
      setProgress(null);
      return;
    }
    const u = prep.upload;
    // XMLHttpRequest (not fetch) so we can show upload progress.
    const ok = await new Promise<boolean>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open(u.method, u.uploadUrl);
      for (const [k, v] of Object.entries(u.headers)) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((100 * e.loaded) / e.total));
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false);
      xhr.send(file);
    });
    if (!ok) {
      setError("The upload didn't finish. Check your connection and try again.");
      setProgress(null);
      return;
    }
    const fin = await finishAudioUpload(slug, sectionId, {
      storagePath: u.storagePath,
      publicUrl: u.publicUrl,
      filename: file.name,
      contentType: u.headers["content-type"],
      size: file.size,
    });
    setProgress(null);
    if (!fin.ok) setError("Uploaded, but couldn't attach it to this section. Try again.");
    else {
      setDone(true);
      if (input.current) input.current.value = "";
      router.refresh();
    }
  }

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="label">{hasAudio ? "Replace with a new audio file" : "Upload an audio file"} (.mp3, .m4a, .wav; up to 50 MB)</span>
        <input
          ref={input}
          type="file"
          accept=".mp3,.m4a,.wav,.ogg,.aac,audio/*"
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
        {done && <span className="font-semibold text-teal-ink">✓ Uploaded. Residents can listen now.</span>}
        {error && <span className="font-semibold text-coral-ink">{error}</span>}
      </p>
    </div>
  );
}
