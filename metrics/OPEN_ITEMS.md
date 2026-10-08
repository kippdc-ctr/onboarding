# Metrics Hub: open items for Ashley

The app runs with all of these at their defaults. Section numbers refer to the v0 spec.

## Decisions I made so it could be built (tell me to change any)

1. **Access (Q1).** Email + personal password, limited to the Users list (Google sign-in was removed at your request). You set a temporary password when adding someone. Roles as in the README table: CTR team can import
   and type numbers but can't edit goals, users, or the calendar, and never sees demographics on resident rows. RDLs see the scorecard
   and only their own campus's residents and breakdown row.
2. **CORE goals (Q2).** Not built. The database supports private goals, and they are excluded from every shared screen and export, but there is no "My CORE goals" tab until you decide.
3. **Targets (Q3).** All 45 targets are seeded from the spec and marked **"to confirm"** on the scorecard. Confirm or edit them in Admin → Goals
   (there's a "Mark all targets confirmed" button). Close = within 5 points; change it in Admin → Settings.
4. **The "(n)" numbers in the goals doc** (e.g. "(45/50)") match each *target* times 50 residents, not last year's n, so I stored them as
   "target as a count" notes. SY25-26 actuals are stored without an n. Add one per goal in Admin → Goals if you have them.
5. **Goals 1 and 2 baselines.** The doc lists both a CTR figure and an Eval 3 figure; I used the Eval 3 figure (90% and 92%) since both goals are measured at Eval 3.
6. **Measurement windows.** Each goal has a period (Eval 3, EOY survey, May 1, June 1, or "each cycle/sprint"). Please check them in Admin → Goals.
   Goal 4 ("by Cycle 3") is set to the EOY survey; switch it to "Mid-year survey" if that's where the question is asked.
7. **Calendar.** Cycle, eval, sprint, and survey dates are **placeholders** I estimated for SY26-27. Replace them in Admin → Calendar.
8. **Goal 33** counts race/ethnicity and gender groups of 5+ residents whose goal 31 completion rate is more than 10 points below overall. It and goal 32 recalculate automatically from goal 31's import.
9. **Mid-year pace (Q7).** Not built. Goals measured at EOY show interim numbers (if any were imported for an earlier period) without a status.
10. **Imports** are CSV upload or paste (Google Sheets → File → Download → CSV). Direct Google Sheets sync is Phase C.

## Things I need from you

- Your email for `OWNER_EMAILS`, and the list of people (and RDL campuses) to add.
- The real SY26-27 calendar (cycles, evals, sprints, survey windows).
- The Info tab's column names and the exact Status values (the app treats exactly "Enrolled - Resident" as enrolled; editable in Settings).
- Where demographics live today and the category labels used (goal 32 matches race starting with "Black" and gender "Male").

## Not in Phase A (per spec section 10)

Observation/GRM/Praxis/survey-specific imports, resident profile, roster grid, campus view and PDF (Phase B–C); senior resident and alumni tab;
Sheets sync; onboarding hub link-up; CORE tab; email digest (Phase D).
