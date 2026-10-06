/**
 * The key a shortcut refers to, independent of the keyboard layout.
 *
 * `event.key` is the character the layout produces, which breaks shortcuts on non-Latin layouts (Khmer, Russian, Arabic…)
 * and for keys like the backquote on AZERTY. So: use the character when it is a plain ASCII one, otherwise fall back to the
 * physical key (`event.code`). The backquote key is always matched by position, as editors conventionally do.
 */
export function shortcutKey(e: Pick<KeyboardEvent, 'key' | 'code'>): string {
  if (e.code === 'Backquote') return '`'
  if (e.key.length === 1 && e.key >= '!' && e.key <= '~') return e.key.toLowerCase()
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(e.code)) return e.code.slice(5)
  if (/^Numpad[0-9]$/.test(e.code)) return e.code.slice(6)
  switch (e.code) {
    case 'Equal': case 'NumpadAdd': return '='
    case 'Minus': case 'NumpadSubtract': return '-'
    default: return e.key.toLowerCase()
  }
}
