"use client";

export function PrintButton({ label = "Download PDF" }: { label?: string }) {
  return <button type="button" className="btn-primary !min-h-10 !text-base" onClick={() => window.print()}>{label}</button>;
}
