# Desktop app: build, install, release

## Prerequisites
- Rust stable (rustup), Node 20+.
- Windows: Visual Studio Build Tools (C++), WebView2 runtime (preinstalled on Win 11).
- Linux: `webkit2gtk-4.1`, `libssl-dev`, `libsecret-1-dev`, `librsvg2-dev`, `libayatana-appindicator3-dev`.
- macOS: Xcode command line tools.

## Develop / build
```bash
cd desktop && npm install
npm run dev        # Vite (frontend) + native window
npm run build      # NSIS installer on Windows → src-tauri/target/release/bundle/nsis/
```
`tauri.conf.json`: `frontendDist=../../frontend/dist`, `devUrl=http://localhost:5173/app`, bundle target `nsis`, per-user install (no admin needed).
Add `msi`, `dmg`, `appimage`, `deb`, `rpm` to `bundle.targets` on the matching OS.

## Building without a local Rust toolchain
Run the **Build desktop installers** GitHub Actions workflow (`.github/workflows/desktop.yml`, manual or on a `v*` tag). It builds the
Windows NSIS installer, macOS dmg, and Linux deb/rpm/AppImage and uploads them with SHA-256 sums as workflow artifacts.

**Windows App Control / Smart App Control:** if `cargo build` fails with `An Application Control policy has blocked this file (os error 4551)`,
the OS is refusing to run Rust build scripts. Use the CI workflow or ask an administrator to allow the toolchain; do not disable security policy casually.

## Local host mode (shortcut launcher)
`scripts/launch-forge.vbs` (the Desktop shortcut runs it through `wscript`, so no console windows appear) starts (1) a static server for the UI on :4173 and (2) `desktop/host/server.mjs` on 127.0.0.1:4174, then opens
Edge in app mode with `?forgeHost=…&forgeToken=…`. The host provides **real MySQL/MariaDB/PostgreSQL, files and Git** to the window.
Security: loopback only, random per-launch token (`X-Forge-Token`), Origin and Host checks, passwords in memory only.
Limits vs. the native app: no SQLite files, SQL Server or SSH tunnels; the terminal is simulated (no PTY); passwords are re-entered after a restart.
### Laragon / WAMP / XAMPP
`desktop/host/stacks.mjs` detects Laragon, WampServer and XAMPP (install folders on any local drive, plus running `mysqld`/`mariadbd` processes and their listening port).
The app polls every 5 s: the **Local servers** section of the Database panel shows each server (running/stopped), and when a server comes up
(or is already running at launch) the app connects to it, reusing a saved connection on the same 127.0.0.1 port or creating `<Stack> MySQL`
(root, empty password). **Start** launches a stopped server after a confirmation. Stack detection is Windows-only and not yet in the native Rust build.

The background services exit on their own ~5 minutes after the app window closes (`FORGE_IDLE_MINUTES`). `scripts/launch-forge.cmd` is the older visible-console variant.

Footer switchers (Beekeeper-style): the connection chip switches/connects/disconnects saved connections and retargets the current SQL tab; the database chip
switches the active database/schema, which the host applies with `USE`/`search_path` before each query.

On first run in this mode the app creates and connects a `MySQL Local` connection (127.0.0.1:3306, root, empty password).

## Shortcuts
The NSIS installer creates a Start Menu entry and offers a Desktop shortcut. A manual Desktop shortcut can point at the installed
`MySQL Forge Studio.exe` (`%LOCALAPPDATA%\MySQL Forge Studio\`).

## Publishing a release
1. Build per OS/arch; compute `sha256` of each artifact (`certutil -hashfile <file> SHA256` / `shasum -a 256`).
2. Upload artifacts (e.g. GitHub Releases).
3. In Django admin (or `POST /api/releases/` as staff) create `Release` rows with the real `download_url`, `file_size`, `checksum`, `is_latest=true`.
4. `/download` shows them automatically; WebSocket `ws/releases/` notifies listeners.
Code signing (Authenticode, Apple notarization) is not configured; unsigned builds trigger SmartScreen/Gatekeeper warnings.

## Rust command surface
`db_test, db_connect, db_disconnect, db_query, db_cancel, db_transaction, secret_save|get|remove, fs_*, term_*, git_*` — see `src-tauri/src/lib.rs`
and the 1:1 wrappers in `frontend/src/bridge/tauri.ts`.
