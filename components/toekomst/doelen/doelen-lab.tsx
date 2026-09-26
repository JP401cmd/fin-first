'use client'

// Verplaatst uit components/app/horizon/horizon-client.tsx r7562–7653 @ c1b4849eb (fase 1, ADR 0179).
// euro-view: dit bestand deflateert niets en leest geen inflationFactor. De bedrag-feeds
// `labKnoppen`, `labFormatters` en `labUitkomstRegel` komen GEDEFLATEERD binnen (ze worden
// in de parent binnen de euro-weergave-bakens gebouwd); `effectiveStopAge` en
// `scenarioReturnDeltas` zijn leeftijd/percentages, geen euro's.
//
// Pure kopie (blok M, kaart §1.5): props dragen exact de namen van de parent-variabelen,
// de JSX-body is byte-gelijk aan de bron (controle: `diff` op r7562–7653). `vraag={heroVraag}`
// blijft staan — ADR 0179 toetste B10 op precies die voorwaarde.
import type { Dispatch, RefObject, SetStateAction } from 'react'
import Link from 'next/link'
import { KATERN_HREF } from '@/components/toekomst/layout/katern-routes'
import {
  LabKnoppen,
  type LabKnopConfig,
  type LabKnopFormatters,
  type LabKnopWeergave,
  type LabUitkomstRegel,
} from '@/components/app/horizon/lab-knoppen'
import { LabIndicatieRegel, LabOpslaanBalk, type LabOpslaanToestand } from '@/components/app/horizon/lab-opslaan-balk'
import { VERKEN_SECTION_ID } from '@/components/app/horizon/scenario-chip'
import { WhatIfMarketAssumptions } from '@/components/app/horizon/whatif-market-assumptions'
import { formatAge } from '@/lib/horizon/fire-format'
import { LAB_COPY } from '@/lib/horizon/anker-copy'
import type { zoneVanHuidig, HefboomKey } from '@/lib/horizon/lab-grenzen-types'
import type { buildCategorieReturnGroups, ToekomstScenarioDoel } from '@/lib/horizon/toekomst-scenario'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'
import type { FireEndForm } from '@/lib/fire-strategy'

export interface DoelenLabProps {
  verkenSectieZichtbaar: boolean
  verkenSectionRef: RefObject<HTMLElement | null>
  firstDragHintVisible: boolean
  dismissFirstDragHint: () => void
  heroVraag: string
  labKnoppen: Partial<Record<HefboomKey, LabKnopConfig>>
  planEindVorm: FireEndForm
  labUitkomstRegel: LabUitkomstRegel | null
  labZone: ReturnType<typeof zoneVanHuidig>
  labGrenzenPending: boolean
  knopWeergave: LabKnopWeergave
  setKnopWeergave: Dispatch<SetStateAction<LabKnopWeergave>>
  labFormatters: Record<HefboomKey, LabKnopFormatters>
  planIsDezeStop: boolean
  setStopPlanError: Dispatch<SetStateAction<string>>
  setStopPlanConfirmOpen: Dispatch<SetStateAction<boolean>>
  stopPlanSaving: boolean
  effectiveStopAge: number
  whatIfBaseline: WhatIfOverrides | null
  categorieReturnGroups: ReturnType<typeof buildCategorieReturnGroups>
  scenarioReturnDeltas: Record<string, number>
  setScenarioReturnDeltas: Dispatch<SetStateAction<Record<string, number>>>
  labOpslaanToestand: LabOpslaanToestand
  doelBlok: ToekomstScenarioDoel | null
  doelSaving: boolean
  doelVastleggenMogelijk: boolean
  doelBijwerkenMogelijk: boolean
  setDoelSheetOpen: Dispatch<SetStateAction<boolean>>
  handleDoelHerstellen: () => void
  setDoelLoslatenOpen: Dispatch<SetStateAction<boolean>>
  handleScenarioReset: () => void
}

export function DoelenLab({
  verkenSectieZichtbaar,
  verkenSectionRef,
  firstDragHintVisible,
  dismissFirstDragHint,
  heroVraag,
  labKnoppen,
  planEindVorm,
  labUitkomstRegel,
  labZone,
  labGrenzenPending,
  knopWeergave,
  setKnopWeergave,
  labFormatters,
  planIsDezeStop,
  setStopPlanError,
  setStopPlanConfirmOpen,
  stopPlanSaving,
  effectiveStopAge,
  whatIfBaseline,
  categorieReturnGroups,
  scenarioReturnDeltas,
  setScenarioReturnDeltas,
  labOpslaanToestand,
  doelBlok,
  doelSaving,
  doelVastleggenMogelijk,
  doelBijwerkenMogelijk,
  setDoelSheetOpen,
  handleDoelHerstellen,
  setDoelLoslatenOpen,
  handleScenarioReset,
}: DoelenLabProps) {
  return (
    <>
              {/* ── Doelscenario: vijf knoppen met een driekleurige schaal (ADR 0170) ──
                  Staat IN de grafiekkaart, direct onder de fasering: de knoppen bewegen de
                  gestippelde lijn hierboven, dus ze horen bij die grafiek en niet in een eigen
                  katern eronder. Wat hier stond — twee genummerde panelen, de marge-band, de
                  dekkingsbalk met drie tegels, per-knop antwoordregels, "Wat hoort daarbij?",
                  een uitleg-disclosure en een concept-banner — is vervangen door één blok:
                  uitkomstregel → vijf gekleurde knoppen → opslaan-balk. De grens staat op de
                  knop; dat maakt de duidingslagen overbodig. */}
              {verkenSectieZichtbaar && (
                <section
                  id={VERKEN_SECTION_ID}
                  ref={verkenSectionRef}
                  className="mt-6 scroll-mt-24 border-t border-[var(--border-ed)] pt-4"
                >
                  {/* Eerste-sleep-hint: éénmalig per apparaat een pijl naar de gestippelde
                      lijn, zodat de eerste knopbeweging niet onopgemerkt blijft. */}
                  {firstDragHintVisible && (
                    <p className="mb-2 flex flex-wrap items-baseline gap-x-2 font-sans text-[11px] text-[var(--ink-3)]">
                      <span>Kijk naar de gestippelde lijn in de grafiek ↑ — dat is jouw wat-als.</span>
                      <button
                        type="button"
                        onClick={dismissFirstDragHint}
                        className="font-semibold text-horizon-700 underline underline-offset-2 transition-colors hover:text-[var(--ink)]"
                      >
                        Begrepen
                      </button>
                    </p>
                  )}

                  <LabKnoppen
                    vraag={heroVraag}
                    knoppen={labKnoppen}
                    nalatenschapNotitie={planEindVorm === 'perpetual' ? LAB_COPY.nalatenschapPerpetual : null}
                    uitkomst={labUitkomstRegel}
                    zone={labZone}
                    pending={labGrenzenPending}
                    weergave={knopWeergave}
                    onWeergaveChange={setKnopWeergave}
                    formatters={labFormatters}
                    stopSlot={
                      // TPR-09 + melding B-038 — de stop-knop is een VERKENNING. Hier staat de
                      // enige plek waar die verkenning het plan kan worden (het volledige plan,
                      // via `planDraftToFireSettingsBody`), náást de verwijzing naar de plek waar
                      // álle plan-keuzes staan. Alleen zichtbaar als de knop van het plan afwijkt.
                      <div className="flex flex-wrap items-center gap-x-4">
                        {!planIsDezeStop && (
                          <button
                            type="button"
                            onClick={() => {
                              setStopPlanError('')
                              setStopPlanConfirmOpen(true)
                            }}
                            disabled={stopPlanSaving}
                            className="inline-flex min-h-[44px] items-center font-sans text-[11px] font-semibold text-horizon-700 underline underline-offset-2 transition-colors hover:text-horizon-800 disabled:no-underline disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                          >
                            {stopPlanSaving ? 'Opslaan…' : `Maak ${formatAge(effectiveStopAge)} mijn stopmoment`}
                          </button>
                        )}
                        {/* ADR 0179 D4: één ingang per instelling — de plan-keuzes wonen in
                            katern Instellingen (de strategie-modal verdwijnt in fase 3). */}
                        <Link
                          href={KATERN_HREF.instellingen}
                          className="inline-flex min-h-[44px] items-center font-sans text-[11px] font-medium text-[var(--ink-2)] underline underline-offset-2 transition-colors hover:text-horizon-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                        >
                          Je plan-keuzes &rarr;
                        </Link>
                      </div>
                    }
                    marktbias={
                      whatIfBaseline && categorieReturnGroups.length > 0 ? (
                        <WhatIfMarketAssumptions
                          value={scenarioReturnDeltas}
                          onChange={setScenarioReturnDeltas}
                          assetGroups={categorieReturnGroups}
                        />
                      ) : null
                    }
                  />

                  <LabOpslaanBalk
                    toestand={labOpslaanToestand}
                    gezetOp={doelBlok?.gezetOp ?? null}
                    busy={doelSaving}
                    vastleggenMogelijk={doelVastleggenMogelijk}
                    bijwerkenMogelijk={doelBijwerkenMogelijk}
                    onVastleggen={() => setDoelSheetOpen(true)}
                    onHerstel={handleDoelHerstellen}
                    onLoslaten={() => setDoelLoslatenOpen(true)}
                    onReset={handleScenarioReset}
                  />
                  <LabIndicatieRegel />
                </section>
              )}
    </>
  )
}
