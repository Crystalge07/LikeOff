-- Tie-break equal streaks by most recent run (finished_at desc).
-- Safe to re-run; also folded into schema.sql.

create or replace function public.get_leaderboard_all_time()
returns table (name text, score integer)
language sql
stable
security definer
set search_path = public
as $$
  select display_name as name, streak as score
  from public.score_runs
  order by streak desc, finished_at desc
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
  order by streak desc, finished_at desc
  limit 10;
$$;
