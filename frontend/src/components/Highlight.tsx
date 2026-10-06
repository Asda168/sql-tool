import { highlightParts } from '../lib/highlight'

/** Text with the characters that match `query` emphasised. */
export default function Highlight({ text, query }: { text: string; query: string }) {
  return <>{highlightParts(query, text).map((p, i) => (p.hit ? <mark key={i} className="rounded-sm bg-accent/20 px-px font-semibold text-accent">{p.text}</mark> : <span key={i}>{p.text}</span>))}</>
}
