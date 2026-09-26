// Verplaatst uit components/app/horizon/horizon-client.tsx r7833–7989 @ c1b4849eb (fase 1, ADR 0179).
// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf
'use client'

import dynamic from 'next/dynamic'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { PlanAfbouwOverzicht } from './plan-afbouw-overzicht'

// Kopie van horizon-client r297–304 + r309–312 — V3: de dynamic() verhuist mee met zijn
// enige consument. Zwaar-maar-conditionele sub-componenten uit de first-load JS van
// /toekomst gehaald (bundle ronde 2). Bewust géén mount-gate: HouseholdFireSection rendert
// vaak null (solo-gebruiker) + beheert z'n eigen laadstaat, dus een skeleton-fallback zou
// flitsen. `loading` = null (default).
const HouseholdFireSection = dynamic(() =>
  import('@/components/app/household-fire-section').then(m => ({ default: m.HouseholdFireSection })),
  { ssr: false }
)

/**
 * De verdieping van Plan: blok R (HouseholdFireSection — moet op Plan gemount blijven,
 * ADR 0168, want hij schrijft `households.combined_fire_summary`).
 *
 * Addendum 26 sep (ADR 0179): de levensinkomenstrook, de dekkingsradar, het verloop en de
 * geplande acties zijn weg. Fase 4: de scenario-kaarten ("Wat het betekent") verhuisden
 * naar katern Doelen als "Andere paden naast je doelscenario"
 * (`components/toekomst/doelen/andere-paden.tsx`), mét hun preset-gate. Fase 3: het
 * afbouwoverzicht ("Van vrijheid tot eindleeftijd") verhuisde van Instellingen hierheen —
 * resultaat, geen instelling (spec §5); het rekent uit de hoofdrun.
 */
export interface PlanVerdiepingProps {
  personalHeroProjection: { fireAge: number | null; fireAgeFractional: number | null; fireTarget: number; freedomPercentage: number; fireDate: string; freedomYears: number; freedomMonths: number; } | null // horizon-client r3508
}

export function PlanVerdieping({ personalHeroProjection }: PlanVerdiepingProps) {
  return (
    <>
      {/* Afbouwoverzicht — HideInSimple zit in de component zelf (ADR 0026). */}
      <PlanAfbouwOverzicht />

      {/* === 5. Household FIRE Projections === */}
      <HideInSimple>
        <HouseholdFireSection personalProjection={personalHeroProjection} />
      </HideInSimple>
    </>
  )
}
