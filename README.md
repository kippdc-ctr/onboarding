# CTR Onboarding Hub

Onboarding app for the Capital Teaching Residency (KIPP DC), replacing Trainual for the 2028 cohort.
Residents pick their name, set a 4-digit PIN, and work through three phases: welcome action items,
five prework modules, and HR/summer prep. The CTR team sees everyone's progress at `/admin`.

- **Stack:** Next.js (App Router) + TypeScript + Tailwind, hosted on Vercel; Postgres on Supabase.
- **The browser never talks to the database.** Every read and write goes through the Next.js server,
  which identifies the resident from a signed cookie (never from an id sent by the browser).
- **Content** (module text, quiz questions and answer keys, the Mentor Match survey) lives in
  [`/content`](content). **Links, due dates, the roster, and groups** live in the database and are edited in `/admin`.

## Environment variables

| Name | What it is |
| --- | --- |
| `DATABASE_URL` or `POSTGRES_URL` | Supabase Postgres connection string. `POSTGRES_URL` is set for you by Vercel's Supabase integration; if you set it yourself, use the **Transaction pooler** string (port 6543). |
| `SEED_SAMPLE_RESIDENTS` | Optional. `true` adds the 10 fake "Sample" residents on deploy, for testing. Remove before launch. |
| `ADMIN_PASSCODE` | The shared CTR team passcode for `/admin`. Changing it signs every admin out. |
| `SESSION_SECRET` | Long random string that signs sign-in cookies. Generate with `openssl rand -hex 32`. |
| `PIN_ENCRYPTION_KEY` | Long random string that encrypts resident PINs at rest. Generate with `openssl rand -hex 32`. **Never change it** after residents set PINs, or their PINs can't be read (they'd need resets). |
| `APP_TIME_ZONE` | Optional. Defaults to `America/New_York`; used for "today" in due dates. |

Copy `.env.example` to `.env.local` for local development.

## Deploy (first time, no command line needed)

1. **Vercel:** sign in at vercel.com with GitHub, choose **Add New → Project**, and import `kippdc-ctr/onboarding`. Leave the build settings as they are.
2. **Database:** in the new Vercel project, open **Storage → Create / Connect Database → Supabase** (free plan) and connect it to the project.
   This creates the Supabase project and adds its connection string (`POSTGRES_URL`) for you.
3. **Environment variables** (Vercel project → Settings → Environment Variables), for Production and Preview:
   `ADMIN_PASSCODE`, `SESSION_SECRET`, `PIN_ENCRYPTION_KEY` (see the table above), and for a test run `SEED_SAMPLE_RESIDENTS` = `true`.
4. **Redeploy** (Deployments → ⋯ → Redeploy). Every build creates or updates the tables and seeds groups, modules, phase items, and settings
   automatically (`npm run vercel-build`); it never overwrites anything already edited in `/admin`.
5. Open the site. Pick any "Sample" name to try the resident side; open `/admin` with the passcode for the admin side.
6. **Before real launch:** delete `SEED_SAMPLE_RESIDENTS`, then Admin → Data → **Delete sample data**, and work through **Content flags**.

Every push to a branch also gets its own preview link from Vercel (shown on the GitHub branch and in the Vercel dashboard).

To use a Supabase project you created yourself instead, set `DATABASE_URL` to its **Transaction pooler** connection string (port 6543).
You can also run the database steps by hand: `npm run db:migrate`, `npm run db:seed`, `npm run db:seed-samples`.

## Everyday admin tasks

- **Add residents:** Admin → Roster → "Add one resident", or "Add many" and paste lines like `First, Last, Grade band[, Group, School]`.
  New residents immediately get all three phases with their group's dates. Two residents with the same name get a label (school or last initial) so the picker can tell them apart.
- **Locked out / forgot PIN:** Admin → Roster (or the resident's page) shows the PIN (click to reveal), a Locked badge, and Unlock / Reset PIN buttons.
  Reset clears the PIN; the resident creates a new one at their next sign-in.
- **Verify items:** on the Completion grid, click a "✓ Verify?" cell to mark it Verified (click again to clear). The resident page has the same controls, plus Module 2's checklist.
- **Praxis statuses:** Admin → Praxis upload. CSV columns `First, Last, Stage, Math, Reading, Writing`. You get a preview and a list of unmatched rows before saving.
- **Due dates and links:** Admin → Settings. Group welcome-email dates and per-group overrides: Admin → Groups.
- **Prework Update email:** Admin → Completion → "Prework status export" (filter by group first). Columns match last year's merge fields.
- **Mentor Match responses:** Admin → Mentor Match (filter, view, edit, reopen, CSV export). Admin only: includes identity preferences.

## Editing module content

Module text and quizzes are in `content/modules/*.json`; the Mentor Match survey is `content/forms/mentor-match.json`.
Ask Claude Code to make the edit, then push; Vercel redeploys automatically.

- To flip a quiz answer, change that question's `"correct"` letter.
- Keep every `id` / `promptId` / `activityId` the same so saved answers stay attached. Add new ids for new questions.
- Blocks marked `"sample": true` show a "sample, replace" or "CTR to confirm" tag to residents until replaced.
- Each section has an `"audioUrl"` slot for narrated audio (blank for now).
- Links in content refer to settings keys (`"linkKey": "url.m3.four_domains_video"`), so the URL itself is set in Admin → Settings.

## Next year's cohort

1. Admin → Data → **Download full backup (JSON)**, plus any CSVs you want.
2. Admin → Data → **Delete a cohort** (type `DELETE 2028` to confirm).
3. Admin → Settings: update module due dates, Praxis dates, and Phase 3 dates. Admin → Groups: new welcome-email dates.
4. Add the new roster. New residents use the cohort year of existing residents (2028 by default); to change the default, edit `cohortYear()` in `app/actions/admin.ts`.

## Cost and hosting notes

- Vercel Hobby and Supabase Free cover ~70 users at $0. Supabase Pro ($25/month) adds daily backups.
- Supabase free projects **pause after a week with no traffic**. During onboarding there is steady traffic; for quiet months either upgrade or set up a simple weekly visit to the site.

## Privacy notes

- Sign-in is name + 4-digit PIN, locked after 5 wrong tries. Admins can read PINs by design (for lockout support), so share the admin passcode only with the CTR team.
- The app does **not** collect background checks, HR documents, or Praxis documents; it only links to the existing systems.
- Reflections, quiz answers, and survey responses are visible to admins only. Residents are told this on the landing page, module pages, and the survey.

## Local development

```bash
cp .env.example .env.local      # point DATABASE_URL at a local Postgres
npm install
npm run db:migrate && npm run db:seed && npm run db:seed-samples
npm run dev                     # http://localhost:3000 (admin at /admin)
npm run typecheck
```
