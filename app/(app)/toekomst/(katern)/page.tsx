import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { OrnamentColophon } from '@/components/editorial'
import { PlanPaneel } from '@/components/toekomst/plan/plan-paneel'
import { OudeLabBladwijzer } from '@/components/toekomst/layout/oude-lab-bladwijzer'

export const metadata: Metadata = {
  title: 'Toekomst — TriFinity',
  description: 'Tijdas, doelen, gebeurtenissen en toekomst-voorkeuren — keuzes maken voor later.',
}

/**
 * /toekomst — katern Plan (ADR 0179 D1/D4, fase 1 stap 15).
 *
 * De kop, het canvas, de katern-koppen en de overlays staan in
 * `(katern)/layout.tsx` en blijven gemonteerd bij een katernwissel; deze page levert
 * alleen het Plan-paneel eronder. De data komt uit de provider van die layout
 * (`loadToekomstData`, één lading per request), niet uit de route (D8).
 *
 * Backwards-compat: oude `?tab=<doelen|gebeurtenissen|voorkeuren|rekenhulp>`- en
 * `?modal=withdrawal`-deeplinks redirecten op de routing-laag (`has`-regels in
 * `next.config.ts`, ADR 0179 besluit Q2) — deze page ziet ze nooit.
 */
export default function ToekomstPlanPage() {
  return (
    <>
      {/* Tab-root → 'rich' TopBar (utility-cluster) + tab-titel in de mobiele
          bovenbalk, gelijk aan /overzicht en /mijn. Zonder expliciete topBar
          valt NavStackMeta terug op 'simple' en verdwijnt de cluster. */}
      <NavStackMeta title="Toekomst" topBar={{ kind: 'rich' }} bottomBar={{ kind: 'tabs' }} />

      {/* `/toekomst#verken-je-aannames` (het lab stond hier tot stap 16) → katern Doelen. */}
      <OudeLabBladwijzer />
      <PlanPaneel />

      {/* Krant-stijl colophon als voet van katern Plan. `print:hidden` blijft staan:
          de eigen printknop is weg (B-021), maar de browser-print van de
          gebruiker (Ctrl+P) hoort deze footer nog steeds niet mee te nemen. */}
      <div className="print:hidden">
        <OrnamentColophon text="Geld levert tijd op" module="De Toekomst" />
      </div>
    </>
  )
}
