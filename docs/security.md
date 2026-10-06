# Security notes

- **Passwords/keys**: stored only via the OS keychain (`keyring`: Windows Credential Manager, macOS Keychain, Secret Service). Saved connection records contain a `keychain_ref`, never a secret. SSH uses the system `ssh` + agent with `BatchMode`; private keys are never read by the app.
- **Server never executes user SQL** and rejects secret fields on connection payloads.
- **SQL safety gate**: statements are split/classified (`sqlSafety.ts`, mirrored in `backend/database/sqlsafety.py`). Confirmation for DROP, TRUNCATE, ALTER, DELETE/UPDATE without WHERE, `SELECT … INTO OUTFILE`, and every write on PRODUCTION (red banner).
- **Transactions** for batched data edits; rollback on first error.
- **Git**: `GIT_TERMINAL_PROMPT=0`; branch/ref names validated (no leading `-`); clone URL must be https/ssh/git@ and must not embed credentials.
- **Filesystem**: deletes go to the Recycle Bin/Trash when possible; UI always confirms.
- **CSP** is set in `tauri.conf.json`; Monaco/xterm are bundled locally (no CDN).
- **Backend**: JWT, throttling, per-user querysets, HTTPS/HSTS/secure cookies when `DJANGO_DEBUG=0`, `DJANGO_SECRET_KEY` required in production.
- **Privacy**: downloads store a salted IP hash and user agent only.
- Known gaps: unsigned installers; cancel does not issue server-side KILL; identifier injection in generated SQL is mitigated by quoting but values typed into the WHERE filter of the data editor are user-supplied SQL by design.
