import { useApp } from '../store/app'
import { AboutDialog, CloneDialog, ConfirmDialog, ConnectionDialog, PromptDialog } from './Dialogs'
import Palette, { SaveQueryDialog } from './Palette'

/** Renders whichever modal the store currently asks for. */
export default function DialogHost() {
  const d = useApp((s) => s.dialog)
  if (!d) return null
  switch (d.type) {
    case 'confirm': return <ConfirmDialog d={d} />
    case 'prompt': return <PromptDialog d={d} />
    case 'connection': return <ConnectionDialog editId={d.editId} engine={d.engine} initial={d.initial} />
    case 'clone': return <CloneDialog />
    case 'about': return <AboutDialog />
    case 'palette': return <Palette mode={d.mode} />
    case 'save-query': return <SaveQueryDialog sql={d.sql} />
  }
}
