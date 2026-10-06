# Architecture

```
Browser / Website (React, /, /download, /docs …)
        |  HTTPS
        v
Django REST API  (accounts, releases, downloads, optional sync)
        ^
        |  HTTPS (login, settings sync, release metadata)
Desktop app = Tauri 2 window + the same React UI (/app)
        |  Tauri invoke()  ──►  Rust commands
        +-- fsops.rs   local filesystem
        +-- git.rs     system git
        +-- term.rs    PTY terminals (Git Bash, PowerShell, CMD, zsh, bash)
        +-- db.rs      sqlx (MySQL/MariaDB/PostgreSQL/SQLite) + tiberius (SQL Server)
        +-- tunnel.rs  SSH tunnel through the system `ssh`
        +-- secrets.rs OS keychain
```

## Responsibility split
| Concern | Django server | Desktop (Rust) |
| --- | --- | --- |
| Accounts, JWT | yes | token holder only |
| Releases, download records, docs | yes | – |
| Editor settings sync (optional) | yes | local source of truth |
| Connection *metadata* (no secrets) | optional | yes |
| Passwords / SSH keys | **never** | OS keychain |
| SQL execution, schema, rows | **never** (analysis only) | yes |
| Files, Git, terminal, processes | **never** | yes |

## The Bridge
`frontend/src/bridge/types.ts` defines `Bridge { db, secrets, fs, term, git }`.
`bridge()` returns the Tauri implementation inside the desktop app and the demo implementation in a plain browser.
Demo mode runs real SQL on in-browser SQLite (sql.js) with a virtual project, Git and terminal, so the website can host a working preview.

## Query flow
1. `SqlTab` → `store.runSql(tabId, mode)`
2. `sqlSafety.analyse()` parses statements; destructive or production writes open a confirm dialog.
3. Statements run one at a time through `bridge().db.query()` (row-capped), results land in `store.results[tabId]`.
4. History is appended (local, last 500).

## Data editing flow
`TableDataTab` keeps edits/new rows/deletes in memory → **Save Changes** → confirm dialog with statement preview → `bridge().db.transaction()` (single transaction, rollback on first error) → reload.

## Multi-engine support
`lib/engines.ts` holds per-engine identifier quoting, literal escaping, paging SQL and dialect. `lib/introspect.ts` builds engine-specific catalog queries on top of `db.query`, so a new engine needs no UI changes.
