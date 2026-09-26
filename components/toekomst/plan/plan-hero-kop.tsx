// Verplaatst uit components/app/horizon/horizon-client.tsx r5879–5922 @ c1b4849eb (fase 1, ADR 0179).
'use client'

import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { TableProperties } from 'lucide-react'
import type { SimResult } from '@/lib/fire-simulation'
import type { HouseholdHeroData } from '@/components/toekomst/state/types'

/**
 * Blok B — de kopregel van de hero-kaart: perspectief-kicker + Details-pill (`relative z-[46]`,
 * M9 — boven de tips-scrim). De omhullende `<section data-testid="horizon-hero">`, de
 * accentstreep en de `p-4`-wrapper blijven bij de ouder: die omsluiten ook canvas en lab.
 */
export interface PlanHeroKopProps {
  hasPerspectiveHero: boolean // horizon-client r5633
  isPartnerView: boolean // horizon-client r625
  perspectiveHero: HouseholdHeroData | null // horizon-client r5632
  simResult: SimResult | null // horizon-client r1253
  setSimModalOpen: Dispatch<SetStateAction<boolean>> // horizon-client r754
  /**
   * Stap 15 (ADR 0179, kaart V11): de kopregel is de canvas-kop geworden. Wat uit de
   * vervallen kicker-kop meeverhuist, komt hier binnen — links het perspectief-label,
   * rechts de Tips-toggle vóór de Details-pill.
   */
  kicker?: ReactNode
  acties?: ReactNode
}

export function PlanHeroKop({
  hasPerspectiveHero,
  isPartnerView,
  perspectiveHero,
  simResult,
  setSimModalOpen,
  kicker,
  acties,
}: PlanHeroKopProps) {
  return (
    <>
          {/* Header rij: kicker + Details pill.
              `relative z-[46]` (M9): de tips-scrim van ToekomstOverlay is een
              klik-vanger die als portal-kind van [data-scroll-container] op
              z-[45] over de VOLLE paginahoogte ligt — hij vervaagt bewust ook
              deze kop. Zonder eigen stapelniveau viel de Details-pill dus
              ónder die vanger: de eerste klik sloot de tips i.p.v. de
              jaar-op-jaar-tabel te openen. 46 tilt de rij precies één stap
              boven de scrim, en blijft ruim onder de grafiek+markers (z-[50])
              en onder elke overlay (z-[70]). Werkt omdat de hero-kaart in
              tips-modus `no-hover-lift` draagt en dus géén eigen
              stacking-context via hover-transform opent. */}
          <div className="relative z-[46] mb-3 sm:mb-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {kicker}
              {hasPerspectiveHero && (
                <div>
                  <p className="label-editorial text-horizon-600">
                    {isPartnerView
                      ? `${perspectiveHero!.householdName} — Horizon`
                      : `${perspectiveHero!.householdName} — Gezamenlijke horizon`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
                    {isPartnerView
                      ? `FIRE-projectie van ${perspectiveHero!.householdName}`
                      : 'Gecombineerde financiën van het huishouden'}
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
            {acties}
            {simResult && (
              <button
                type="button"
                onClick={() => setSimModalOpen(true)}
                // Pointerdown-guard, zelfde patroon als de ✕ en de markers in
                // toekomst-overlay.tsx: houd de pointerdown weg bij alles wat
                // hem zou kunnen kapen (pointer-capture/klik-vangers) zodat de
                // knop zijn eigen `onClick` gegarandeerd krijgt.
                onPointerDown={(e) => e.stopPropagation()}
                className="flex items-center gap-1 rounded-[var(--r-sm)] border border-horizon-200 bg-horizon-50 px-2 py-0.5 font-sans text-[10px] text-horizon-600 transition-all hover:bg-horizon-100"
              >
                <TableProperties className="h-3 w-3" />
                Details
              </button>
            )}
            </div>
          </div>
    </>
  )
}
