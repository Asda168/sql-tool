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

## Releases
Tag `vX.Y.Z` (and bump `desktop/src-tauri/tauri.conf.json` + `Cargo.toml` version) and push the tag: `.github/workflows/release.yml` builds Windows NSIS, macOS universal dmg and Linux AppImage/deb/rpm, publishes them to GitHub Releases with stable names (`MySQLForgeStudio-Setup-x64.exe`, `MySQLForgeStudio-macOS-universal.dmg`, `MySQLForgeStudio.{AppImage,deb,rpm}`) and runs install smoke tests. The website download page (`frontend/src/pages/website/DownloadSection.tsx`) reads GitHub Releases for the version picker and falls back to the Django API.

## Code map
- `frontend/src/bridge/` `types.ts` (contract), `tauri.ts` (invokes Rust), `demo.ts` (browser fallback: sql.js SQLite + virtual FS/Git/terminal).
- `frontend/src/lib/` engines registry (quoting, paging, literals per engine), `sqlSafety.ts` (mirrors `backend/database/sqlsafety.py`; keep both in sync), `introspect.ts` (per-engine schema SQL), `codegen.ts` (CREATE TABLE), `exporters.ts`.
- `frontend/src/store/app.ts` single zustand store (settings, connections, tabs, history, dialogs, `runSql`). `terminal/termStore.ts` holds terminals.
- `frontend/src/editor/` Monaco setup (`monaco.ts` has schema-aware completion), `SqlTab`, `FileTab`. `database/` explorer, data editor, designer, ERD, results grid.
- `frontend/src/pages/website/` public site (/, /features, /mysql, /editor, /download, /docs, /changelog, /releases, /github, /privacy, /terms). IDE is `/app`.
- `desktop/src-tauri/src/` `db.rs`, `fsops.rs`, `git.rs`, `term.rs`, `secrets.rs`, `tunnel.rs`; commands are registered in `lib.rs` and wrapped 1:1 in `bridge/tauri.ts`.
- `backend/` apps: accounts, projects, repositories, database, queries, releases, downloads. Per-user data uses `accounts.permissions.OwnedModelViewSet`.

## Conventions
- **Scrolling:** virtualized lists use `lib/useScrollWindow.ts` (synchronous window update, row buckets, large overscan). Do NOT defer the window update with requestAnimationFrame: it shows blank rows during fast wheel scrolling. Scroll areas get `overscroll-behavior: contain` + `overflow-anchor: none` (global CSS); `html.ide` is overflow-hidden; never use `scrollIntoView` (it scrolls every ancestor), scroll the list's own container.
- **Shortcuts:** match keys with `lib/shortcut.ts` (`shortcutKey`), never `event.key` alone: it breaks on non-Latin/AZERTY layouts. Ctrl+Backquote is matched by position. The terminal panel stays mounted when hidden so shells survive; use `toggleTerminal()`.
- Inputs: use the `.input` class or `components/SearchBox.tsx`; both show ONE focus indicator (cyan border + soft ring). Inputs inside a styled wrapper get `.bare-input` so the global `:focus-visible` outline does not add a second border. Hover styles must not override focus styles (`[&:not(:focus-within)]:hover:`).
- Editing data: `lib/dataEdit.ts` (`buildStatements`, tested) is used by the table Data tab and by query results (`database/QueryResultGrid.tsx`, eligibility via `lib/sqlTable.ts`). Edit mode is opt-in and always confirmed; production adds a banner. There are no paid tiers or license gates.
- Layout: `store.layout` (sidebar left/right, terminal bottom/right, results below/beside) + `toggleFocusMode`, exposed in View menu and the command palette.
- **Performance rules (UI):** never render long lists as plain DOM (`database/SchemaTree.tsx` is a virtualized, delegated-event tree: ~40 rows in the DOM for 700+ tables). Never call `useApp()` without a selector inside list rows or big components (it re-renders on every store change); use selectors / `useShallow`. High-frequency state (the cursor) lives in its own store (`store/cursor.ts`). Throttle scroll handlers with `requestAnimationFrame`.
- The explorer shows only the selected database (`store.selectedNs`); `DatabaseSwitch` in `database/ExplorerPanel.tsx` and the footer chip change it.
- Adding a bridge capability: update `types.ts`, `tauri.ts`, `demo.ts`, the Rust command and `lib.rs` handler list together.
- Adding an engine: extend `lib/engines.ts`, `introspect.ts`, `codegen.ts`, `db.rs`, and `ENGINES` in `backend/database/models.py` (then a migration).
- Theme uses CSS variables (`index.css`); do not rely on colour alone for state (environment badges have text + symbol).
- Default editor font JetBrains Mono 14px, line-height 1.5, dark theme.
- Tauri command args are camelCase in JS and snake_case in Rust (automatic).
- Monaco 0.57: worker import is `monaco-editor/editor/editor.worker?worker`.
- Windows dev: use Git Bash/PowerShell; avoid committing `node_modules`, `.venv`, `target/` (see `.gitignore`).

## Known limitations / honest status
- Three bridges exist: `tauri.ts` (native), `http.ts` (local host `desktop/host/server.mjs`, MySQL/MariaDB/PostgreSQL + fs + git, simulated terminal) and `demo.ts` (browser). Keep `server.mjs` RPC names in sync with `http.ts`.
- Autocomplete: `editor/completion.ts` (Monaco provider) + pure helpers in `lib/sqlContext.ts` (fuzzy ranking, clause detection, table/alias extraction, tested) + `lib/usage.ts` (usage ranking). Schema comes from `Introspector.fullSchema` cached per database in `store.schemaCache[conn][ns]` (tables, column types/keys, foreign keys). Selecting a database = `store.selectDatabase` (sets `selectedNs`, loads schema, opens a query tab); the host applies it with `USE`/`search_path` before each query (the native Rust build ignores `database` for now).
- Local stacks: `desktop/host/stacks.mjs` + `frontend/src/store/stacks.ts` (polling, auto-connect, Start). Laragon runs mysqld as launcher+child; only the child listens.
- Secrets in host mode: `desktop/host/secrets.mjs` (Windows DPAPI per-user). Use `add-connection.mjs` with `FORGE_DB_PASSWORD` env, never a CLI arg.
- mysql2 gotchas in the host: `fields` can be `null`; OK-packet statements need `finish()` on `result`; killing a query mid-stream is fatal for that connection, so `ensure()` reconnects the session.
- The Rust layer has NOT been compiled yet on the dev machine (Windows App Control blocked cargo build scripts, os error 4551). Treat `desktop/src-tauri` as unverified until `cargo check` passes locally or in the CI workflow.
- Rust code is written to compile on stable but check `cargo check` output first if the build fails; installers are unsigned.
- Release rows from `seed_releases` are placeholders (zero checksums). Replace with real artifacts.
- Query cancel aborts the client task; it does not issue a server-side KILL.
- Excel export writes an HTML table with `.xls` extension (opens in Excel; not true .xlsx).
- Browser demo mode maps every connection to a built-in SQLite database.
