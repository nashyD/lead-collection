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
