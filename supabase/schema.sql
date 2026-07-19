create table if not exists public.game_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  points bigint not null default 0,
  coins bigint not null default 0,
  tap_power bigint not null default 1,
  auto_tap_level integer not null default 0,
  auto_tap_power bigint not null default 1,
  workshop_count integer not null default 0,
  factory_count integer not null default 0,
  treasure_worker_level integer not null default 0,
  guardian_worker_level integer not null default 0,
  savings_points bigint not null default 0,
  rebirth_count integer not null default 0,
  lifetime_points bigint not null default 0,
  legacy_points integer not null default 0,
  legacy_earned_total integer not null default 0,
  legacy_production_level integer not null default 0,
  legacy_offline_level integer not null default 0,
  legacy_bounty_level integer not null default 0,
  legacy_treasure_level integer not null default 0,
  legacy_start_coins_level integer not null default 0,
  rebirth_tap_multiplier bigint not null default 1,
  shield_charges integer not null default 0,
  total_taps bigint not null default 0,
  enemy_defeats bigint not null default 0,
  highest_points bigint not null default 0,
  highest_auto_rate bigint not null default 0,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.game_states
  add column if not exists rebirth_tap_multiplier bigint not null default 1;

alter table public.game_states
  add column if not exists auto_tap_power bigint not null default 1;

alter table public.game_states
  add column if not exists workshop_count integer not null default 0;

alter table public.game_states
  add column if not exists factory_count integer not null default 0;

alter table public.game_states
  add column if not exists treasure_worker_level integer not null default 0;

alter table public.game_states
  add column if not exists guardian_worker_level integer not null default 0;

alter table public.game_states
  add column if not exists savings_points bigint not null default 0;

alter table public.game_states
  add column if not exists lifetime_points bigint not null default 0,
  add column if not exists legacy_points integer not null default 0,
  add column if not exists legacy_earned_total integer not null default 0,
  add column if not exists legacy_production_level integer not null default 0,
  add column if not exists legacy_offline_level integer not null default 0,
  add column if not exists legacy_bounty_level integer not null default 0,
  add column if not exists legacy_treasure_level integer not null default 0,
  add column if not exists legacy_start_coins_level integer not null default 0;

create table if not exists public.rebirth_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  generation integer not null,
  reached_points bigint not null,
  tap_power bigint not null,
  auto_tap_level integer not null,
  created_at timestamptz not null default now()
);

alter table public.game_states enable row level security;
alter table public.rebirth_history enable row level security;

drop policy if exists "users manage their own game state" on public.game_states;
drop policy if exists "users manage their own rebirth history" on public.rebirth_history;

create policy "users manage their own game state"
  on public.game_states for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "users manage their own rebirth history"
  on public.rebirth_history for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
