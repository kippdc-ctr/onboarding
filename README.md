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
| `DATABASE_URL` | Supabase Postgres connection string. Use the **Transaction pooler** string (port 6543) from Supabase → Project Settings → Database. |
| `ADMIN_PASSCODE` | The shared CTR team passcode for `/admin`. Changing it signs every admin out. |
| `SESSION_SECRET` | Long random string that signs sign-in cookies. Generate with `openssl rand -hex 32`. |
| `PIN_ENCRYPTION_KEY` | Long random string that encrypts resident PINs at rest. Generate with `openssl rand -hex 32`. **Never change it** after residents set PINs, or their PINs can't be read (they'd need resets). |
| `APP_TIME_ZONE` | Optional. Defaults to `America/New_York`; used for "today" in due dates. |

Copy `.env.example` to `.env.local` for local development.

## Deploy (first time)

1. **Supabase:** create a free project. Copy the transaction-pooler connection string (with your DB password).
2. **Create the tables and seed data** from your computer (one time, and again after schema changes):
   ```bash
   npm install
   DATABASE_URL="postgres://..." npm run db:migrate
   DATABASE_URL="postgres://..." npm run db:seed          # groups, modules, phase items, settings
   DATABASE_URL="postgres://..." npm run db:seed-samples  # optional: 10 clearly fake residents for testing
   ```
   Seeding never overwrites rows that already exist, so it is safe to re-run.
3. **Vercel:** import this GitHub repo, add the four environment variables above (Production and Preview), and deploy.
4. Open `/admin`, sign in with the passcode, and work through **Content flags** (every link still empty).

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
