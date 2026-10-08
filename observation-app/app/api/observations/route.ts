import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { SaveError, saveObservation } from "@/lib/save";
import type { SubmitPayload } from "@/lib/draft";

export async function POST(req: Request) {
  // Same-origin only (blocks cross-site form posts riding on the device cookie).
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return NextResponse.json({ error: "Wrong origin." }, { status: 403 });
  const me = await apiUser();
  if (!me) return NextResponse.json({ error: "This device isn't signed in. Open the app link and enter the passcode, then try again." }, { status: 401 });
  let body: SubmitPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "That didn't look like an observation." }, { status: 400 });
  }
  try {
    const id = await saveObservation(body, me);
    return NextResponse.json({ id });
  } catch (e) {
    if (e instanceof SaveError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error(e);
    return NextResponse.json({ error: "Something went wrong saving this observation." }, { status: 500 });
  }
}
