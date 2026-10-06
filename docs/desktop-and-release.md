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
