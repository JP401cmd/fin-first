import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import DebtsPage from '../../core/debts/page'
import { SchuldenFilter } from '@/components/overview/schulden-filter'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PAGE_INFO } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Schulden — TriFinity',
  description: 'Hypotheek, leningen en studieschuld — de hefboom schulden.',
}

/**
 * /overzicht/schulden — tweede hefboom-verdieping.
 *
 * Layout: PageInfo rechtsboven, DebtsPage met SchuldenFilter naast de
 * "Schuld toevoegen"-knop in de toolbar. De losse vierdeling-strook is
 * op verzoek verwijderd — de categorieën onder de filter tonen schulden
 * weer in hun oorspronkelijke groepering.
 */
export default function OverzichtSchuldenPage() {
  return (
    <>
      <NavStackMeta title="Schulden" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <PageInfoButton
          description={PAGE_INFO['/overzicht/schulden'] ?? ''}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>
      <DebtsPage toolbarFilter={<SchuldenFilter />} />
    </>
  )
}
