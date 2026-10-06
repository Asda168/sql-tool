/** Illustration of the real IDE layout: database tree, SQL editor with results, terminal and status bar. Pure markup, no image files. */
const K = ({ children }: { children: string }) => <span className="text-accent">{children}</span>
const S = ({ children }: { children: string }) => <span className="text-mint">{children}</span>
const C = ({ children }: { children: string }) => <span className="text-white/35">{children}</span>

const CODE = [
  <><K>SELECT</K>{' id, name, email, status'}</>,
  <><K>FROM</K>{' users u'}</>,
  <><K>JOIN</K>{' orders o '}<K>ON</K>{' o.user_id = u.id'}</>,
  <><K>WHERE</K>{' u.status = '}<S>'active'</S></>,
  <><K>ORDER BY</K>{' u.created_at '}<K>DESC</K>{';  '}<C>-- 1,245 rows</C></>,
]
const TABLES = ['crm_contacts', 'crm_deals', 'crm_invoices', 'crm_products', 'orders', 'users']
const ROWS = [['1', 'Ada Lovelace', 'ada@forge.dev', 'active'], ['2', 'Alan Turing', 'alan@forge.dev', 'active'], ['3', 'Grace Hopper', 'grace@forge.dev', 'active'], ['4', 'Linus T.', 'linus@forge.dev', 'active']]

export default function AppShot({ className = '' }: { className?: string }) {
  return (
    <div className={`glow-soft overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d] text-left ${className}`} role="img" aria-label="MySQL Forge Studio: database tree on the left, SQL editor with query results in the middle, integrated terminal at the bottom">
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#171717] px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" /><span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" /><span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 hidden text-[11px] text-white/50 sm:inline">File&nbsp;&nbsp;Edit&nbsp;&nbsp;View&nbsp;&nbsp;Tools&nbsp;&nbsp;Help</span>
        <span className="mx-auto text-[11px] text-white/40">Development — MySQL Forge Studio</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[190px_1fr]">
        <aside className="hidden border-r border-white/10 bg-[#171717] p-3 text-[11px] sm:block">
          <div className="relative mb-3 rounded-md border border-white/10 bg-black/30 px-3 py-2 pl-3.5"><span className="absolute inset-y-1.5 left-1 w-[3px] rounded bg-teal-400" /><div className="font-medium text-white/90">Development</div><div className="text-white/40">db.example.com:3306</div></div>
          <div className="mb-1 flex items-center justify-between rounded-md border border-white/10 px-2 py-1.5 text-white/80"><span>⛁ crm</span><span className="text-[9px] uppercase tracking-wider text-white/40">switch</span></div>
          <div className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-white/40">Tables · {TABLES.length}</div>
          <ul className="mt-1.5 space-y-0.5 font-mono">
            {TABLES.map((t, i) => <li key={t} className={`flex items-center justify-between rounded px-2 py-1 ${i === 0 ? 'bg-accent/15 text-white' : 'text-white/65'}`}><span>▦ {t}</span><span className="text-[9px] text-white/30">{[17, 12, 9, 14, 8, 11][i]}</span></li>)}
          </ul>
        </aside>
        <div className="min-w-0">
          <div className="flex border-b border-white/10 bg-[#171717] text-[11px]">
            <span className="border-t-2 border-accent bg-[#0d0d0d] px-4 py-1.5 text-white/90">users.sql</span><span className="px-4 py-1.5 text-white/40">orders.sql</span><span className="px-4 py-1.5 text-white/40">+</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 px-3 py-1.5 text-[10px]">
            <span className="rounded bg-accent px-2 py-1 font-semibold text-ink">▶ Run</span><span className="rounded border border-white/15 px-2 py-1 text-white/70">Format</span><span className="rounded border border-white/15 px-2 py-1 text-white/70">Explain</span>
            <span className="ml-auto rounded border border-white/15 px-2 py-1 text-white/70">✎ Edit Data</span>
          </div>
          <div className="overflow-hidden px-4 py-3 font-mono text-[12px] leading-5 text-white/85" aria-hidden>
            {CODE.map((line, i) => <div key={i} className="flex gap-4 whitespace-pre"><span className="w-3 shrink-0 select-none text-right text-white/25">{i + 1}</span><span>{line}</span></div>)}
          </div>
          <div className="border-t border-white/10">
            <div className="flex items-center gap-3 px-3 py-1.5 text-[10px]"><span className="font-semibold uppercase tracking-widest text-white/40">Results</span><span className="text-mint">✓ completed</span><span className="text-white/70">1,245 rows</span><span className="text-white/50">0.124 seconds</span></div>
            <table className="w-full font-mono text-[11px]"><thead className="bg-white/[0.04] text-left text-white/50"><tr>{['id', 'name', 'email', 'status'].map((h) => <th key={h} className="px-3 py-1 font-medium">{h}</th>)}</tr></thead>
              <tbody>{ROWS.map((r) => <tr key={r[0]} className="border-t border-white/5 text-white/80">{r.map((c, i) => <td key={i} className={`px-3 py-1 ${i === 3 ? 'text-mint' : ''}`}>{c}</td>)}</tr>)}</tbody></table>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 bg-black/40 px-4 py-2.5 font-mono text-[11px] leading-5 text-white/70">
        <span className="text-white/35">Git Bash</span><br />
        <span className="text-mint">dev@forge</span> <span className="text-violet">~/crm-app</span> <span className="text-accent">(main)</span><br />
        $ git status<br /><span className="text-white/50">On branch main — nothing to commit, working tree clean</span>
      </div>
      <div className="flex items-center gap-4 border-t border-white/10 bg-[#171717] px-3 py-1 text-[10px] text-white/45">
        <span>⎇ main</span><span>MySQL</span><span><span className="text-teal-300">▮</span> Development</span><span>crm</span><span className="ml-auto">UTF-8</span><span>Ln 5, Col 38</span><span>JetBrains Mono 14px</span>
      </div>
    </div>
  )
}
