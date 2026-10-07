import { NextRequest } from "next/server";
import { isAdmin } from "@/lib/session";
import { MAX_AUDIO_BYTES, storageMode, writeLocal } from "@/lib/storage";

// Local-development upload target. In production, files upload straight to Supabase Storage.
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return new Response("Not signed in", { status: 401 });
  if (storageMode() !== "local") return new Response("Not available", { status: 404 });
  const p = req.nextUrl.searchParams.get("path") ?? "";
  if (!/^audio\/[\w.-]+$/.test(p)) return new Response("Bad path", { status: 400 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length > MAX_AUDIO_BYTES) return new Response("Too large", { status: 413 });
  await writeLocal(p, buf);
  return Response.json({ ok: true });
}
