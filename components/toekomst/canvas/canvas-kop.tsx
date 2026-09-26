// Verplaatst uit components/app/horizon/horizon-client.tsx r5879–5922 @ c1b4849eb (fase 1, ADR 0179).
'use client'

import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { TableProperties } from 'lucide-react'
import type { SimResult } from '@/lib/fire-simulation'
import type { HouseholdHeroData } from '@/components/toekomst/state/types'

/**
 * De canvaskop (blok B; tot fase 2 `plan/plan-hero-kop.tsx`): de bedieningsrij boven
 * de grafiek. Fase 2 (ADR 0179 D3, spec §4.2 regel 7) houdt hier hoogstens vijf
 * interactieve elementen: links de modus-switch, rechts Lagen, de canvas-i
 * ("Zo werkt je grafiek", met de tips-schakelaar erin) en Details (de jaar-op-jaar-
 * tabel); de zoom zit op de grafiek zelf. De rij draagt `relative z-[46]` (M9): één
 * stap boven de tips-scrim van ToekomstOverlay (z-[45]).
 *
 * Presentational: de slots komen van `ToekomstCanvas`. De omhullende sectie, de
 * accentstreep en de padding blijven bij de ouder.
 */
export interface CanvasKopProps {
  hasPerspectiveHero: boolean
  isPartnerView: boolean
  perspectiveHero: HouseholdHeroData | null
  simResult: SimResult | null
  setSimModalOpen: Dispatch<SetStateAction<boolean>>
  /** Perspectief-label (alleen bij een huishouden). */
  kicker?: ReactNode
  /** Links in de bedieningsrij: de modus-switch. */
  modus?: ReactNode
  /** Rechts in de bedieningsrij, vóór Details: Lagen en de canvas-i. */
  acties?: ReactNode
}

export function CanvasKop({
  hasPerspectiveHero,
  isPartnerView,
  perspectiveHero,
  simResult,
  setSimModalOpen,
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
          klik sloot de tips in plaats van Details (of Lagen, of de i) te openen. 46
          tilt de rij precies één stap boven de scrim, ruim onder de grafiek+markers
          (z-[50]) en elke overlay (z-[70]). */}
      <div className="relative z-[46] mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:mb-4">
        <div className="min-w-0">{modus}</div>
        <div className="flex items-center gap-1.5">
          {acties}
          {simResult && (
            <button
              type="button"
              onClick={() => setSimModalOpen(true)}
              // Pointerdown-guard, zelfde patroon als de ✕ en de markers in
              // toekomst-overlay.tsx: houd de pointerdown weg bij alles wat hem zou
              // kunnen kapen (pointer-capture/klik-vangers).
              onPointerDown={(e) => e.stopPropagation()}
              className="inline-flex min-h-[44px] items-center gap-1 border border-horizon-200 bg-horizon-50 px-2.5 font-sans text-[11px] text-horizon-600 transition-colors hover:bg-horizon-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] lg:min-h-[32px]"
            >
              <TableProperties className="h-3 w-3" aria-hidden />
              Details
            </button>
          )}
        </div>
      </div>
    </>
  )
}
