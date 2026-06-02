-- Historical migration — fully folded into schema.sql (run schema.sql only for new setups).
-- Kept for reference; safe to re-run if you applied an older schema.sql without these pieces.

-- ============================================================
-- 0. Server-set created_at (rate limit / global cap use this, not client times)
-- ============================================================
alter table public.score_runs
  add column if not exists created_at timestamptz not null default now();

alter table public.score_runs drop constraint if exists score_runs_streak_check;
alter table public.score_runs
  add constraint score_runs_streak_check check (streak >= 0 and streak <= 35);

-- ============================================================
-- 1. Profanity blocklist helper
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
-- 2. BEFORE INSERT trigger function
-- ============================================================
create or replace function public.score_runs_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.finished_at := now();
  new.created_at := now();

  if (
    select count(*)::int
    from public.score_runs
    where created_at > now() - interval '10 seconds'
  ) >= 20 then
    raise exception 'Too many score submissions right now. Try again in a few seconds.'
      using errcode = 'P0001';
  end if;

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
