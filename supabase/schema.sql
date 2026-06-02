-- Run this in Supabase Dashboard → SQL Editor (once per project).
-- One file: table, RLS, RPCs, rate limit, profanity, server-owned timestamps.
-- Note: SQL role "anon" is Supabase's public API role. In the app use the Publishable key.

-- Max streak = unique_posts / 2 (integer division). Current deck: 71 posts → 35.
-- Update this cap in SQL when posts.js grows (must match leaderboard.js maxAchievableStreak).

create table if not exists public.score_runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 24),
  streak int not null check (streak >= 0 and streak <= 35),
  finished_at timestamptz not null default now()
);

alter table public.score_runs
  add column if not exists created_at timestamptz not null default now();

-- Tighten streak cap on existing projects (idempotent)
alter table public.score_runs drop constraint if exists score_runs_streak_check;
alter table public.score_runs
  add constraint score_runs_streak_check check (streak >= 0 and streak <= 35);

create index if not exists score_runs_streak_idx on public.score_runs (streak desc);
create index if not exists score_runs_finished_at_idx on public.score_runs (finished_at desc);
create index if not exists score_runs_player_id_idx on public.score_runs (player_id);
create index if not exists score_runs_created_at_idx on public.score_runs (created_at desc);

alter table public.score_runs enable row level security;

-- No direct table reads for anon; leaderboards/stats use SECURITY DEFINER RPCs below.
drop policy if exists "score_runs_select" on public.score_runs;

drop policy if exists "score_runs_insert" on public.score_runs;
create policy "score_runs_insert"
  on public.score_runs for insert
  to anon, authenticated
  with check (
    streak >= 0
    and streak <= 35
    and char_length(trim(display_name)) between 1 and 24
  );

-- Leaderboards & stats (Toronto "today" handled in SQL; SECURITY DEFINER reads score_runs)
create or replace function public.get_leaderboard_all_time()
returns table (name text, score integer)
language sql
stable
security definer
set search_path = public
as $$
  select display_name as name, streak as score
  from public.score_runs
  order by streak desc, finished_at asc
  limit 10;
$$;

create or replace function public.get_leaderboard_today()
returns table (name text, score integer)
language sql
stable
security definer
set search_path = public
as $$
  select display_name as name, streak as score
  from public.score_runs
  where (finished_at at time zone 'America/Toronto')::date
      = (now() at time zone 'America/Toronto')::date
  order by streak desc, finished_at asc
  limit 10;
$$;

create or replace function public.get_global_stats()
returns table (unique_players bigint, posts_judged bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(distinct player_id)::bigint as unique_players,
    coalesce(sum(streak * 2), 0)::bigint as posts_judged
  from public.score_runs;
$$;

-- ============================================================
-- Profanity blocklist helper
-- ============================================================
create or replace function public.name_contains_profanity(input text)
returns boolean
language sql
immutable
set search_path = public
as $$
  with
    blocklist as (
      select unnest(array[
        'fuck','shit','ass','bitch','cock','cunt',
        'nigger','nigga','faggot','retard',
        'pussy','whore','slut','bastard',
        'asshole','motherfucker','twat'
      ]) as word
    ),
    raw as (
      select coalesce(input, '')::text as s
    ),
    lowered as (
      select lower(s) as s
      from raw
    ),
    flags as (
      select
        s,
        (
          s ~ '[[:space:].,_\\-\\+\\*\\^]+'
          or s ~ '[@4]|3|[1!|]|0|[$5]|7'
          or s ~ '[àáâãäåāăąèéêëēĕėęěìíîïīĭįòóôõöōŏőùúûüūŭůűų]'
          or s ~ '(.)\\1{2,}'
        ) as obfuscated
      from lowered
    ),
    wordish_0 as (
      select
        obfuscated,
        regexp_replace(
          s,
          '[[:space:].,_\\-\\+\\*\\^]+',
          ' ',
          'g'
        ) as s
      from flags
    ),
    mapped as (
      select
        obfuscated,
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(s, '[@4]', 'a', 'g'),
                '3', 'e', 'g'),
              '[1!|]', 'i', 'g'),
            '0', 'o', 'g'),
          '[$5]', 's', 'g'),
        '7', 't', 'g'
        ) as s
      from wordish_0
    ),
    unaccented as (
      select
        obfuscated,
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  s,
                  '[àáâãäåāăą]', 'a', 'g'
                ),
                '[èéêëēĕėęě]', 'e', 'g'
              ),
              '[ìíîïīĭį]', 'i', 'g'
            ),
            '[òóôõöōŏő]', 'o', 'g'
          ),
          '[ùúûüūŭůűų]', 'u', 'g'
        ) as s
      from mapped
    ),
    squashed as (
      select
        obfuscated,
        trim(regexp_replace(regexp_replace(s, '(.)\\1+', '\\1', 'g'), '\\s+', ' ', 'g')) as wordish,
        regexp_replace(regexp_replace(s, '(.)\\1+', '\\1', 'g'), '\\s+', '', 'g') as collapsed
      from unaccented
    )
  select exists (
    select 1
    from blocklist b
    cross join squashed n
    where
      n.wordish ~ ('\\m' || b.word || '\\M')
      or (n.obfuscated and position(b.word in n.collapsed) > 0)
  );
$$;

-- ============================================================
-- BEFORE INSERT trigger: timestamps, spam cap, rate limit, profanity
-- ============================================================
create or replace function public.score_runs_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Server-owned timestamps (ignore client-supplied finished_at / created_at).
  new.finished_at := now();
  new.created_at := now();

  -- Coarse global anti-spam (not a real defense; normal play is ~1 insert per run).
  if (
    select count(*)::int
    from public.score_runs
    where created_at > now() - interval '10 seconds'
  ) >= 20 then
    raise exception 'Too many score submissions right now. Try again in a few seconds.'
      using errcode = 'P0001';
  end if;

  -- Per player_id: 1 insert per 2 seconds (uses server-set created_at on prior rows).
  if exists (
    select 1 from public.score_runs
    where player_id = new.player_id
      and created_at > now() - interval '2 seconds'
  ) then
    raise exception 'Rate limited — wait a few seconds before submitting again.'
      using errcode = 'P0001';
  end if;

  if public.name_contains_profanity(new.display_name) then
    raise exception 'Display name contains inappropriate language.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_score_runs_before_insert on public.score_runs;

create trigger trg_score_runs_before_insert
  before insert on public.score_runs
  for each row
  execute function public.score_runs_before_insert();

-- Permissions: anon may insert scores and call RPCs only (no direct SELECT on score_runs).
grant usage on schema public to anon, authenticated;
revoke all on public.score_runs from anon;
grant insert on public.score_runs to anon, authenticated;
grant execute on function public.get_leaderboard_all_time() to anon, authenticated;
grant execute on function public.get_leaderboard_today() to anon, authenticated;
grant execute on function public.get_global_stats() to anon, authenticated;
