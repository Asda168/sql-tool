import { forwardRef } from 'react'
import { Search, X } from 'lucide-react'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder: string
  label: string
  /** shown at the right while the box is empty, e.g. a shortcut */
  hint?: string
  /** shown at the right while typing, e.g. "12 results" */
  count?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  autoFocus?: boolean
}

/**
 * Search field with ONE focus indicator (a cyan border and soft ring on the whole box),
 * a visible hover state, a clear button, and Escape-to-clear.
 */
const SearchBox = forwardRef<HTMLInputElement, Props>(function SearchBox({ value, onChange, placeholder, label, hint, count, onKeyDown, autoFocus }, ref) {
  return (
    <div className="group flex h-9 items-center gap-2 rounded-lg border border-line bg-bg px-2.5 transition-colors [&:not(:focus-within)]:hover:border-muted/50 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
      <Search size={14} className="shrink-0 text-muted transition-colors group-focus-within:text-accent" aria-hidden />
      <input
        ref={ref} autoFocus={autoFocus} type="text" role="searchbox" aria-label={label} placeholder={placeholder} value={value} spellCheck={false} autoComplete="off"
        className="bare-input h-full min-w-0 flex-1 bg-transparent text-xs placeholder:text-muted/80"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape' && value) { e.preventDefault(); e.stopPropagation(); onChange('') } onKeyDown?.(e) }}
      />
      {value ? (
        <>
          {count && <span className="shrink-0 text-[10px] tabular-nums text-muted">{count}</span>}
          <button type="button" aria-label="Clear search" title="Clear (Esc)" className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-raised hover:text-fg" onClick={() => onChange('')}><X size={13} /></button>
        </>
      ) : hint ? <kbd className="code shrink-0 rounded border border-line px-1.5 py-px !text-[10px] text-muted">{hint}</kbd> : null}
    </div>
  )
})

export default SearchBox
