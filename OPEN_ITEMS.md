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
12. Elliott Sans font files (`.woff2`) and the CTR logo file. Until then the app uses Nunito Sans and four CSS circles.
13. **Links:** neighborhood videos (5) and Homes.com Congress Heights, Revisionist History episode, A Tale of Two Systems, KIPP DC 25-year video,
    Hometown Padlet, the correct Personal Why link (the one sent matches Praxis Registration), Teaching Is Heart Work video, Hattie video,
    the three scenario videos and their captions, the four-domains video, Genially originals, Praxis documentation upload,
    Praxis info, background check checklist, Workday instructions, Summer Academy schedule, preview webinar link, HR action items.
14. **Settings:** CTR contact email (for "Don't see your name?"), cleared background check due date, webinar date and time.

## Choices made while building (tell me if you want any changed)

- **Database connection:** the app connects to Supabase Postgres with a `DATABASE_URL` connection string instead of the `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` pair. Same Supabase project, still server-only; it lets the app run real SQL and be tested locally.
- **Extra environment variable:** `PIN_ENCRYPTION_KEY` (separate from `SESSION_SECRET`) so rotating the cookie secret doesn't make PINs unreadable.
- **Module completion** requires the resident to press "Mark module complete" (the button unlocks when the rule is met). The admin resident page flags anyone who finished everything but didn't press it.
- **Accuracy** counts a "retake" as a new attempt: the resident answers every question once per attempt, and the best attempt's score is shown. Every answer is stored.
- **Status export:** Accuracy is a percent (e.g. `80%`); checklist columns (Personal Why, MT Match, Intro Slide, Gradeband) say `Complete` / `Incomplete`; Last, Email, and Group are added at the end.
- **Brand contrast:** deep teal `#4998A4` and coral `#ED4D44` don't meet WCAG AA as small text on white, so text uses darker shades of the same hues (`#2C6A74`, `#B8312A`). Brand colors are used for fills, borders, and large text.
- **PIN reset** signs the resident out on every device; they create a new PIN at next sign-in.
- **Praxis Registration** is not required for Phase 1 completion until a resident's Praxis status is loaded (shown with "Only if you are not exempt").
