import { NextRequest } from "next/server";
import { currentResident, isAdmin } from "@/lib/session";
import { MAX_AUDIO_BYTES, storageMode, writeLocal } from "@/lib/storage";

// Local-development upload target. In production, files upload straight to Supabase Storage.
// Admins may write audio/ and images/; a signed-in resident may write only under residents/<their id>/.
export async function POST(req: NextRequest) {
  if (storageMode() !== "local") return new Response("Not available", { status: 404 });
  const p = req.nextUrl.searchParams.get("path") ?? "";
  let allowed = false;
  if (/^(audio|images)\/[\w.-]+$/.test(p)) allowed = await isAdmin();
  else {
    const m = p.match(/^residents\/([0-9a-f-]{36})\/[\w.-]+$/);
    if (m) allowed = (await currentResident())?.id === m[1];
  }
  if (!allowed) return new Response("Not allowed", { status: 403 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length > MAX_AUDIO_BYTES) return new Response("Too large", { status: 413 });
  await writeLocal(p, buf);
  return Response.json({ ok: true });
}
