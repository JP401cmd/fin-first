import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { SchuldenView } from '@/components/overview/schulden-view'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PAGE_INFO } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Schulden — TriFinity',
  description: 'Hypotheek, leningen en studieschuld — de hefboom schulden.',
}

/**
 * /overzicht/schulden — tweede hefboom-verdieping.
 *
 * Layout: PageInfo rechtsboven, SchuldenView (client-wrapper) toont
 * DebtsPage met de SchuldenFilter naast de "Schuld toevoegen"-knop in
 * de toolbar. Filter werkt client-side: selecteren beperkt de
 * categorie-lijst eronder zonder route-navigatie.
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
      <SchuldenView />
    </>
  )
}
