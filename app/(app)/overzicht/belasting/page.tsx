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
 * BelastingPage rendert alle boxen op één pagina; geen segmented control
 * meer (regressie-risico met scroll-anchors uit client-component die
 * door BelastingPage's interne state-machine wordt overschreden).
 */
export default function OverzichtBelastingPage() {
  return (
    <>
      <NavStackMeta title="Belasting" bottomBar={{ kind: 'tabs' }} />
      <BelastingPage />
    </>
  )
}
