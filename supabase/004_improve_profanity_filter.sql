-- Stronger profanity detection: expanded blocklist, more leet decoding,
-- phonetic bypass handling (ph→f, v→u), digit stripping.
-- Safe to re-run; also folded into schema.sql.

create or replace function public.name_contains_profanity(input text)
returns boolean
language sql
immutable
set search_path = public
as $$
  with
    blocklist as (
      select unnest(array[
        'fuck','fuk','fck','fvck','phuck','fucker','fuckin','fucking','motherfucker',
        'shit','shyt','shite','bullshit',
        'ass','arse','asshole','dumbass',
        'bitch','biatch','bich',
        'cock','dick','penis',
        'cunt','kunt',
        'pussy','pusy',
        'whore','hoe','slut','skank',
        'bastard','twat','wank','wanker',
        'cum','jizz','clit',
        'damn',
        'rape','nude','porn',
        'nigger','nigga','nigg',
        'faggot','fag',
        'retard','tard',
        'kike','chink','spic','wetback',
        'dyke','tranny',
        'nazi','hitler'
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
          s ~ '[[:space:].,_\\-\\+\\*\\^#|/\\\\~]+'
          or s ~ '[@4]|3|[1!|]|0|[$5]|7|8|6|9'
          or s ~ '[0-9]'
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
          '[[:space:].,_\\-\\+\\*\\^#|/\\\\~]+',
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
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(
                          regexp_replace(s, '[@4]', 'a', 'g'),
                        '3', 'e', 'g'),
                      '[1!|]', 'i', 'g'),
                    '0', 'o', 'g'),
                  '[$5]', 's', 'g'),
                '7', 't', 'g'),
              '8', 'b', 'g'),
            '9', 'g', 'g'),
          '6', 'g', 'g'),
        'ph', 'f', 'g'
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
    phonetic as (
      select
        obfuscated,
        regexp_replace(s, 'v', 'u', 'g') as s
      from unaccented
    ),
    no_digits as (
      select
        obfuscated,
        regexp_replace(s, '[0-9]', '', 'g') as s
      from phonetic
    ),
    squashed as (
      select
        obfuscated,
        trim(regexp_replace(regexp_replace(s, '(.)\\1+', '\\1', 'g'), '\\s+', ' ', 'g')) as wordish,
        regexp_replace(regexp_replace(s, '(.)\\1+', '\\1', 'g'), '[^a-z]', '', 'g') as alpha_only
      from no_digits
    )
  select exists (
    select 1
    from blocklist b
    cross join squashed n
    where
      n.wordish ~ ('\\m' || regexp_replace(b.word, '([\\.*+?^${}()|[\]\\])', '\\\1', 'g') || '\\M')
      or (
        char_length(b.word) >= 5
        and position(b.word in n.alpha_only) > 0
      )
      or (
        char_length(b.word) = 4
        and b.word not in ('cock','dick','damn','kike','tard','hell')
        and position(b.word in n.alpha_only) > 0
      )
      or (
        n.obfuscated
        and char_length(b.word) < 5
        and position(b.word in n.alpha_only) > 0
      )
  );
$$;
