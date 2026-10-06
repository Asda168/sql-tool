# MySQL Forge Studio

**Write SQL. Manage Code. Connect. Build.**

A cross-platform SQL client + code editor + Git client + terminal. Engines: MySQL, MariaDB, PostgreSQL, SQLite, SQL Server.

## Architecture

```
Browser / Website (React)
        |
        v
Django REST API  ── accounts, releases, downloads, docs, optional settings sync
        |
Desktop app (Tauri 2 + Rust + the same React UI)
        +-- Local filesystem          desktop/src-tauri/src/fsops.rs
        +-- Git (system git)          desktop/src-tauri/src/git.rs
        +-- Terminal (PTY: Git Bash, PowerShell, CMD, zsh, bash)   term.rs
        +-- Databases (sqlx, tiberius) db.rs   (+ SSH tunnel via system ssh: tunnel.rs)
        +-- OS keychain for passwords  secrets.rs
```

**Rule:** Django never touches the user's machine. It never runs commands, reads files, drives Git, connects to the
user's databases or receives passwords. `POST /api/database/query/` only *analyses* SQL (safety verdict).

The UI talks to the machine through one interface, `frontend/src/bridge/types.ts`:

| Implementation | Used when | Notes |
| --- | --- | --- |
| `bridge/tauri.ts` → Rust commands | inside the desktop app | real databases, files, Git, terminal |
| `bridge/demo.ts` | plain browser (`/app` on the website) | real SQL on in-browser SQLite (sql.js), virtual files/Git/terminal |

## Layout

```
backend/    Django 5 + DRF + Channels (accounts, projects, repositories, database, queries, releases, downloads)
frontend/   React + TypeScript + Tailwind: website pages (/, /features, /download, /docs, …) and the IDE (/app)
desktop/    Tauri 2 shell and Rust services (src-tauri/)
website/    Deployment notes for the public site (the pages themselves live in frontend/src/pages/website)
```

## Setup

### Backend
```bash
cd backend
python -m venv .venv && .venv/Scripts/activate        # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                                    # PostgreSQL/Redis are optional in dev (SQLite + in-memory fallback)
python manage.py migrate
python manage.py seed_releases                          # placeholder release rows (replace checksums/URLs!)
python manage.py createsuperuser
python manage.py runserver                              # or: daphne config.asgi:application  (WebSockets)
python manage.py test
```
Production: set `DJANGO_DEBUG=0`, `DJANGO_SECRET_KEY`, `POSTGRES_*`, `REDIS_URL`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`.

API: `/api/auth/` (register, login, refresh, me), `/api/projects/`, `/api/repositories/`, `/api/database/connections|schema|tables|query/`,
`/api/queries/`, `/api/query-history/`, `/api/editor/settings/`, `/api/releases/`, `/api/downloads/`. JWT auth; releases and downloads are public.

### Frontend / website
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173  (proxies /api to Django on :8000)
npm test           # vitest
npm run build      # tsc + vite build
```
Set `VITE_API_URL` if the API lives on another origin. Deploys to Vercel as a static SPA (`frontend/vercel.json`, root directory `frontend`).

### Desktop app
Prerequisites: Rust (rustup), Node 20+, Windows: MSVC Build Tools + WebView2; Linux: `webkit2gtk-4.1`, `libssl-dev`, `libsecret-1-dev`, `librsvg2-dev`.
```bash
cd desktop
npm install
npm run dev        # runs the Vite dev server and the native window
npm run build      # NSIS installer (Windows). Output: src-tauri/target/release/bundle/nsis/
```
Installers are not code-signed; Windows SmartScreen and macOS Gatekeeper will warn until you add signing certificates.

## Security model
- Passwords: OS keychain only (`keyring`). Not in settings files, not in the repo, not on the server (the API rejects `password` fields).
- Destructive SQL (`DROP`, `TRUNCATE`, `ALTER`, `DELETE`/`UPDATE` without `WHERE`) needs confirmation; every write on PRODUCTION connections does, with a banner.
- SQL is never executed automatically; data edits are batched into one transaction behind a **Save Changes** confirmation.
- Git prompts are disabled (`GIT_TERMINAL_PROMPT=0`); credentials come from your credential helper / SSH agent.
- Downloads store a salted hash of the IP, never the raw address.

## Keyboard shortcuts
`Ctrl/Cmd+Enter` run · `+Shift+Enter` run statement · `+S` save · `+P` quick open · `+Shift+P` commands · `+B` sidebar · `+J` terminal · `+` / `-` / `0` font size.
