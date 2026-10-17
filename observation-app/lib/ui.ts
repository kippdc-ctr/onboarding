// Small shared UI helpers (safe for client and server).
export function scoreClass(score: number | null | undefined): string {
  switch (score) {
    case 1: return "bg-s1 text-white";
    case 2: return "bg-s2 text-ink";
    case 3: return "bg-s3 text-ink";
    case 4: return "bg-s4 text-white";
    default: return "bg-white text-muted border border-gray-brand/40";
  }
}

export const TRACK_STYLE: Record<string, string> = {
  standard: "border-gray-brand/50 bg-white text-ink",
  accelerated: "border-teal bg-teal-wash text-teal-ink",
  developing: "border-[#c9a400] bg-yellow-wash text-ink",
};

export const FOLLOW_LABEL: Record<string, string> = {
  yes: "Yes",
  partially: "Partially",
  no: "No",
  not_observed: "Not observed",
};

export function cls(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(" ");
}
