-- CTR Program Metrics Hub schema. Safe to run more than once (idempotent).
-- Everything lives in its own Postgres schema ("metrics") so it can share a Supabase project
-- with the Onboarding Hub without name clashes. Only the Next.js server talks to this database.

create extension if not exists pgcrypto;
create schema if not exists metrics;

-- ---------- People who can sign in ----------

create table if not exists metrics.app_users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique check (email = lower(email)),
  name           text,
  role           text not null check (role in ('owner','team','rdl')),
  campus         text,                     -- required for rdl
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  last_login_at  timestamptz,
  version        int not null default 1    -- bumped on role/active changes; signs the user out everywhere
);

create table if not exists metrics.audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  user_email  text not null,
  action      text not null,               -- sign_in | view_members | import | goal_edit | measurement | user_change | export | year_change
  target      text,
  detail      jsonb not null default '{}'::jsonb
);
create index if not exists audit_log_at_idx on metrics.audit_log (at desc);

-- ---------- Calendar ----------

create table if not exists metrics.school_years (
  id          text primary key,             -- 'SY26-27'
  start_date  date not null,
  end_date    date not null,
  is_current  boolean not null default false,
  locked      boolean not null default false
);

create table if not exists metrics.campuses (
  name        text primary key,
  sort_order  int not null default 0
);

-- Cycles, evals, sprints, survey windows, and deadlines. A goal's measurement window opens on opens_on.
create table if not exists metrics.periods (
  school_year  text not null references metrics.school_years(id) on delete cascade,
  key          text not null,               -- 'C1', 'Eval 2', 'Sprint 3', 'EOY', 'June 1'
  kind         text not null check (kind in ('cycle','eval','sprint','survey','deadline')),
  opens_on     date not null,
  closes_on    date not null,
  sort_order   int not null default 0,
  confirmed    boolean not null default false,
  primary key (school_year, key)
);

-- ---------- Roster ----------

create table if not exists metrics.residents (
  id               uuid primary key default gen_random_uuid(),
  school_year      text not null references metrics.school_years(id) on delete cascade,
  first_name       text not null,           -- legal name; imports match on legal name + campus
  last_name        text not null,
  preferred_name   text,
  email            text,
  campus           text,
  school           text,
  grade_band       text,
  group_label      text,
  cohort           text,
  role             text not null default 'first_year' check (role in ('first_year','senior')),
  status           text not null default 'Enrolled - Resident',
  mentor_teacher   text,
  race_ethnicity   text,                    -- demographics: owner-only on screens, used only in goal breakdowns
  gender           text,
  is_sample        boolean not null default false,
  updated_at       timestamptz not null default now()
);
create unique index if not exists residents_identity_idx
  on metrics.residents (school_year, lower(first_name), lower(last_name), lower(coalesce(campus, '')));

-- ---------- Goals ----------

create table if not exists metrics.goals (
  id                 serial primary key,
  school_year        text not null references metrics.school_years(id) on delete cascade,
  number             int not null,           -- 0 = Big Goal
  category           text not null,
  text               text not null,
  type               text not null check (type in ('achievement','perception','input')),
  population         text not null,          -- first_year | mentor_teachers | senior_residents | alumni | incoming_cohort | ctr_team | students
  unit               text not null default 'percent' check (unit in ('percent','count')),
  direction          text not null default 'at_least' check (direction in ('at_least','at_most')),
  target_value       numeric not null,
  target_confirmed   boolean not null default false,
  target_count_note  text,                   -- e.g. "about 45 of 50 residents"
  numerator_def      text not null default '',
  denominator_def    text not null default '',
  source             text not null,          -- sources.key
  measured_at        text,                   -- periods.key; null = rolling (each cycle / sprint, latest wins)
  measured_label     text not null,          -- "Eval 3", "EOY survey", "Each cycle"
  pace_by            text check (pace_by in ('cycle','sprint')),  -- inputs shown "on pace" against the calendar
  baseline_value     numeric,
  baseline_n         text,
  baseline_note      text,
  doc_change         text,                   -- the Program Goals doc's "Change" column, kept for reference
  suppress_small_n   boolean not null default true,
  counts_withdrawn   boolean not null default false,  -- retention goals keep withdrawn residents in the denominator
  derive_rule        jsonb,                  -- computed from another goal's resident results (goals 32, 33)
  visibility         text not null default 'shared' check (visibility in ('shared','private')),
  owner              text not null default 'Ashley Pettway Carter',
  active             boolean not null default true,
  unique (school_year, number, visibility)
);

create table if not exists metrics.goal_changes (
  id          bigserial primary key,
  goal_id     int not null references metrics.goals(id) on delete cascade,
  changed_at  timestamptz not null default now(),
  changed_by  text not null,
  field       text not null,
  old_value   text,
  new_value   text,
  note        text
);

-- ---------- Sources, imports, measurements ----------

create table if not exists metrics.sources (
  key               text primary key,
  label             text not null,
  feeds             text not null default '',
  stale_after_days  int,
  sort_order        int not null default 0
);

create table if not exists metrics.imports (
  id            bigserial primary key,
  school_year   text not null references metrics.school_years(id) on delete cascade,
  kind          text not null check (kind in ('roster','aggregate','results','manual')),
  source        text not null references metrics.sources(key),
  goal_id       int references metrics.goals(id) on delete cascade,
  period        text,
  file_name     text,
  data_through  date,
  run_by        text not null,
  run_at        timestamptz not null default now(),
  rows_total    int not null default 0,
  rows_saved    int not null default 0,
  rows_failed   int not null default 0,
  problems      jsonb not null default '[]'::jsonb,
  is_sample     boolean not null default false
);
create index if not exists imports_source_idx on metrics.imports (school_year, source, run_at desc);

create table if not exists metrics.measurements (
  id                bigserial primary key,
  goal_id           int not null references metrics.goals(id) on delete cascade,
  period            text not null,
  breakdown_type    text not null default 'all',   -- all | campus | school | grade_band | group | race_ethnicity | gender
  breakdown_value   text not null default '',
  numerator         numeric not null,
  denominator       numeric,
  data_through      date not null,
  source_import_id  bigint references metrics.imports(id) on delete cascade,
  note              text,
  created_at        timestamptz not null default now(),
  unique (goal_id, period, breakdown_type, breakdown_value)
);

-- Per-resident results behind a measurement: powers "who is missing this goal".
-- Never used for perception (survey) goals: survey results stay aggregate.
create table if not exists metrics.goal_members (
  goal_id           int not null references metrics.goals(id) on delete cascade,
  period            text not null,
  resident_id       uuid not null references metrics.residents(id) on delete cascade,
  counted           boolean not null,
  met               boolean not null,
  raw_value         text,
  reason            text,                         -- why not counted
  source_import_id  bigint references metrics.imports(id) on delete cascade,
  primary key (goal_id, period, resident_id)
);

create table if not exists metrics.import_mappings (
  kind     text primary key,               -- 'roster' | 'results' | 'aggregate'
  mapping  jsonb not null
);

create table if not exists metrics.settings (
  key    text primary key,
  value  text not null
);

-- ---------- Passwords (email + personal password sign-in) ----------
alter table metrics.app_users add column if not exists password_hash text;          -- scrypt$<salt>$<hash>
alter table metrics.app_users add column if not exists must_change_password boolean not null default true;
alter table metrics.app_users add column if not exists failed_attempts int not null default 0;
alter table metrics.app_users add column if not exists locked_until timestamptz;
