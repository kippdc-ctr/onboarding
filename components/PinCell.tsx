"use client";

import { useState } from "react";

/** PIN is rendered server-side for admins only, hidden until clicked so it isn't shoulder-surfed. */
export function PinCell({ pin }: { pin: string | null }) {
  const [show, setShow] = useState(false);
  if (!pin) return <span className="text-muted">Not set</span>;
  return (
    <button type="button" className="font-mono font-bold text-teal-ink underline decoration-dotted" onClick={() => setShow((s) => !s)}>
      {show ? pin : "••••"}
      <span className="sr-only">{show ? " (click to hide)" : " (click to show PIN)"}</span>
    </button>
  );
}
