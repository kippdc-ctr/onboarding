-- CTR Observation App schema. Safe to re-run (every statement is idempotent).
create extension if not exists pgcrypto;

create table if not exists observers (
  id text primary key,                 -- 'ashley', 'alison'
  name text not null,
  full_name text not null default '',
  advisor_code text not null default '', -- matches the Advisor column on the roster (APC, AC)
  email text not null default '',
  is_admin boolean not null default false
);

create table if not exists cycles (
  number int primary key,
  theme text not null,
  start_date date not null,
  end_date date not null
);

create table if not exists indicators (
  code text primary key,
  name text not null,
  short_label text not null,
  domain text not null,                -- CC or CK
  area text not null,                  -- Learning Environment, Intellectual Prep, Responsive Instruction
  sort int not null,
  scored boolean not null default true,
  introduced_cycle int,
  first_scored_cycle int,              -- per-indicator setting: scorable from this cycle's start date
  tier int                             -- the tier that first includes this indicator
);

create table if not exists cfs (
  id text primary key,                 -- 'CC.A.4.1'
  indicator text not null references indicators(code),
  short_label text not null,
  full_text text not null,
  sort int not null default 0
);

create table if not exists tiers (
  number int primary key,
  name text not null,
  calendar_cycle int not null          -- Standard residents reach this tier when this cycle starts
);

create table if not exists tracks (
  code text primary key,
  name text not null,
  follows_calendar boolean not null default false,
  sort int not null default 0
);

create table if not exists residents (
  id uuid primary key default gen_random_uuid(),
  person_id text not null unique,      -- permanent person ID (carries through senior resident and alumni status)
  full_name text not null,
  preferred_first text not null default '',
  last_name text not null default '',
  pronouns text not null default '',
  status text not null default '',
  advisor_code text not null default '',
  school text not null default '',
  campus text not null default '',
  grade_band text not null default '',
  content text not null default '',
  grade text not null default '',
  mentor_teacher text not null default '',
  mentor_email text not null default '',
  manager text not null default '',
  email text not null default '',
  active boolean not null default true,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists residents_name_idx on residents (lower(full_name));

-- Track and tier history. The row with the latest effective_from (then created_at) on or before a date is in force.
create table if not exists resident_track (
  id bigserial primary key,
  resident_id uuid not null references residents(id) on delete cascade,
  track text not null references tracks(code),
  tier int,                            -- null for calendar-following tracks
  effective_from date not null,
  reason text not null default '',
  decided_by text references observers(id),
  set_by text references observers(id),
  previous_track text,
  previous_tier int,
  created_at timestamptz not null default now()
);
create index if not exists resident_track_idx on resident_track (resident_id, effective_from);

create table if not exists resident_indicator_override (
  resident_id uuid not null references residents(id) on delete cascade,
  indicator text not null references indicators(code),
  mode text not null check (mode in ('on', 'off')),
  effective_from date not null,
  reason text not null default '',
  set_by text references observers(id),
  created_at timestamptz not null default now(),
  primary key (resident_id, indicator)
);

-- Optional per-resident cycle calendar (promoted residents on different dates).
create table if not exists resident_cycle_override (
  resident_id uuid not null references residents(id) on delete cascade,
  cycle int not null references cycles(number),
  start_date date not null,
  end_date date not null,
  primary key (resident_id, cycle)
);

create table if not exists resident_priorities (
  id bigserial primary key,
  resident_id uuid not null references residents(id) on delete cascade,
  cycle int not null,
  indicator text references indicators(code),
  note text not null,
  closed boolean not null default false,
  created_by text references observers(id),
  created_at timestamptz not null default now()
);

create table if not exists action_steps (
  id text primary key,                 -- permanent ID, e.g. AS-001 (current), AS-L01 (legacy), AS-101 (added later)
  domain text not null,
  indicator text not null references indicators(code),
  cfs_ids text[] not null default '{}',
  link_type text not null default 'single' check (link_type in ('single', 'multiple', 'cross_cutting')),
  text text not null,
  skill_level text not null default '',
  grade_band text not null default '',
  content_area text not null default '',
  look_fors text not null default '',
  practice_rep text not null default '',
  resource_url text not null default '',
  tags text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'draft', 'retired')),
  is_legacy boolean not null default false,
  replacement_id text references action_steps(id),
  merged_into text references action_steps(id),
  intro_cycle int,
  source text not null default '',
  pair_group text not null default '',
  review_note text not null default '',
  created_at date not null default current_date,
  retired_at date,
  updated_at timestamptz not null default now()
);

create table if not exists action_step_history (
  id bigserial primary key,
  step_id text not null references action_steps(id) on delete cascade,
  changed_at timestamptz not null default now(),
  changed_by text,
  change text not null,                -- created, edited, retired, restored, merged
  before jsonb,
  after jsonb
);

create table if not exists observations (
  id uuid primary key default gen_random_uuid(),
  client_id text unique,               -- idempotency key from the device (offline queue retries)
  resident_id uuid not null references residents(id),
  observer_id text not null references observers(id),
  type text not null default '',
  involvement text not null default '',
  observed_at timestamptz not null,
  observed_date date not null,
  cycle int not null,
  cycle_overridden boolean not null default false,
  status text not null default 'submitted' check (status in ('draft', 'submitted')),
  internal_comments text not null default '',
  affirming text not null default '',
  adjusting text not null default '',
  send_flag boolean not null default true,
  include_snapshot boolean not null default true,
  next_note text not null default '',
  sent_at timestamptz,
  sent_by text references observers(id),
  source text not null default 'app',  -- app or import
  import_ref text unique,              -- Fillout submission ID for imported rows
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  deleted_at timestamptz
);
create index if not exists observations_resident_idx on observations (resident_id, observed_at);

create table if not exists observation_scores (
  observation_id uuid not null references observations(id) on delete cascade,
  indicator text not null references indicators(code),
  score int check (score between 1 and 4), -- null = comment only
  expected_status text not null default 'expected' check (expected_status in ('expected', 'early')),
  cfs_demonstrated text[] not null default '{}',
  comment text not null default '',
  primary key (observation_id, indicator)
);

create table if not exists observation_action_steps (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references observations(id) on delete cascade,
  slot int not null check (slot between 1 and 5),
  step_id text references action_steps(id),
  custom_text text,
  custom_look_fors text not null default '',
  custom_practice text not null default '',
  indicator text references indicators(code),
  personalization_note text not null default '',
  wording_snapshot text not null,
  legacy_text boolean not null default false, -- imported text that matched no library step
  promoted_step_id text references action_steps(id),
  unique (observation_id, slot)
);

create table if not exists step_followthrough (
  observation_id uuid not null references observations(id) on delete cascade,
  prior_assignment_id uuid not null references observation_action_steps(id) on delete cascade,
  result text not null check (result in ('yes', 'partially', 'no', 'not_observed')),
  note text not null default '',
  primary key (observation_id, prior_assignment_id)
);

create table if not exists settings (
  key text primary key,
  value text not null default ''
);

create table if not exists audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text,
  action text not null,
  entity text not null default '',
  entity_id text not null default '',
  detail jsonb
);
create index if not exists audit_log_at_idx on audit_log (at desc);
