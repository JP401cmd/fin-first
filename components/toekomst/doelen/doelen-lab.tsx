'use client'

// Verplaatst uit components/app/horizon/horizon-client.tsx r7562–7653 @ c1b4849eb (fase 1, ADR 0179).
// euro-view: dit bestand deflateert niets en leest geen inflationFactor. De bedrag-feeds
// `labKnoppen`, `labFormatters` en `labUitkomstRegel` komen GEDEFLATEERD binnen (ze worden
// in de parent binnen de euro-weergave-bakens gebouwd); `effectiveStopAge` is een leeftijd.
//
// Fase 4 (ADR 0179 D7): het lab staat op twee plekken — in de rechterkolom van de canvas-rij
// op desktop (`plek="kolom"`, standaard harp) en direct onder de katern-koppen op mobiel
// (`plek="onder-koppen"`, standaard rad). Zichtbaarheid regelt CSS (de host), dus geen
// hydratiesprong. `vraag={heroVraag}` blijft staan — ADR 0179 toetste B10 op precies die
// voorwaarde. De marktaannames en de indicatieregel staan in `doelen-lab-details.tsx`.
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
import {
  LAB_ACTIE_LABEL,
  LabOpslaanBalk,
  labActieBar,
  type LabOpslaanToestand,
} from '@/components/app/horizon/lab-opslaan-balk'
import { VERKEN_SECTION_ID } from '@/components/app/horizon/scenario-chip'
import { useLiveActionBar } from '@/components/app/shell/use-live-action-bar'
import { formatAge } from '@/lib/horizon/fire-format'
import { LAB_COPY } from '@/lib/horizon/anker-copy'
import type { zoneVanHuidig, HefboomKey } from '@/lib/horizon/lab-grenzen-types'
import type { ToekomstScenarioDoel } from '@/lib/horizon/toekomst-scenario'
import type { FireEndForm } from '@/lib/fire-strategy'

/** Waar het lab staat: naast de grafiek (desktop) of onder de katern-koppen (mobiel). */
export type DoelenLabPlek = 'kolom' | 'onder-koppen'

export interface DoelenLabProps {
  plek: DoelenLabPlek
  /**
   * Draagt deze plek het anker `#verken-je-aannames` en de scroll-ref? Alleen de plek die
   * op dit breekpunt zichtbaar is — de andere staat op `display:none`.
   */
  anker: boolean
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
  setKnopWeergave: (v: LabKnopWeergave) => void
  labFormatters: Record<HefboomKey, LabKnopFormatters>
  planIsDezeStop: boolean
  setStopPlanError: Dispatch<SetStateAction<string>>
  setStopPlanConfirmOpen: Dispatch<SetStateAction<boolean>>
  stopPlanSaving: boolean
  effectiveStopAge: number
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

/** De sectieklassen per plek: de kolom heeft zijn eigen rand; onder de koppen compact. */
export const DOELEN_LAB_PLEK_KLASSE: Record<DoelenLabPlek, string> = {
  kolom: 'scroll-mt-24',
  'onder-koppen': 'mt-3 scroll-mt-24 border-t border-[var(--border-ed)] pt-3',
}

export function DoelenLab({
  plek,
  anker,
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
  // Mobiel: de opslaan-actie is de action-bar van de shell (ADR 0179 D7). Alleen de plek
  // onder de koppen registreert, en alleen als er iets op te slaan is.
  const bar =
    plek === 'onder-koppen' && verkenSectieZichtbaar
      ? labActieBar(labOpslaanToestand, {
          vastleggenMogelijk: doelVastleggenMogelijk,
          bijwerkenMogelijk: doelBijwerkenMogelijk,
        })
      : null
  useLiveActionBar(
    bar
      ? {
          primary: { label: LAB_ACTIE_LABEL[bar.primary], onClick: () => setDoelSheetOpen(true), disabled: doelSaving },
          secondary: {
            label: LAB_ACTIE_LABEL[bar.secondary],
            onClick: bar.secondary === 'herstel' ? handleDoelHerstellen : handleScenarioReset,
            disabled: doelSaving,
          },
        }
      : null,
  )

  return (
    <>
              {/* ── Doelscenario: vijf knoppen met een driekleurige schaal (ADR 0170) ──
                  Eén blok: uitkomstregel → vijf gekleurde knoppen → opslaan-balk. De grens
                  staat op de knop; dat maakt de duidingslagen overbodig. */}
              {verkenSectieZichtbaar && (
                <section
                  id={anker ? VERKEN_SECTION_ID : undefined}
                  ref={anker ? verkenSectionRef : undefined}
                  data-testid={`doelen-lab-${plek}`}
                  className={DOELEN_LAB_PLEK_KLASSE[plek]}
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
                    weergaveKiezer="menu"
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
                    acties={plek === 'onder-koppen' ? 'shell' : 'inline'}
                  />
                </section>
              )}
    </>
  )
}
