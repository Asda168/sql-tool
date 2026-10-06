import type { EngineId, Environment } from '../lib/engines'

/** Everything the UI needs from the local machine. Implemented by Tauri (Rust) or the in-browser demo. */

export interface ConnectionConfig {
  id: string
  name: string
  group: string
  environment: Environment
  engine: EngineId
  host: string
  port: number
  username: string
  /** Only present in memory while connecting; persisted exclusively in the OS keychain. */
  password?: string
  database: string
  filePath: string
  ssl: boolean
  sshEnabled: boolean
  sshHost: string
  sshPort: number
  sshUser: string
  timeoutSeconds: number
}

export interface QueryResult {
  columns: string[]
  rows: unknown[][]
  /** rows modified by INSERT/UPDATE/DELETE */
  affected: number
  elapsedMs: number
  /** true when the row cap was hit (more rows exist) */
  truncated: boolean
}

export interface DirEntry { name: string; path: string; isDir: boolean; size: number }
export interface GitFileChange { path: string; index: string; worktree: string }
export interface GitStatus { isRepo: boolean; branch: string; ahead: number; behind: number; changes: GitFileChange[] }
export interface GitCommit { hash: string; author: string; date: string; message: string }
export interface GitBranch { name: string; current: boolean; remote: boolean }
export interface ProjectInfo { kind: 'laravel' | 'django' | 'node' | 'python' | 'php' | 'generic'; label: string; commands: string[] }
export type ShellId = 'git-bash' | 'powershell' | 'cmd' | 'zsh' | 'bash'

export interface DbBridge {
  testConnection(cfg: ConnectionConfig): Promise<{ ok: boolean; message: string; serverVersion?: string }>
  connect(cfg: ConnectionConfig): Promise<string>
  disconnect(session: string): Promise<void>
  /** Runs one statement; fetches at most `maxRows` rows. */
  query(session: string, sql: string, opts?: { maxRows?: number; database?: string }): Promise<QueryResult>
  cancel(session: string): Promise<void>
  /** Runs statements inside a single transaction; rolls back on first error. */
  transaction(session: string, statements: string[]): Promise<{ affected: number }>
}

export interface SecretsBridge {
  save(ref: string, secret: string): Promise<void>
  get(ref: string): Promise<string | null>
  remove(ref: string): Promise<void>
}

export interface FsBridge {
  homeDir(): Promise<string>
  pickFolder(): Promise<string | null>
  pickFile(filters?: string[]): Promise<string | null>
  list(path: string): Promise<DirEntry[]>
  read(path: string): Promise<string>
  write(path: string, content: string): Promise<void>
  createFile(path: string): Promise<void>
  createDir(path: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  remove(path: string): Promise<void>
  copy(from: string, to: string): Promise<void>
  reveal(path: string): Promise<void>
  detectProject(path: string): Promise<ProjectInfo>
  search(root: string, text: string): Promise<{ path: string; line: number; preview: string }[]>
  saveDialog(defaultName: string, content: string): Promise<boolean>
}

export interface TermBridge {
  shells(): Promise<{ id: ShellId; label: string }[]>
  spawn(shell: ShellId, cwd: string, onData: (d: string) => void, onExit: () => void): Promise<string>
  write(id: string, data: string): Promise<void>
  resize(id: string, cols: number, rows: number): Promise<void>
  kill(id: string): Promise<void>
}

export interface GitBridge {
  status(cwd: string): Promise<GitStatus>
  stage(cwd: string, paths: string[]): Promise<void>
  unstage(cwd: string, paths: string[]): Promise<void>
  commit(cwd: string, message: string): Promise<void>
  branches(cwd: string): Promise<GitBranch[]>
  checkout(cwd: string, branch: string): Promise<void>
  createBranch(cwd: string, name: string): Promise<void>
  log(cwd: string, limit: number, path?: string): Promise<GitCommit[]>
  diff(cwd: string, path: string, staged: boolean): Promise<string>
  remotes(cwd: string): Promise<{ name: string; url: string }[]>
  run(cwd: string, op: 'pull' | 'push' | 'fetch' | 'stash' | 'stash-pop' | 'merge' | 'rebase', arg?: string): Promise<string>
  clone(url: string, dest: string): Promise<string>
  init(cwd: string): Promise<void>
}

export interface Bridge {
  kind: 'tauri' | 'demo'
  db: DbBridge
  secrets: SecretsBridge
  fs: FsBridge
  term: TermBridge
  git: GitBridge
}
