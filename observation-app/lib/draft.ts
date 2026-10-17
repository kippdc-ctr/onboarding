// Client-safe types and browser storage for observation drafts and the offline submit queue.

export type DraftScore = { score: number | null; cfs: string[]; comment: string };
export type DraftStep =
  | { kind: "library"; stepId: string; note: string }
  | { kind: "custom"; text: string; indicator: string; lookFors: string; practice: string; note: string };
export type DraftFollow = { result: "" | "yes" | "partially" | "no" | "not_observed"; note: string };

export type Draft = {
  clientId: string;
  observationId?: string; // set when editing a saved observation
  residentId: string;
  observerId: string;
  type: string;
  involvement: string;
  date: string; // YYYY-MM-DD
  cycleOverride: number | null;
  follow: Record<string, DraftFollow>; // by prior assignment id
  scores: Record<string, DraftScore>; // by indicator code
  extra: string[]; // indicators added beyond the expected set
  steps: DraftStep[];
  internal: string;
  affirming: string;
  adjusting: string;
  sendFlag: boolean;
  includeSnapshot: boolean;
  nextNote: string;
  savedAt?: number;
  residentName?: string;
};

export type SubmitPayload = { draft: Draft; status: "draft" | "submitted" };

const DRAFT_PREFIX = "obs-draft:";
const QUEUE_KEY = "obs-queue";

function store(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function newClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function saveLocalDraft(d: Draft) {
  try {
    store()?.setItem(DRAFT_PREFIX + d.clientId, JSON.stringify({ ...d, savedAt: Date.now() }));
  } catch {
    /* storage full or blocked: the server draft button still works */
  }
}

export function loadLocalDraft(clientId: string): Draft | null {
  try {
    const raw = store()?.getItem(DRAFT_PREFIX + clientId);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function removeLocalDraft(clientId: string) {
  try {
    store()?.removeItem(DRAFT_PREFIX + clientId);
  } catch {}
}

export function listLocalDrafts(): Draft[] {
  const s = store();
  if (!s) return [];
  const out: Draft[] = [];
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (!k?.startsWith(DRAFT_PREFIX)) continue;
      try {
        out.push(JSON.parse(s.getItem(k)!));
      } catch {}
    }
  } catch {}
  return out.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
}

export function readQueue(): SubmitPayload[] {
  try {
    return JSON.parse(store()?.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function writeQueue(q: SubmitPayload[]) {
  try {
    store()?.setItem(QUEUE_KEY, JSON.stringify(q));
    window.dispatchEvent(new Event("obs-queue"));
  } catch {}
}

export function enqueue(p: SubmitPayload) {
  writeQueue([...readQueue().filter((x) => x.draft.clientId !== p.draft.clientId), p]);
}

export type SubmitResult = { ok: true; id: string } | { ok: false; error: string; offline?: boolean };

export async function postObservation(p: SubmitPayload): Promise<SubmitResult> {
  try {
    const res = await fetch("/api/observations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(p),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, id: body.id };
    return { ok: false, error: body.error || `The server said no (${res.status}).` };
  } catch {
    return { ok: false, error: "No connection.", offline: true };
  }
}

/** Send everything in the queue. Items the server rejects stay queued with their error so nothing is lost. */
export async function flushQueue(): Promise<{ sent: number; failed: { name: string; error: string }[] }> {
  const q = readQueue();
  let sent = 0;
  const keep: SubmitPayload[] = [];
  const failed: { name: string; error: string }[] = [];
  for (const p of q) {
    const r = await postObservation(p);
    if (r.ok) {
      sent++;
      removeLocalDraft(p.draft.clientId);
    } else {
      keep.push(p);
      if (!r.offline) failed.push({ name: p.draft.residentName ?? "an observation", error: r.error });
      if (r.offline) break;
    }
  }
  const rest = q.slice(sent + keep.length);
  writeQueue([...keep, ...rest]);
  return { sent, failed };
}
