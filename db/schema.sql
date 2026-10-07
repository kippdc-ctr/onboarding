-- CTR Onboarding Hub schema. Safe to run more than once (idempotent).
-- The browser never talks to this database; only the Next.js server does.

create extension if not exists pgcrypto;

create table if not exists groups (
  number              int primary key check (number between 1 and 8),
  welcome_email_date  date
);

create table if not exists residents (
  id                   uuid primary key default gen_random_uuid(),
  first_name           text not null,
  last_name            text not null,
  preferred_name       text,
  picker_label         text,            -- distinguishing label when two residents share a name
  grade_band           text check (grade_band in ('ECE','Elementary','Middle','Secondary')),
  group_number         int references groups(number),
  school               text,
  email                text,
  cohort_year          int not null default 2028,
  active               boolean not null default true,
  is_sample            boolean not null default false,
  added_on             date not null default current_date,
  pin_encrypted        text,
  pin_set_at           timestamptz,
  failed_pin_attempts  int not null default 0,
  locked               boolean not null default false,
  praxis_exempt        boolean,         -- null = Praxis status not loaded yet
  last_active_at       timestamptz
);
create index if not exists residents_active_idx on residents (active, cohort_year);

create table if not exists phase_items (
  id            text primary key,
  phase         int not null check (phase in (1,3)),
  sort_order    int not null default 0,
  label         text not null,
  description   text,
  link_key      text,                   -- settings key holding the URL
  due_rule      text not null check (due_rule in ('group_plus_days','fixed')),
  due_days      int,                    -- for group_plus_days
  due_date      date,                   -- for fixed
  required      boolean not null default true,
  condition     text                    -- e.g. 'praxis_not_exempt'
);

create table if not exists item_checks (
  resident_id  uuid not null references residents(id) on delete cascade,
  item_id      text not null references phase_items(id) on delete cascade,
  checked      boolean not null default false,
  checked_at   timestamptz,
  verified     boolean not null default false,
  verified_by  text,
  verified_at  timestamptz,
  primary key (resident_id, item_id)
);

create table if not exists praxis_status (
  resident_id  uuid primary key references residents(id) on delete cascade,
  stage        int check (stage between 1 and 6),
  math         text,
  reading      text,
  writing      text,
  updated_at   timestamptz not null default now()
);

create table if not exists modules (
  slug           text primary key,
  title          text not null,
  sort_order     int not null,
  due_date       date,
  soft_due_date  timestamptz,
  enabled        boolean not null default true
);

-- Per-group due date overrides. target examples: 'phase1', 'module:what-we-believe', 'item:p3-workday'.
create table if not exists group_due_overrides (
  group_number  int not null references groups(number) on delete cascade,
  target        text not null,
  due_date      date not null,
  primary key (group_number, target)
);

create table if not exists module_progress (
  resident_id     uuid not null references residents(id) on delete cascade,
  module_slug     text not null references modules(slug) on delete cascade,
  started_at      timestamptz,
  completed_at    timestamptz,
  last_active_at  timestamptz,
  primary key (resident_id, module_slug)
);

create table if not exists quiz_attempts (
  id               bigserial primary key,
  resident_id      uuid not null references residents(id) on delete cascade,
  module_slug      text not null,
  attempt_no       int not null default 1,
  question_id      text not null,
  selected_option  text not null,
  is_correct       boolean not null,
  attempted_at     timestamptz not null default now(),
  unique (resident_id, module_slug, attempt_no, question_id)
);

create table if not exists reflections (
  resident_id    uuid not null references residents(id) on delete cascade,
  module_slug    text not null,
  prompt_id      text not null,
  response_text  text not null default '',
  updated_at     timestamptz not null default now(),
  primary key (resident_id, prompt_id)
);

create table if not exists checklist_items (
  resident_id  uuid not null references residents(id) on delete cascade,
  module_slug  text not null,
  item_id      text not null,
  checked      boolean not null default false,
  checked_at   timestamptz,
  verified     boolean not null default false,
  verified_at  timestamptz,
  primary key (resident_id, module_slug, item_id)
);

create table if not exists activity_results (
  resident_id   uuid not null references residents(id) on delete cascade,
  module_slug   text not null,
  activity_id   text not null,
  payload_json  jsonb not null default '{}'::jsonb,
  completed_at  timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (resident_id, module_slug, activity_id)
);

create table if not exists form_responses (
  resident_id   uuid not null references residents(id) on delete cascade,
  form_slug     text not null,
  answers_json  jsonb not null default '{}'::jsonb,
  status        text not null default 'draft' check (status in ('draft','submitted')),
  submitted_at  timestamptz,
  reopened_by   text,
  updated_at    timestamptz not null default now(),
  primary key (resident_id, form_slug)
);

create table if not exists settings (
  key    text primary key,
  value  text not null default ''
);
