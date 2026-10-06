import { useState, type ReactNode } from 'react'
import { DEFAULT_SETTINGS, useApp, type Settings } from '../store/app'
import { Field } from '../components/ui'
import { mod } from '../lib/os'
import { api } from '../lib/api'

const CATS = ['Editor', 'Appearance', 'Terminal', 'Git', 'Database', 'Keyboard', 'Security', 'Downloads'] as const
const SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32]

const Toggle = ({ label, v, on }: { label: string; v: boolean; on: (b: boolean) => void }) => (
  <label className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-xs"><span>{label}</span><input type="checkbox" role="switch" checked={v} onChange={(e) => on(e.target.checked)} /></label>
)

export const SHORTCUTS: [string, string][] = [
  ['Ctrl/Cmd + Enter', 'Run SQL'], ['Ctrl/Cmd + Shift + Enter', 'Run current statement'], ['Ctrl/Cmd + S', 'Save'],
  ['Ctrl/Cmd + P', 'Quick open file'], ['Ctrl/Cmd + Shift + P', 'Command palette'], ['Ctrl/Cmd + F', 'Find'], ['Ctrl/Cmd + H', 'Replace'],
  ['Ctrl/Cmd + B', 'Toggle sidebar'], ['Ctrl/Cmd + J', 'Toggle terminal'], ['Ctrl/Cmd + +', 'Increase font'], ['Ctrl/Cmd + -', 'Decrease font'],
  ['Ctrl/Cmd + 0', 'Reset font'], ['Ctrl + mouse wheel', 'Zoom editor'], ['Alt + click', 'Add cursor'], ['Ctrl/Cmd + G', 'Go to line'], ['Ctrl/Cmd + Shift + O', 'Go to symbol'],
]

export default function SettingsTab() {
  const { settings: s, setSettings, toast } = useApp()
  const [cat, setCat] = useState<(typeof CATS)[number]>('Editor')
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings({ [k]: v } as Partial<Settings>)
  const num = (k: keyof Settings, min: number, max: number, step = 1) => <input className="input code" type="number" min={min} max={max} step={step} value={s[k] as number} onChange={(e) => set(k, Math.max(min, Math.min(max, Number(e.target.value))) as never)} />

  const body: Record<(typeof CATS)[number], ReactNode> = {
    Editor: (
      <div className="grid max-w-2xl grid-cols-2 gap-3">
        <Field label="Font family"><input className="input" value={s.fontFamily} onChange={(e) => set('fontFamily', e.target.value)} /></Field>
        <Field label="Font size"><select className="input" value={s.fontSize} onChange={(e) => set('fontSize', Number(e.target.value))}>{[...new Set([...SIZES, s.fontSize])].sort((a, b) => a - b).map((n) => <option key={n}>{n}</option>)}</select></Field>
        <Field label="Font weight"><select className="input" value={s.fontWeight} onChange={(e) => set('fontWeight', Number(e.target.value))}>{[300, 400, 500, 600, 700].map((n) => <option key={n}>{n}</option>)}</select></Field>
        <Field label="Line height (1.0 – 2.5)">{num('lineHeight', 1, 2.5, 0.1)}</Field>
        <Field label="Letter spacing (px)">{num('letterSpacing', -2, 10, 0.1)}</Field>
        <Field label="Tab size">{num('tabSize', 1, 8)}</Field>
        <Field label="Cursor style"><select className="input" value={s.cursorStyle} onChange={(e) => set('cursorStyle', e.target.value as Settings['cursorStyle'])}><option value="line">Line</option><option value="block">Block</option><option value="underline">Underline</option></select></Field>
        <div />
        <Toggle label="Ligatures" v={s.ligatures} on={(b) => set('ligatures', b)} />
        <Toggle label="Word wrap" v={s.wordWrap} on={(b) => set('wordWrap', b)} />
        <Toggle label="Minimap" v={s.minimap} on={(b) => set('minimap', b)} />
        <Toggle label="Breadcrumbs / sticky scroll" v={s.breadcrumbs} on={(b) => set('breadcrumbs', b)} />
        <Toggle label="Code folding" v={s.folding} on={(b) => set('folding', b)} />
        <Toggle label="Auto save" v={s.autoSave} on={(b) => set('autoSave', b)} />
        <div className="col-span-2 rounded-lg border border-line bg-bg p-3"><div className="mb-1 text-[11px] text-muted">Preview</div>
          <pre className="code" style={{ fontFamily: `"${s.fontFamily}", monospace`, fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, fontVariantLigatures: s.ligatures ? 'normal' : 'none' }}>{`SELECT id, name, email\nFROM users WHERE status = 'active' -- => != <= >=`}</pre></div>
      </div>
    ),
    Appearance: (
      <div className="max-w-md space-y-3">
        <Field label="Theme"><select className="input" value={s.theme} onChange={(e) => set('theme', e.target.value as Settings['theme'])}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></Field>
      </div>
    ),
    Terminal: (
      <div className="max-w-md space-y-3">
        <Field label="Default shell" hint="Windows: Git Bash, PowerShell, CMD. macOS/Linux: zsh, bash."><select className="input" value={s.terminalShell} onChange={(e) => set('terminalShell', e.target.value)}>{['default', 'git-bash', 'powershell', 'cmd', 'zsh', 'bash'].map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Terminal font size">{num('terminalFontSize', 8, 32)}</Field>
      </div>
    ),
    Git: <div className="max-w-md space-y-3"><Toggle label="Auto-fetch every 5 minutes" v={s.gitAutoFetch} on={(b) => set('gitAutoFetch', b)} /><p className="text-xs text-muted">Authentication uses your system Git credential helper or SSH agent. The app never stores Git passwords or tokens.</p></div>,
    Database: (
      <div className="max-w-md space-y-3">
        <Field label="Maximum rows loaded per query" hint="Results are always capped and paged; raise carefully for very wide tables.">{num('rowLimit', 100, 100000, 100)}</Field>
        <Field label="Query timeout (seconds)">{num('queryTimeoutSec', 1, 3600)}</Field>
      </div>
    ),
    Keyboard: (
      <table className="max-w-xl text-xs"><tbody>{SHORTCUTS.map(([k, d]) => <tr key={k} className="border-b border-line"><td className="py-1.5 pr-6"><kbd className="code rounded border border-line bg-raised px-1.5 py-0.5">{k.replace('Ctrl/Cmd', mod())}</kbd></td><td>{d}</td></tr>)}</tbody></table>
    ),
    Security: (
      <div className="max-w-lg space-y-3 text-xs">
        <Toggle label="Confirm destructive queries (DROP, TRUNCATE, ALTER, DELETE/UPDATE without WHERE)" v={s.confirmDestructive} on={(b) => set('confirmDestructive', b)} />
        <ul className="list-disc space-y-1 pl-5 text-muted"><li>Database passwords are stored in your OS keychain (Windows Credential Manager, macOS Keychain, Secret Service).</li><li>Production connections always ask before any modifying statement.</li><li>SQL is never executed automatically, and the website cannot reach your files, Git or databases.</li></ul>
      </div>
    ),
    Downloads: (
      <div className="max-w-lg space-y-3 text-xs">
        <p className="text-muted">Version 1.0.0. Releases and checksums are published at <a className="text-accent underline" href="/download">/download</a>.</p>
        <button className="btn" onClick={async () => { try { await api.saveEditorSettings({ font_family: s.fontFamily, font_size: s.fontSize, font_weight: s.fontWeight, line_height: s.lineHeight, letter_spacing: s.letterSpacing, ligatures: s.ligatures, word_wrap: s.wordWrap, minimap: s.minimap, tab_size: s.tabSize, auto_save: s.autoSave, theme_mode: s.theme }); toast('success', 'Settings synced to your account') } catch { toast('error', 'Sign in to sync settings (optional).') } }}>Sync editor settings to my account</button>
      </div>
    ),
  }

  return (
    <div className="flex h-full">
      <nav className="w-44 shrink-0 border-r border-line p-2" aria-label="Settings categories">
        {CATS.map((c) => <button key={c} className={`block w-full rounded-md px-3 py-1.5 text-left text-xs ${c === cat ? 'bg-accent/15 text-accent' : 'hover:bg-raised'}`} onClick={() => setCat(c)}>{c}</button>)}
      </nav>
      <div className="min-w-0 flex-1 overflow-auto p-6">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{cat}</h2><button className="btn" onClick={() => setSettings(DEFAULT_SETTINGS)}>Reset all to defaults</button></div>
        {body[cat]}
        <p className="mt-6 text-[11px] text-muted">Settings are saved automatically on this computer.</p>
      </div>
    </div>
  )
}
