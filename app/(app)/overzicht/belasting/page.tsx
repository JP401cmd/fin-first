import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import BelastingPage from '../../core/belasting/page'
import { BelastingSegmented } from '@/components/overview/belasting-segmented'

export const metadata: Metadata = {
  title: 'Belasting — TriFinity',
  description: 'Box 1, Box 2 en Box 3 — de hefboom belasting.',
}

/**
 * /overzicht/belasting — vierde hefboom-verdieping in nieuwe architectuur.
 *
 * Toont alle boxen op één pagina; segmented-control bovenaan scrollt naar
 * Box 3 (#box3) of Box 2 (#box2) anchors. Geen route-verandering — alle
 * data + berekeningen leven in BelastingPage.
 *
 * Toekomstige verbeteringen:
 *  - Box 1-sectie toevoegen (nu alleen via uitsluitingen zichtbaar)
 *  - Aangifte-flow als aparte view-tab
 *  - jaarruimte/reserveringsruimte-tracker als Will-suggestie inline
 */
export default function OverzichtBelastingPage() {
  return (
    <>
      <NavStackMeta title="Belasting" bottomBar={{ kind: 'tabs' }} />
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <BelastingSegmented />
      </div>
      <BelastingPage />
    </>
  )
}
