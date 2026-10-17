"use client";

import { useState } from "react";

/** Copies the email as rich text (keeps the colored callouts when pasted into Gmail), with plain text as a fallback. */
export function CopyEmail({ html, text, subject, to }: { html: string; text: string; subject: string; to: string }) {
  const [msg, setMsg] = useState("");
  const copy = async () => {
    try {
      if ("ClipboardItem" in window) {
        await navigator.clipboard.write([
          new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setMsg("Copied. Paste it into the body of a new Gmail message.");
    } catch {
      setMsg("Your browser blocked copying. Select the preview below and copy it by hand.");
    }
  };
  const copySubject = async () => {
    try {
      await navigator.clipboard.writeText(subject);
      setMsg("Subject copied.");
    } catch {}
  };
  // mailto bodies are plain text and some mail apps cut them off, so the button opens a message with the subject
  // and a short body; paste the copied rich email into it.
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn-primary !min-h-10 !text-base" onClick={copy}>Copy email</button>
      <a className="btn-small" href={mailto}>Open in mail</a>
      <button type="button" className="btn-small" onClick={copySubject}>Copy subject</button>
      <span role="status" className="text-sm font-semibold text-teal-ink">{msg}</span>
    </div>
  );
}
