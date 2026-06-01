import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { GeavanceerdSettings } from '@/components/mijn/geavanceerd-settings'

export const metadata: Metadata = {
  title: 'Geavanceerd — TriFinity',
  description: 'Externe koppelingen, data-export en je gegevens resetten.',
}

/**
 * /mijn/geavanceerd — koppelingen + data-export + reset. Vervangt de
 * redirect-stub naar /identity/instellingen?tab=gegevens (plan A-2,
 * ontmanteling settings-monolith). Content in GeavanceerdSettings (client).
 *
 * De handmatige module-aan/uit-toggle is hier verwijderd — modules worden
 * tijdens onboarding ingesteld en daarna niet meer handmatig geschakeld.
 */
export default function MijnGeavanceerdPage() {
  return (
    <>
      <NavStackMeta title="Geavanceerd" bottomBar={{ kind: 'tabs' }} />
      <GeavanceerdSettings />
    </>
  )
}
