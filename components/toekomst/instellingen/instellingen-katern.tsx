/**
 * InstellingenKatern — katern 3 van /toekomst (ADR 0179 D1/D4): alles wat het plan voedt.
 *
 * Bovenaan de wizard-ingang (plan-review), daaronder de rijen (fase 3: één rij per
 * instelling, `InstellingenRijen`) in drie secties; sectie I draagt het oude anker
 * `#voorkeuren`. De rijen lezen hun deeplink zelf (`?rij=`, aliassen `?regel=`/`?strategie=`)
 * en ruimen hem meteen op; `AnkerScroll` zet de pagina na hydratie op het anker uit de hash.
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

import type { PlanReviewProgress } from '@/lib/plan-review/types'
import { WizardIngang } from './wizard-ingang'
import { AnkerScroll } from './anker-scroll'
import { InstellingenRijen, INSTELLINGEN_PLAN_ANKER, type InstellingenRijenProps } from './instellingen-rijen'

export const INSTELLINGEN_ANKERS = {
  voorkeuren: INSTELLINGEN_PLAN_ANKER,
} as const

export function InstellingenKatern({
  planReviewProgress,
  rijen,
}: {
  /** Afgeleide review-voortgang; `null` = review kan (nog) niets bewaren → geen ingang. */
  planReviewProgress: PlanReviewProgress | null
  rijen: InstellingenRijenProps
}) {
  return (
    <div className="pt-4">
      {/* Een deeplink met #voorkeuren (sectie I) landt pas na hydratie op zijn plek. */}
      <AnkerScroll ankers={Object.values(INSTELLINGEN_ANKERS)} />
      {planReviewProgress && (
        <div className="mx-auto max-w-3xl px-4 pb-8 sm:px-6">
          <WizardIngang progress={planReviewProgress} />
        </div>
      )}
      <InstellingenRijen {...rijen} />
    </div>
  )
}
