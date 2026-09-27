// Verplaatst uit components/toekomst/instellingen/instellingen-rijen.tsx @ 039a369b9 (27 sep, ADR 0179).
'use client'

/**
 * "Je levensstrategieën" — AOW, pensioen, werk en eigen woning, bij de levensgebeurtenissen
 * op katern Plan (eigenaarsbesluit 27 sep 2026: "neem de levensstrategieën op in het plan").
 * Tot die dag sectie II van katern Instellingen; dezelfde rijen (`InstellingRij`), dezelfde
 * waarden (`levensstrategieRijwaarde`) en dezelfde editors (`StrategieEditors`, gehost door
 * `LevensstrategieEditorsHost` op de Plan-page) — geen tweede formulier.
 *
 * Twee plekken, net als de gebeurtenissen (`PlanGebeurtenissen`): `kolom` naast de grafiek
 * vanaf `lg`, `pagina` eronder. Het anker `#levensstrategieen` gaat naar de zichtbare plek.
 *
 * Een klik op een rij opent de editor via een venster-event
 * (`LEVENSSTRATEGIE_OPEN_EVENT`): de kolom staat in de katern-layout en de editor-host in
 * de page, dus er is geen gedeelde ouder. De URL blijft rustig; een deeplink
 * (`/toekomst?rij=aow#levensstrategieen`) loopt via de host zelf.
 *
 * Leest zijn data uit de provider (events, woonstrategie), nooit uit de route (D8).
 */

import { useIsLgUp } from '@/lib/hooks/use-media-query'
import { useToekomstBron } from '@/components/toekomst/state/toekomst-state-provider'
import { AnkerScroll } from '@/components/toekomst/layout/anker-scroll'
import { InstellingRij, RijWaarde } from '@/components/toekomst/instellingen/instelling-rij'
import { LEVENSSTRATEGIEEN_ANKER } from '@/lib/horizon/strategie-route'
import { LEVENSSTRATEGIE_RIJEN, type LevensstrategieRij } from '@/lib/toekomst/instellingen-rij'
import {
  INSTELLINGEN_SECTIE_DECK,
  INSTELLINGEN_SECTIE_KOP,
  RIJ_LABEL,
  levensstrategieRijStaat,
  levensstrategieRijwaarde,
  type LevensRijInput,
} from '@/lib/toekomst/instellingen-rijwaarden'

/** Venster-event waarmee een rij de editor-host op de page vraagt een editor te openen. */
export const LEVENSSTRATEGIE_OPEN_EVENT = 'toekomst:levensstrategie-open'

export interface LevensstrategieOpenDetail {
  rij: LevensstrategieRij
}

export function openLevensstrategie(rij: LevensstrategieRij): void {
  window.dispatchEvent(
    new CustomEvent<LevensstrategieOpenDetail>(LEVENSSTRATEGIE_OPEN_EVENT, { detail: { rij } }),
  )
}

export type LevensstrategieenPlek = 'kolom' | 'pagina'

export function LevensstrategieenBlok({ plek }: { plek: LevensstrategieenPlek }) {
  const { initialData, gebeurtenissen } = useToekomstBron()
  // Het anker hoort bij de plek die op dit breekpunt zichtbaar is (server = mobile-first).
  const isLg = useIsLgUp()
  const kolom = plek === 'kolom'
  const anker = kolom ? isLg : !isLg

  const invoer: LevensRijInput = {
    // Dezelfde gebeurtenissen als de lijst erboven (de layout bouwt ze uit de bundel).
    events: gebeurtenissen?.events ?? initialData.events,
    housingStrategy: initialData.housingStrategy,
    woonstrategieGekozen: initialData.rawProfile?.housing_strategy_config != null,
  }

  return (
    <section
      id={anker ? LEVENSSTRATEGIEEN_ANKER : undefined}
      aria-labelledby={`levensstrategieen-kop-${plek}`}
      className={kolom ? 'mt-4 scroll-mt-24' : 'mt-10 scroll-mt-20'}
      data-testid={kolom ? 'levensstrategieen-kolom' : 'levensstrategieen'}
    >
      {/* Eén scroll-helper: de pagina-plek is altijd gemount. */}
      {!kolom && <AnkerScroll ankers={[LEVENSSTRATEGIEEN_ANKER]} />}
      {/* Kolom: dezelfde kicker-kop als de compacte gebeurtenissen erboven, zonder deck —
          de kolom moet bij een gewoon aantal passen zonder te scrollen (27 sep). */}
      <h2
        id={`levensstrategieen-kop-${plek}`}
        className={
          kolom
            ? 'py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]'
            : 'font-serif text-xl text-[var(--ink)]'
        }
      >
        {INSTELLINGEN_SECTIE_KOP.levensstrategieen}
      </h2>
      {!kolom && (
        <p className="mt-1 font-serif text-[14px] italic leading-snug text-[var(--ink-2)]">
          {INSTELLINGEN_SECTIE_DECK.levensstrategieen}
        </p>
      )}
      <div className={kolom ? 'mt-1 border-t border-[var(--border-ed)]' : 'mt-3 border-t border-[var(--ink)]'}>
        {LEVENSSTRATEGIE_RIJEN.map((rij) => (
          <InstellingRij
            key={rij}
            rij={rij}
            label={RIJ_LABEL[rij]}
            waarde={<RijWaarde delen={levensstrategieRijwaarde(rij, invoer)} />}
            staat={levensstrategieRijStaat(rij, invoer)}
            onEdit={() => openLevensstrategie(rij)}
            compact={kolom}
          />
        ))}
      </div>
    </section>
  )
}
