import { readFile } from "node:fs/promises";
import { localFile, storageMode } from "@/lib/storage";

// Serves locally uploaded media in development. In production, media is served by Supabase Storage.
const TYPES: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", aac: "audio/aac" };

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (storageMode() !== "local") return new Response("Not found", { status: 404 });
  const p = (await params).path.join("/");
  try {
    const data = await readFile(localFile(p));
    const ext = p.split(".").pop()?.toLowerCase() ?? "";
    const range = req.headers.get("range");
    const type = TYPES[ext] ?? "application/octet-stream";
    if (range) {
      const m = range.match(/bytes=(\d*)-(\d*)/);
      const start = m?.[1] ? Number(m[1]) : 0;
      const end = m?.[2] ? Number(m[2]) : data.length - 1;
      return new Response(data.subarray(start, end + 1), {
        status: 206,
        headers: { "content-type": type, "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${data.length}`, "content-length": String(end - start + 1) },
      });
    }
    return new Response(data, { headers: { "content-type": type, "accept-ranges": "bytes", "content-length": String(data.length) } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
