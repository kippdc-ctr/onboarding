import { redirect } from "next/navigation";

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function str(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}

export function back(path: string, msg: string, kind: "ok" | "error" = "ok"): never {
  const [p, hash] = path.split("#");
  const sep = p.includes("?") ? "&" : "?";
  redirect(`${p}${sep}${kind}=${encodeURIComponent(msg)}${hash ? `#${hash}` : ""}`);
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}
