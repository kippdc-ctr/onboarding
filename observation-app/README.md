# CTR Observation App

Phone-first observation scoring for the Capital Teaching Residency (KIPP DC). Ashley and Alison score observations,
assign one or two action steps from a searchable library, record follow-through on the last step, send the resident a
feedback email, and review each resident's trajectory and the program dashboards. It replaces the Fillout form and the
Form → Send → Latest → Behavior Pull → Profile → Charts → Document Studio chain.

This app lives in `observation-app/` and is built and deployed **on its own**, separate from the CTR Onboarding Hub at the
repo root and from the Program Metrics App (which reads this app's data feed).

- **Stack:** Next.js (App Router) + TypeScript + Tailwind on Vercel; Postgres on Supabase (database only); installable web app with offline drafts.
- **The browser never talks to the database.** Every read and write goes through the Next.js server.
- **Spec:** `CTR_Observation_App_Spec_v1.md` (v1 draft). What's built, what's not, and decisions made along the way: [`OPEN_ITEMS.md`](OPEN_ITEMS.md).

## What's in it

| Area | Where |
| --- | --- |
| Scoring screen: resident search (recent on top), observer, type, involvement, date (auto cycle, override), follow-through on the last step, 1–4 scores with CFS checkboxes and last-time comparison, "add another indicator" (saved as extra / early), 1–2 action steps from the library or typed, feedback, email preview, autosave + offline queue | **+ Observe** (`/observe`) |
| Resident context panel: last 3 observations with trend arrows, CFS dots, last step(s) and how long ago, open priorities, days since, count this cycle | Right column on large screens; "Show resident context" on phones |
| Observation page: scores, follow-through, steps, **Copy email** (rich text for Gmail), **Open in mail**, **Mark as sent**, edit (7 days; admin after, logged), delete, **Add to library** for typed steps | `/observations/<id>` |
| Resident page: trajectory (one row per indicator, cycle bands, action steps marked), history with "miss" vs "–", step follow-through, **track / tier changes with history** (backdatable, advisor decides), indicator overrides, custom cycle dates, priorities, roster details | `/residents/<id>` |
| Latest scores grid (the Latest tab) with filters and CSV | `/dashboards/latest` |
| Observation pace by observer and week; residents not observed | `/dashboards/pace` |
| CFS heatmap by campus | `/dashboards/cfs` |
| Action step analytics: by step, follow-through rate, average score change split by Yes/Partially/No, 3+ repeats with no gain, never-used steps | `/dashboards/steps` |
| Cycle close-out: advance / hold / extra visit / on track / accelerated / developing (the app recommends; the advisor decides) | `/dashboards/closeout` |
| Monthly campus one-pagers (Learning Environment, letter portrait, logo centered, Calibri, groups under 5 hidden) → **Download PDF** | `/onepagers` |
| Action step library: 48 current + 28 legacy steps, search, edit with history, retire, merge duplicates, bulk CSV import, usage and follow-through | `/library` |
| Settings: types, involvement, campuses, step limit, edit window, advance rule, cycle calendar, indicator schedule and tiers, tracks, observers, passcode, **rotate link and passcode**, data feed token, sample data | `/settings` |
| Imports: roster (Info tab CSV) and existing Fillout submissions (Form tab CSV), both with a preview | `/settings/import` |
| Audit log (every observation, track change, import, and settings change, with who and when) | `/settings/audit` |
| Data feed for the Program Metrics App (token-protected JSON/CSV) and CSV exports | `/api/feed`, `/export/<kind>` |

## Access (no Google sign-in)

1. **Shared passcode** (on by default): entered once per device, remembered 90 days. 10 wrong tries locks entry for 15 minutes.
   This is what keeps resident data private, so keep it on and don't share the passcode.
2. **"Who is using this?"**: Ashley or Alison, remembered on the device. It labels observations and decisions; it isn't security.
3. **Private link (optional, off by default):** Settings → Access → "Also require the private link". When on, only `https://<app>/enter/<access key>`
   opens the app and every other address shows "Page not found". Search engines are blocked either way (`robots.txt`, `X-Robots-Tag`).

**Settings → Access → Sign out everyone** (or "Rotate link and passcode" when the link is on) sets a new passcode and signs every other device out.
Only admins (Ashley by default; Settings → Observers) change settings, the library, or imports, and edit observations after the 7-day window.

## Environment variables

| Name | What it is |
| --- | --- |
| `DATABASE_URL` or `POSTGRES_URL` | Supabase Postgres connection string (Transaction pooler, port 6543). `POSTGRES_URL` is set for you by Vercel's Supabase integration. |
| `SESSION_SECRET` | Long random string that signs device cookies (`openssl rand -hex 32`). Changing it signs every device out. |
| `INITIAL_ACCESS_KEY` | Optional. The key for the private link, used only if you turn the link on in Settings. |
| `INITIAL_PASSCODE` | Recommended. The shared passcode. If blank, the first visitor to the app creates it, so open the app right after deploying. |
| `SEED_SAMPLE_DATA` | Optional. `true` adds 18 fake "Sample" residents with observations, for trying the app. Delete them in Settings before launch. |
| `APP_TIME_ZONE` | Optional. Defaults to `America/New_York`. |

## Deploy (first time)

1. **Vercel:** Add New → Project → import `kippdc-ctr/onboarding`. Set **Root Directory** to `observation-app`. Leave the build settings as they are (the `vercel-build` script runs).
   This is a separate Vercel project from the Onboarding Hub.
2. **Database:** in the new project, Storage → Create / Connect Database → Supabase (a **new** Supabase project; don't share the onboarding database).
3. **Environment variables** (Production and Preview): `SESSION_SECRET`, `INITIAL_PASSCODE`, and for a trial run `SEED_SAMPLE_DATA=true`.
4. **Redeploy.** Every build creates or updates the tables and seeds cycles, indicators, CFS, tiers, tracks, the action step library, and settings. It never overwrites anything edited in the app.
5. Open `https://<app>` on each phone and computer, enter the passcode, pick your name. On a phone, use **Add to Home Screen** to install it.
6. **Before launch:** Settings → Import → roster (Info tab), then the Form tab; Settings → Sample data → delete; Settings → Access → Sign out everyone with a new passcode; give Alison the passcode directly.

## Switching over from Fillout (Section 8)

1. Import the roster first (Info tab → File → Download → CSV), then the Form tab. Each Fillout submission imports once (matched by Submission ID; re-running is safe).
   Look-fors are matched to the CFS list; action step text is matched to the library (current or legacy wording); anything unmatched is kept and labeled "legacy text".
2. Pick a clean point (the start of a cycle). Run both for one week and compare; re-import the Form tab at the end of the week to pick up the last Fillout entries.
3. Keep the Fillout form read-only as an archive.

## Data feed (Section 9)

`GET /api/feed?dataset=<name>&token=<token>` (or `Authorization: Bearer <token>`), add `&format=csv` for CSV. Datasets:
`scores` (one row per observation score), `steps` (one row per assigned step), `followthrough`, `tracks` (current track/tier plus change history),
`residents`, `indicators`, `cfs`, `cycles`, `library`. Everything is keyed by permanent IDs: `person_id` for residents (carries through senior
resident and alumni status), indicator codes, CFS IDs like `CC.A.6.2`, step IDs like `AS-012`, and cycle numbers. The token is in Settings → Data feed.
This app doesn't compute program goals; the Metrics App decides how scores roll up.

## Everyday tasks

- **Fill in look-fors and practice reps:** Library → Download CSV, fill the `look_fors` / `practice_rep` / `resource_url` columns, Library → Bulk import. Or edit a step directly.
- **Promote or hold a resident:** resident page → Development track. Choose the track and tier, the effective date (backdating is fine), who decided, and a short reason.
- **Next school year:** Settings → Cycle calendar (new dates), Indicator schedule (first-scored cycles, tiers), then import the new roster. Returning people keep their person ID (matched by KIPP email, then name).

## Local development

```bash
cd observation-app
cp .env.example .env.local      # point DATABASE_URL at a local Postgres, set SESSION_SECRET and INITIAL_PASSCODE
npm install
npm run db:migrate && npm run db:seed && npm run db:samples
npm run dev                     # http://localhost:3100
npm run typecheck && npm test   # rules for cycles, tracks, tiers, and the advance recommendation
```
