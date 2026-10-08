"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { flushQueue, readQueue } from "@/lib/draft";

/** Shows queued (offline) submissions and sends them when the connection comes back. */
export function OfflineQueue() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ name: string; error: string }[]>([]);

  useEffect(() => {
    const refresh = () => setCount(readQueue().length);
    const flush = async () => {
      if (!navigator.onLine || !readQueue().length) return refresh();
      const r = await flushQueue();
      refresh();
      setFailed(r.failed);
      if (r.sent) {
        setMsg(`${r.sent} saved observation${r.sent > 1 ? "s" : ""} sent.`);
        router.refresh();
      }
    };
    const on = () => { setOnline(true); flush(); };
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    flush();
    const t = setInterval(flush, 30_000);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("obs-queue", refresh);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("obs-queue", refresh);
    };
  }, [router]);

  if (!count && online && !msg && !failed.length) return null;
  return (
    <div className="no-print mx-auto max-w-7xl px-4 pt-3" role="status">
      {!online && <p className="rounded-xl border-2 border-yellow bg-yellow-wash p-2 text-sm font-semibold">You're offline. Drafts save on this device; submissions send when you reconnect.</p>}
      {count > 0 && (
        <p className="mt-2 rounded-xl border-2 border-teal bg-teal-wash p-2 text-sm font-semibold text-teal-ink">
          {count} observation{count > 1 ? "s" : ""} waiting to send.{" "}
          {online && <button className="link" onClick={() => flushQueue().then(() => { setCount(readQueue().length); router.refresh(); })}>Send now</button>}
        </p>
      )}
      {failed.map((f, i) => (
        <p key={i} role="alert" className="mt-2 rounded-xl border-2 border-coral bg-coral-wash p-2 text-sm font-semibold text-coral-ink">
          Couldn't send the observation for {f.name}: {f.error} It is still saved on this device; open Home → Drafts to fix it.
        </p>
      ))}
      {msg && <p className="mt-2 text-sm font-semibold text-teal-ink">{msg}</p>}
    </div>
  );
}
