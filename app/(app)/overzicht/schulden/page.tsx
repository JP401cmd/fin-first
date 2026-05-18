import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import DebtsPage from '../../core/debts/page'

export const metadata: Metadata = {
  title: 'Schulden — TriFinity',
  description: 'Hypotheek, leningen en studieschuld — de hefboom schulden.',
}

/**
 * /overzicht/schulden — tweede hefboom-verdieping in nieuwe architectuur.
 *
 * Vervangt /core/debts. Voor nu rendert DebtsPage (client component) zodat
 * de UI direct werkt onder de nieuwe URL. Toekomstige verbeteringen:
 *  - segmented-control [Alles | Hypotheek | Lening | Studie]
 *  - progressive-disclosure: BKR / roodstand / familie-lening / belasting-schuld
 *  - hypotheek-aflossing wordt onderdeel van Huis-strategie (Toekomst)
 */
export default function OverzichtSchuldenPage() {
  return (
    <>
      <NavStackMeta title="Schulden" bottomBar={{ kind: 'tabs' }} />
      <DebtsPage />
    </>
  )
}
