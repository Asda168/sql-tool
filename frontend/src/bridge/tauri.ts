import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { open, save } from '@tauri-apps/plugin-dialog'
import type { Bridge } from './types'

/** Thin typed wrapper over the Rust commands in desktop/src-tauri/src. Command names are snake_case. */
export function createTauriBridge(): Bridge {
  const termListeners = new Map<string, UnlistenFn[]>()
  return {
    kind: 'tauri',
    db: {
      testConnection: (cfg) => invoke('db_test', { cfg }),
      connect: (cfg) => invoke('db_connect', { cfg }),
      disconnect: (session) => invoke('db_disconnect', { session }),
      query: (session, sql, opts) => invoke('db_query', { session, sql, maxRows: opts?.maxRows ?? 1000, database: opts?.database ?? null }),
      cancel: (session) => invoke('db_cancel', { session }),
      transaction: (session, statements) => invoke('db_transaction', { session, statements }),
    },
    secrets: {
      save: (ref, secret) => invoke('secret_save', { reference: ref, secret }),
      get: (ref) => invoke('secret_get', { reference: ref }),
      remove: (ref) => invoke('secret_remove', { reference: ref }),
    },
    fs: {
      homeDir: () => invoke('fs_home'),
      pickFolder: async () => (await open({ directory: true, multiple: false })) as string | null,
      pickFile: async () => (await open({ multiple: false })) as string | null,
      list: (path) => invoke('fs_list', { path }),
      read: (path) => invoke('fs_read', { path }),
      write: (path, content) => invoke('fs_write', { path, content }),
      createFile: (path) => invoke('fs_create_file', { path }),
      createDir: (path) => invoke('fs_create_dir', { path }),
      rename: (from, to) => invoke('fs_rename', { from, to }),
      remove: (path) => invoke('fs_remove', { path }),
      copy: (from, to) => invoke('fs_copy', { from, to }),
      reveal: (path) => invoke('fs_reveal', { path }),
      detectProject: (path) => invoke('fs_detect_project', { path }),
      search: (root, text) => invoke('fs_search', { root, text }),
      saveDialog: async (defaultName, content) => {
        const p = await save({ defaultPath: defaultName })
        if (!p) return false
        await invoke('fs_write', { path: p, content })
        return true
      },
    },
    term: {
      shells: () => invoke('term_shells'),
      spawn: async (shell, cwd, onData, onExit) => {
        const id = await invoke<string>('term_spawn', { shell, cwd })
        const a = await listen<string>(`term://data/${id}`, (e) => onData(e.payload))
        const b = await listen(`term://exit/${id}`, () => onExit())
        termListeners.set(id, [a, b])
        return id
      },
      write: (id, data) => invoke('term_write', { id, data }),
      resize: (id, cols, rows) => invoke('term_resize', { id, cols, rows }),
      kill: async (id) => {
        termListeners.get(id)?.forEach((u) => u())
        termListeners.delete(id)
        await invoke('term_kill', { id })
      },
    },
    git: {
      status: (cwd) => invoke('git_status', { cwd }),
      stage: (cwd, paths) => invoke('git_stage', { cwd, paths }),
      unstage: (cwd, paths) => invoke('git_unstage', { cwd, paths }),
      commit: (cwd, message) => invoke('git_commit', { cwd, message }),
      branches: (cwd) => invoke('git_branches', { cwd }),
      checkout: (cwd, branch) => invoke('git_checkout', { cwd, branch }),
      createBranch: (cwd, name) => invoke('git_create_branch', { cwd, name }),
      log: (cwd, limit, path) => invoke('git_log', { cwd, limit, path: path ?? null }),
      diff: (cwd, path, staged) => invoke('git_diff', { cwd, path, staged }),
      remotes: (cwd) => invoke('git_remotes', { cwd }),
      run: (cwd, op, arg) => invoke('git_run', { cwd, op, arg: arg ?? null }),
      clone: (url, dest) => invoke('git_clone', { url, dest }),
      init: (cwd) => invoke('git_init', { cwd }),
    },
  }
}
