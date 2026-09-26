'use client'

// Verplaatst uit components/app/horizon/horizon-client.tsx r7786–7831 @ c1b4849eb (fase 1, ADR 0179).
// euro-view: dit bestand deflateert niets en leest geen inflationFactor. `viewDoelPreviews`
// komt GEDEFLATEERD binnen (gebouwd binnen de euro-weergave-bakens van de parent); de
// overige props zijn leeftijden, ankers en vlaggen — geen euro-feeds.
//
// Pure kopie (blok P, kaart §1.5): DoelVastlegSheet, DoelLoslatenConfirm en StopPlanConfirm.
// Props dragen exact de namen van de parent-variabelen; de JSX-body is byte-gelijk aan de
// bron. Geen directe BottomSheet: de drie sheets hebben hun eigen overlay-laag.
// De stale commentaarkop r7769–7785 (KATERN II-gate, achterhaald sinds 20 sep — kaart V7)
// is bewust NIET meegekopieerd.
import type { Dispatch, SetStateAction } from 'react'
import {
  DoelVastlegSheet,
  type DoelParameterPreview,
} from '@/components/app/horizon/doel-vastleg-sheet'
import { DoelLoslatenConfirm } from '@/components/future/doel-loslaten-confirm'
import { StopPlanConfirm } from '@/components/app/horizon/stop-plan-confirm'
import {
  dekkingSheetToelichting,
  eindvermogenSheetToelichting,
  type AnkerStop,
} from '@/lib/horizon/anker-copy'
import type { LabUitkomst } from '@/lib/horizon/lab-uitkomst'
import type { DoelParameter } from '@/lib/horizon/toekomst-scenario'
import type { StopAnchor } from '@/lib/fire-strategy'
import type { AowAge } from '@/lib/aow-leeftijd'
import type { HorizonPageData } from '@/lib/horizon-data-loader'
import type { HorizonFireSimResult } from '@/lib/hooks/use-horizon-fire-sim'

export interface DoelenLabSheetsProps {
  doelSheetOpen: boolean
  setDoelSheetOpen: Dispatch<SetStateAction<boolean>>
  viewDoelPreviews: DoelParameterPreview[]
  doelActief: boolean
  doelSaving: boolean
  handleDoelVastleggen: (gekozen: Partial<Record<DoelParameter, true>>) => Promise<void>
  isFixedAnchorMode: boolean
  planAnchor: StopAnchor
  labPromotie: LabUitkomst['promotie']
  ankerStop: AnkerStop | null
  simResult: HorizonFireSimResult['result']
  initialData: HorizonPageData
  doelLoslatenOpen: boolean
  handleDoelLoslaten: () => Promise<void>
  setDoelLoslatenOpen: Dispatch<SetStateAction<boolean>>
  stopPlanConfirmOpen: boolean
  stopPlanSaving: boolean
  stopPlanError: string
  effectiveStopAge: number
  userAowAge: AowAge
  handleStopPlanBevestigen: () => Promise<void>
  setStopPlanConfirmOpen: Dispatch<SetStateAction<boolean>>
}

export function DoelenLabSheets({
  doelSheetOpen,
  setDoelSheetOpen,
  viewDoelPreviews,
  doelActief,
  doelSaving,
  handleDoelVastleggen,
  isFixedAnchorMode,
  planAnchor,
  labPromotie,
  ankerStop,
  simResult,
  initialData,
  doelLoslatenOpen,
  handleDoelLoslaten,
  setDoelLoslatenOpen,
  stopPlanConfirmOpen,
  stopPlanSaving,
  stopPlanError,
  effectiveStopAge,
  userAowAge,
  handleStopPlanBevestigen,
  setStopPlanConfirmOpen,
}: DoelenLabSheetsProps) {
  return (
    <>
        {/* Vastleg-/bijwerk-sheet (BottomSheet, boven de nav-pill). */}
        <DoelVastlegSheet
          open={doelSheetOpen}
          onClose={() => setDoelSheetOpen(false)}
          previews={viewDoelPreviews}
          bijwerken={doelActief}
          saving={doelSaving}
          onSubmit={handleDoelVastleggen}
          // ADR 0129/0145 — onder een vast stopmoment schrijft het lab geen fire_age-doel
          // (de sheet filtert de fire-rij als vangnet); de toelichting zegt wat het lab
          // dáár wél vastlegt: of het plan reikt.
          // D12 — bij een GEDEKT plan legt het lab het eindvermogen vast; de toelichting zegt dat.
          fireAgeNietVanToepassing={
            isFixedAnchorMode && planAnchor.kind !== 'solved'
              ? (labPromotie.kind === 'eindvermogen' ? eindvermogenSheetToelichting : dekkingSheetToelichting)(
                  ankerStop ?? (planAnchor.kind === 'age' ? { kind: 'age', stopAge: planAnchor.age } : { kind: 'now' }),
                  simResult?.displayEndAge ?? initialData.firePlan?.endAge ?? null,
                )
              : null
          }
        />

        {/* Gedeelde "Doel loslaten"-bevestiging — zelfde ShellOverlay-confirm
            als /toekomst/doelen. Horizon meldt fouten via toast, dus error="". */}
        <DoelLoslatenConfirm
          open={doelLoslatenOpen}
          busy={doelSaving}
          error=""
          onConfirm={handleDoelLoslaten}
          onClose={() => setDoelLoslatenOpen(false)}
        />

        {/* TPR-09 — "Maak dit mijn plan": bevestiging vóór de verkenning het plan wordt.
            Fouten (validatie/route) inline in de confirm, zodat de gebruiker ze ziet
            naast de keuze die ze afwijzen. */}
        <StopPlanConfirm
          open={stopPlanConfirmOpen}
          busy={stopPlanSaving}
          error={stopPlanError}
          stopAge={effectiveStopAge}
          planAnchor={planAnchor}
          planEndAge={simResult?.displayEndAge ?? initialData.firePlan?.endAge ?? null}
          aowAge={userAowAge.fractional}
          onConfirm={handleStopPlanBevestigen}
          onClose={() => setStopPlanConfirmOpen(false)}
        />
    </>
  )
}
