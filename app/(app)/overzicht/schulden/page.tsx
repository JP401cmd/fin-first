import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import DebtsPage from '../../core/debts/page'
import { SchuldenSegmented } from '@/components/overview/schulden-segmented'

export const metadata: Metadata = {
  title: 'Schulden — TriFinity',
  description: 'Hypotheek, leningen en studieschuld — de hefboom schulden.',
}

/**
 * /overzicht/schulden — tweede hefboom-verdieping in nieuwe architectuur.
 *
 * Toont "Alles"-view via DebtsPage. Voor specifieke categorieën navigeert
 * de segmented-control naar /overzicht/schulden/[type] (re-exports van
 * /core/debts/[type]). Toekomstige verbeteringen:
 *  - progressive-disclosure: BKR / roodstand / familie-lening / belasting-schuld
 *  - hypotheek-aflossing wordt onderdeel van Huis-strategie (Toekomst)
 */
export default function OverzichtSchuldenPage() {
  return (
    <>
      <NavStackMeta title="Schulden" bottomBar={{ kind: 'tabs' }} />
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <SchuldenSegmented />
      </div>
      <DebtsPage />
    </>
  )
}
