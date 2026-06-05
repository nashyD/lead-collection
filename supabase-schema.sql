-- Run this once in the Supabase SQL editor after creating your project.
-- It creates the leads table, indexes, and a status_updated_at trigger.
-- RLS is enabled with NO policies, so only the server-side service role key can read/write.

create extension if not exists "pgcrypto";

create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),

  -- captured from the form
  first_name      text not null,
  phone           text not null,        -- E.164 (e.g. +17045550123)
  email           text not null,

  -- attribution
  source          text default 'direct',
  medium          text default '',
  campaign        text default '',
  user_agent      text default '',
  ip              text default '',

  -- CRM fields (managed from the dashboard)
  status          text not null default 'new'
                  check (status in ('new','contacted','quoted','bound','lost')),
  notes           text default '',
  contacted_at    timestamptz,
  status_updated_at timestamptz not null default now()
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_status_idx     on public.leads (status);

-- Auto-stamp status_updated_at when status changes.
create or replace function public.leads_touch_status() returns trigger as $$
begin
  if new.status is distinct from old.status then
    new.status_updated_at := now();
    if new.status = 'contacted' and old.contacted_at is null then
      new.contacted_at := now();
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists leads_touch_status on public.leads;
create trigger leads_touch_status
  before update on public.leads
  for each row execute function public.leads_touch_status();

-- Lock the table down. The server uses the service_role key, which bypasses RLS.
-- The anon/auth keys (used in browsers) get zero access until you add a policy.
alter table public.leads enable row level security;

-- ---------------------------------------------------------------------------
-- Key/value settings (e.g. the office email notification recipient list).
-- Managed from the dashboard Settings panel; read server-side at lead time.
create table if not exists public.settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.settings (key, value)
values ('notify_emails', '')
on conflict (key) do nothing;

alter table public.settings enable row level security;

-- ---------------------------------------------------------------------------
-- Apartment complexes: the Gaston County canvassing list AND the dimension
-- leads attribute to. Seeded once from the Google Places API; maintained from
-- the dashboard Complexes tab.
create table if not exists public.complexes (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  address           text default '',
  city              text default '',
  lat               numeric,
  lng               numeric,
  place_id          text unique,          -- Google Places id; used to dedupe on re-seed
  units             int,
  canvass_status    text not null default 'not_started'
                    check (canvass_status in ('not_started','flyered','contacted','declined','partner')),
  last_contacted_at timestamptz,
  last_contacted_by text default '',
  notes             text default '',
  created_at        timestamptz not null default now()
);

create index if not exists complexes_status_idx         on public.complexes (canvass_status);
create index if not exists complexes_last_contacted_idx on public.complexes (last_contacted_at);

alter table public.complexes enable row level security;

-- Tie each lead to the complex the renter selected on the form (self-reported,
-- optional). complex_id when it matched a known complex; complex_other holds
-- a typed-in community that wasn't in the list.
alter table public.leads add column if not exists complex_id    uuid references public.complexes(id);
alter table public.leads add column if not exists complex_other text default '';
create index if not exists leads_complex_id_idx on public.leads (complex_id);

-- Self-reported preferred language (en/es/ht) so the office can route the lead to a
-- rep who speaks it. Whitelisted to en/es/ht server-side before insert.
alter table public.leads add column if not exists language text not null default 'en';

-- ---------------------------------------------------------------------------
-- Mileage tracker: one row per flyer-delivery trip. A canvasser enters their
-- name (remembered on their device) and taps Start; thereafter each arrival is a
-- "stop" they tap to record. Miles = the straight-line distance between
-- consecutive stops × a road factor — no continuous GPS, so the app needn't stay
-- open while driving. 'driver' is a free-text label (the shared office password
-- is the only auth), so mileage is attributed per person without a user system.
create table if not exists public.trips (
  id          uuid primary key default gen_random_uuid(),
  driver      text not null,
  status      text not null default 'active'
              check (status in ('active','completed')),
  source      text not null default 'gps'
              check (source in ('gps','manual')),  -- 'manual' once the total is hand-edited
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  miles       numeric not null default 0 check (miles >= 0),
  stops       int not null default 1,              -- recorded stops (the origin counts as 1)
  start_lat   numeric,
  start_lng   numeric,
  last_lat    numeric,                              -- most recent stop, for the next-leg calc
  last_lng    numeric,
  note        text default '',
  created_at  timestamptz not null default now()
);

create index if not exists trips_driver_idx     on public.trips (driver);
create index if not exists trips_started_at_idx  on public.trips (started_at desc);
create index if not exists trips_status_idx      on public.trips (status);

-- Service-role only, same as the other tables.
alter table public.trips enable row level security;

-- IRS standard mileage rate (US dollars per mile) for the trip-log $ estimate.
-- Editable from the dashboard Settings panel. Default is the 2025 IRS rate.
insert into public.settings (key, value)
values ('mileage_rate', '0.70')
on conflict (key) do nothing;
