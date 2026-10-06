# CLAUDE.md

Guidance for Claude Code (and other contributors) working in this repository.

## What this is
MySQL Forge Studio: a cross-platform SQL client + code editor + Git client + terminal. Engines: MySQL, MariaDB, PostgreSQL, SQLite, SQL Server.
Three parts: `backend/` (Django API), `frontend/` (React website + IDE UI), `desktop/` (Tauri 2 + Rust shell). See `README.md` and `docs/`.

## Non-negotiable architecture rules
1. **Django never touches the user's machine.** No command execution, filesystem, Git, or connections to the user's databases. `POST /api/database/query/` only *analyses* SQL.
2. **The desktop layer owns local capabilities** (filesystem, terminal, Git, DB drivers, keychain). The UI reaches them only through the `Bridge` interface in `frontend/src/bridge/types.ts`.
3. **Secrets never leave the OS keychain.** Never store, log, sync or send database/SSH passwords. The API serializer rejects `password`-like fields (`database/serializers.py`).
4. **No automatic SQL execution.** Destructive statements (DROP, TRUNCATE, ALTER, DELETE/UPDATE without WHERE) and any write on a PRODUCTION connection require a confirmation dialog. Keep this gate in `store/app.ts` `runSql` and `database/actions.ts` `runDdl`.
5. **Never load whole tables.** Results are capped (`rowLimit`) and paged; the grid is virtualized.

## Commands
```bash
# backend (from backend/, venv active)
python manage.py test                 # 14 tests
python manage.py makemigrations && python manage.py migrate
python manage.py runserver
# frontend (from frontend/)
npm run dev | npm test | npm run build      # build = tsc --noEmit + vite build
# desktop (from desktop/, needs Rust + MSVC Build Tools/WebView2 on Windows)
npm run dev | npm run build
```
Before finishing a change: `npx tsc --noEmit`, `npm test`, `python manage.py test`; for Rust changes `cargo check` in `desktop/src-tauri`.

## Code map
- `frontend/src/bridge/` `types.ts` (contract), `tauri.ts` (invokes Rust), `demo.ts` (browser fallback: sql.js SQLite + virtual FS/Git/terminal).
- `frontend/src/lib/` engines registry (quoting, paging, literals per engine), `sqlSafety.ts` (mirrors `backend/database/sqlsafety.py`; keep both in sync), `introspect.ts` (per-engine schema SQL), `codegen.ts` (CREATE TABLE), `exporters.ts`.
- `frontend/src/store/app.ts` single zustand store (settings, connections, tabs, history, dialogs, `runSql`). `terminal/termStore.ts` holds terminals.
- `frontend/src/editor/` Monaco setup (`monaco.ts` has schema-aware completion), `SqlTab`, `FileTab`. `database/` explorer, data editor, designer, ERD, results grid.
- `frontend/src/pages/website/` public site (/, /features, /mysql, /editor, /download, /docs, /changelog, /releases, /github, /privacy, /terms). IDE is `/app`.
- `desktop/src-tauri/src/` `db.rs`, `fsops.rs`, `git.rs`, `term.rs`, `secrets.rs`, `tunnel.rs`; commands are registered in `lib.rs` and wrapped 1:1 in `bridge/tauri.ts`.
- `backend/` apps: accounts, projects, repositories, database, queries, releases, downloads. Per-user data uses `accounts.permissions.OwnedModelViewSet`.

## Conventions
- Adding a bridge capability: update `types.ts`, `tauri.ts`, `demo.ts`, the Rust command and `lib.rs` handler list together.
- Adding an engine: extend `lib/engines.ts`, `introspect.ts`, `codegen.ts`, `db.rs`, and `ENGINES` in `backend/database/models.py` (then a migration).
- Theme uses CSS variables (`index.css`); do not rely on colour alone for state (environment badges have text + symbol).
- Default editor font JetBrains Mono 14px, line-height 1.5, dark theme.
- Tauri command args are camelCase in JS and snake_case in Rust (automatic).
- Monaco 0.57: worker import is `monaco-editor/editor/editor.worker?worker`.
- Windows dev: use Git Bash/PowerShell; avoid committing `node_modules`, `.venv`, `target/` (see `.gitignore`).

## Known limitations / honest status
- Rust code is written to compile on stable but check `cargo check` output first if the build fails; installers are unsigned.
- Release rows from `seed_releases` are placeholders (zero checksums). Replace with real artifacts.
- Query cancel aborts the client task; it does not issue a server-side KILL.
- Excel export writes an HTML table with `.xls` extension (opens in Excel; not true .xlsx).
- Browser demo mode maps every connection to a built-in SQLite database.
