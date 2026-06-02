# LikeOff

LikeOff is a small browser game where you guess which LinkedIn post got more engagement.

## What this project is

- A static web app (plain HTML, CSS, and JavaScript).
- No build step or framework setup required.
- Main app files live in `likeoff/`.

## Run locally

1. Open a terminal in the repo root:
   - `cd /Users/crystalge/LikeOff`
2. (Optional) Use the project virtual environment:
   - `python3 -m venv .venv` — only needed once if `.venv` is missing
   - `source .venv/bin/activate`
3. Start a local server from the app folder:
   - `cd likeoff`
   - `python3 -m http.server 8080`
4. Open your browser:
   - `http://127.0.0.1:8080/`

## Stop the server

- Press `Ctrl + C` in the terminal running `http.server`.

## Supabase (leaderboards & stats)

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run the full script in [`supabase/schema.sql`](supabase/schema.sql) once (table, RLS, RPCs, rate limit, profanity, and triggers — everything in one file). The older [`supabase/002_rate_limit_and_profanity.sql`](supabase/002_rate_limit_and_profanity.sql) is kept for history only; its contents are already included in `schema.sql`.
3. In **Project Settings → API**, copy **Project URL** and the **Publishable** key (`sb_publishable_…`).
4. Set **Project URL** and **Publishable key** in [`likeoff/supabase-config.js`](likeoff/supabase-config.js) (or copy from [`likeoff/supabase-config.example.js`](likeoff/supabase-config.example.js)).
5. Restart the local server and hard-refresh the browser.

The Publishable key (`sb_publishable_…`) is safe in the repo with RLS. **Never** commit the secret key (`sb_secret_…`).

Leaderboards and homepage stats stay at `0` / empty until config is set. Full product rules: [`LEADERBOARD_SPEC.md`](LEADERBOARD_SPEC.md).

## Troubleshooting

- **Port already in use**: change the port, e.g. `python3 -m http.server 3000`, then open `http://127.0.0.1:3000/`.
- **Python not found**: install Python 3 and retry with `python3`.
- **Opening `index.html` directly looks broken**: run the local server so image/script paths resolve correctly.
- **Leaderboard not updating**: check the browser console; confirm `schema.sql` was run and keys are in `supabase-config.js`.
