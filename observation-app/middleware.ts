import { NextResponse, type NextRequest } from "next/server";

// Off switch. The app is turned off unless APP_ENABLED is "true" in the environment (Vercel → Settings →
// Environment Variables, then redeploy). While off, every page and API returns this notice and nothing
// reads from or writes to the database.
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>CTR Observations</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#faf8f6;color:#1f2a2e;font-family:system-ui,sans-serif}
main{max-width:26rem;margin:1rem;padding:2rem;background:#fff;border:1px solid #ddd;border-radius:1rem;text-align:center}
h1{color:#2c6a74;font-size:1.5rem;margin:0 0 .5rem}p{margin:0;line-height:1.5}</style></head>
<body><main><h1>Turned off for now</h1><p>The CTR Observation App isn't available right now.</p></main></body></html>`;

export function middleware(req: NextRequest) {
  if (process.env.APP_ENABLED === "true") return NextResponse.next();
  const json = req.nextUrl.pathname.startsWith("/api/");
  return json
    ? NextResponse.json({ error: "The CTR Observation App is turned off for now." }, { status: 503 })
    : new NextResponse(PAGE, { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

export const config = {
  // Everything except build assets, the logo images, and the service worker script.
  matcher: ["/((?!_next/static|_next/image|brand/|sw\\.js|robots\\.txt).*)"],
};
