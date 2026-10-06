# REST API

Base: `/api`. Auth: JWT (`Authorization: Bearer <access>`), access 30 min, refresh 14 days (rotating). Lists are paginated (`PAGE_SIZE=50`).
Throttles: anon 120/min, user 600/min, auth endpoints 10/min, downloads 30/min.

| Endpoint | Methods | Auth | Notes |
| --- | --- | --- | --- |
| `/auth/register/` | POST | public | username, email, password (validated) |
| `/auth/login/` | POST | public | returns `access`, `refresh` |
| `/auth/refresh/` | POST | public | rotates refresh |
| `/auth/me/` | GET, PATCH | user | profile |
| `/editor/settings/` | GET, PUT, PATCH | user | font (JetBrains Mono/14/400/1.5 default), wrap, minimap, cursor, tab size, theme mode… |
| `/editor/themes/`, `/editor/terminal-profiles/`, `/editor/preferences/` | CRUD | user | |
| `/projects/`, `/projects/workspaces/` | CRUD | user | `path_hint` is a hint only |
| `/repositories/`, `/repositories/remotes/` | CRUD | user | URLs with embedded credentials are rejected |
| `/database/connections/` | CRUD | user | metadata only; `password`, `ssh_private_key`, … → 400 |
| `/database/schema/`, `/database/tables/` | GET | user | cached metadata (`?connection=`, `?schema=`, `?q=`) |
| `/database/schema-sync/` | POST | user | desktop pushes names/types, never rows |
| `/database/query/` | POST | user | `{sql}` → `{statements[], read_only, requires_confirmation}`; **does not execute** |
| `/queries/` | CRUD | user | saved queries |
| `/query-history/` | CRUD, `DELETE /clear/` | user | summary only, no result rows |
| `/releases/` | GET (public), write (staff) | | filters `platform`, `architecture`, `version`, `package_type`; `/releases/latest/` |
| `/downloads/` | POST | public | `{platform, architecture?, package_type?}` → creates a `Download` (salted IP hash) and returns the release incl. `download_url` |
| `/downloads/stats/` | GET | staff | counts |
| `ws/releases/` | WebSocket | public | pushes `{type:"release", version}` when a latest release is created |

Models: UserProfile, Workspace, Project, Repository, GitRemote, DatabaseConnection, DatabaseSchema, DatabaseTable, DatabaseColumn,
SavedQuery, QueryHistory, QueryResult, EditorSettings, TerminalProfile, Theme, Release, Download, UserPreference.

Release: `version, platform (windows|macos|linux), architecture (x64|arm64), package_type, download_url, file_size, checksum (sha256), release_notes, published_at, is_latest`.
Only one `is_latest` per platform/arch/package.
