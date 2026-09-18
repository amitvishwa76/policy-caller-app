-- Run this in the Supabase SQL editor.
-- It creates/updates the supporting tables the web app needs.
-- Your existing `policy_list` table is untouched.

-- If you ran an earlier version of this migration (with a 'frequency'
-- daily/twice_daily schedule), this section upgrades it to the new
-- manual/auto model. Safe to run even on a fresh database, and safe to
-- run more than once.
alter table if exists sync_settings drop constraint if exists sync_settings_frequency_check;
alter table if exists sync_settings drop column if exists frequency;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'sync_settings' and column_name = 'last_run_at'
  ) and not exists (
    select 1 from information_schema.columns
    where table_name = 'sync_settings' and column_name = 'last_auto_check_at'
  ) then
    alter table sync_settings rename column last_run_at to last_auto_check_at;
  end if;
end $$;

create table if not exists sync_settings (
  id int primary key,
  days_ahead int not null default 60,
  only_pending boolean not null default true,
  auto_send boolean not null default false,
  last_auto_check_at timestamptz
);

-- In case the table already existed without these columns (upgrade path).
alter table sync_settings add column if not exists auto_send boolean not null default false;
alter table sync_settings add column if not exists last_auto_check_at timestamptz;

create table if not exists sync_log (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  trigger text not null,        -- 'manual' | 'auto'
  days int,
  matched int,
  inserted int,
  status text not null,         -- 'success' | 'partial_error' | 'error' | 'no_matches'
  detail text
);

-- Tracks which policies have already been pushed to the Genesys calling
-- list, so auto-send never sends the same policy twice. Manual sends also
-- record here, so auto-send won't re-send something you already sent by hand.
create table if not exists genesys_sync_state (
  policy_id bigint primary key references policy_list (id) on delete cascade,
  synced_at timestamptz not null default now()
);

-- Seed the single settings row (id = 1) the app reads/writes.
insert into sync_settings (id, days_ahead, only_pending, auto_send)
values (1, 60, true, false)
on conflict (id) do nothing;

-- Dummy payment links: one persistent, unguessable token per policy.
-- The same link is reused every time a policy is (re)synced to Genesys.
create table if not exists payment_links (
  token text primary key,
  policy_id bigint not null unique references policy_list (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Track the Genesys contact ID returned when we insert each contact, so a
-- later payment can update that specific contact's prem_paid_status.
alter table genesys_sync_state add column if not exists genesys_contact_id text;
