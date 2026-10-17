export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <p role={error ? "alert" : "status"} className={`mb-4 rounded-xl border-2 p-3 font-semibold ${error ? "border-coral bg-coral-wash text-coral-ink" : "border-teal bg-teal-wash text-teal-ink"}`}>
      {error ?? ok}
    </p>
  );
}
