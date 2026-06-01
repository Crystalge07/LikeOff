# LikeOff — project & leaderboard spec (agent handoff)

Paste this whole file into future agent chats so you don’t have to re-explain the game or the database plan.

---

## General idea (what LikeOff is)

**LikeOff** is a playful “how good are you at LinkedIn doomscrolling?” game. Each round shows **two real LinkedIn post screenshots** side by side; the player picks which one got **more likes/reactions**. Get it right → streak goes up and the next pair appears. Get it wrong → run ends. You can also “win” by judging every post in the deck once.

- **Vibe:** LinkedIn-parody UI (feed grey `#f3f2ef`, brand blue `#0a66c2`, fake post cards on the homepage preview with rage-bait copy).
- **Audience goal:** Quick, shareable skill test — not a full social network.
- **No accounts:** Anonymous play; leaderboard uses a **display name** only (see below).

### How a run works

1. **Home** → “Play now” starts a shuffled deck from `posts.js` (images in `likeoff/posts/`; filename ≈ like count).
2. **Game** → two cards, current **streak** shown live; tap the post you think went more viral.
3. **End** → wrong guess → **Game over** screen shows **“Your longest streak: X”** (personal best in `localStorage`, not the global leaderboard).
4. **Win** → cleared all unique posts in one run → win screen (no longest-streak line required on win unless product changes).

Each correct pick shows two posts, so **posts judged in a run ≈ streak × 2** (used for global stats).

### Repo layout (high level)

| Area | Role |
|------|------|
| `likeoff/index.html` | Screens: home, game, game over, win; homepage preview duel; leaderboard tabs; inline leaderboard script (to be replaced by Supabase). |
| `likeoff/script.js` | Core game logic, streak, screens, screenshot fitting, rounded `LO.png` favicon. |
| `likeoff/posts.js` | `window.POSTS` array: `{ image, likes, caption }`. |
| `likeoff/posts/` | Screenshot assets (~65 posts). |
| `likeoff/style.css` | LinkedIn-like styling; logo uses Source Sans 3 (Myriad-like). |
| `README.md` | How to run locally (`python3 -m http.server` from `likeoff/`). |

**Stack today:** static HTML/CSS/JS only — **no build step**.  
**Stack next:** **Supabase** (Postgres + JS client) for leaderboards and live homepage stats.

### What’s done vs planned

| Done | Planned (this spec) |
|------|---------------------|
| Full duel gameplay, deck shuffle, dedupe by image path | Supabase-backed **all-time** & **today** leaderboards |
| `localStorage` personal best for game-over copy | One-time **“Enter your name for the leaderboard”** after first finished run |
| Hardcoded fake leaderboard + stats on home | Real **top 10 single runs**; real **player count** & **posts judged** |
| `player_id` + name remembered per browser | Submit **every** finished run to DB |

---

## Database / leaderboard — the plan in one paragraph

Use **Supabase** so everyone’s scores persist. After each finished game, save that run’s **streak** with a **player_id** (UUID in `localStorage`) and **display_name** (asked once per browser). **All-time** tab = top 10 **individual runs** ever; **Today** tab = top 10 runs that ended on the current day in **Toronto time**. Homepage counters come from the DB: **unique `player_id`s** and **sum of streak × 2** across all runs. No login.

---

## Product summary (technical)

LikeOff is a static web game in `likeoff/` (HTML/CSS/JS). Players guess which LinkedIn post got more likes. Streak = consecutive correct guesses in one run. Game ends on a wrong answer or when all posts are exhausted (win).

**Backend:** Supabase (Postgres + JS client). No user login.

---

## Leaderboards

### All-time tab
- Show **top 10 single runs** by streak (highest `streak` ever).
- Same `display_name` may appear **multiple times** if they had multiple great runs.
- Not “top 10 players by personal best” — it is **top 10 individual game results**.

### Today’s tab
- Same as all-time, but only runs that **finished on the current calendar day in America/Toronto** (`America/Toronto` timezone).
- Top 10 single runs for that day.

### Score submission policy
- **Submit on every finished run** (loss or win/cleared feed), even if it was not a personal best.
- Submit **streak 0** if they lose on the first guess.
- Each submission adds to global “posts judged” (see Stats).

---

## Player identity (no login)

1. On first visit, generate a stable **`player_id`** (UUID) and store in `localStorage`.
2. After the user’s **first finished game** (any streak, including 0), show a one-time prompt: e.g. **“Enter your name for the leaderboard”** (short display name, no password).
3. Save `display_name` linked to `player_id` in Supabase and in `localStorage`.
4. **Never prompt again on the same browser** unless they clear site data — identified by `player_id` in `localStorage`, not by name string alone.
5. **Duplicate display names are allowed** — different `player_id`s are different players.

---

## Homepage stats (replace hardcoded zeros)

Remove fake numbers; drive from database:

| Stat | Rule |
|------|------|
| **Unique players (all time)** | Count **distinct `player_id`** who have at least one submitted run. |
| **Posts judged by players** | Sum over all submissions: **`streak × 2`** (two posts shown per correct step in a streak; count each finished run once using that run’s final streak). |
| **Real LinkedIn posts to judge** | Keep as static count of entries in `posts.js` / `posts/` folder (currently ~65), unless product says otherwise. |

Start displayed totals from **0** (no seeding fake millions).

---

## When to write to Supabase

On **every run end** (`screenGameOver` or win/cleared screen):

1. Ensure `player_id` exists in `localStorage`.
2. If no `display_name` stored yet → show name modal → save name.
3. `INSERT` a row: `player_id`, `display_name`, `streak`, `finished_at` (timestamptz).
4. Refresh leaderboard queries and global stats if visible.

**Recommendation (locked):** submit every finished run (not only personal bests). Required for stats + single-run leaderboards.

---

## Suggested schema (Supabase / Postgres)

```sql
-- One row per finished game
create table score_runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 24),
  streak int not null check (streak >= 0),
  finished_at timestamptz not null default now()
);

create index score_runs_streak_idx on score_runs (streak desc);
create index score_runs_finished_at_idx on score_runs (finished_at desc);
create index score_runs_player_id_idx on score_runs (player_id);

-- Optional: store display names once per player
create table players (
  player_id uuid primary key,
  display_name text not null,
  created_at timestamptz not null default now()
);
```

### Queries

**All-time top 10:**
```sql
select display_name as name, streak as score
from score_runs
order by streak desc, finished_at asc
limit 10;
```

**Today top 10 (Toronto):**
```sql
select display_name as name, streak as score
from score_runs
where (finished_at at time zone 'America/Toronto')::date
    = (now() at time zone 'America/Toronto')::date
order by streak desc, finished_at asc
limit 10;
```

**Unique players:**
```sql
select count(distinct player_id) from score_runs;
```

**Posts judged:**
```sql
select coalesce(sum(streak * 2), 0) from score_runs;
```

Expose via Supabase views/RPCs or client queries with RLS.

---

## Security (minimum viable)

- Use **anon key** in frontend; never service role in client.
- RLS: allow `INSERT` on `score_runs` with checks e.g. `streak <= 65` (max posts in deck), reasonable `display_name` length.
- Rate-limit or edge function if abuse becomes an issue.
- Validate/sanitize `display_name` in UI (trim, max length, strip HTML).

---

## Frontend touchpoints (current codebase)

| File | Change |
|------|--------|
| `likeoff/index.html` | Remove hardcoded `allTimeData` / `todayData`; load from Supabase; update stat elements from DB; name modal on first run end. |
| `likeoff/script.js` | On run end, call submit flow; reuse `bestStreak` / run `streak` as appropriate (submit **this run’s** streak, not all-time best from localStorage). |
| New `likeoff/supabase-config.js` or env | `SUPABASE_URL`, `SUPABASE_ANON_KEY` (gitignore secrets; document in README). |
| `likeoff/style.css` | Modal styles for name prompt. |

**Important:** Leaderboard displays **this run’s streak** on submit. `localStorage` `likeoff.bestStreak` is for “Your longest streak” on game over UI only.

---

## localStorage keys (proposed)

| Key | Purpose |
|-----|---------|
| `likeoff.playerId` | UUID, created on first visit |
| `likeoff.displayName` | Set after first prompt; skip prompt if present |
| `likeoff.bestStreak` | Personal best for game-over copy (existing) |

---

## UX copy (reference)

- First-time prompt title/message: **“Enter your name for the leaderboard”** (or similar).
- Tabs unchanged: **All-time leaderboard** / **Today’s leaderboard**.

---

## Out of scope unless user asks

- Login / OAuth
- Editing display name after set
- Anti-cheat beyond basic RLS
- Merging duplicate names across players

---

## Decisions log (user-confirmed)

| # | Decision |
|---|----------|
| 1 | Top 10 **single runs**, not per-player bests |
| 2 | Today = same rule, Toronto calendar day |
| 3 | Submit **every finished run** (recommended & adopted) |
| 4 | Same name = different players if different `player_id` |
| 5 | Remember via **`player_id`** in localStorage |
| 6 | Prompt after **first finished game** |
| 7 | Unique player count = distinct **`player_id`** |
| 8 | Every run adds `streak × 2` to posts judged |
| 9 | Stats **replace** fake numbers, start from real 0 |
| 10 | **America/Toronto** for “today” |
| 11 | Submit **streak 0** on first-guess loss |
