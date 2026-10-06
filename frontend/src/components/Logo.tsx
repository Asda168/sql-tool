/** Icon: database cylinder + code brackets + anvil base. Uses currentColor tokens so it works on dark and light. */
export function Logo({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="MySQL Forge Studio">
      <ellipse cx="32" cy="14" rx="16" ry="6" fill="none" stroke="rgb(var(--accent))" strokeWidth="3" />
      <path d="M16 14v14c0 3.3 7.2 6 16 6s16-2.7 16-6V14" fill="none" stroke="rgb(var(--accent))" strokeWidth="3" />
      <path d="M26 40l-6 6 6 6M38 40l6 6-6 6" fill="none" stroke="rgb(var(--fg))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 58h40" stroke="rgb(var(--fg))" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function LogoFull({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <Logo className="h-7 w-7" />
      <span>MySQL Forge <span className="text-accent">Studio</span></span>
    </span>
  )
}
