# CTR Program Metrics Hub

One place to see how the Capital Teaching Residency is doing against the SY26-27 Program Goals and which residents,
campuses, or grade bands are driving a miss. Companion to the Onboarding Hub (same brand and stack; lives in this
repo's `metrics/` folder and deploys as its own Vercel project).

This is **Phase A** of the spec: sign-in and roles, roster import, all 45 goals plus the Big Goal seeded with their
definitions, manual entry and CSV import of results, the program scorecard, goal detail, and data health. The goal
editor, user list, calendar, settings, audit log, and school-year tools are in Admin.

- **Stack:** Next.js (App Router) + TypeScript + Tailwind on Vercel; Postgres on Supabase. Charts are plain SVG.
- **The browser never talks to the database.** Every page and action checks the signed-in user on the server.
- **Tables live in a `metrics` Postgres schema**, so this app can share the Onboarding Hub's Supabase project safely.

## Who sees what

| | Owner | CTR team | RDL / campus leader |
| --- | --- | --- | --- |
| Scorecard, goal detail, data health | ✓ | ✓ | ✓ |
| Residents list | All, with demographics | All, no demographics | Own campus only |
| "Who is missing this goal" list | All | All | Own campus only |
| Breakdowns by campus, school, grade band, group | ✓ (small groups shown with a warning) | ✓ (groups under 5 show "n < 5") | Own campus row only |
| Demographic breakdowns (race/ethnicity, gender) | ✓ | ✓ (groups under 5 hidden) | — |
| Import, type in numbers | ✓ | ✓ | — |
| Goal editor, users, calendar, settings, years, audit log | ✓ | — | — |

Survey (perception) goals are aggregate-only: they can't be imported per resident.
The member list for goals calculated from a demographic subset (goal 32) is Owner-only, because it would reveal each person's demographics.

The audit log records sign-ins, every view of a "who is missing" list, imports, typed-in numbers, goal edits, user changes, and exports.

## Environment variables

| Name | What it is |
| --- | --- |
| `DATABASE_URL` or `POSTGRES_URL` | Supabase Postgres connection string (Transaction pooler, port 6543). `POSTGRES_URL` is set for you by Vercel's Supabase integration. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client (see below). |
| `ALLOWED_EMAIL_DOMAIN` | Defaults to `kippdc.org`. Google accounts on other domains are refused. |
| `OWNER_EMAILS` | Comma-separated. Added as Owners on each deploy if they aren't on the list yet. Put Ashley's @kippdc.org address here. |
| `SESSION_SECRET` | Long random string that signs sign-in cookies (`openssl rand -hex 32`). Changing it signs everyone out. |
| `APP_URL` | Optional. The site's URL, e.g. `https://ctr-metrics.vercel.app`, so the Google redirect is always the same. |
| `APP_TIME_ZONE` | Optional. Defaults to `America/New_York`. |

## Deploy (first time)

1. **Vercel:** Add New → Project → import `kippdc-ctr/onboarding` again, and set **Root Directory** to `metrics`. Leave the build settings as they are.
2. **Database:** Storage → Connect Database → choose the Onboarding Hub's Supabase project (or create a new one). The app creates its own `metrics` schema.
3. **Google sign-in:** in [Google Cloud Console](https://console.cloud.google.com/) (a KIPP DC project), APIs & Services →
   OAuth consent screen → **Internal** (KIPP DC accounts only); then Credentials → Create credentials → OAuth client ID → Web application.
   Add the authorized redirect URI `https://<your-vercel-domain>/auth/callback`. Copy the client ID and secret.
4. **Environment variables** (Settings → Environment Variables): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `OWNER_EMAILS`, and `APP_URL`.
5. **Redeploy.** Every build creates or updates the tables and seeds the goals, calendar, campuses, and sources (`npm run vercel-build`). It never overwrites anything edited in Admin.
6. Sign in, then: Admin → Users to add the team and RDLs; Admin → Goals to confirm targets; Admin → Calendar to replace placeholder dates.
   To try the screens first: Admin → School years & data → **Load sample data** (delete it before importing real data).

Vercel preview links won't work with Google sign-in unless their URL is added as a redirect URI; test on the production URL.

## Everyday tasks

- **Roster:** Import → Roster. Download the Info tab as CSV (File → Download → .csv) or paste the cells. Match columns once; the mapping is remembered.
  Residents are matched on legal first + last name + campus. Nobody is ever deleted by an import. Set a withdrawn resident's Status to "Withdrawn"; they stay in retention goals.
- **Results for one goal:** Import → Resident results. Pick the goal and period, then a file with one row per resident and a result column
  (Yes/No, Met/Not met, Pass/Exempt, On time/Late, or a score with a threshold like 3.0). The preview shows every match, every unmatched name, and roster residents missing from the file.
  Saving builds the overall number and every breakdown, and recalculates goals 32 and 33 when goal 31 is imported.
- **Survey and other summarized numbers:** Import → Aggregate numbers (columns: Goal, Period, Numerator, Denominator, optional Breakdown and Breakdown value), or type a number on the goal's page.
- **Re-importing** the same goal and period replaces what was saved for it.
- **Data health** shows each source's last import, rows that didn't match, and a Stale warning (observations and GRM after 14 days).

## Status rules

Met = at or above target. Close = within 5 points below. Off track = more than 5 points below. Not yet measured = the goal's
measurement period hasn't opened. No data = open but nothing imported. Change compares to the SY25-26 actual (no change = within 1 point; NEW = no baseline).
Goals measured "each cycle" use the latest cycle. The senior resident touchpoint goal (41) is paced: one per sprint completed so far.
Thresholds are in Admin → Settings.

## Next school year

Admin → School years & data: download the archive (JSON), **Start a new school year** (copies goals with this year's results as baselines,
and the calendar shifted a year), update targets and dates, make it current, import the new roster, then lock the old year.

## Local development

```bash
cd metrics
cp .env.example .env.local   # point DATABASE_URL at a local Postgres; add DEV_LOGIN=true and OWNER_EMAILS=you@kippdc.org
npm install
npm run db:migrate && npm run db:seed
npm run dev                  # http://localhost:3100 (DEV_LOGIN shows a sign-in picker)
npm test                     # status and breakdown rules
npm run typecheck
```
