'use client'

// Verplaatst uit components/app/horizon/horizon-client.tsx r7562–7653 @ c1b4849eb (fase 1, ADR 0179).
// euro-view: dit bestand deflateert niets en leest geen inflationFactor. De bedrag-feeds
// `labKnoppen`, `labFormatters` en `labUitkomstRegel` komen GEDEFLATEERD binnen (ze worden
// in de parent binnen de euro-weergave-bakens gebouwd); `effectiveStopAge` is een leeftijd.
//
// Fase 4 (ADR 0179 D7): het lab staat op twee plekken — in de rechterkolom van de canvas-rij
// op desktop (`plek="kolom"`, standaard harp) en direct onder de katern-koppen op mobiel
// (`plek="onder-koppen"`, standaard rad). Zichtbaarheid regelt CSS (de host), dus geen
// hydratiesprong. Eigenaarsbesluit 27 sep: één plek per actie. Desktop: de acties staan in
// een eigen rij onder grafiek en harp (`DoelenLabActies`); de kolom draagt alleen het lab.
// Mobiel: met een shell-bar staan álle acties in die bar, anders op de pagina. `vraag={heroVraag}` blijft staan — ADR 0179 toetste B10 op precies die
// voorwaarde. De marktaannames en de indicatieregel staan in `doelen-lab-details.tsx`.
import type { Dispatch, RefObject, SetStateAction } from 'react'
import Link from 'next/link'
import { KATERN_HREF } from '@/components/toekomst/layout/katern-routes'
import {
  LabKnoppen,
  LabWeergaveMenu,
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
import { useLiveActionBar, type LiveActionBarExtra } from '@/components/app/shell/use-live-action-bar'
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
  // Onder de tabbladen staat het lab in de witte katern-module: die en de tabstrook zijn
  // de rand, dus geen eigen lijn en geen extra ruimte (één-scherm-eis).
  'onder-koppen': 'scroll-mt-24',
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
  // onder de koppen registreert, en alleen als er iets op te slaan is. Is er een bar, dan
  // staan ÁLLE lab-acties erin (één plek per actie, 27 sep): de twee knoppen, en daarboven
  // stopmoment, plan-keuzes en Loslaten. Zonder bar blijft alles op de pagina en blijft de
  // nav-pill staan — een altijd-bar zou de pill verbergen.
  const bar =
    plek === 'onder-koppen' && verkenSectieZichtbaar
      ? labActieBar(labOpslaanToestand, {
          vastleggenMogelijk: doelVastleggenMogelijk,
          bijwerkenMogelijk: doelBijwerkenMogelijk,
        })
      : null
  const openStopBevestiging = () => {
    setStopPlanError('')
    setStopPlanConfirmOpen(true)
  }
  useLiveActionBar(
    bar
      ? {
          primary: { label: LAB_ACTIE_LABEL[bar.primary], onClick: () => setDoelSheetOpen(true), disabled: doelSaving },
          secondary: {
            label: LAB_ACTIE_LABEL[bar.secondary],
            onClick: bar.secondary === 'herstel' ? handleDoelHerstellen : handleScenarioReset,
            disabled: doelSaving,
          },
          extra: labBarExtra({
            planIsDezeStop,
            stopPlanSaving,
            effectiveStopAge,
            onStop: openStopBevestiging,
            // Loslaten hoort bij een doel dat er ligt: in de bar is dat de toestand `gewijzigd`.
            loslaten: labOpslaanToestand === 'gewijzigd' ? { onClick: () => setDoelLoslatenOpen(true), disabled: doelSaving } : null,
          }),
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
                      <span>Kijk naar de gestippelde lijn in de grafiek ↑ — dat is je doelscenario.</span>
                      <button
                        type="button"
                        onClick={dismissFirstDragHint}
                        className="font-semibold text-[var(--module-active-700)] underline underline-offset-2 transition-colors hover:text-[var(--ink)]"
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
                    // Kolom: de keuzelijst naast de vraag. Onder de koppen (mobiel) staat hij
                    // in de actierij onder de knoppen, en valt de kicker weg: de vraag past
                    // dan met de zone op één regel (één-scherm-eis, ADR 0179 D7).
                    onWeergaveChange={plek === 'kolom' ? setKnopWeergave : undefined}
                    weergaveKiezer="menu"
                    kicker={plek === 'kolom'}
                    // De schaal-legenda staat onder het lab (DoelenLabDetails): één regel
                    // minder in de kolom en onder de koppen (één-scherm-eis).
                    schaalLegenda={false}
                    formatters={labFormatters}
                    stopSlot={
                      // Desktop (kolom): de acties staan in de actierij onder grafiek en harp
                      // (`DoelenLabActies`, 27 sep). Mobiel: de weergavekeuze, en de acties
                      // alleen zolang er geen shell-bar is (anders staan ze in die bar).
                      plek === 'kolom' ? null : (
                        <div className="flex flex-wrap items-center gap-x-4">
                          <LabWeergaveMenu weergave={knopWeergave} onChange={setKnopWeergave} />
                          {!bar && (
                            <DoelenLabStopActies
                              planIsDezeStop={planIsDezeStop}
                              stopPlanSaving={stopPlanSaving}
                              effectiveStopAge={effectiveStopAge}
                              onStop={openStopBevestiging}
                            />
                          )}
                        </div>
                      )
                    }
                  />

                  {/* Desktop: de opslaan-balk staat in de actierij onder de canvas-rij. */}
                  {plek === 'onder-koppen' && (
                    <DoelenLabOpslaanBalk
                      acties="shell"
                      labOpslaanToestand={labOpslaanToestand}
                      doelBlok={doelBlok}
                      doelSaving={doelSaving}
                      doelVastleggenMogelijk={doelVastleggenMogelijk}
                      doelBijwerkenMogelijk={doelBijwerkenMogelijk}
                      setDoelSheetOpen={setDoelSheetOpen}
                      handleDoelHerstellen={handleDoelHerstellen}
                      setDoelLoslatenOpen={setDoelLoslatenOpen}
                      handleScenarioReset={handleScenarioReset}
                    />
                  )}
                </section>
              )}
    </>
  )
}

/** Het label van de stop-actie: dezelfde tekst op de pagina en in de shell-bar. */
export function stopActieLabel(effectiveStopAge: number, saving: boolean): string {
  return saving ? 'Opslaan…' : `Maak ${formatAge(effectiveStopAge)} mijn stopmoment`
}

/** De tekst van de link naar álle plan-keuzes (katern Instellingen). */
export const PLAN_KEUZES_LABEL = 'Je plan-keuzes →'

/**
 * De extra acties in de shell-bar (mobiel, 27 sep): stopmoment (als de knop van het plan
 * afwijkt), de plan-keuzes, en Loslaten (als er een doel ligt). Pure afleiding, zodat de
 * volgorde en de voorwaarden zonder DOM te toetsen zijn.
 *
 * Staan stopmoment én Loslaten er, dan valt de plan-keuzes-link weg: drie acties lopen op
 * 360 px over twee regels, en die bar dekt dan het rad af (één-scherm-eis, ADR 0179 D7).
 * De link is een verwijzing, geen actie, en het tabblad Instellingen staat erboven.
 */
export function labBarExtra({
  planIsDezeStop,
  stopPlanSaving,
  effectiveStopAge,
  onStop,
  loslaten,
}: {
  planIsDezeStop: boolean
  stopPlanSaving: boolean
  effectiveStopAge: number
  onStop: () => void
  loslaten: { onClick: () => void; disabled: boolean } | null
}): LiveActionBarExtra[] {
  const extra: LiveActionBarExtra[] = []
  if (!planIsDezeStop) {
    extra.push({ label: stopActieLabel(effectiveStopAge, stopPlanSaving), onClick: onStop, disabled: stopPlanSaving })
  }
  if (planIsDezeStop || !loslaten) extra.push({ label: PLAN_KEUZES_LABEL, href: KATERN_HREF.instellingen })
  if (loslaten) extra.push({ label: LAB_COPY.opslaanActieLoslaten, onClick: loslaten.onClick, disabled: loslaten.disabled })
  return extra
}

/**
 * De stop-actie en de verwijzing naar de plan-keuzes.
 *
 * TPR-09 + melding B-038 — de stop-knop is een VERKENNING. Hier staat de enige plek waar
 * die verkenning het plan kan worden (het volledige plan, via `planDraftToFireSettingsBody`),
 * náást de verwijzing naar de plek waar álle plan-keuzes staan. De stop-knop staat er alleen
 * als de knop van het plan afwijkt.
 */
export function DoelenLabStopActies({
  planIsDezeStop,
  stopPlanSaving,
  effectiveStopAge,
  onStop,
}: {
  planIsDezeStop: boolean
  stopPlanSaving: boolean
  effectiveStopAge: number
  onStop: () => void
}) {
  return (
    <>
      {!planIsDezeStop && (
        <button
          type="button"
          onClick={onStop}
          disabled={stopPlanSaving}
          className="inline-flex min-h-[44px] items-center font-sans text-[11px] font-semibold text-[var(--module-active-700)] underline underline-offset-2 transition-colors hover:text-[var(--module-active-800)] disabled:no-underline disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        >
          {stopActieLabel(effectiveStopAge, stopPlanSaving)}
        </button>
      )}
      {/* ADR 0179 D4: één ingang per instelling — de plan-keuzes wonen in
          katern Instellingen (de strategie-modal verdwijnt in fase 3). */}
      <Link
        href={KATERN_HREF.instellingen}
        className="inline-flex min-h-[44px] items-center font-sans text-[11px] font-medium text-[var(--ink-2)] underline underline-offset-2 transition-colors hover:text-[var(--module-active-600)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        {PLAN_KEUZES_LABEL}
      </Link>
    </>
  )
}

type DoelenLabOpslaanBalkProps = Pick<
  DoelenLabProps,
  | 'labOpslaanToestand'
  | 'doelBlok'
  | 'doelSaving'
  | 'doelVastleggenMogelijk'
  | 'doelBijwerkenMogelijk'
  | 'setDoelSheetOpen'
  | 'handleDoelHerstellen'
  | 'setDoelLoslatenOpen'
  | 'handleScenarioReset'
> & { acties: 'inline' | 'shell'; className?: string }

/** De opslaan-balk van het lab, op de plek die de host kiest (onder het lab of in de actierij). */
function DoelenLabOpslaanBalk({
  acties,
  className,
  labOpslaanToestand,
  doelBlok,
  doelSaving,
  doelVastleggenMogelijk,
  doelBijwerkenMogelijk,
  setDoelSheetOpen,
  handleDoelHerstellen,
  setDoelLoslatenOpen,
  handleScenarioReset,
}: DoelenLabOpslaanBalkProps) {
  return (
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
      acties={acties}
      className={className}
    />
  )
}

export type DoelenLabActiesProps = Pick<
  DoelenLabProps,
  | 'verkenSectieZichtbaar'
  | 'planIsDezeStop'
  | 'setStopPlanError'
  | 'setStopPlanConfirmOpen'
  | 'stopPlanSaving'
  | 'effectiveStopAge'
> &
  Omit<DoelenLabOpslaanBalkProps, 'acties'>

/**
 * De actierij van het lab op desktop (27 sep, eigenaarsbesluit): over de volle breedte
 * ónder grafiek en harp, zodat de harp alleen het lab draagt en de grafiek tot zijn maat
 * kan groeien. Links de stop-actie en de plan-keuzes, rechts de opslaan-balk met zijn
 * knoppen (inline). Hangt aan dezelfde afleiding `verkenSectieZichtbaar` als het lab.
 */
export function DoelenLabActies({
  verkenSectieZichtbaar,
  planIsDezeStop,
  setStopPlanError,
  setStopPlanConfirmOpen,
  stopPlanSaving,
  effectiveStopAge,
  ...balk
}: DoelenLabActiesProps) {
  if (!verkenSectieZichtbaar) return null
  return (
    <div data-testid="doelen-lab-actierij" className="flex flex-wrap items-center gap-x-6 gap-y-1">
      <div className="flex flex-wrap items-center gap-x-4">
        <DoelenLabStopActies
          planIsDezeStop={planIsDezeStop}
          stopPlanSaving={stopPlanSaving}
          effectiveStopAge={effectiveStopAge}
          onStop={() => {
            setStopPlanError('')
            setStopPlanConfirmOpen(true)
          }}
        />
      </div>
      <DoelenLabOpslaanBalk acties="inline" className="min-w-0 flex-1" {...balk} />
    </div>
  )
}
