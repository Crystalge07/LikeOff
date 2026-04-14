# LikeOff

LikeOff is a small browser game where you guess which LinkedIn post got more engagement.

## What this project is

- A static web app (plain HTML, CSS, and JavaScript).
- No build step or framework setup required.
- Main app files live in `likeoff/`.

## Run locally

1. Open a terminal in the repo root:
   - `cd /Users/crystalge/LikeOff`
2. Start a local server from the app folder:
   - `cd likeoff`
   - `python3 -m http.server 8080`
3. Open your browser:
   - `http://127.0.0.1:8080/`

## Stop the server

- Press `Ctrl + C` in the terminal running `http.server`.

## Troubleshooting

- **Port already in use**: change the port, e.g. `python3 -m http.server 3000`, then open `http://127.0.0.1:3000/`.
- **Python not found**: install Python 3 and retry with `python3`.
- **Opening `index.html` directly looks broken**: run the local server so image/script paths resolve correctly.
