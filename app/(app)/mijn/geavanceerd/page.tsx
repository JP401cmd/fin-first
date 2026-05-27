import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { GeavanceerdSettings } from '@/components/mijn/geavanceerd-settings'

export const metadata: Metadata = {
  title: 'Geavanceerd — TriFinity',
  description: 'Modules aan/uit, data-export en je gegevens resetten.',
}

/**
 * /mijn/geavanceerd — modules + data-export + reset. Vervangt de
 * redirect-stub naar /identity/instellingen?tab=gegevens (plan A-2,
 * ontmanteling settings-monolith). Content in GeavanceerdSettings (client).
 */
export default function MijnGeavanceerdPage() {
  return (
    <>
      <NavStackMeta title="Geavanceerd" bottomBar={{ kind: 'tabs' }} />
      <GeavanceerdSettings />
    </>
  )
}
