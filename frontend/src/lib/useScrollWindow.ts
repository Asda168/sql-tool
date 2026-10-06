import { useCallback, useEffect, useState, type RefObject } from 'react'

/**
 * Which rows of a long, fixed-height-row list to render.
 *
 * Why it looks like this (each part fixes a real scrolling glitch):
 *  - updates synchronously inside the scroll event, never deferred to a later frame: a deferred update shows blank rows
 *    for a frame during fast wheel scrolling;
 *  - the window only moves when the scroll position crosses a `bucket` of rows, so React re-renders every few rows, not every pixel;
 *  - a generous `overscan` keeps rows rendered well beyond the viewport, so even very fast scrolling never outruns them.
 */
export function useScrollWindow(ref: RefObject<HTMLElement | null>, rowH: number, bucket = 6, overscan = 30) {
  const [b, setB] = useState(0)
  const [height, setHeight] = useState(600)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.clientHeight))
    ro.observe(el)
    setHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [ref])

  const onScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    const w = Math.floor(e.currentTarget.scrollTop / (rowH * bucket))
    setB((prev) => (prev === w ? prev : w))
  }, [rowH, bucket])

  const range = (count: number) => {
    const top = b * bucket
    return { first: Math.max(0, top - overscan), last: Math.min(count, top + Math.ceil(height / rowH) + bucket + overscan) }
  }
  return { onScroll, range, height }
}
