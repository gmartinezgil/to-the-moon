# AGENTS.md

## What this repo is

Marketing/pitch content PLUS the full-stack implementation for the "To The Moon" Bitcoin
finance app concept. The marketing content (README, `presentation/`, `docs/`, `assets/`) is the
original repo; the working application lives in `app/`.

## Layout

- `README.md` — primary marketing page and index of everything
- `presentation/index.html` — standalone static HTML deck (self-contained inline CSS, no JS/build)
- `docs/` — `architecture.md` (brief stub), `implementation-plan.md` (real, kept current), plus
  PDFs. `whitepaper.pdf` is a 30-byte placeholder; only `investor-deck.pdf` is real.
- `assets/` — images and GIFs referenced from README. `videos/` is empty and untracked.
- `app/` — the actual application (npm workspaces monorepo: `server` + `web`). See `app/README.md`.
  - `server/` — Fastify + TypeScript API; owns all secrets, provider adapters, SQLite (built-in `node:sqlite`).
  - `web/` — Vite + React + Tailwind frontend (port of the demo prototype).

## Commands (from `app/`)

- `npm install` (from `app/`) — installs both workspaces
- `npm run dev` — server (3001) + web (5173) concurrently
- `npm run typecheck` — both workspaces
- `npm run build` — production web build
- Requires Node 22.5+ (uses built-in `node:sqlite`). Server needs `app/server/data/` to exist (created on boot).

## Architecture notes

- Every external integration sits behind a provider interface in `app/server/src/providers/`.
  Mocks are the default; live adapters activate automatically when the matching env var exists
  (Bitso price, Banxico, Bitso trading, LNBits, Bitrefill). See `app/README.md` provider table.
- The BTC/MXN price feed is live by default (`PRICE_PROVIDER=auto` → Bitso public API, falls back
  to mock offline). Other providers are mock unless their env vars are set.

## Gotchas

- **`CONTRIBUTING.md` at repo root is stale**: its `npm install` / `npm run dev` instructions
  don't apply to the marketing repo root — run those commands from `app/`.
- **GitHub Pages**: the site deploys from this repo root, so every asset reference in `README.md`
  must stay relative (e.g. `./assets/...`). Don't introduce absolute paths or external asset links.
- No lint/test/format commands exist. Verify with `npm run typecheck` (from `app/`) and by opening
  the app locally.
- Git hygiene: keep the commit history clean (see `git log`). `.DS_Store`, `app/node_modules/`,
  `app/*/dist/`, and `app/server/data/*.db` must stay untracked.
