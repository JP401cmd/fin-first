// Verplaatst uit components/toekomst/plan/plan-paneel.tsx @ a70310db4 (27 sep, ADR 0179).
// euro-view: rekent en deflateert niets; de view krijgt zijn props van de layout en de hoofdrun van de provider
'use client'

/**
 * "Wat er in je leven gebeurt" — de levensgebeurtenissen van katern Plan op twee plekken
 * (eigenaarsbesluit 27 sep: Plan krijgt dezelfde canvas-rij als Doelen, zodat de grafiek
 * bij een katernwissel op dezelfde plek en in dezelfde maat blijft staan):
 * - `plek="kolom"` — rechts naast de grafiek, desktop (de layout rendert hem via
 *   `CanvasZijkolom`), compact; de kolom scrolt zelf en rekt de canvas-rij niet op;
 * - `plek="pagina"` — onder het Plan-paneel, alleen onder `lg` (`lg:hidden`).
 *
 * Eén plek per breekpunt: beide staan in de DOM, CSS verbergt de plek die niet bij het
 * breekpunt hoort (geen hydratiesprong). Het anker `#gebeurtenissen` gaat alleen naar de
 * zichtbare plek (`useIsLgUp`), net als het lab in Doelen. De jaar-op-jaar-tabel hoort
 * bij deze sectie (spec §4.3: één ingang) en verhuist mee.
 *
 * Leest zijn data uit de provider, nooit uit de route (D8).
 */

import { useIsLgUp } from '@/lib/hooks/use-media-query'
import { GebeurtenissenMetHoofdrun } from './gebeurtenissen-met-hoofdrun'
import { LevensstrategieenBlok } from './levensstrategieen-blok'
import { AnkerScroll } from '@/components/toekomst/layout/anker-scroll'
import { GEBEURTENISSEN_ANKER } from '@/components/toekomst/layout/oude-lab-bladwijzer'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { SectionLabel } from '@/components/editorial'
import { PLAN_GEBEURTENISSEN_KOP, PLAN_JAARTABEL_LINK } from '@/lib/horizon/katern-copy'
import {
  useToekomstBron,
  useToekomstOverlayContext,
  useToekomstSimContext,
} from '@/components/toekomst/state/toekomst-state-provider'

export type PlanGebeurtenissenPlek = 'kolom' | 'pagina'

/** De kop van de sectie (visueel label; de koppen staan in de view zelf). Bron: katern-copy. */
export { PLAN_GEBEURTENISSEN_KOP }

/** Zichtbaarheid per plek: de kolom staat alleen vanaf `lg` in de canvas, de pagina eronder. */
export const PLAN_GEBEURTENISSEN_ZICHTBAARHEID: Record<PlanGebeurtenissenPlek, string> = {
  kolom: '',
  pagina: 'lg:hidden',
}

const JAARTABEL_KNOP =
  'inline-flex min-h-[44px] items-center font-sans text-[13px] text-[var(--ink-2)] underline decoration-[var(--border-ed)] underline-offset-4 transition-colors hover:text-[var(--module-active-700)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]'

export function PlanGebeurtenissen({ plek }: { plek: PlanGebeurtenissenPlek }) {
  const { gebeurtenissen } = useToekomstBron()
  const { setSimModalOpen } = useToekomstOverlayContext()
  const { simResult } = useToekomstSimContext()
  // Het anker hoort bij de plek die op dit breekpunt zichtbaar is. De server rendert
  // mobile-first, dus daar staat het op de pagina.
  const isLg = useIsLgUp()
  const anker = plek === 'kolom' ? isLg : !isLg
  const kolom = plek === 'kolom'


  return (
    <div className={PLAN_GEBEURTENISSEN_ZICHTBAARHEID[plek]} data-gebeurtenissen-plek={plek}>
      {/* === KATERN II — Wat er in je leven gebeurt ===
          De levensgebeurtenissen onder het plan (ADR 0179, addendum 26 sep): dezelfde
          lijst met kernelmomenten en dezelfde toevoegknop als tot dan in Instellingen, in
          Eenvoudig én Volledig. De props bouwt de layout server-side; de hoofdrun komt uit
          de provider (besluit Q8). `#gebeurtenissen` is het anker van elke deeplink. */}
      {gebeurtenissen && (
        <section
          id={anker ? GEBEURTENISSEN_ANKER : undefined}
          className={kolom ? 'scroll-mt-24' : 'mt-8 scroll-mt-20 sm:mt-10'}
          data-testid={kolom ? 'plan-gebeurtenissen-kolom' : 'plan-gebeurtenissen'}
        >
          {/* Eén scroll-helper: de pagina-plek is altijd gemount. */}
          {!kolom && <AnkerScroll ankers={[GEBEURTENISSEN_ANKER]} />}
          {/* Kolom: de compacte view draagt zelf de kop (kicker met het aantal, 27 sep). */}
          {!kolom && (
            <HideInSimple>
              <SectionLabel num="II">{PLAN_GEBEURTENISSEN_KOP}</SectionLabel>
            </HideInSimple>
          )}
          {kolom ? (
            <GebeurtenissenMetHoofdrun {...gebeurtenissen} compact />
          ) : (
            // De view draagt zijn eigen `max-w-6xl px-4 sm:px-6`-kolom; de katern-layout
            // padt al, dus de negatieve marge voorkomt dubbele inspringing.
            <div className="-mx-4 sm:-mx-6">
              <GebeurtenissenMetHoofdrun {...gebeurtenissen} />
            </div>
          )}
        </section>
      )}
      {/* De levensstrategieën (AOW, pensioen, werk, eigen woning) direct onder de lijst
          (eigenaarsbesluit 27 sep: uit katern Instellingen naar het plan). Zelfde plek-regel. */}
      <LevensstrategieenBlok plek={plek} />
      {/* Kolom: de jaar-op-jaar-tabel onder de gebeurtenissen en de levensstrategieën. Pagina: de host zet
          hem onder de verdieping (de plek van vóór 27 sep). */}
      {kolom && simResult && (
        <p className="mt-4">
          <button
            type="button"
            onClick={() => setSimModalOpen(true)}
            data-testid="plan-jaar-op-jaar-kolom"
            className={JAARTABEL_KNOP}
          >
            {PLAN_JAARTABEL_LINK}
          </button>
        </p>
      )}
    </div>
  )
}

/**
 * De link naar de jaar-op-jaar-tabel op de pagina (onder `lg`). Vanaf `lg` staat hij in
 * de kolom naast de grafiek, onder de gebeurtenissen.
 */
export function PlanJaartabelLink() {
  const { setSimModalOpen } = useToekomstOverlayContext()
  const { simResult } = useToekomstSimContext()
  // Links-rij van Plan (spec §4.3/§4.9): alleen de jaar-op-jaar-tabel. "Zo werkt je
  // grafiek" heeft één ingang, de i op het canvas. In beide weergavemodi (§4.7).
  if (!simResult) return null
  return (
    <p className="mt-6 sm:mt-8 lg:hidden">
      <button type="button" onClick={() => setSimModalOpen(true)} data-testid="plan-jaar-op-jaar" className={JAARTABEL_KNOP}>
        {PLAN_JAARTABEL_LINK}
      </button>
    </p>
  )
}
