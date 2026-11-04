"use client";

import { useEffect, useState } from "react";

/** Floating "Back to top" button that appears once the reader has scrolled down. */
export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  function toTop() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    // Move keyboard focus to the top too, so screen-reader and keyboard users land in the same place.
    const main = document.getElementById("main");
    if (main) {
      main.setAttribute("tabindex", "-1");
      main.classList.add("outline-none");
      main.focus({ preventScroll: true });
    }
  }
  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Back to top"
      className={`fixed right-4 bottom-4 z-40 flex min-h-12 items-center gap-1 rounded-full border-2 border-teal bg-white px-4 font-semibold text-teal-ink shadow-lg transition-opacity hover:bg-teal-wash print:hidden ${
        show ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      tabIndex={show ? 0 : -1}
    >
      <span aria-hidden>↑</span> Back to top
    </button>
  );
}
