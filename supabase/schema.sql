-- Run this in Supabase Dashboard → SQL Editor (once per project).

create table if not exists public.score_runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 24),
  streak int not null check (streak >= 0 and streak <= 128),
  finished_at timestamptz not null default now()
);

create index if not exists score_runs_streak_idx on public.score_runs (streak desc);
create index if not exists score_runs_finished_at_idx on public.score_runs (finished_at desc);
create index if not exists score_runs_player_id_idx on public.score_runs (player_id);

alter table public.score_runs enable row level security;

drop policy if exists "score_runs_select" on public.score_runs;
create policy "score_runs_select"
  on public.score_runs for select
  to anon, authenticated
  using (true);

drop policy if exists "score_runs_insert" on public.score_runs;
create policy "score_runs_insert"
  on public.score_runs for insert
  to anon, authenticated
  with check (
    streak >= 0
    and streak <= 128
    and char_length(trim(display_name)) between 1 and 24
  );

-- Leaderboards & stats (Toronto "today" handled in SQL)
create or replace function public.get_leaderboard_all_time()
returns table (name text, score integer)
language sql
stable
security invoker
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
security invoker
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
security invoker
set search_path = public
as $$
  select
    count(distinct player_id)::bigint as unique_players,
    coalesce(sum(streak * 2), 0)::bigint as posts_judged
  from public.score_runs;
$$;

grant usage on schema public to anon, authenticated;
grant select, insert on public.score_runs to anon, authenticated;
grant execute on function public.get_leaderboard_all_time() to anon, authenticated;
grant execute on function public.get_leaderboard_today() to anon, authenticated;
grant execute on function public.get_global_stats() to anon, authenticated;
