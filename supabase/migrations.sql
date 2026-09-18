-- Run this once in the Supabase SQL editor.
-- It creates the two supporting tables the web app needs.
-- Your existing `policy_list` table is untouched.

create table if not exists sync_settings (
  id int primary key,
  frequency text not null default 'off' check (frequency in ('off', 'daily', 'twice_daily')),
  days_ahead int not null default 60,
  only_pending boolean not null default true,
  last_run_at timestamptz
);

create table if not exists sync_log (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  trigger text not null,        -- 'manual' | 'cron'
  days int,
  matched int,
  inserted int,
  status text not null,         -- 'success' | 'partial_error' | 'error' | 'no_matches'
  detail text
);

-- Seed the single settings row (id = 1) the app reads/writes.
insert into sync_settings (id, frequency, days_ahead, only_pending)
values (1, 'off', 60, true)
on conflict (id) do nothing;
