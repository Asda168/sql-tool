import { create } from 'zustand'

/** Editor cursor position. Kept out of the main store so moving the cursor only re-renders the status bar. */
export const useCursor = create<{ line: number; col: number }>(() => ({ line: 1, col: 1 }))
