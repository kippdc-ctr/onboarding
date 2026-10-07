// Turns a pasted video link into something that can play inside the page.
export type Embed = { kind: "iframe"; src: string; provider: "YouTube" | "Vimeo" | "Google Drive" } | { kind: "video"; src: string } | null;

function seconds(t: string | null): number | null {
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function videoEmbed(raw: string | null | undefined): Embed {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\.|^m\./, "");

  // YouTube: watch?v=, youtu.be/, shorts/, embed/, live/
  let yt: string | null = null;
  if (host === "youtu.be") yt = u.pathname.slice(1).split("/")[0];
  else if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    yt = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{6,})/)?.[1] ?? null;
  }
  if (yt && /^[\w-]{6,}$/.test(yt)) {
    const start = seconds(u.searchParams.get("t") ?? u.searchParams.get("start"));
    return { kind: "iframe", provider: "YouTube", src: `https://www.youtube-nocookie.com/embed/${yt}?rel=0${start ? `&start=${start}` : ""}` };
  }

  // Vimeo: vimeo.com/123, vimeo.com/123/abcdef (unlisted hash), player.vimeo.com/video/123?h=abc
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = u.pathname.match(/(?:\/video)?\/(\d+)(?:\/([\da-f]+))?/);
    if (m) {
      const h = m[2] ?? u.searchParams.get("h");
      return { kind: "iframe", provider: "Vimeo", src: `https://player.vimeo.com/video/${m[1]}${h ? `?h=${h}` : ""}` };
    }
  }

  // Google Drive: /file/d/<id>/view (or open?id=<id>). The file must be shared "Anyone with the link".
  if (host === "drive.google.com") {
    const id = u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] ?? u.searchParams.get("id");
    if (id) return { kind: "iframe", provider: "Google Drive", src: `https://drive.google.com/file/d/${id}/preview` };
  }

  // A direct video file
  if (/\.(mp4|webm|m4v|mov)$/i.test(u.pathname)) return { kind: "video", src: u.toString() };
  return null;
}
