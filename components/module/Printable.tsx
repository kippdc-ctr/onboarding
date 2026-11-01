"use client";

import { useRef } from "react";
import { RichText } from "../RichText";

/** A one-page reference card with a "Print or save as PDF" button that prints just this card. */
export function Printable({ title, intro, items, note }: { title: string; intro?: string; items: string[]; note?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  function print() {
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w || !ref.current) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
      <style>body{font-family:"Nunito Sans",Arial,sans-serif;color:#1f2a2e;margin:40px;line-height:1.5}h2{color:#2c6a74;margin:0 0 12px}
      ul{padding-left:20px}li{margin:4px 0}.muted{color:#5c5655;font-size:13px}</style></head><body>${ref.current.innerHTML}
      <p class="muted">Capital Teaching Residency</p></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }
  return (
    <div className="rounded-2xl border-2 border-teal bg-white p-5">
      <div ref={ref}>
        <h2 className="h3 text-teal-ink">{title}</h2>
        {intro && (
          <p className="mt-2">
            <RichText text={intro} />
          </p>
        )}
        <ul className="mt-3 list-disc space-y-1 pl-6">
          {items.map((it, i) => (
            <li key={i}>
              <RichText text={it} />
            </li>
          ))}
        </ul>
        {note && <p className="muted mt-3 text-sm text-muted">{note}</p>}
      </div>
      <button type="button" className="btn-small mt-4" onClick={print}>
        Print or save as PDF
      </button>
    </div>
  );
}
