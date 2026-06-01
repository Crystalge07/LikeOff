-- Migration: rate-limit per player_id + basic profanity filter on display_name.
-- Idempotent — safe to re-run in Supabase SQL Editor.
-- Adds a BEFORE INSERT trigger; does NOT touch the existing RLS INSERT policy.

-- ============================================================
-- 0. Add server-set created_at column (idempotent)
--    finished_at is client-supplied (game-end time); created_at
--    is when the row was actually written — rate-limit uses this.
-- ============================================================
alter table public.score_runs
  add column if not exists created_at timestamptz not null default now();

-- ============================================================
-- 1. Profanity blocklist helper
-- ============================================================
create or replace function public.name_contains_profanity(input text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select exists (
    select 1
    from unnest(array[
      'fuck','shit','ass','bitch','dick','cock','cunt',
      'nigger','nigga','faggot','retard',
      'pussy','whore','slut','bastard','damn','piss',
      'asshole','motherfucker','twat'
    ]) as word
    where lower(input) ~ ('\m' || word || '\M')   -- whole-word match
  );
$$;

-- ============================================================
-- 2. BEFORE INSERT trigger function
-- ============================================================
create or replace function public.score_runs_before_insert()
returns trigger
language plpgsql
security definer              -- needs to query the table bypassing RLS
set search_path = public
as $$
begin
  -- ── Rate limit: 1 insert per player_id per 2 seconds ──
  -- Uses server-set created_at, not client-supplied finished_at.
  if exists (
    select 1 from public.score_runs
    where player_id = new.player_id
      and created_at > now() - interval '2 seconds'
  ) then
    raise exception 'Rate limited — wait a few seconds before submitting again.'
      using errcode = 'P0001';
  end if;

  -- ── Profanity filter ──
  if public.name_contains_profanity(new.display_name) then
    raise exception 'Display name contains inappropriate language.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- ============================================================
-- 3. Attach trigger (drop first so re-runs are clean)
-- ============================================================
drop trigger if exists trg_score_runs_before_insert on public.score_runs;

create trigger trg_score_runs_before_insert
  before insert on public.score_runs
  for each row
  execute function public.score_runs_before_insert();
