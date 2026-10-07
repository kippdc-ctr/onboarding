import { videoEmbed } from "@/lib/embed";
import { LinkButton } from "./LinkButton";

/** Plays a video inside the page when the link is YouTube, Vimeo, Google Drive, or a video file; otherwise a button. */
export function VideoPlayer({ url, title, captionsUrl }: { url: string | null | undefined; title: string; captionsUrl?: string | null }) {
  const e = videoEmbed(url);
  if (!e) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <LinkButton href={url} label={title} kind="video" />
        {captionsUrl && <LinkButton href={captionsUrl} label="Captions / transcript" variant="small" />}
      </div>
    );
  }
  return (
    <figure className="space-y-2">
      <figcaption className="font-semibold">{title}</figcaption>
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-ink">
        {e.kind === "iframe" ? (
          <iframe
            src={e.src}
            title={title}
            className="absolute inset-0 h-full w-full"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <video src={e.src} controls preload="metadata" className="absolute inset-0 h-full w-full" />
        )}
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <a href={url!} target="_blank" rel="noopener noreferrer" className="link">
          Open video in a new tab ↗
        </a>
        {captionsUrl ? (
          <a href={captionsUrl} target="_blank" rel="noopener noreferrer" className="link">
            Captions / transcript ↗
          </a>
        ) : (
          e.kind === "iframe" && e.provider !== "Google Drive" && <span className="text-muted">Turn on captions with the CC button in the player.</span>
        )}
      </p>
    </figure>
  );
}

/** Section narration with an optional transcript. */
export function AudioPlayer({ url, transcript, label = "Listen to this section" }: { url: string; transcript?: string | null; label?: string }) {
  return (
    <div className="rounded-2xl border-2 border-teal-light bg-teal-wash p-3">
      <p className="mb-2 font-semibold">🎧 {label}</p>
      <audio controls preload="none" src={url} className="w-full">
        Your browser can&apos;t play this audio. <a href={url}>Download it</a>.
      </audio>
      {transcript?.trim() && (
        <details className="mt-2">
          <summary className="link cursor-pointer text-sm">Read the transcript</summary>
          <p className="mt-2 whitespace-pre-wrap">{transcript}</p>
        </details>
      )}
    </div>
  );
}
