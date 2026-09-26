// Verplaatst uit components/app/horizon/horizon-client.tsx r6567–6832 @ c1b4849eb (fase 1, ADR 0179).
// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf
'use client'

import type { Dispatch, SetStateAction } from 'react'
import Link from 'next/link'
import type { useRouter } from 'next/navigation'
import { AlertTriangle, Home, Minus, Sparkles } from 'lucide-react'
import { EindsituatieNotice } from '@/components/app/horizon/eindsituatie-notice'
import { GlossaryTerm } from '@/components/editorial'
import type { SimResult } from '@/lib/fire-simulation'
import type { FirePlan, FireStrategyConfig } from '@/lib/fire-strategy'
import { formatMaskedCurrency, formatWithFreedom } from '@/lib/format'
import type { HorizonPageData } from '@/lib/horizon-data-loader'
import { isKernelReachedNowDisplay } from '@/lib/horizon-kernel/bridge'
import type { ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'
import type { SolverStatus } from '@/lib/horizon-kernel/solver'
import { type AnkerReach, type AnkerStop, ankerZin } from '@/lib/horizon/anker-copy'
import { AOW_ONTBREEKT_COPY } from '@/lib/horizon/aow-notice-minimize'
import type { DeficitLoanCopy } from '@/lib/horizon/deficit-loan-copy'
import type { DeficitLoanNotice } from '@/lib/horizon/deficit-loan-display'
import type { EindsituatieDuiding } from '@/lib/horizon/eindsituatie-duiding'
import type { BannerDisplay } from '@/lib/page-status/display'
import type { ActiveModal } from '@/components/toekomst/state/types'

/**
 * Blok I (meldingen) — niet-haalbaar, anker-tekort, reached_now, tekort-lening, AOW,
 * eindsituatie, huis-nooit-verkocht. De lege staat (r6543–6562) is van stroom X2 (canvas).
 * Staat in de bron binnen de `simResult ? (…)`-tak, dus `simResult` is hier niet-null.
 */
export interface PlanMeldingenProps {
  simResult: SimResult // horizon-client r1253
  isFixedAnchorMode: boolean // horizon-client r2144
  fireStrategy: FireStrategyConfig | undefined // horizon-client r719
  masked: boolean // horizon-client r621
  kernelStatus: SolverStatus | null // horizon-client r1253
  kernelMaandHint: number | null // horizon-client r1253
  ankerReach: AnkerReach | null // horizon-client r2723
  ankerStop: AnkerStop | null // horizon-client r2736
  currentAge: number | null // horizon-client r2080
  deficitLoanCopy: DeficitLoanCopy | null // horizon-client r3425
  deficitDisplay: BannerDisplay | "none" // horizon-client r3372
  deficitLoanNotice: DeficitLoanNotice | null // horizon-client r2278
  canMinimizeDeficit: boolean // horizon-client r3373
  minimizeDeficitNotice: () => void // horizon-client r3374
  router: ReturnType<typeof useRouter> // horizon-client r1044
  setStrategieInitialTab: Dispatch<SetStateAction<"eind" | "onttrekking" | "woning" | null>> // horizon-client r753
  setActiveModal: Dispatch<SetStateAction<ActiveModal>> // horizon-client r750
  aowDisplay: BannerDisplay | "none" // horizon-client r3383
  canMinimizeAow: boolean // horizon-client r3384
  minimizeAowNotice: () => void // horizon-client r3385
  eindsituatiePlan: FirePlan | null // horizon-client r3394
  eindsituatieDuiding: EindsituatieDuiding | null // horizon-client r3398
  eindsituatieDisplay: BannerDisplay | "none" // horizon-client r3414
  canMinimizeEindsituatie: boolean // horizon-client r3415
  minimizeEindsituatieNotice: () => void // horizon-client r3416
  canonicalDailyRate: number // horizon-client r690
  initialData: HorizonPageData // horizon-client r598
  kernelRawProfile: ConvergentieRawProfileRow | null // horizon-client r741
  housingHeldNotice: { houseValue: number; sharePct: number; endAge: number; realLegacyTarget: number; } | null // horizon-client r3258
  isPensioenMode: boolean // horizon-client r2713
}

export function PlanMeldingen({
  simResult,
  isFixedAnchorMode,
  fireStrategy,
  masked,
  kernelStatus,
  kernelMaandHint,
  ankerReach,
  ankerStop,
  currentAge,
  deficitLoanCopy,
  deficitDisplay,
  deficitLoanNotice,
  canMinimizeDeficit,
  minimizeDeficitNotice,
  router,
  setStrategieInitialTab,
  setActiveModal,
  aowDisplay,
  canMinimizeAow,
  minimizeAowNotice,
  eindsituatiePlan,
  eindsituatieDuiding,
  eindsituatieDisplay,
  canMinimizeEindsituatie,
  minimizeEindsituatieNotice,
  canonicalDailyRate,
  initialData,
  kernelRawProfile,
  housingHeldNotice,
  isPensioenMode,
}: PlanMeldingenProps) {
  return (
    <>
              {!simResult.fireReachable && !isFixedAnchorMode && (
                <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-dashed border-amber-200 bg-amber-50/60 px-3 py-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <p className="font-sans text-[12px] text-amber-800">
                    {simResult.strategy === 'legacy' ? (
                      <>Je haalt je nalatenschapsdoel{fireStrategy?.legacyAmount ? ` van ${formatMaskedCurrency(fireStrategy.legacyAmount, masked)}` : ''} niet binnen je projectie (tot leeftijd {simResult.displayEndAge}). Verlaag het nalatenschapsbedrag, verhoog je <GlossaryTerm term="spaarquote">spaarquote</GlossaryTerm> of verlaag je uitgaven.</>
                    ) : simResult.strategy === 'perpetual' ? (
                      <>Je vermogen is niet groot genoeg om er blijvend van te leven binnen je projectie (tot leeftijd {simResult.displayEndAge}). Verhoog je <GlossaryTerm term="spaarquote">spaarquote</GlossaryTerm> of verlaag je uitgaven.</>
                    ) : (
                      <>FIRE niet haalbaar binnen je projectie (tot leeftijd {simResult.displayEndAge}). Verhoog je <GlossaryTerm term="spaarquote">spaarquote</GlossaryTerm> of verlaag je uitgaven.</>
                    )}
                    {/* V12 — kernel-hint: hoeveel €/mnd extra sparen het wél haalbaar maakt. */}
                    {kernelStatus === 'unreachable_within_horizon' && kernelMaandHint != null && kernelMaandHint > 0 && (
                      <> Zo&apos;n {formatMaskedCurrency(Math.ceil(kernelMaandHint), masked)}/mnd extra opzij zetten maakt het wél haalbaar binnen je projectie.</>
                    )}
                  </p>
                </div>
              )}

              {/* ADR 0129 D3 — ÉÉN tekort-blok voor elk vast anker (`anchor_shortfall`).
                  `pension_shortfall` en `stop_now_shortfall` blijven tot F4 als aliassen op
                  hetzelfde blok. De zin komt uit anker-copy en noemt de AOW bewust NIET:
                  een tekort kan ook ná de AOW vallen — de oude pensioen-kopij ("vanaf je
                  AOW-leeftijd dekt je inkomen je uitgaven wél") beloofde iets dat de run
                  niet draagt. Beschrijvend (hoe ver reikt het), nergens aansporend. */}
              {(kernelStatus === 'anchor_shortfall' || kernelStatus === 'pension_shortfall' || kernelStatus === 'stop_now_shortfall') && ankerReach != null && (
                <div data-testid="anchor-shortfall-blok" className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-dashed border-amber-200 bg-amber-50/60 px-3 py-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <p className="font-sans text-[12px] text-amber-800">
                    {ankerZin(ankerReach, ankerStop ?? { kind: 'now' })}
                  </p>
                </div>
              )}

              {/* V12 — kernel reached_now: nu al genoeg. Stoplicht-"goed"-status
                  (emerald, volgt de accentkeuze bewust NIET — CLAUDE.md-kleurconventie).
                  B93-doel=0-quirk: bij deplete is de status ALTIJD `reached_now`, óók bij
                  een echte latere FIRE-maand — toon deze "nu al stoppen"-banner daarom alleen
                  als de gevonden FIRE-leeftijd (echte solver-waarde) ~ je huidige leeftijd is;
                  anders krijgt /toekomst gewoon de normale grafiek/countdown (reached_at). */}
              {kernelStatus === 'reached_now' && isKernelReachedNowDisplay(simResult.fireAgeFractional, currentAge) && (
                <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-positive/30 bg-positive-bg px-3 py-2.5">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
                  <p className="font-sans text-[12px] text-[var(--ink-2)]">
                    {/* ADR 0129 — onder een VAST anker is "je kunt nu al stoppen" een
                        tautologie: het stopmoment ligt al vast. De informatieve
                        uitspraak is dan hoe ver het liquide vermogen reikt — de
                        bereik-zin uit anker-copy (statusblok gedekt). */}
                    {isFixedAnchorMode
                      ? (ankerReach != null
                          ? ankerZin(ankerReach, ankerStop ?? { kind: 'now' })
                          : 'Als je op je stopmoment stopt, reikt je liquide vermogen tot het einde van je plan.')
                      : 'Volgens je huidige cijfers kun je nu al stoppen met werken.'}
                  </p>
                </div>
              )}

              {/* V7 — tekort-lening aangesproken: expliciete, uitlegbare melding.
                  De lijn plot netWorth (tekort al gesaldeerd) en vloert op 0, dus een
                  aangesproken tekort-lening is in Pad-modus onzichtbaar. De 0-vloer
                  blijft bewust staan (y-schaal-invariant over meerdere render-sites;
                  netWorth is rekenkundig al de waarheid) — daarom deze melding + de
                  tijdlijn-marker i.p.v. de lijn ontvloeren. Stoplicht-oranje (aandacht),
                  volgt de module-accentkeuze bewust NIET (CLAUDE.md-kleurconventie).
                  View-gating spiegelt de marker: in partner-weergave (met partner-pad)
                  plot de grafiek de pártnerlijn — dan geen eigen tekort-verhaal tonen.

                  MINIMALISEERBAAR (CLAUDE.md-meldingen-conventie): uitgeklapt = deze
                  melding; na "Minimaliseren" blijft alleen het gekleurde statuspunt
                  links naast de pagina-'i' over (`DeficitNoticeDot` in de /toekomst-kop).
                  De aria-live-regio blijft ALTIJD gemount, zodat een screenreader zowel
                  het minimaliseren als het heropenen meekrijgt.

                  KLEUR: amber = de canonieke stoplicht-'warn'-familie (dezelfde die
                  `LEVERAGE_STATUS_DOT.warn` aan het statuspunt geeft), zodat melding en
                  punt één familie zijn. Semantische status, dus bewust GEEN module-accent.
                  De naburige oranje meldingen hierboven zijn pre-existing drift — buiten
                  scope van deze wijziging. */}
              <section role="status" aria-live="polite">
                {deficitLoanCopy && deficitDisplay === 'minimized' && (
                  <span className="sr-only">
                    Melding over je tekort-lening geminimaliseerd. Activeer de gekleurde
                    stip naast de informatie-knop om de melding opnieuw te tonen.
                  </span>
                )}
                {deficitLoanCopy && deficitLoanNotice && deficitDisplay === 'expanded' && (
                  <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-sans text-[12px] font-semibold text-amber-900">
                          Tekort-lening aangesproken vanaf leeftijd {Math.floor(deficitLoanNotice.firstAge)}
                        </p>
                        {/* Minimaliseren alleen tonen waar de keuze ook onthouden
                            wordt (binnen de provider) — geen knop die niets doet. */}
                        {canMinimizeDeficit && (
                          <button
                            type="button"
                            onClick={minimizeDeficitNotice}
                            aria-label="Minimaliseren"
                            title="Minimaliseren"
                            className="-mr-1 -mt-1 inline-flex shrink-0 items-center gap-1 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                          >
                            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                            Minimaliseren
                          </button>
                        )}
                      </div>
                      <p className="mt-1 font-sans text-[12px] leading-relaxed text-amber-800">
                        {deficitLoanCopy.periode} {deficitLoanCopy.waarom}
                      </p>
                      {deficitLoanCopy.woning && (
                        <p className="mt-1.5 font-sans text-[12px] leading-relaxed text-amber-800">
                          {deficitLoanCopy.woning}
                        </p>
                      )}
                      <p className="mt-1.5 font-sans text-[12px] leading-relaxed text-amber-800">
                        {deficitLoanCopy.piek} {deficitLoanCopy.lijn}
                      </p>
                      <p className="mt-1.5 font-sans text-[12px] leading-relaxed text-amber-800">
                        {deficitLoanCopy.instelling}
                      </p>
                      <p className="mt-1.5 font-sans text-[12px] leading-relaxed text-amber-800">
                        {deficitLoanCopy.knoppen}
                      </p>
                      {deficitLoanCopy.toonInstellingLink && (
                        <button
                          type="button"
                          onClick={() => router.push('/toekomst/instellingen?regel=eindstrategie')}
                          className="mt-1.5 mr-4 inline-flex items-center gap-1 font-sans text-[12px] font-medium text-amber-900 underline underline-offset-2 transition-colors hover:text-[var(--ink)]"
                          style={{ minHeight: 44 }}
                        >
                          Bekijk of wijzig of een tekort-lening mag &rarr;
                        </button>
                      )}
                      {deficitLoanCopy.toonWoonstrategieLink && (
                        <button
                          type="button"
                          onClick={() => { setStrategieInitialTab('woning'); setActiveModal('strategie') }}
                          className="mt-1.5 inline-flex items-center gap-1 font-sans text-[12px] font-medium text-amber-900 underline underline-offset-2 transition-colors hover:text-[var(--ink)]"
                          style={{ minHeight: 44 }}
                        >
                          Bekijk of wijzig je woonstrategie &rarr;
                        </button>
                      )}
                      <p className="mt-2 font-sans text-[11px] text-[var(--ink-3)]">
                        {deficitLoanCopy.disclaimer}
                      </p>
                    </div>
                  </div>
                )}
              </section>

              {/* TPR-04 — geen actief AOW-event: de kern rekent bewust met €0 AOW
                  (eigenaarsbesluit, geen terugval op volledige opbouw), maar niet meer
                  stil. Bron = de adapter-notice `aow_ontbreekt` uit dezelfde run; kopij
                  (keuze · effect · waarom) uit `lib/horizon/aow-notice-minimize.ts`, ook
                  de bron van de kassabon-regel. Minimaliseerbaar via `AowNoticeProvider`
                  (statuspunt naast de pagina-'i'); kleur = stoplicht-'aandacht'. Staat
                  bewust NÁ de tekort-sectie: de bron-grendel
                  horizon-client.tekort-lening.test.ts leest de éérste aria-live-sectie. */}
              <section role="status" aria-live="polite">
                {aowDisplay === 'minimized' && (
                  <span className="sr-only">
                    Melding over je AOW geminimaliseerd. Activeer de gekleurde stip naast de
                    informatie-knop om de melding opnieuw te tonen.
                  </span>
                )}
                {aowDisplay === 'expanded' && (
                  <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-sans text-[12px] font-semibold text-amber-900">
                          {AOW_ONTBREEKT_COPY.kop}
                        </p>
                        {canMinimizeAow && (
                          <button
                            type="button"
                            onClick={minimizeAowNotice}
                            aria-label="Minimaliseren"
                            title="Minimaliseren"
                            className="-mr-1 -mt-1 inline-flex shrink-0 items-center gap-1 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                          >
                            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                            Minimaliseren
                          </button>
                        )}
                      </div>
                      <p className="mt-1 font-sans text-[12px] leading-relaxed text-amber-800">
                        {AOW_ONTBREEKT_COPY.keuze} {AOW_ONTBREEKT_COPY.effect}
                      </p>
                      <p className="mt-1.5 font-sans text-[12px] leading-relaxed text-amber-800">
                        {AOW_ONTBREEKT_COPY.waarom}
                      </p>
                      <Link
                        href={AOW_ONTBREEKT_COPY.actieHref}
                        className="mt-2 inline-flex items-center gap-1 font-sans text-[12px] font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                      >
                        {AOW_ONTBREEKT_COPY.actieLabel}
                      </Link>
                    </div>
                  </div>
                )}
              </section>

              {/* Eindsituatie-duiding (plan 17 sep, D) — "waarom blijft er aan het eind
                  zoveel over?". Minimaliseerbaar via `EindsituatieNoticeProvider`
                  (statuspunt naast de pagina-'i'); neutrale horizon-stijl. Staat NÁ de
                  tekort-sectie: de bron-grendel leest de éérste aria-live-sectie. */}
              {eindsituatiePlan && (
                <EindsituatieNotice
                  duiding={eindsituatieDuiding}
                  endForm={eindsituatiePlan.endForm}
                  display={eindsituatieDisplay}
                  canMinimize={canMinimizeEindsituatie}
                  onMinimize={minimizeEindsituatieNotice}
                  canonicalDailyRate={canonicalDailyRate}
                  dailyRateSource={initialData.dailyExpenseRateDetail.source}
                  overschotIsLiquide={!(eindsituatiePlan.endForm === 'legacy' && kernelRawProfile?.fire_legacy_include_illiquid === true)}
                />
              )}

              {/* "Huis wordt nooit verkocht" — beschrijvende info (geen advies, Wft-veilig).
                  Neutrale horizon-toon, niet de rode "fout"-stijl. */}
              {housingHeldNotice && !isPensioenMode && (() => {
                const dRate = canonicalDailyRate
                const freedom = dRate > 0
                  ? formatWithFreedom(housingHeldNotice.houseValue, dRate, { includeCurrency: false, format: 'long', includeDays: false })
                  : null
                return (
                  <div className="mb-4 rounded-[var(--r)] border border-horizon-200 bg-horizon-50/50 px-3.5 py-3">
                    <div className="flex items-start gap-2.5">
                      <Home className="mt-0.5 h-4 w-4 shrink-0 text-horizon-600" />
                      <div className="min-w-0">
                        <p className="font-sans text-[13px] font-semibold text-horizon-800">
                          Je huis wordt in deze projectie nooit verkocht
                        </p>
                        <p className="mt-1 font-sans text-[12px] leading-relaxed text-[var(--ink-2)]">
                          Je hebt ingesteld: verkopen zodra je geld opraakt — maar je inkomen blijft je
                          uitgaven dekken, dus dat moment komt niet. Daardoor blijft je huis staan en
                          groeit het mee in je vermogen:{' '}
                          <span className="font-semibold text-[var(--ink)]">
                            {formatMaskedCurrency(housingHeldNotice.houseValue, masked)}
                          </span>
                          {freedom && !masked ? <> ({freedom} vrijheid)</> : null}, oftewel{' '}
                          <span className="font-semibold text-[var(--ink)]">{housingHeldNotice.sharePct}%</span>{' '}
                          van je vermogen op leeftijd {housingHeldNotice.endAge}. Daardoor ligt je getoonde
                          nalatenschap ver boven je doel
                          {housingHeldNotice.realLegacyTarget > 0
                            ? <> van {formatMaskedCurrency(housingHeldNotice.realLegacyTarget, masked)}</>
                            : null}.
                        </p>
                        <button
                          type="button"
                          onClick={() => { setStrategieInitialTab('woning'); setActiveModal('strategie') }}
                          className="mt-2 inline-flex items-center gap-1 font-sans text-[12px] font-medium text-horizon-800 underline underline-offset-2 transition-colors hover:text-[var(--ink)]"
                          style={{ minHeight: 44 }}
                        >
                          Wil je je huis eerder verkopen of een andere woonstrategie? Pas je woonstrategie aan &rarr;
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })()}
    </>
  )
}
