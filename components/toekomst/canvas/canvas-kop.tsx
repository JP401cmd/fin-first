// Verplaatst uit components/app/horizon/horizon-client.tsx r5879–5922 @ c1b4849eb (fase 1, ADR 0179).
'use client'

import type { ReactNode } from 'react'
import type { HouseholdHeroData } from '@/components/toekomst/state/types'

/**
 * De canvaskop (blok B; tot fase 2 `plan/plan-hero-kop.tsx`): de bedieningsrij boven
 * de grafiek. Fase 2 (ADR 0179 D3, wireframe §4.3 regel 7) houdt hier alleen links de
 * modus-switch en rechts Lagen en de canvas-i ("Zo werkt je grafiek", met de
 * tips-schakelaar erin); de zoom zit op de grafiek zelf. De jaar-op-jaar-tabel heeft
 * één ingang, de link in Plan (spec §4.2 regel 10) — hier dus geen Details-knop. De rij
 * draagt `relative z-[46]` (M9): één stap boven de tips-scrim van ToekomstOverlay (z-[45]).
 *
 * Presentational: de slots komen van `ToekomstCanvas`. De omhullende sectie, de
 * accentstreep en de padding blijven bij de ouder.
 */
export interface CanvasKopProps {
  hasPerspectiveHero: boolean
  isPartnerView: boolean
  perspectiveHero: HouseholdHeroData | null
  /** Perspectief-label (alleen bij een huishouden). */
  kicker?: ReactNode
  /** Links in de bedieningsrij: de modus-switch. */
  modus?: ReactNode
  /** Rechts in de bedieningsrij: Lagen en de canvas-i. */
  acties?: ReactNode
}

export function CanvasKop({
  hasPerspectiveHero,
  isPartnerView,
  perspectiveHero,
  kicker,
  modus,
  acties,
}: CanvasKopProps) {
  return (
    <>
      {/* `empty:hidden`: het perspectief-label rendert buiten een huishouden niets. */}
      <div className="mb-2 flex items-center gap-3 empty:hidden">
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
      {/* `relative z-[46]` (M9): de tips-scrim van ToekomstOverlay is een klik-vanger
          die als portal-kind van [data-scroll-container] op z-[45] over de volle
          paginahoogte ligt. Zonder eigen stapelniveau viel deze rij eronder: de eerste
          klik sloot de tips in plaats van Lagen of de i te openen. 46
          tilt de rij precies één stap boven de scrim, ruim onder de grafiek+markers
          (z-[50]) en elke overlay (z-[70]). */}
      <div className="relative z-[46] mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:mb-4">
        <div className="min-w-0">{modus}</div>
        <div className="flex items-center gap-1.5">{acties}</div>
      </div>
    </>
  )
}
