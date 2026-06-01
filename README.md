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
2. In **SQL Editor**, run the full script in [`supabase/schema.sql`](supabase/schema.sql).
3. In **Project Settings → API**, copy **Project URL** and the **Publishable** key (`sb_publishable_…`).
4. Create your local config (gitignored — won’t be pushed):
   - `cp likeoff/supabase-config.example.js likeoff/supabase-config.js`
   - Paste **Project URL** and **Publishable key** into `likeoff/supabase-config.js` as `SUPABASE_PUBLISHABLE_KEY`
5. Restart the local server and hard-refresh the browser.

`likeoff/supabase-config.js` is listed in `.gitignore` and `.cursorignore`. Only `supabase-config.example.js` is tracked in git.

Leaderboards and homepage stats stay at `0` / empty until config is set. Full product rules: [`LEADERBOARD_SPEC.md`](LEADERBOARD_SPEC.md).

## Troubleshooting

- **Port already in use**: change the port, e.g. `python3 -m http.server 3000`, then open `http://127.0.0.1:3000/`.
- **Python not found**: install Python 3 and retry with `python3`.
- **Opening `index.html` directly looks broken**: run the local server so image/script paths resolve correctly.
- **Leaderboard not updating**: check the browser console; confirm `schema.sql` was run and keys are in `supabase-config.js`.
