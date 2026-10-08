import { NextResponse } from "next/server";
import { grantLink } from "@/lib/auth";

// The private link. A correct key marks this device; a wrong one looks like any missing page.
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!(await grantLink(key))) return new NextResponse("Page not found", { status: 404, headers: { "x-robots-tag": "noindex" } });
  return NextResponse.redirect(new URL("/", req.url), { headers: { "x-robots-tag": "noindex" } });
}
