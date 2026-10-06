import { describe, expect, it } from 'vitest'
import { shortcutKey } from './shortcut'

describe('shortcutKey', () => {
  it('uses the character on Latin layouts', () => {
    expect(shortcutKey({ key: 'P', code: 'KeyP' })).toBe('p')
    expect(shortcutKey({ key: '=', code: 'Equal' })).toBe('=')
    expect(shortcutKey({ key: '0', code: 'Digit0' })).toBe('0')
  })
  it('falls back to the physical key on non-Latin layouts', () => {
    expect(shortcutKey({ key: 'ព', code: 'KeyP' })).toBe('p')
    expect(shortcutKey({ key: 'з', code: 'KeyP' })).toBe('p')
    expect(shortcutKey({ key: '٠', code: 'Digit0' })).toBe('0')
  })
  it('always matches the backquote by position', () => {
    expect(shortcutKey({ key: '`', code: 'Backquote' })).toBe('`')
    expect(shortcutKey({ key: 'ឍ', code: 'Backquote' })).toBe('`')
    expect(shortcutKey({ key: '²', code: 'Backquote' })).toBe('`')
    expect(shortcutKey({ key: 'Dead', code: 'Backquote' })).toBe('`')
  })
  it('keeps non-printing keys as they are', () => {
    expect(shortcutKey({ key: 'F11', code: 'F11' })).toBe('f11')
    expect(shortcutKey({ key: 'Escape', code: 'Escape' })).toBe('escape')
  })
})
