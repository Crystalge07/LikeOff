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
  /*
    Normalization goals (in order):
    - lowercase
    - collapse separators used to split words (spaces, dots, hyphens, underscores, asterisks, plus, commas, etc.)
    - map common leetspeak + accented vowels to base letters
    - collapse repeated chars (cuuunt -> cunt)

    Matching goals:
    - Prefer whole-word boundaries on a "wordish" normalized string (avoid Scunthorpe problem).
    - Also catch obfuscated variants where separators/leet were used by checking a fully-collapsed string,
      but ONLY when the input appears obfuscated (otherwise we'd block innocent substrings like "scunthorpe").
  */
  with
    blocklist as (
      -- Keep this list simple to extend.
      select unnest(array[
        'fuck','shit','ass','bitch','dick','cock','cunt',
        'nigger','nigga','faggot','retard',
        'pussy','whore','slut','bastard','damn','piss',
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
      /*
        Only attempt "embedded in collapsed string" matching when there's evidence of obfuscation:
        separators, common leet chars, accented vowels, or 3+ repeated chars.
      */
      select
        s,
        (
          s ~ '[[:space:].,_\\-\\+\\*\\^]+'  -- separators (incl caret for c^nt)
          or s ~ '[@4]|3|[1!|]|0|[$5]|7'     -- leetspeak-ish chars
          or s ~ '[àáâãäåāăąèéêëēĕėęěìíîïīĭįòóôõöōŏőùúûüūŭůűų]'
          or s ~ '(.)\\1{2,}'                -- 3+ repeats
        ) as obfuscated
      from lowered
    ),
    wordish_0 as (
      -- Replace separators with spaces so word boundaries still exist.
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
        -- leetspeak
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
        -- map common accented vowels to base vowel (keep it SQL-only; no extensions required)
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
        -- collapse repeated chars and normalize whitespace
        trim(regexp_replace(regexp_replace(s, '(.)\\1+', '\\1', 'g'), '\\s+', ' ', 'g')) as wordish,
        regexp_replace(regexp_replace(s, '(.)\\1+', '\\1', 'g'), '\\s+', '', 'g') as collapsed
      from unaccented
    )
  select exists (
    select 1
    from blocklist b
    cross join squashed n
    where
      -- Prefer whole-word matches (minimize false positives)
      n.wordish ~ ('\\m' || b.word || '\\M')
      -- Also catch obfuscated variants when separators/leet were used
      or (n.obfuscated and position(b.word in n.collapsed) > 0)
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
