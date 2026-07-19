create table if not exists public.game_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  points bigint not null default 0,
  coins bigint not null default 0,
  tap_power bigint not null default 1,
  auto_tap_level integer not null default 0,
  rebirth_count integer not null default 0,
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

create policy "users manage their own game state"
  on public.game_states for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "users manage their own rebirth history"
  on public.rebirth_history for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
