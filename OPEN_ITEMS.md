# Open items for Ashley

The app runs with all of these blank or in draft. Admin → Content flags shows the live list of empty links.

## Decisions

1. **Group dates.** Confirm the six group dates are welcome-email dates (seeded: Dec 7, 2026; Mar 1, Apr 1, May 1, Jun 1, Jul 1, 2027).
2. **Group 6 late-group rule.** Group 6's Phase 1 is due July 15, after the July 1 module dates and the July 9 Phase 3 date.
   Admin → Groups shows a warning banner and has per-group override fields. Group 6 uses the standard dates until you decide.
3. **Phase 3 date.** All Phase 3 items are due July 9. Confirm Summer Academy starts after that.

## Content to confirm

4. **Answer keys** for Modules 1, 3, and 4 were inferred from the Genially export. Confirm or flip (`"correct"` in each module file).
5. **Module 5 knowledge check** (6 questions) was newly drafted from the deck. Approve, edit, or delete.
6. **Module 5 "five domains":** the closing reflection says "five domains" (the deck teaches five; the original slide said four).
7. **Piaget stage descriptors** (Module 5) were written from standard sources because an image covered them in the slide export. Marked "CTR to confirm."
8. **Theory Quick Reference table** (Module 5) was rebuilt from the deck's list of theorists; the "big idea" and "signature terms" text needs a check. Marked "CTR to confirm."
9. **High vs. low self-efficacy table** (Module 4): the export named this comparison but didn't include the rows, so four example rows were written. Marked "CTR to confirm."
10. **Mentor Match survey:** confirm no changes from the Google Form, including the typo fix in question 8 ("comfortable with my mentor challenging…").

## Materials still needed

11. Module 5: milestones quick-reference guide, both matching card sets (currently 6 sample cards each), and real scenario cards (one sample scenario now).
12. Elliott Sans font files (`.woff2`). Until then the app uses Nunito Sans. (Logo received and in place.)
13. **Links:** neighborhood videos (5) and Homes.com Congress Heights, Revisionist History episode, A Tale of Two Systems, KIPP DC 25-year video,
    Hometown Padlet, the correct Personal Why link (the one sent matches Praxis Registration), Teaching Is Heart Work video, Hattie video,
    the three scenario videos and their captions, the four-domains video, Genially originals, Praxis documentation upload,
    Praxis info, background check checklist, Workday instructions, Summer Academy schedule, preview webinar link, HR action items.
14. **Settings:** CTR contact email (for "Don't see your name?"), cleared background check due date, webinar date and time.

## Module 3 (What We Believe), rebuilt from the November content file

- **Knowledge check:** the file says "Eight questions" but the questions weren't in it. The module keeps its 5 existing questions (asset-based teaching, Pygmalion, deficit thinking, Ladson-Billings, families), which still match the content, until the 8 arrive.
- **Mindset statements:** three sample statements, marked "Sample statements, replace."
- **"Try it: reframe it":** the statements weren't in the file. It starts with the one example from the text ("He is a low reader"), marked sample. Add more in Admin → Module content → What We Believe → Reframe practice.
- **Image still needed:** the three-pillar diagram.
- **Final task message** has a hard 100-word limit; the module can't be marked complete until it's under.
- **Removed:** the four-domains video and the old child-development sections (child development now lives in Module 5).

## Module 2 (Your Story Matters), rebuilt from the November content file and the revised persona quiz

- **Persona descriptions:** the quiz file says the descriptions on pages 12 and 13 of the original still apply, but those pages weren't included. Results show each persona's signature move (from your facilitator notes) and "Full persona description coming soon" until a Strength and Watch for are added. You can paste them in Admin → Module content → Your Story Matters → Teacher Persona Quiz → Personas.
- **Mindset statements:** three sample statements are in place (marked "Sample statements, replace"). Send the real ones or edit them in Admin → Module content.
- **Mentor Match merged into About You:** About You's fields come first (track, grade-band interest, feedback, communication style, goals, professional context), followed by the Mentor Match questions that weren't duplicates (placement school, first instinct, how you learn, the rating scales, hard-day need, identity preferences, anything else, teacher in mind). The name question was dropped since the app knows who is signed in. Existing responses carry over.
- **Certification track** is collected in About You. Routing in Section 4 by track isn't built yet; it will need Section 4's content.
- **Tiebreakers:** asked when the top two personas finish within one point (per the quiz). Per the "Reading your result" rules they only change the primary when two personas are tied for first; otherwise the leader stays primary and the runner-up is the secondary.
- **Images still needed:** the five persona illustrations and the KIPP DC campus one-pager (link in Settings → url.m2.campus_onepager).
- **Removed from Section 2:** the Padlet, Intro Slide and grade-band photo Google Forms, the Personal Why form link, and the Teaching Is Heart Work video. The status export's Personal Why, Intro Slide, and Gradeband columns now read from the in-app forms.

## Module 1 (Our City, Our Schools), rebuilt from the November content file

- **Knowledge check:** the file says "Six questions" but the questions themselves weren't in it (they were interactive in the preview). The module keeps the 4 existing questions until the 6 arrive.
- **Mindset check:** the file describes it (ungraded agree/disagree ratings, repeated after the section and before the first evaluation period) but the statements weren't in it. Send the statements and say whether residents should see their earlier ratings.
- **Images:** three image slots (ward map, M Street/Dunbar photo, KIPP DC timeline) are hidden until an image is uploaded in Admin → Module content. Content flags lists them.
- **Timing:** set to 65 minutes, as requested. The plan line still mentions the mindset check.
- **Completion rule changed:** knowledge check + the Community Strengths Snapshot (the old neighborhood reflection was removed; any earlier answers stay in the database).

## Content editor notes

- Most items above (answer keys, Module 5 cards and scenario, draft tables, wording) can now be fixed directly in **Admin → Module content**.
- Audio upload uses Supabase Storage. It was tested against a stand-in for Supabase's API, not a real Supabase project; try one upload after the first deploy.
- Videos play inside the page from YouTube, Vimeo, or Google Drive links; they are not uploaded into the app (bandwidth limits on the free plans).

## Choices made while building (tell me if you want any changed)

- **Database connection:** the app connects to Supabase Postgres with a `DATABASE_URL` connection string instead of the `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` pair. Same Supabase project, still server-only; it lets the app run real SQL and be tested locally.
- **Extra environment variable:** `PIN_ENCRYPTION_KEY` (separate from `SESSION_SECRET`) so rotating the cookie secret doesn't make PINs unreadable.
- **Module completion** requires the resident to press "Mark module complete" (the button unlocks when the rule is met). The admin resident page flags anyone who finished everything but didn't press it.
- **Accuracy** counts a "retake" as a new attempt: the resident answers every question once per attempt, and the best attempt's score is shown. Every answer is stored.
- **Status export:** Accuracy is a percent (e.g. `80%`); checklist columns (Personal Why, MT Match, Intro Slide, Gradeband) say `Complete` / `Incomplete`; Last, Email, and Group are added at the end.
- **Brand contrast:** deep teal `#4998A4` and coral `#ED4D44` don't meet WCAG AA as small text on white, so text uses darker shades of the same hues (`#2C6A74`, `#B8312A`). Brand colors are used for fills, borders, and large text.
- **PIN reset** signs the resident out on every device; they create a new PIN at next sign-in.
- **Praxis Registration** is not required for Phase 1 completion until a resident's Praxis status is loaded (shown with "Only if you are not exempt").
