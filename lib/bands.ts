// Grade bands for Section 4's branches. A resident's band comes from (in order):
// 1. the certification track they chose in About You (Section 2),
// 2. a choice they made on the Section 4 page (only offered when About You has no track),
// 3. the grade band on the roster.
import type { ProgressBundle } from "./data";

export type Band = "ece" | "elementary" | "middle" | "high";
export const BANDS: Band[] = ["ece", "elementary", "middle", "high"];
export const BAND_LABEL: Record<Band, string> = {
  ece: "ECE (PreK3 to K)",
  elementary: "Elementary (1 to 4)",
  middle: "Middle (5 to 8)",
  high: "High School (9 to 12)",
};
/** The adjacent band for the optional neighboring-band review. */
export const NEIGHBOR: Record<Band, Band> = { ece: "elementary", elementary: "middle", middle: "high", high: "middle" };
export const BAND_CHOICE_ACTIVITY = "band-choice";

export function bandFromText(v: string | null | undefined): Band | null {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("ece") || s.startsWith("early")) return "ece";
  if (s.startsWith("elem")) return "elementary";
  if (s.startsWith("mid")) return "middle";
  if (s.startsWith("high") || s.startsWith("sec")) return "high";
  return BANDS.includes(s as Band) ? (s as Band) : null;
}

export type BandSource = "about-you" | "choice" | "roster";

export function residentBand(r: { grade_band?: string | null }, b: ProgressBundle): { band: Band | null; source: BandSource | null } {
  const fromTrack = bandFromText(b.track);
  if (fromTrack) return { band: fromTrack, source: "about-you" };
  const choice = b.activities.find((a) => a.activity_id === BAND_CHOICE_ACTIVITY)?.payload_json as { answers?: { band?: string } } | undefined;
  const fromChoice = bandFromText(choice?.answers?.band);
  if (fromChoice) return { band: fromChoice, source: "choice" };
  const fromRoster = bandFromText(r.grade_band);
  if (fromRoster) return { band: fromRoster, source: "roster" };
  return { band: null, source: null };
}
