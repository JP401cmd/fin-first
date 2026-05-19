import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import DebtsPage from '../../core/debts/page'
import { SchuldenFilter } from '@/components/overview/schulden-filter'

export const metadata: Metadata = {
  title: 'Schulden — TriFinity',
  description: 'Hypotheek, leningen en studieschuld — de hefboom schulden.',
}

/**
 * /overzicht/schulden — tweede hefboom-verdieping.
 *
 * Toont alle schulden in één DebtsPage-view. Bovenaan een filter-dropdown
 * met alle 11 debt-types (uit DEBT_TYPE_LABELS). Selectie navigeert naar
 * /overzicht/schulden/[type] voor categorie-detail; "Alle schulden" terug
 * naar deze landings-view.
 */
export default function OverzichtSchuldenPage() {
  return (
    <>
      <NavStackMeta title="Schulden" bottomBar={{ kind: 'tabs' }} />
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <SchuldenFilter />
      </div>
      <DebtsPage />
    </>
  )
}
