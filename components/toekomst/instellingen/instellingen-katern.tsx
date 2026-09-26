/**
 * InstellingenKatern — katern 3 van /toekomst (ADR 0179 D1/D4): alles wat het plan voedt.
 *
 * Fase 1 is compositie, geen herontwerp: bovenaan de wizard-ingang (plan-review),
 * daaronder de bestaande Voorkeuren- en Gebeurtenissen-view, gestapeld als secties met
 * ankers (`#voorkeuren`, `#gebeurtenissen`). De views houden hun eigen deeplinks
 * (`?strategie=`, `?regel=` in Voorkeuren; `?nieuw=` in Gebeurtenissen) — die sleutels
 * zijn disjunct, dus beide kunnen op dezelfde route luisteren.
 *
 * D8: dit component leest de route niet. Data komt via props; de plan-review-opener via
 * de provider die de host (route of katern-layout) eromheen zet.
 *
 * Geen 'use client': de kinderen zijn zelf client-componenten.
 */

import type { ComponentProps } from 'react'
import { VoorkeurenView } from '@/components/future/voorkeuren-view'
import { GebeurtenissenView } from '@/components/future/gebeurtenissen-view'
import type { PlanReviewProgress } from '@/lib/plan-review/types'
import { WizardIngang } from './wizard-ingang'

export const INSTELLINGEN_ANKERS = {
  voorkeuren: 'voorkeuren',
  gebeurtenissen: 'gebeurtenissen',
} as const

export function InstellingenKatern({
  planReviewProgress,
  voorkeuren,
  gebeurtenissen,
}: {
  /** Afgeleide review-voortgang; `null` = review kan (nog) niets bewaren → geen ingang. */
  planReviewProgress: PlanReviewProgress | null
  voorkeuren: ComponentProps<typeof VoorkeurenView>
  gebeurtenissen: ComponentProps<typeof GebeurtenissenView>
}) {
  return (
    <div className="pt-4">
      {planReviewProgress && (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pb-8">
          <WizardIngang progress={planReviewProgress} />
        </div>
      )}
      <div id={INSTELLINGEN_ANKERS.voorkeuren} className="scroll-mt-20">
        <VoorkeurenView {...voorkeuren} />
      </div>
      <div id={INSTELLINGEN_ANKERS.gebeurtenissen} className="scroll-mt-20">
        <GebeurtenissenView {...gebeurtenissen} />
      </div>
    </div>
  )
}
