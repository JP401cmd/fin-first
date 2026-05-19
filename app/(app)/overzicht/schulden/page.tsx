import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import DebtsPage from '../../core/debts/page'

export const metadata: Metadata = {
  title: 'Schulden — TriFinity',
  description: 'Hypotheek, leningen en studieschuld — de hefboom schulden.',
}

/**
 * /overzicht/schulden — tweede hefboom-verdieping.
 *
 * Toont alle schulden in één DebtsPage-view. Geen segmented-control:
 * user-feedback (mei 2026) was dat tab-verdeling niet uitputtend was —
 * filtering/sortering binnen DebtsPage zelf is gepaster. De [type]-sub-
 * routes onder /overzicht/schulden/[type] blijven werken voor directe
 * deep-links.
 */
export default function OverzichtSchuldenPage() {
  return (
    <>
      <NavStackMeta title="Schulden" bottomBar={{ kind: 'tabs' }} />
      <DebtsPage />
    </>
  )
}
