import "server-only";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

// Audio files go to Supabase Storage (public bucket "media", unguessable file names).
// The browser uploads straight to Supabase with a one-time signed URL, because Vercel functions
// cap request bodies at 4.5 MB. Without Supabase settings (local development) files go to ./.uploads.

const BUCKET = "media";
export const MAX_AUDIO_BYTES = 50 * 1024 * 1024; // Supabase free plan per-file limit
export const LOCAL_DIR = path.join(process.cwd(), ".uploads");

function supabase() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || "";
  return url && key ? { url, key } : null;
}

export type StorageMode = "supabase" | "local" | "none";

export function storageMode(): StorageMode {
  if (supabase()) return "supabase";
  return process.env.VERCEL ? "none" : "local";
}

function headers(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, authorization: `Bearer ${key}`, ...extra };
}

let bucketReady = false;
async function ensureBucket() {
  const s = supabase()!;
  if (bucketReady) return;
  const res = await fetch(`${s.url}/storage/v1/bucket`, {
    method: "POST",
    headers: headers(s.key, { "content-type": "application/json" }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (!/exist|duplicate|409/i.test(text)) throw new Error(`Could not create the storage bucket: ${res.status} ${text}`);
  }
  bucketReady = true;
}

export type PreparedUpload = { method: "PUT" | "POST"; uploadUrl: string; headers: Record<string, string>; storagePath: string; publicUrl: string };

export async function prepareUpload(storagePath: string, contentType: string): Promise<PreparedUpload> {
  const mode = storageMode();
  if (mode === "supabase") {
    const s = supabase()!;
    await ensureBucket();
    const res = await fetch(`${s.url}/storage/v1/object/upload/sign/${BUCKET}/${storagePath}`, {
      method: "POST",
      headers: headers(s.key, { "content-type": "application/json" }),
      body: "{}",
    });
    if (!res.ok) throw new Error(`Could not start the upload: ${res.status} ${await res.text()}`);
    const { url } = (await res.json()) as { url: string };
    return {
      method: "PUT",
      uploadUrl: `${s.url}/storage/v1${url}`,
      headers: { "content-type": contentType, "cache-control": "max-age=31536000", "x-upsert": "false" },
      storagePath,
      publicUrl: `${s.url}/storage/v1/object/public/${BUCKET}/${storagePath}`,
    };
  }
  if (mode === "local") {
    return {
      method: "POST",
      uploadUrl: `/admin/media/upload?path=${encodeURIComponent(storagePath)}`,
      headers: { "content-type": contentType },
      storagePath,
      publicUrl: `/media/${storagePath}`,
    };
  }
  throw new Error("Audio upload isn't set up yet: connect Supabase to this Vercel project (Storage → Supabase), then redeploy.");
}

export async function deleteStored(storagePath: string) {
  const mode = storageMode();
  if (mode === "supabase") {
    const s = supabase()!;
    await fetch(`${s.url}/storage/v1/object/${BUCKET}/${storagePath}`, { method: "DELETE", headers: headers(s.key) }).catch(() => {});
  } else if (mode === "local") {
    await unlink(localFile(storagePath)).catch(() => {});
  }
}

/** Resolves a storage path inside the local uploads folder, refusing anything that escapes it. */
export function localFile(storagePath: string): string {
  const p = path.resolve(LOCAL_DIR, storagePath);
  if (!p.startsWith(LOCAL_DIR + path.sep)) throw new Error("Bad path");
  return p;
}

export async function writeLocal(storagePath: string, data: Buffer) {
  const p = localFile(storagePath);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, data);
}
