import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import BelastingPage from '../../core/belasting/page'

export const metadata: Metadata = {
  title: 'Belasting — TriFinity',
  description: 'Box 1, Box 2 en Box 3 — de hefboom belasting.',
}

/**
 * /overzicht/belasting — vierde hefboom-verdieping in nieuwe architectuur.
 *
 * Vervangt /core/belasting. Voor nu rendert BelastingPage (client component)
 * zodat de UI direct werkt onder de nieuwe URL. Toekomstige verbeteringen:
 *  - segmented-control [Box 1 | Box 2 | Box 3 | Aangifte]
 *  - progressive-disclosure: schenking / erfenis / buitenland / ZZP-jaarafrekening
 *  - jaarruimte/reserveringsruimte-tracker als Will-suggestie inline
 */
export default function OverzichtBelastingPage() {
  return (
    <>
      <NavStackMeta title="Belasting" bottomBar={{ kind: 'tabs' }} />
      <BelastingPage />
    </>
  )
}
