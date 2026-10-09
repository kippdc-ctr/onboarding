# Open items for Ashley (Observation App)

## Spec questions still open (Section 10), and what the app does until you decide

1. **Shared passcode:** on (the recommended setting). The private link is **off** (you asked to remove it), so the passcode is the only lock on resident data. Settings → Access turns the link back on.
2. **Look-fors, practice reps, resource links for the 48 current steps:** blank. The picker shows "No look-fors yet" on those steps, and the email leaves those sections out.
   Fastest fix: Library → Download CSV → fill the columns → Bulk import.
3. **Email structure:** built as proposed in Section 6. The optional Sheets bridge to the Send tab (for Document Studio) is **not built**; see "Not built" below.
4. **Advance / hold wording:** advance = every expected indicator at 3+ in the last 2 observations (both numbers are in Settings). "Consider a hold" = any expected indicator at 1, or the latest expected scores average under 2.5.
   "Needs an extra visit" = fewer than 3 observations this cycle or more than 21 days since the last one. Tell me the wording and rules you want.
5. **Cycle 0 (summer):** treated as **practice only**. Nothing is expected until Cycle 1 starts on Aug 10, so summer scores save as "early / practice".
   To count summer scores on CC.A.4 to CC.A.6, set those three indicators' first-scored cycle (and Tier 1's start) to Cycle 0 in Settings.
6. **Dates between cycles:** count toward the cycle that most recently ended (Nov 21 to 29 → Cycle 2), and the observer can change it on the scoring screen.

## Choices made while building (tell me if you want any changed)

- **Where it lives:** `observation-app/` in the `kippdc-ctr/onboarding` repo (the only repo connected), deployed as its own Vercel project with its own Supabase database.
  It can move to its own repo later without changes.
- **The action step library** came from your Drive sheet "Action Step" (the one rated in "CTR_Action_Step_Ratings"): rows 2–49 are the 48 current steps
  (AS-001 to AS-048, in sheet order) and rows 50–77 are the 28 legacy wordings (AS-L01 to AS-L28), each pointing at its suggested replacement through the
  sheet's Pair Group. I didn't have `CTR_Action_Step_Library_v2.xlsx` itself, so the 3 exact duplicates it mentions weren't checked.
  The sheet "CTR_Action_Steps_Revised" has sharper rewrites of many steps; they aren't loaded. Say the word and I'll swap them in (the step IDs stay the same).
- **CFS links for each step were inferred by me** from the step text (for example "Narrate 2–3 students by name…" → CC.A.6.2). The 9 cross-cutting steps match
  your list: the 4 CC.P.3 routine steps, both "rehearse" steps, student voice or choice, referencing prior learning, and the repeat-the-direction check.
  (The spec says five CC.P.3 steps; the sheet has four.) Review on each step's Library page.
- **CFS (look-for) wording and IDs** come from the Behavior Pull tab: 36 look-fors, IDs like `CC.A.6.2` in rubric order.
- **Indicator names** are short versions of the rubric names (Settings → Indicator schedule lets you edit them).
- **Score colors:** 1 coral, 2 yellow (gold), 3 light teal, 4 a darker teal than `#4998A4` so white numbers are readable. The number is always printed in the pill.
  "Early / practice" scores get a dashed ring and a small "e". Score 1 is labeled "Area of Concern"; 4 "Exceeds Expectations".
- **Levels of involvement** seeded as Leading Whole Group, Leading Small Group, Supporting, Co-Teaching, Not Teaching (I only saw "Leading Whole Group" and "Supporting" in the workbook). Edit in Settings.
- **Advisor codes:** APC = Ashley, AC = Alison (from the Latest tab). Alison's full name and email are blank (Settings → Observers); the full name signs the email.
- **Admin:** Ashley. Only admins change settings, the library, and imports, and edit observations after 7 days. Alison can be made an admin in Settings → Observers.
- **Expected observations per cycle:** 3 per resident (used for the pace page). Change in Settings.
- **Imported Fillout observations** are marked as already sent, and they have no follow-through (Fillout didn't record it).
- **One-pagers:** "Download PDF" opens the browser's print dialog; choose "Save as PDF". Each campus prints on its own letter page. Calibri is used where the computer has it.
  Month-over-month change is shown on the overview tiles. Percentages (tiles, look-for list, priorities) are hidden when fewer than 5 residents at the campus have a score.
- **Offline:** the scoring screen autosaves on the device every 3 seconds. Submitting with no connection queues it on the device and sends it automatically when the
  connection returns (the banner at the top shows anything waiting). "Save draft" stores a draft in the app so it can be finished from another device.
- **Follow-through** is asked about the step(s) from the resident's most recent observation. If two observations of the same resident are entered offline
  on two devices, the later one records "Not observed" for any step it couldn't see, with a note, rather than failing.
- **Email delivery:** Copy email (rich text that keeps the teal/gold/coral styling in Gmail), Open in mail (to and subject filled in), Mark as sent.

## Not built in v1 (each needs a Google service account set up with KIPP DC IT)

- **Linked Sheet roster sync on a schedule.** Roster import is by CSV upload for now.
- **Nightly Google Sheet mirror** of the data feed. The feed and CSV downloads are built.
- **Sheets bridge** that appends each submission to the Send tab for Document Studio.
- **Sending email from the app** (out of scope for v1 in the spec).

## To do before launch

1. Fill in look-fors and practice reps (item 2 above) and review the CFS links.
2. Import the roster, then the Form tab; review the import preview's "not recognized" notes.
3. Delete the sample data, use Settings → Access → Sign out everyone with a new passcode, and give Alison the passcode directly.
4. Elliott Sans font files (`.woff2`), if you want the brand font (Nunito Sans is used until then).
