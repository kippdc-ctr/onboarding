"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/** After a save, bring the edited item back into view, highlight it, and show the result as a toast. */
export function ScrollToSaved() {
  const params = useSearchParams();
  const stamp = params.get("t");
  const ok = params.get("ok");
  const error = params.get("error");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!stamp) return;
    setVisible(true);
    const id = decodeURIComponent(window.location.hash.slice(1));
    const el = id ? document.getElementById(id) : null;
    if (el) {
      el.scrollIntoView({ block: "center" });
      el.classList.add("ring-4", error ? "ring-coral" : "ring-teal-light");
    }
    const t = setTimeout(() => {
      el?.classList.remove("ring-4", "ring-coral", "ring-teal-light");
      if (!error) setVisible(false);
    }, 3000);
    return () => clearTimeout(t);
  }, [stamp, error]);

  if (!visible || (!ok && !error)) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={`fixed bottom-4 left-1/2 z-50 flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-full px-5 py-3 font-semibold shadow-lg ${
        error ? "bg-coral-ink text-white" : "bg-teal-ink text-white"
      }`}
    >
      {error ? `⚠ ${error}` : `✓ ${ok}`}
      {error && (
        <button type="button" className="underline" onClick={() => setVisible(false)}>
          Dismiss
        </button>
      )}
    </div>
  );
}
