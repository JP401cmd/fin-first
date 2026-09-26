// Verplaatst uit components/app/horizon/horizon-client.tsx r10316–10472, r10474–10582, r10584–10833, r10835–10864 @ c1b4849eb (fase 1, ADR 0179).
// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf
'use client'

import type { Dispatch, SetStateAction } from 'react'
import dynamic from 'next/dynamic'
import { FreedomTimeBadge } from '@/components/app/freedom-time-label'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { MaskedAmount } from '@/components/app/masked-amount'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { GlossaryTerm } from '@/components/editorial'
import type { AowAge } from '@/lib/aow-leeftijd'
import type { HealthScore } from '@/lib/financial-health'
import type { FireParams } from '@/lib/fire-params'
import type { SimCashflow, SimResult } from '@/lib/fire-simulation'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { formatMaskedCurrency } from '@/lib/format'
import type { FinancialInput, FireProjection, FireRange } from '@/lib/horizon-data'
import type { HorizonPageData } from '@/lib/horizon-data-loader'
import { type AnkerReach, type AnkerStop, ankerTitel, ankerZin, formatStopAge } from '@/lib/horizon/anker-copy'
import { AOW_ONTBREEKT_COPY } from '@/lib/horizon/aow-notice-minimize'
import { type HeroFireAge, heroFireAgeYear } from '@/lib/horizon/hero-fire-age'
import { HORIZON_MISSENDE_GEGEVENS_LABEL, type HorizonOutcomeGuard } from '@/lib/horizon/outcome-guard'
import type { ActiveModal } from './types'

// Kopie van horizon-client r317–324 — V3: de dynamic() verhuist mee met zijn enige
// consument (kassabon Z); de integrator schrapt de declaratie in horizon-client.
// HealthScoreReceipt (1011 r) uit het first-load-chunk van /toekomst (perf Task
// 3.2) — hij zit alleen in een BottomSheet die pas opent na een klik op de
// gezondheidsscore-kaart. `loading: null` (default) omdat een skeleton hier
// zou flitsen — zelfde afweging als de andere dynamics hierboven.
const HealthScoreReceipt = dynamic(() =>
  import('@/components/app/horizon/health-score-receipt').then(m => ({ default: m.HealthScoreReceipt })),
  { ssr: false }
)

/** Kassabon W — vrijheidsleeftijd. Afwijking (Q9): `<ShellOverlay kind="sheet">` i.p.v. `<BottomSheet>`. */
export interface PlanKassabonVrijheidsleeftijdProps {
  showFireAgeReceipt: boolean // horizon-client r959
  setShowFireAgeReceipt: Dispatch<SetStateAction<boolean>> // horizon-client r959
  heroAgeLabel: string // horizon-client r5721
  showFireAgeNotice: boolean // horizon-client r5751
  fireAgeNoticeGuard: HorizonOutcomeGuard // horizon-client r5741
  isFixedAnchorMode: boolean // horizon-client r2144
  simResult: SimResult | null // horizon-client r1253
  ankerReach: AnkerReach | null // horizon-client r2723
  ankerStop: AnkerStop | null // horizon-client r2736
  effectiveInput: FinancialInput | null // horizon-client r1910
  showLiquidWealthLine: boolean // horizon-client r2794
  initialData: HorizonPageData // horizon-client r598
  fire: FireProjection // horizon-client r697
  fireParams: FireParams // horizon-client r663
  aowOntbreekt: boolean | undefined // horizon-client r1253
  heroFireAge: HeroFireAge // horizon-client r2852
  isPensioenMode: boolean // horizon-client r2713
  aowAgeFormatted: string // horizon-client r2842
  viewVermogenOpAnker: number | null // horizon-client r5236
  viewMonthlyWithdrawalAtAow: number | null // horizon-client r5237
  fireSwr: number // horizon-client r672
  heroFireAgeReceiptText: string // horizon-client r2876
  range: FireRange // horizon-client r700
}

export function PlanKassabonVrijheidsleeftijd({
  showFireAgeReceipt,
  setShowFireAgeReceipt,
  heroAgeLabel,
  showFireAgeNotice,
  fireAgeNoticeGuard,
  isFixedAnchorMode,
  simResult,
  ankerReach,
  ankerStop,
  effectiveInput,
  showLiquidWealthLine,
  initialData,
  fire,
  fireParams,
  aowOntbreekt,
  heroFireAge,
  isPensioenMode,
  aowAgeFormatted,
  viewVermogenOpAnker,
  viewMonthlyWithdrawalAtAow,
  fireSwr,
  heroFireAgeReceiptText,
  range,
}: PlanKassabonVrijheidsleeftijdProps) {
  return (
    <>
      {/* === KPI Kassabon Modals === */}
      <ShellOverlay kind="sheet" open={showFireAgeReceipt} onClose={() => setShowFireAgeReceipt(false)} title={heroAgeLabel}>
        <div className="p-5">
          <KassabonShell>
            {/* M6: de motor gaf een leeftijd op/voorbij het horizonplafond — dat is
                de parkeerstand, geen antwoord. Melding vóór de onderbouwing. */}
            {showFireAgeNotice && (
              <div className="mb-3 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)] p-2.5 font-sans text-[11px] leading-relaxed text-[var(--ink-2)]">
                <strong className="font-semibold text-[var(--ink)]">{HORIZON_MISSENDE_GEGEVENS_LABEL}.</strong>{' '}
                {fireAgeNoticeGuard.hint}
              </div>
            )}
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">{heroAgeLabel.toUpperCase()}</p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
                {isFixedAnchorMode
                  ? 'Bereik uit de simulatie-engine — onttrekking vanaf je stopmoment'
                  : simResult?.fireAgeFractional != null ? 'Simulatie-engine berekening' : 'Statische projectie'}
              </p>
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              {isFixedAnchorMode
                ? (ankerReach != null
                    ? ankerZin(ankerReach, ankerStop ?? { kind: 'now' })
                    : 'De leeftijd tot waar je liquide vermogen je uitgaven dekt als je op je stopmoment stopt.')
                : 'De leeftijd waarop je vermogen voldoende is om je uitgaven te dekken zonder te werken.'}
            </div>

            <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Huidig netto vermogen</span>
                <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={(effectiveInput?.totalAssets ?? 0) - (effectiveInput?.totalDebts ?? 0)} tone="horizon" />}</span>
              </div>
              {/* Zelfde conditie als de besteedbaar-vermogenslijn: eigen woning ÉN een
                  niet-meetellen-strategie (bij include_full is J ≡ I, dus "belegbaar"
                  zou hier het totaal herhalen). Consumeert de gedeelde helper i.p.v.
                  de conditie letterlijk te dupliceren. */}
              {showLiquidWealthLine && (
                  <div className="flex justify-between py-0.5">
                    <span
                      className="font-sans text-sm text-[var(--ink-2)]"
                      title="Het deel van je vermogen dat de FIRE-engine gebruikt — eigen woning telt niet automatisch mee."
                    >
                      Belegbaar voor pensioen
                    </span>
                    <span className="tabular-nums text-[var(--ink)]">
                      <MaskedAmount value={initialData.fireEligibleNetWorth} tone="horizon" />
                    </span>
                  </div>
                )}
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Jaarlijkse besparing</span>
                <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={(fire?.monthlySavings ?? 0) * 12} tone="horizon" />}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Verwacht rendement</span>
                <span className="tabular-nums text-[var(--ink)]">{(fireParams.grossReturn * 100).toFixed(1)}%</span>
              </div>
              {/* M5 — de tweede aanname onder élk prognosegetal. De bevinding
                  wees erop dat rendement wél in de kassabon stond en inflatie
                  niet, terwijl juist die twee samen bepalen hoeveel het bedrag
                  straks wáárd is. Bron is `fireParams.inflationRate` (profiel →
                  resolveFireParams) — dezelfde waarde waarmee de kernel rekent,
                  niet een eigen aanname. */}
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Verwachte inflatie</span>
                <span className="tabular-nums text-[var(--ink)]">{(fireParams.inflationRate * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Pensioenuitgaven/jr</span>
                <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={effectiveInput?.yearlyMustExpenses ?? 0} tone="horizon" />}</span>
              </div>
              {/* TPR-04 — de stille €0 benoemd: zonder actief AOW-event rekent de run
                  (adapter-notice `aow_ontbreekt`) met €0 AOW. Zelfde bron en kopij als
                  de melding boven de grafiek; geen eigen event-telling hier. */}
              {aowOntbreekt && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">{AOW_ONTBREEKT_COPY.kassabonLabel}</span>
                  <span className="tabular-nums text-[var(--ink)]">{AOW_ONTBREEKT_COPY.kassabonWaarde}</span>
                </div>
              )}
              {/* ADR 0129 — het stopmoment als aanname in de bon (uit `vastStopLeeftijd`, nooit `fireAge`). */}
              {isFixedAnchorMode && ankerStop != null && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Stopmoment</span>
                  <span className="tabular-nums text-[var(--ink)]">{ankerStop.kind === 'now' ? 'nu' : `${formatStopAge(ankerStop.stopAge)} jaar`}</span>
                </div>
              )}
              {isFixedAnchorMode && heroFireAge.anker?.solvedFireAge != null && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Vrij mogelijk vanaf</span>
                  <span className="tabular-nums text-[var(--ink)]">{heroFireAgeYear(heroFireAge.anker.solvedFireAge)} jaar</span>
                </div>
              )}
              {isPensioenMode && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">AOW-leeftijd</span>
                  <span className="tabular-nums text-[var(--ink)]">{aowAgeFormatted}</span>
                </div>
              )}
              {/* Beide zijn puntbedragen op de AOW-leeftijd (klasse S resp. F) en
                  moeten hetzelfde tonen als de KPI hierboven — anders spreekt de
                  onderbouwing de kaart tegen. Onder het aow-anker valt de ankermaand
                  samen met de AOW-leeftijd, dus dit bedrag hoort hier; de grondslag is
                  netto LIQUIDE (Prognose!J), zoals het onderschrift bij de KPI zegt. */}
              {isPensioenMode && viewVermogenOpAnker != null && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Vermogen op AOW</span>
                  <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={Math.round(viewVermogenOpAnker)} tone="horizon" />}</span>
                </div>
              )}
              {isPensioenMode && viewMonthlyWithdrawalAtAow != null && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Mnd. onttrekking</span>
                  <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={Math.round(viewMonthlyWithdrawalAtAow)} tone="horizon" />}</span>
                </div>
              )}
              {!isPensioenMode && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]"><GlossaryTerm term="swr">Opnamerate</GlossaryTerm></span>
                  <span className="tabular-nums text-[var(--ink)]">{(fireSwr * 100).toFixed(2)}%</span>
                </div>
              )}
            </div>

            <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
              <span className="text-[var(--ink)]">{heroAgeLabel}</span>
              <span className="tabular-nums text-[var(--ink)]">{heroFireAgeReceiptText}</span>
            </div>

            {/* Optimistisch/pessimistisch zijn FIRE-leeftijden uit de scenarioband —
                onder 'Nu stoppen' bestaat er geen FIRE-moment om te spreiden (D1). */}
            {!isFixedAnchorMode && range && range.optimistic.fireAge !== null && range.pessimistic.fireAge !== null && (
              <div className="mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Optimistisch</span>
                  <span className="tabular-nums text-[var(--ink)]">{Math.round(range.optimistic.fireAge)} jaar</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Pessimistisch</span>
                  <span className="tabular-nums text-[var(--ink)]">{Math.round(range.pessimistic.fireAge)} jaar</span>
                </div>
              </div>
            )}


            <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              <p><strong className="font-semibold text-[var(--ink-3)]">Formule:</strong> {isFixedAnchorMode
                ? 'Onttrekking start op je stopmoment. Het bereik is de eerste maand waarin je liquide vermogen aanhoudend op nul staat — omgerekend naar een leeftijd.'
                : 'Portfolio groeit met rendement + jaarlijkse besparing. FIRE is bereikt wanneer portfolio ≥ doelbedrag.'}</p>
            </div>

            <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">{isFixedAnchorMode && ankerStop != null ? `${ankerTitel(ankerStop)} — gerekend vanaf dat moment` : 'Berekend op basis van huidig vermogen, spaargedrag en verwacht rendement'}</p>
          </KassabonShell>
        </div>
      </ShellOverlay>
    </>
  )
}

/** Kassabon X — doelbedrag / vermogen op je stopmoment. Afwijking (Q9): `<ShellOverlay kind="sheet">` i.p.v. `<BottomSheet>`. */
export interface PlanKassabonDoelbedragProps {
  showFireTargetReceipt: boolean // horizon-client r960
  setShowFireTargetReceipt: Dispatch<SetStateAction<boolean>> // horizon-client r960
  isFixedAnchorMode: boolean // horizon-client r2144
  showFireTargetNotice: boolean // horizon-client r2829
  fireTargetGuard: HorizonOutcomeGuard // horizon-client r2820
  simResult: SimResult | null // horizon-client r1253
  fireSwr: number // horizon-client r672
  effectiveInput: FinancialInput | null // horizon-client r1910
  isPensioenMode: boolean // horizon-client r2713
  aowAgeFormatted: string // horizon-client r2842
  fireParams: FireParams // horizon-client r663
  viewMonthlyWithdrawalAtAow: number | null // horizon-client r5237
  viewVermogenOpAnker: number | null // horizon-client r5236
  viewEffectiveFireTarget: number // horizon-client r5235
  fireStrategy: FireStrategyConfig | undefined // horizon-client r719
  masked: boolean // horizon-client r621
}

export function PlanKassabonDoelbedrag({
  showFireTargetReceipt,
  setShowFireTargetReceipt,
  isFixedAnchorMode,
  showFireTargetNotice,
  fireTargetGuard,
  simResult,
  fireSwr,
  effectiveInput,
  isPensioenMode,
  aowAgeFormatted,
  fireParams,
  viewMonthlyWithdrawalAtAow,
  viewVermogenOpAnker,
  viewEffectiveFireTarget,
  fireStrategy,
  masked,
}: PlanKassabonDoelbedragProps) {
  return (
    <>
      {/* De aftel-kassabon ("Aftellen naar vrijheid") is verwijderd: er was geen enkele
          aanroeper van `setShowCountdownReceipt(true)` meer (dode code sinds de
          figures-strip), en onder een vast anker is er niets om naar af te tellen. */}
      <ShellOverlay kind="sheet" open={showFireTargetReceipt} onClose={() => setShowFireTargetReceipt(false)} title={isFixedAnchorMode ? 'Vermogen op je stopmoment' : 'FIRE Doelbedrag'}>
        <div className="p-5">
          <KassabonShell>
            {/* M6: dezelfde vangrail als op de KPI-tegel — de bon mag nooit een
                bedrag onderbouwen dat de tegel als "we missen gegevens" toont. */}
            {showFireTargetNotice && (
              <div className="mb-3 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)] p-2.5 font-sans text-[11px] leading-relaxed text-[var(--ink-2)]">
                <strong className="font-semibold text-[var(--ink)]">{HORIZON_MISSENDE_GEGEVENS_LABEL}.</strong>{' '}
                {fireTargetGuard.hint}
              </div>
            )}
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">{isFixedAnchorMode ? 'VERMOGEN OP JE STOPMOMENT' : 'FIRE DOELBEDRAG'}</p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
                {isFixedAnchorMode
                  ? 'Geprojecteerd — een uitkomst, geen doel'
                  : simResult?.requiredFirePortfolio != null ? 'Simulatie-engine berekening (incl. AOW & kasstromen)' : `Klassieke FIRE-berekening (${(fireSwr * 100).toFixed(2)}% SWR)`}
              </p>
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              {/* ADR 0129 D4 — onder een vast anker bestaat er geen doelbedrag (de kernel
                  bisecteert op tijd, niet op kapitaal); de bon onderbouwt de PROJECTIE. */}
              {isFixedAnchorMode
                ? 'Het geprojecteerde liquide vermogen op je stopmoment. Onder een vast stopmoment is er geen doelbedrag: de vraag is niet hoeveel je nodig hebt, maar tot welke leeftijd dit vermogen reikt.'
                : 'Het minimale vermogen waarmee je jaarlijkse pensioenuitgaven volledig kunt dekken.'}
            </div>

            <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Jaarlijkse pensioenuitgaven</span>
                <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={effectiveInput?.yearlyMustExpenses ?? 0} tone="horizon" />}</span>
              </div>
              {isPensioenMode && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">AOW-leeftijd</span>
                  <span className="tabular-nums text-[var(--ink)]">{aowAgeFormatted}</span>
                </div>
              )}
              {/* Onder een vast anker geen opnamerate-regel: uitgaven ÷ huidig vermogen
                  is daar betekenisloos (bevinding 6). */}
              {!isFixedAnchorMode && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Opnamerate (SWR)</span>
                  <span className="tabular-nums text-[var(--ink)]">{(fireSwr * 100).toFixed(2)}%</span>
                </div>
              )}
              {/* M5 — de twee aannames waaruit die SWR volgt (rendement − Box 3-
                  druk − inflatie). Zonder deze regels is het doelbedrag een kaal
                  getal en de opnamerate een onverklaarde constante. Beide uit
                  `fireParams`, dus dezelfde waarden als de kernel gebruikt. */}
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Verwacht rendement</span>
                <span className="tabular-nums text-[var(--ink)]">{(fireParams.grossReturn * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Verwachte inflatie</span>
                <span className="tabular-nums text-[var(--ink)]">{(fireParams.inflationRate * 100).toFixed(1)}%</span>
              </div>
              {isPensioenMode && viewMonthlyWithdrawalAtAow != null && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Mnd. onttrekking op AOW</span>
                  <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={Math.round(viewMonthlyWithdrawalAtAow)} tone="horizon" />}</span>
                </div>
              )}
              {!isPensioenMode && simResult?.requiredFirePortfolio != null && (
                <div className="py-0.5 font-sans text-[11px] italic text-[var(--ink-3)]">
                  Simulatie houdt rekening met AOW, pensioen en levensgebeurtenissen
                </div>
              )}
            </div>

            <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
              {/* ADR 0129 — geen "Benodigd"-totaalregel onder een vast anker: het bedrag is
                  de geprojecteerde stand op het stopmoment, geen doel. */}
              <span className="text-[var(--ink)]">{isFixedAnchorMode ? 'Vermogen op je stopmoment (geprojecteerd)' : 'Benodigd'}</span>
              <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={isFixedAnchorMode ? (viewVermogenOpAnker ?? 0) : viewEffectiveFireTarget} tone="horizon" />}</span>
            </div>

            <div className="mt-3 flex justify-center">
              {/* De vrijheidstijd volgt automatisch het (eventueel gedeflateerde)
                  bedrag — het dagtarief zelf blijft een grootheid van vandaag (D15). */}
              <FreedomTimeBadge amount={isFixedAnchorMode ? (viewVermogenOpAnker ?? 0) : viewEffectiveFireTarget} />
            </div>

            <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              <p>
                <strong className="font-semibold text-[var(--ink-3)]">Formule:</strong>{' '}
                {isFixedAnchorMode
                  ? 'Vermogensprojectie op je stopmoment via de simulatie-engine (incl. Box 3, inflatie en levensgebeurtenissen)'
                  : simResult?.requiredFirePortfolio != null
                    ? 'Levenslange simulatie (opbouw + verbruik tot leeftijd 90, incl. Box 3 en inflatie)'
                    : fireStrategy?.strategy === 'deplete'
                      ? `Doelbedrag = PV-annuïteit: uitgaven × (1 − (1+r)⁻ⁿ) / r — vermogen ≈ €0 op leeftijd ${fireStrategy.endAge}`
                      : fireStrategy?.strategy === 'legacy'
                        ? `Doelbedrag = Jaaruitgaven ÷ SWR + erfenisbuffer (${formatMaskedCurrency(fireStrategy.legacyAmount, masked)})`
                        : `Doelbedrag = Jaaruitgaven ÷ SWR = ${formatMaskedCurrency(effectiveInput?.yearlyMustExpenses ?? 0, masked)} ÷ ${(fireSwr * 100).toFixed(2)}%`}
              </p>
            </div>

            <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
              {isFixedAnchorMode ? 'Geprojecteerd op je stopmoment — een uitkomst, geen doel' : simResult?.requiredFirePortfolio != null ? 'Simulatie-engine berekening (incl. AOW & kasstromen)' : fireStrategy?.strategy === 'deplete' ? 'Deplete strategie — PV-annuïteitsformule' : fireStrategy?.strategy === 'legacy' ? 'Legacy strategie — erfenis-gebaseerd doelbedrag' : 'Klassieke FIRE-berekening'}
            </p>
          </KassabonShell>
        </div>
      </ShellOverlay>
    </>
  )
}

/** Kassabon Y — opnamepercentage (SWR). Afwijking (Q9): `<ShellOverlay kind="sheet">` i.p.v. `<BottomSheet>`. */
export interface PlanKassabonOpnamerateProps {
  showSwrReceipt: boolean // horizon-client r962
  setShowSwrReceipt: Dispatch<SetStateAction<boolean>> // horizon-client r962
  simResult: SimResult | null // horizon-client r1253
  effectiveInput: FinancialInput | null // horizon-client r1910
  fireSwr: number // horizon-client r672
  simCashflows: SimCashflow[] // horizon-client r1253
  userAowAge: AowAge // horizon-client r731
  effectiveFireTarget: number // horizon-client r2637
}

export function PlanKassabonOpnamerate({
  showSwrReceipt,
  setShowSwrReceipt,
  simResult,
  effectiveInput,
  fireSwr,
  simCashflows,
  userAowAge,
  effectiveFireTarget,
}: PlanKassabonOpnamerateProps) {
  return (
    <>
      <ShellOverlay kind="sheet" open={showSwrReceipt} onClose={() => setShowSwrReceipt(false)} title="Opnamepercentage">
        <div className="p-5">
          <KassabonShell>
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">OPNAMEPERCENTAGE</p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
                {simResult?.implicitWithdrawalRate != null ? 'Simulatie vs. ingestelde SWR' : 'Ingestelde SWR (Safe Withdrawal Rate)'}
              </p>
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              Het opnamepercentage bepaalt hoeveel je jaarlijks uit je vermogen opneemt na FIRE.
              {simResult?.implicitWithdrawalRate != null
                ? ' De simulatie berekent een impliciet percentage dat afwijkt van je ingestelde SWR, omdat toekomstige inkomsten (AOW, pensioen) je onttrekkingsbehoefte verlagen.'
                : ' Een lager percentage betekent meer veiligheid — je vermogen gaat langer mee.'}
            </div>

            {/* ── Sectie 1: Klassieke SWR berekening ── */}
            <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              <p className="mb-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Klassieke berekening</p>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Jaarlijkse pensioenuitgaven</span>
                <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={effectiveInput?.yearlyMustExpenses ?? 0} tone="horizon" />}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Ingestelde SWR</span>
                <span className="tabular-nums text-[var(--ink)]">{(fireSwr * 100).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Klassiek doelvermogen</span>
                <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={Math.round((effectiveInput?.yearlyMustExpenses ?? 0) / fireSwr)} tone="horizon" />}</span>
              </div>
              <p className="mt-1 font-sans text-[10px] italic text-[var(--ink-4)]">
                Uitgaven ÷ SWR = {<MaskedAmount value={effectiveInput?.yearlyMustExpenses ?? 0} tone="horizon" />} ÷ {(fireSwr * 100).toFixed(2)}% = {<MaskedAmount value={Math.round((effectiveInput?.yearlyMustExpenses ?? 0) / fireSwr)} tone="horizon" />}
              </p>
            </div>

            {/* ── Sectie 2: Simulatie-berekening (alleen als simResult beschikbaar) ── */}
            {simResult?.implicitWithdrawalRate != null && (() => {
              const yearlyExp = effectiveInput?.yearlyMustExpenses ?? 0
              const fireAge = simResult.fireAgeFractional ?? simResult.fireAge ?? 0
              const fireAgeInt = Math.ceil(fireAge)

              // Inkomstenkasstromen actief op FIRE-leeftijd
              const incomeCfAtFire = simCashflows.filter(cf =>
                cf.direction === 'income' && cf.fromAge <= fireAgeInt && (cf.toAge === null || cf.toAge > fireAgeInt)
              )
              const yearlyIncomeAtFire = incomeCfAtFire.reduce((s, cf) => s + cf.amount * 12, 0)

              // Inkomstenkasstromen actief op AOW-leeftijd (dynamisch uit aow_leeftijd tabel)
              const aowAge = Math.ceil(userAowAge.fractional)
              const incomeCfAtAow = simCashflows.filter(cf =>
                cf.direction === 'income' && cf.fromAge <= aowAge && (cf.toAge === null || cf.toAge > aowAge)
              )
              const yearlyIncomeAtAow = incomeCfAtAow.reduce((s, cf) => s + cf.amount * 12, 0)

              // Pensioen-fase rijen uit de simulatie
              const pensionRows = simResult.rows.filter(r => r.phase === 'retirement')
              const firstPensionRow = pensionRows.length > 0 ? pensionRows[0] : null
              const rowAtAow = pensionRows.find(r => r.age === aowAge) ?? null

              // Heeft de gebruiker kasstromen na AOW-leeftijd die nog niet op FIRE-moment actief zijn?
              const laterCashflows = simCashflows.filter(cf =>
                cf.direction === 'income' && cf.fromAge > fireAgeInt
              )

              const implicitPct = simResult.implicitWithdrawalRate * 100
              const ingesteldPct = fireSwr * 100
              const diff = implicitPct - ingesteldPct
              const classicTarget = yearlyExp / fireSwr
              const portfolioDiff = classicTarget - simResult.requiredFirePortfolio

              return (
                <>
                  <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
                    <p className="mb-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-horizon-600">Simulatie-berekening</p>
                    <div className="flex justify-between py-0.5">
                      <span className="font-sans text-sm text-[var(--ink-2)]">Jaarlijkse pensioenuitgaven</span>
                      <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={yearlyExp} tone="horizon" />}</span>
                    </div>

                    {/* Inkomsten na FIRE die de onttrekking verlagen */}
                    {(incomeCfAtFire.length > 0 || laterCashflows.length > 0) && (
                      <>
                        {incomeCfAtFire.map(cf => (
                          <div key={cf.id} className="flex justify-between py-0.5">
                            <span className="font-sans text-sm text-horizon-600">
                              − {cf.id === 'aow-prefill' ? 'AOW (staatspension)' : cf.name}
                              <span className="ml-1 text-[10px] text-[var(--ink-4)]">vanaf {cf.fromAge} jr</span>
                            </span>
                            <span className="tabular-nums text-horizon-600">− {<MaskedAmount value={Math.round(cf.amount * 12)} tone="horizon" />}/jr</span>
                          </div>
                        ))}
                        {laterCashflows.map(cf => (
                          <div key={cf.id} className="flex justify-between py-0.5">
                            <span className="font-sans text-sm text-[var(--ink-3)]">
                              − {cf.id === 'aow-prefill' ? 'AOW (staatspension)' : cf.name}
                              <span className="ml-1 text-[10px] text-[var(--ink-4)]">vanaf {cf.fromAge} jr</span>
                            </span>
                            <span className="tabular-nums text-[var(--ink-3)]">− {<MaskedAmount value={Math.round(cf.amount * 12)} tone="horizon" />}/jr</span>
                          </div>
                        ))}
                      </>
                    )}

                    <div className="flex justify-between py-0.5">
                      <span className="font-sans text-sm text-[var(--ink-2)]">Benodigd FIRE-vermogen</span>
                      <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={Math.round(simResult.requiredFirePortfolio)} tone="horizon" />}</span>
                    </div>
                  </div>

                  {/* Totaalregel: impliciet opnamepercentage */}
                  <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
                    <span className="text-[var(--ink)]">Impliciet opnamepercentage</span>
                    <span className="tabular-nums text-[var(--ink)]">{implicitPct.toFixed(2)}%</span>
                  </div>

                  {/* Verschil-indicator */}
                  {Math.abs(diff) > 0.01 && (
                    <div className={`mt-2 rounded-[var(--r-sm)] border border-dashed px-3 py-2 font-sans text-[11px] ${
                      diff < 0
                        ? 'border-horizon-300 bg-horizon-50/50 text-horizon-700'
                        : 'border-kern-300 bg-kern-50/50 text-kern-700'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span>{diff < 0 ? '↓' : '↑'} {Math.abs(diff).toFixed(2)}pp {diff < 0 ? 'lager' : 'hoger'} dan ingesteld ({ingesteldPct.toFixed(2)}%)</span>
                        {diff < 0 && <span className="text-[10px] font-medium">= veiliger</span>}
                      </div>
                      {portfolioDiff > 0 && (
                        <p className="mt-1 text-[10px]">
                          Je hebt {<MaskedAmount value={Math.round(portfolioDiff)} tone="horizon" />} minder vermogen nodig dan de klassieke berekening.
                        </p>
                      )}
                    </div>
                  )}

                  {/* ── Fase-breakdown: onttrekking per levensfase ── */}
                  {firstPensionRow && (
                    <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2">
                      <p className="mb-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Onttrekking per fase</p>
                      <div className="space-y-1.5">
                        {/* Bij FIRE */}
                        <div className="rounded-[var(--r-sm)] bg-[var(--subtle)]/40 px-2.5 py-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-sans text-[11px] text-[var(--ink-2)]">Bij FIRE (leeftijd {firstPensionRow.age})</span>
                            <span className="font-mono text-[11px] tabular-nums text-[var(--ink)]">{<MaskedAmount value={Math.round(Math.abs(firstPensionRow.withdrawal))} tone="horizon" />}/jr</span>
                          </div>
                          {firstPensionRow.cashflowNet > 0 && (
                            <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-4)]">
                              waarvan {<MaskedAmount value={Math.round(firstPensionRow.cashflowNet)} tone="horizon" />}/jr gedekt door inkomsten
                            </p>
                          )}
                          {firstPensionRow.startPortfolio > 0 && (
                            <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-4)]">
                              effectief {((Math.abs(firstPensionRow.withdrawal) / firstPensionRow.startPortfolio) * 100).toFixed(2)}% van vermogen
                            </p>
                          )}
                        </div>

                        {/* Na AOW (als AOW later start dan FIRE) */}
                        {rowAtAow && rowAtAow.age > firstPensionRow.age && (
                          <div className="rounded-[var(--r-sm)] bg-horizon-50/40 px-2.5 py-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-sans text-[11px] text-horizon-700">Na AOW (leeftijd {rowAtAow.age})</span>
                              <span className="font-mono text-[11px] tabular-nums text-horizon-700">{<MaskedAmount value={Math.round(Math.abs(rowAtAow.withdrawal))} tone="horizon" />}/jr</span>
                            </div>
                            {rowAtAow.cashflowNet > 0 && (
                              <p className="mt-0.5 font-sans text-[10px] text-horizon-500">
                                waarvan {<MaskedAmount value={Math.round(rowAtAow.cashflowNet)} tone="horizon" />}/jr gedekt door AOW + inkomsten
                              </p>
                            )}
                            {rowAtAow.startPortfolio > 0 && (
                              <p className="mt-0.5 font-sans text-[10px] text-horizon-500">
                                effectief {((Math.abs(rowAtAow.withdrawal) / rowAtAow.startPortfolio) * 100).toFixed(2)}% van vermogen
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Uitleg waarom het verschilt */}
                  <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
                    <p>
                      <strong className="font-semibold text-[var(--ink-3)]">Waarom verschilt dit?</strong>
                    </p>
                    <p className="mt-1">
                      De <strong className="font-semibold">ingestelde SWR</strong> ({ingesteldPct.toFixed(2)}%) gaat uit van een eenvoudige formule: je dekt 100% van je uitgaven uit je vermogen. Doelvermogen = uitgaven ÷ SWR.
                    </p>
                    <p className="mt-1">
                      De <strong className="font-semibold">simulatie</strong> modelleert je hele levenspad jaar voor jaar.
                      {laterCashflows.length > 0
                        ? ` Toekomstige inkomsten (${laterCashflows.map(cf => cf.id === 'aow-prefill' ? 'AOW' : cf.name).join(', ')}) verlagen je jaarlijkse onttrekking na leeftijd ${Math.min(...laterCashflows.map(cf => cf.fromAge))}. Daardoor heb je een kleiner startvermogen nodig, en is het impliciete opnamepercentage ${diff < 0 ? 'lager' : 'hoger'}.`
                        : incomeCfAtFire.length > 0
                          ? ` Inkomsten die al actief zijn bij FIRE (${incomeCfAtFire.map(cf => cf.id === 'aow-prefill' ? 'AOW' : cf.name).join(', ')}) dekken een deel van je uitgaven. Daardoor is het impliciete percentage ${diff < 0 ? 'lager' : 'hoger'}.`
                          : ` Het verschil komt door de nauwkeurigere modellering van rendement, inflatie en Box 3-belasting over de tijd.`}
                    </p>
                  </div>

                  {/* Formule */}
                  <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
                    <p>
                      <strong className="font-semibold text-[var(--ink-3)]">Formule:</strong>
                    </p>
                    <p className="mt-1">
                      Klassiek: SWR = Jaaruitgaven ÷ Doelvermogen = {<MaskedAmount value={yearlyExp} tone="horizon" />} ÷ {<MaskedAmount value={Math.round(yearlyExp / fireSwr)} tone="horizon" />} = {ingesteldPct.toFixed(2)}%
                    </p>
                    <p className="mt-0.5">
                      {/* euro-view: exempt — deze regel toont een DELING die op het
                          scherm moet kloppen: een uitgavenbedrag van vandaag gedeeld
                          door het simulatie-vermogen levert het getoonde percentage.
                          Deflateer je alleen de noemer, dan klopt de zichtbare som niet
                          meer. De grondslag van de teller en de noemer verschilt hier
                          bewust; dat is de definitie van de opnamerate. */}
                      Impliciet: Jaaruitgaven ÷ Simulatie-vermogen = {<MaskedAmount value={yearlyExp} tone="horizon" />} ÷ {<MaskedAmount value={Math.round(simResult.requiredFirePortfolio)} tone="horizon" />} = {implicitPct.toFixed(2)}%
                    </p>
                  </div>
                </>
              )
            })()}

            {/* Fallback als geen simResult: eenvoudige kassabon */}
            {simResult?.implicitWithdrawalRate == null && (
              <>
                <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
                  <span className="text-[var(--ink)]">Opnamepercentage</span>
                  <span className="tabular-nums text-[var(--ink)]">{(fireSwr * 100).toFixed(2)}%</span>
                </div>

                <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
                  <p>
                    <strong className="font-semibold text-[var(--ink-3)]">Formule:</strong>{' '}
                    {/* euro-view: exempt — zelfde reden als de impliciete regel: dit is
                        een zichtbare deling die moet uitkomen op het getoonde
                        percentage, niet een los te lezen doelbedrag. */}
                    SWR = Jaaruitgaven ÷ Doelvermogen = {<MaskedAmount value={effectiveInput?.yearlyMustExpenses ?? 0} tone="horizon" />} ÷ {<MaskedAmount value={effectiveFireTarget} tone="horizon" />}
                  </p>
                </div>
              </>
            )}

            <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
              {simResult?.implicitWithdrawalRate != null
                ? 'Levenslange simulatie (opbouw + verbruik, incl. Box 3 en inflatie)'
                : 'Ingesteld via Toekomst → Voorkeuren'}
            </p>
          </KassabonShell>
        </div>
      </ShellOverlay>
    </>
  )
}

/** Kassabon Z — financiële gezondheid (HealthScoreReceipt). Afwijking (Q9): `<ShellOverlay kind="sheet">` i.p.v. `<BottomSheet>`. */
export interface PlanKassabonGezondheidProps {
  showResilienceReceipt: boolean // horizon-client r961
  setShowResilienceReceipt: Dispatch<SetStateAction<boolean>> // horizon-client r961
  healthScore: HealthScore // horizon-client r703
  setActiveModal: Dispatch<SetStateAction<ActiveModal>> // horizon-client r750
}

export function PlanKassabonGezondheid({
  showResilienceReceipt,
  setShowResilienceReceipt,
  healthScore,
  setActiveModal,
}: PlanKassabonGezondheidProps) {
  return (
    <>
      <ShellOverlay kind="sheet" open={showResilienceReceipt} onClose={() => setShowResilienceReceipt(false)} title="Financiële Gezondheid">
        <div className="p-5">
          {healthScore && (
            <HealthScoreReceipt
              health={healthScore}
              footer={
                <>
                  {/* Backtesting samenvatting */}
                  <div className="rounded-[var(--r-sm)] border border-[var(--border-ed)] p-3">
                    <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">HISTORISCHE VEERKRACHTCHECK</p>
                    <p className="mt-1 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
                      Backtesting over 55 jaar marktgeschiedenis (1970–heden) toont hoe je plan standhoudt onder historische crises.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setShowResilienceReceipt(false); setActiveModal('backtesting') }}
                      className="mt-2 font-serif text-sm italic text-horizon-600 transition-colors hover:text-horizon-800"
                    >
                      Bekijk volledige backtesting →
                    </button>
                  </div>
                  <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
                    Live berekend uit huidige financiële gegevens
                  </p>
                </>
              }
            />
          )}
        </div>
      </ShellOverlay>
    </>
  )
}
