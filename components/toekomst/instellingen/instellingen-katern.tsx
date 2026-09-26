/**
 * InstellingenKatern — katern 3 van /toekomst (ADR 0179 D1/D4): alles wat het plan voedt.
 *
 * Bovenaan de wizard-ingang (plan-review), daaronder de bestaande Voorkeuren-view met het
 * anker `#voorkeuren`. De view houdt zijn eigen deeplinks (`?strategie=`, `?regel=`) en
 * ruimt zijn param meteen na het openen op (`useEenmaligeDeeplink`); `AnkerScroll` zet de
 * pagina na hydratie op het anker uit de hash.
 *
 * Addendum 26 sep (ADR 0179): de levensgebeurtenissen staan niet meer hier maar onder het
 * plan (`/toekomst#gebeurtenissen`). Een oude bladwijzer `/toekomst/instellingen#gebeurtenissen`
 * stuurt `OudeGebeurtenissenBladwijzer` op de Instellingen-page door.
 *
 * D8: dit component leest de route niet. Data komt via props; de plan-review-opener via
 * de provider die de host (route of katern-layout) eromheen zet.
 *
 * Geen 'use client': de kinderen zijn zelf client-componenten.
 */

import type { ComponentProps } from 'react'
import { VoorkeurenView } from '@/components/future/voorkeuren-view'
import type { PlanReviewProgress } from '@/lib/plan-review/types'
import { WizardIngang } from './wizard-ingang'
import { AnkerScroll } from './anker-scroll'

export const INSTELLINGEN_ANKERS = {
  voorkeuren: 'voorkeuren',
} as const

export function InstellingenKatern({
  planReviewProgress,
  voorkeuren,
}: {
  /** Afgeleide review-voortgang; `null` = review kan (nog) niets bewaren → geen ingang. */
  planReviewProgress: PlanReviewProgress | null
  voorkeuren: ComponentProps<typeof VoorkeurenView>
}) {
  return (
    <div className="pt-4">
      {/* Een deeplink met #voorkeuren landt pas na hydratie op zijn plek. */}
      <AnkerScroll ankers={Object.values(INSTELLINGEN_ANKERS)} />
      {planReviewProgress && (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pb-8">
          <WizardIngang progress={planReviewProgress} />
        </div>
      )}
      <div id={INSTELLINGEN_ANKERS.voorkeuren} className="scroll-mt-20">
        <VoorkeurenView {...voorkeuren} />
      </div>
    </div>
  )
}
