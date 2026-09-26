// Verplaatst uit components/app/horizon/horizon-client.tsx r5924–5952, r5954–6184, r6307–6506 @ c1b4849eb (fase 1, ADR 0179).
// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf
'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Compass, Hourglass, Percent, Receipt, Target } from 'lucide-react'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { RetirementExpenseMethod } from '@/lib/budget-utils'
import type { SimResult } from '@/lib/fire-simulation'
import type { FinancialInput } from '@/lib/horizon-data'
import type { FireDoelPaarRegel } from '@/lib/horizon/fire-doel-weergave'
import { type HeroFireAge, heroFireAgeCaption } from '@/lib/horizon/hero-fire-age'
import type { HorizonOutcomeGuard } from '@/lib/horizon/outcome-guard'
import { HeroKpiNotice, ReceiptCue } from './plan-helpers'
import type { HouseholdHeroData } from '@/components/toekomst/state/types'

/** Blok C — het mobiele kerngetal (< md), een knop naar de kassabon vrijheidsleeftijd. */
export interface PlanKerngetalMobielProps {
  setShowFireAgeReceipt: Dispatch<SetStateAction<boolean>> // horizon-client r959
  showFreeHero: boolean // horizon-client r5709
  freeHeroPhrase: string // horizon-client r5712
  hasPerspectiveHero: boolean // horizon-client r5633
  heroFireAgePending: boolean // horizon-client r2872
  perspectiveHero: HouseholdHeroData | null // horizon-client r5632
  heroFireAgeTextMobile: string // horizon-client r2874
  isPensioenMode: boolean // horizon-client r2713
  heroFireAge: HeroFireAge // horizon-client r2852
  heroAgeLabel: string // horizon-client r5721
}

export function PlanKerngetalMobiel({
  setShowFireAgeReceipt,
  showFreeHero,
  freeHeroPhrase,
  hasPerspectiveHero,
  heroFireAgePending,
  perspectiveHero,
  heroFireAgeTextMobile,
  isPensioenMode,
  heroFireAge,
  heroAgeLabel,
}: PlanKerngetalMobielProps) {
  return (
    <>
          {/* Mobile: Primary number */}
          {/* Zelfde breekpunt als de 2x2-strip hieronder (B-025). */}
          <div className="md:hidden mb-3">
            <button type="button" onClick={() => setShowFireAgeReceipt(true)} className="text-left">
              {showFreeHero ? (
                <span className="font-serif text-[28px] font-bold tracking-tight text-[var(--ink)]">{freeHeroPhrase}.</span>
              ) : (
                <>
                  <span
                    className="font-display text-[36px] font-bold tracking-tight text-[var(--ink)]"
                    aria-busy={!hasPerspectiveHero && heroFireAgePending}
                  >
                    {hasPerspectiveHero
                      ? (perspectiveHero!.fireAge !== null ? Math.round(perspectiveHero!.fireAge) : '-')
                      : heroFireAgeTextMobile}
                  </span>
                  <span className="ml-3 font-serif italic text-lg text-[var(--ink-3)]">
                    {hasPerspectiveHero
                      ? (isPensioenMode ? 'pensioenleeftijd' : 'vrijheidsleeftijd')
                      : heroFireAgeCaption(heroFireAge, heroAgeLabel.toLowerCase())}
                  </span>
                  {/* M5 — hetzelfde bonnetje-spoor als op de figures-strip: dit
                      grote getal is óók een knop naar zijn eigen aannames. */}
                  <Receipt className="ml-2 inline h-3.5 w-3.5 shrink-0 align-middle text-[var(--ink-4)]" aria-hidden />
                  <span className="sr-only">— tik voor de aannames achter dit getal</span>
                </>
              )}
            </button>
          </div>
    </>
  )
}

/** Blok D — de desktop-figures-strip (≥ md), 3 of 4 tegels. */
export interface PlanKpiStripDesktopProps {
  isFixedAnchorMode: boolean // horizon-client r2144
  hasPerspectiveHero: boolean // horizon-client r5633
  setShowFireAgeReceipt: Dispatch<SetStateAction<boolean>> // horizon-client r959
  heroFireAge: HeroFireAge // horizon-client r2852
  heroFireAgePending: boolean // horizon-client r2872
  isPartnerView: boolean // horizon-client r625
  perspectiveHero: HouseholdHeroData | null // horizon-client r5632
  showFireAgeNotice: boolean // horizon-client r5751
  showFreeHero: boolean // horizon-client r5709
  freeHeroLabel: string // horizon-client r5713
  heroAgeLabel: string // horizon-client r5721
  fireAgeNoticeGuard: HorizonOutcomeGuard // horizon-client r5741
  freeHeroPhrase: string // horizon-client r5712
  heroFireAgeText: string // horizon-client r2873
  heroAgeCaptionBase: string // horizon-client r5723
  setShowFireTargetReceipt: Dispatch<SetStateAction<boolean>> // horizon-client r960
  showFireTargetNotice: boolean // horizon-client r2829
  fireTargetGuard: HorizonOutcomeGuard // horizon-client r2820
  isNuStoppenMode: boolean // horizon-client r2716
  dualDoelRegels: [FireDoelPaarRegel, FireDoelPaarRegel] | null // horizon-client r5678
  viewPerspectiveHeroFireTarget: number | null // horizon-client r5636
  viewVermogenOpAnker: number | null // horizon-client r5236
  viewBalkVrijheidDoel: number // horizon-client r5234
  fireTargetCaption: string // horizon-client r5663
  setShowSwrReceipt: Dispatch<SetStateAction<boolean>> // horizon-client r962
  isPensioenMode: boolean // horizon-client r2713
  isKernelDepleteRate: boolean // horizon-client r3491
  viewMonthlyWithdrawalAtAow: number | null // horizon-client r5237
  simResult: SimResult | null // horizon-client r1253
  fireSwr: number // horizon-client r672
  openRetirementExpensePane: () => void // horizon-client r951
  retirementMethod: RetirementExpenseMethod // horizon-client r933
  showRetirementExpenseNotice: boolean // horizon-client r5763
  retirementExpenseGuard: HorizonOutcomeGuard // horizon-client r5762
  input: FinancialInput | null // horizon-client r691
  haalbareUitgaveRegel: string | null // horizon-client r5774
  haalbareUitgaveToon: string // horizon-client r5777
}

export function PlanKpiStripDesktop({
  isFixedAnchorMode,
  hasPerspectiveHero,
  setShowFireAgeReceipt,
  heroFireAge,
  heroFireAgePending,
  isPartnerView,
  perspectiveHero,
  showFireAgeNotice,
  showFreeHero,
  freeHeroLabel,
  heroAgeLabel,
  fireAgeNoticeGuard,
  freeHeroPhrase,
  heroFireAgeText,
  heroAgeCaptionBase,
  setShowFireTargetReceipt,
  showFireTargetNotice,
  fireTargetGuard,
  isNuStoppenMode,
  dualDoelRegels,
  viewPerspectiveHeroFireTarget,
  viewVermogenOpAnker,
  viewBalkVrijheidDoel,
  fireTargetCaption,
  setShowSwrReceipt,
  isPensioenMode,
  isKernelDepleteRate,
  viewMonthlyWithdrawalAtAow,
  simResult,
  fireSwr,
  openRetirementExpensePane,
  retirementMethod,
  showRetirementExpenseNotice,
  retirementExpenseGuard,
  input,
  haalbareUitgaveRegel,
  haalbareUitgaveToon,
}: PlanKpiStripDesktopProps) {
  return (
    <>
          {/* Desktop: 4-col figures-strip — editorial blueprint. Onder een vast anker
              valt de Opnamerate-tegel weg (uitgaven ÷ huidig vermogen is daar
              betekenisloos — bevinding 6) en wordt het een 3-koloms strip.

              Breekpunt is `md` (768px), niet `sm` (640px) — B-025. Op 640–767px
              (Surface Duo staand: 696px) gaf vier kolommen ~150px per tegel voor
              een kicker, een icoon en een 32px Playfair-getal: de cijfers liepen
              in elkaar. Die band houdt daarom de 2×2-variant hieronder. */}
          <div className={`hidden md:grid ${isFixedAnchorMode && !hasPerspectiveHero ? 'md:grid-cols-3' : 'md:grid-cols-4'} items-start border-t border-b border-[var(--ink)] mb-5`}>
            {/* KPI 1: Vrijheidsleeftijd / Pensioenleeftijd — winner met highlight-marker */}
            <button
              type="button"
              onClick={() => setShowFireAgeReceipt(true)}
              className="p-4 border-r border-[var(--rule-soft)] last:border-r-0 text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              data-testid="hero-stat-fire-age"
              // Hardheid van het kernantwoord machineleesbaar (C1) — voedt de
              // UAT-controle "3-5x herladen geeft hetzelfde antwoord".
              data-fire-age-status={hasPerspectiveHero ? 'perspectief' : heroFireAge.status}
              aria-busy={!hasPerspectiveHero && heroFireAgePending}
              title={hasPerspectiveHero ? (isPartnerView ? `FIRE-leeftijd van ${perspectiveHero!.householdName}` : 'Gezamenlijke FIRE-leeftijd op basis van gecombineerd vermogen en gedeelde uitgaven') : isFixedAnchorMode ? 'Tot welke leeftijd je liquide vermogen reikt als je op je stopmoment stopt' : undefined}
            >
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1.5">
                <Hourglass className="h-3 w-3 shrink-0" aria-hidden />
                <span>{showFireAgeNotice ? 'Vrijheidsleeftijd' : showFreeHero ? freeHeroLabel : heroAgeLabel}</span>
                <ReceiptCue />
              </div>
              {showFireAgeNotice ? (
                /* UR2-05: geen onderbouwd kernantwoord — dezelfde melding als de
                   Doelbedrag-tegel ernaast, niet een kaal getal of een streepje. */
                <HeroKpiNotice guard={fireAgeNoticeGuard} />
              ) : (
                <>
              <div
                className={`${showFreeHero ? 'text-[18px] sm:text-[20px] leading-tight' : 'text-[28px] sm:text-[32px] leading-none'} font-black tracking-[-0.02em] tabular-nums`}
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                <span
                  className="inline px-1"
                  style={{
                    backgroundImage:
                      'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
                  }}
                >
                  {showFreeHero
                    ? freeHeroPhrase
                    : hasPerspectiveHero
                      ? (perspectiveHero!.fireAge !== null ? Math.round(perspectiveHero!.fireAge) : '–')
                      : heroFireAgeText}
                </span>
              </div>
              <div
                className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {showFreeHero
                  ? ''
                  : hasPerspectiveHero
                    ? (isPartnerView ? `jaar (${perspectiveHero!.householdName})` : 'jaar (huishouden)')
                    : heroFireAgeCaption(heroFireAge, heroAgeCaptionBase)}
              </div>
                </>
              )}
            </button>

            {/* KPI 2: Doelbedrag / Verwacht vermogen op AOW */}
            <button
              type="button"
              onClick={() => setShowFireTargetReceipt(true)}
              className="p-4 border-r border-[var(--rule-soft)] last:border-r-0 text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              data-testid="hero-stat-fire-target"
              title={hasPerspectiveHero ? (isPartnerView ? `FIRE-doelbedrag van ${perspectiveHero!.householdName}` : 'Gezamenlijk FIRE-doelbedrag op basis van gedeelde uitgaven') : isFixedAnchorMode ? 'Geprojecteerd liquide vermogen op je stopmoment' : undefined}
            >
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1.5">
                <Target className="h-3 w-3 shrink-0" aria-hidden />
                <span>{isFixedAnchorMode ? 'Vermogen op je stopmoment' : 'Doelbedrag'}</span>
                <ReceiptCue />
              </div>
              {!hasPerspectiveHero && showFireTargetNotice ? (
                /* M6: onmogelijk/niet-berekenbaar doelbedrag — melding i.p.v. getal. */
                <HeroKpiNotice guard={fireTargetGuard} label={isNuStoppenMode ? 'Geen doelbedrag' : undefined} />
              ) : !hasPerspectiveHero && dualDoelRegels ? (
                <>
                  {/* Het doel op de GRONDSLAG van dit plan — het grote getal; kwalificatie
                      inline zodat de kaart even hoog blijft als de buur-KPI's */}
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <div
                      className="text-[24px] sm:text-[28px] font-black leading-none tracking-[-0.02em]"
                      style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
                    >
                      <MaskedAmount value={dualDoelRegels[0].bedrag} tone="horizon" monoWhenVisible={false} approx />
                    </div>
                    <span
                      className="italic text-[11px] text-[var(--ink-3)]"
                      style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                    >
                      {dualDoelRegels[0].kwalificatie}
                    </span>
                  </div>
                  {/* Het doel op de ándere grondslag — kleiner en lichter, bewust ZONDER
                      module-accent. Een accent is een gebruikersinstelbaar identiteits-
                      token en draagt daarom nooit een grondslag of hiërarchie (besluit
                      19-09-2026). Tot 19-09 viel de tweede regel altijd samen met het
                      liquide doel; sinds de leesvolgorde de grondslag volgt is dat bij
                      Uitsluiten juist het doel MÉT huis, en markeerde de kleur dus niets
                      meer. Hiërarchie loopt nu via grootte + inkt, de grondslag via de
                      kwalificatie-woorden ernaast. */}
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mt-1.5">
                    <div
                      className="text-[16px] sm:text-[18px] font-black leading-none tracking-[-0.02em] text-[var(--ink-2)]"
                      style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
                    >
                      <MaskedAmount value={dualDoelRegels[1].bedrag} tone="horizon" monoWhenVisible={false} approx />
                    </div>
                    <span
                      className="italic text-[11px] text-[var(--ink-3)]"
                      style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                    >
                      {dualDoelRegels[1].kwalificatie}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="text-[24px] sm:text-[28px] font-black leading-none tracking-[-0.02em]"
                    style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
                  >
                    {hasPerspectiveHero
                      ? <MaskedAmount value={viewPerspectiveHeroFireTarget ?? perspectiveHero!.fireTarget} tone="horizon" monoWhenVisible={false} approx />
                      : <MaskedAmount value={isFixedAnchorMode ? (viewVermogenOpAnker ?? 0) : viewBalkVrijheidDoel} tone="horizon" monoWhenVisible={false} approx />}
                  </div>
                  <div
                    className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
                    style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                  >
                    {fireTargetCaption}
                  </div>
                </>
              )}
            </button>

            {/* KPI 3: Opnamerate / Maandelijkse onttrekking — secundaire diepte,
                verborgen in Eenvoudig-modus (hard-hide) én onder een vast anker
                (ADR 0129 F3b, bevinding 6: uitgaven ÷ huidig vermogen zegt daar niets). */}
            {!(isFixedAnchorMode && !hasPerspectiveHero) && (
            <HideInSimple>
            <button
              type="button"
              onClick={() => setShowSwrReceipt(true)}
              className="p-4 border-r border-[var(--rule-soft)] last:border-r-0 text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              data-testid="hero-stat-swr"
            >
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1.5">
                <Percent className="h-3 w-3 shrink-0" aria-hidden />
                <span>{isPensioenMode ? 'Mnd. onttrekking' : isKernelDepleteRate ? 'Onttrekking' : 'Opnamerate'}</span>
                <ReceiptCue />
              </div>
              <div
                className="text-[24px] sm:text-[28px] font-black leading-none tracking-[-0.02em] tabular-nums"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                {isPensioenMode && viewMonthlyWithdrawalAtAow != null
                  ? <MaskedAmount value={Math.round(viewMonthlyWithdrawalAtAow)} tone="horizon" monoWhenVisible={false} />
                  : isKernelDepleteRate
                    ? 'Interen'
                    : simResult?.implicitWithdrawalRate != null
                      ? `${(simResult.implicitWithdrawalRate * 100).toFixed(2)}%`
                      : `${(fireSwr * 100).toFixed(2)}%`}
              </div>
              <div
                className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {isPensioenMode ? 'per maand' : isKernelDepleteRate ? 'je teert op je vermogen — geen vaste opnamerate' : simResult?.implicitWithdrawalRate != null ? 'impliciet' : 'ingesteld'}
              </div>
            </button>
            </HideInSimple>
            )}

            {/* KPI 4: Uitgave na pensioen — linkt naar verdiepingspagina */}
            <button
              type="button"
              onClick={openRetirementExpensePane}
              className="p-4 border-r border-[var(--rule-soft)] last:border-r-0 text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              data-testid="hero-stat-retirement-expense"
              title={
                hasPerspectiveHero
                  ? (isPartnerView
                      ? `Uitgave na pensioen van ${perspectiveHero!.householdName}`
                      : 'Gezamenlijke uitgave na pensioen — pas de methode aan in de huishoud-FIRE-sectie')
                  : retirementMethod === 'custom_amount'
                    ? 'Zelf samengesteld — aanpassen of herzien'
                    : retirementMethod === 'current_income'
                      ? 'Op basis van huidig inkomen — verfijnen'
                      : 'Op basis van essentiële budgetten — verfijnen'
              }
            >
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1.5">
                <Compass className="h-3 w-3 shrink-0" aria-hidden />
                <span>Na pensioen</span>
              </div>
              {showRetirementExpenseNotice ? (
                /* UR2-05: de methode viel terug op de profielschatting en daarna
                   op 0 — dat is geen bestedingspatroon, dus geen bedrag. */
                <HeroKpiNotice guard={retirementExpenseGuard} />
              ) : (
                <>
              <div
                className="text-[24px] sm:text-[28px] font-black leading-none tracking-[-0.02em]"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                <MaskedAmount value={hasPerspectiveHero ? perspectiveHero!.retirementExpense : (input?.yearlyMustExpenses ?? 0)} tone="horizon" monoWhenVisible={false} />
              </div>
              <div
                className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                per jaar
              </div>
              {!hasPerspectiveHero && haalbareUitgaveRegel && (
                <p
                  data-testid="haalbaar-bij-uitgave"
                  className={`mt-1 font-sans text-[11px] leading-snug ${haalbareUitgaveToon}`}
                >
                  {haalbareUitgaveRegel}
                </p>
              )}
                </>
              )}
            </button>
          </div>
    </>
  )
}

/** Blok G — de mobiele 2×2-figures-strip (< md). Staat in de DOM ná blok E/F. */
export interface PlanKpiStripMobielProps {
  setShowFireAgeReceipt: Dispatch<SetStateAction<boolean>> // horizon-client r959
  showFireAgeNotice: boolean // horizon-client r5751
  showFreeHero: boolean // horizon-client r5709
  freeHeroLabel: string // horizon-client r5713
  heroAgeLabelKort: string // horizon-client r5722
  fireAgeNoticeGuard: HorizonOutcomeGuard // horizon-client r5741
  freeHeroPhrase: string // horizon-client r5712
  hasPerspectiveHero: boolean // horizon-client r5633
  perspectiveHero: HouseholdHeroData | null // horizon-client r5632
  heroFireAgeText: string // horizon-client r2873
  heroFireAge: HeroFireAge // horizon-client r2852
  setShowFireTargetReceipt: Dispatch<SetStateAction<boolean>> // horizon-client r960
  isFixedAnchorMode: boolean // horizon-client r2144
  showFireTargetNotice: boolean // horizon-client r2829
  fireTargetGuard: HorizonOutcomeGuard // horizon-client r2820
  isNuStoppenMode: boolean // horizon-client r2716
  dualDoelRegels: [FireDoelPaarRegel, FireDoelPaarRegel] | null // horizon-client r5678
  viewPerspectiveHeroFireTarget: number | null // horizon-client r5636
  viewVermogenOpAnker: number | null // horizon-client r5236
  viewBalkVrijheidDoel: number // horizon-client r5234
  fireTargetCaption: string // horizon-client r5663
  setShowSwrReceipt: Dispatch<SetStateAction<boolean>> // horizon-client r962
  isPensioenMode: boolean // horizon-client r2713
  isKernelDepleteRate: boolean // horizon-client r3491
  viewMonthlyWithdrawalAtAow: number | null // horizon-client r5237
  simResult: SimResult | null // horizon-client r1253
  fireSwr: number // horizon-client r672
  openRetirementExpensePane: () => void // horizon-client r951
  showRetirementExpenseNotice: boolean // horizon-client r5763
  retirementExpenseGuard: HorizonOutcomeGuard // horizon-client r5762
  input: FinancialInput | null // horizon-client r691
  haalbareUitgaveRegel: string | null // horizon-client r5774
  haalbareUitgaveToon: string // horizon-client r5777
}

export function PlanKpiStripMobiel({
  setShowFireAgeReceipt,
  showFireAgeNotice,
  showFreeHero,
  freeHeroLabel,
  heroAgeLabelKort,
  fireAgeNoticeGuard,
  freeHeroPhrase,
  hasPerspectiveHero,
  perspectiveHero,
  heroFireAgeText,
  heroFireAge,
  setShowFireTargetReceipt,
  isFixedAnchorMode,
  showFireTargetNotice,
  fireTargetGuard,
  isNuStoppenMode,
  dualDoelRegels,
  viewPerspectiveHeroFireTarget,
  viewVermogenOpAnker,
  viewBalkVrijheidDoel,
  fireTargetCaption,
  setShowSwrReceipt,
  isPensioenMode,
  isKernelDepleteRate,
  viewMonthlyWithdrawalAtAow,
  simResult,
  fireSwr,
  openRetirementExpensePane,
  showRetirementExpenseNotice,
  retirementExpenseGuard,
  input,
  haalbareUitgaveRegel,
  haalbareUitgaveToon,
}: PlanKpiStripMobielProps) {
  return (
    <>
          {/* Mobiel én smalle tablet (< 768px): 2x2 figures-strip — editorial
              blueprint. Cellen stretchen (géén items-start): de rand tussen de
              cellen moet doorlopen tot de volle rijhoogte, ook als één KPI (dual
              doelbedrag) hoger uitvalt dan zijn buur.
              `md:hidden` i.p.v. `sm:hidden` — zie de noot bij de strip hierboven. */}
          <div className="grid grid-cols-2 md:hidden border-t border-b border-[var(--ink)] mb-5">
            {/* KPI 1: Vrijheidsleeftijd / Pensioenleeftijd — winner */}
            <button
              type="button"
              onClick={() => setShowFireAgeReceipt(true)}
              className="p-3 border-r border-b border-[var(--rule-soft)] text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1">
                <Hourglass className="h-3 w-3 shrink-0" aria-hidden />
                <span>{showFireAgeNotice ? 'Vrijheidslft' : showFreeHero ? freeHeroLabel : heroAgeLabelKort}</span>
                <ReceiptCue />
              </div>
              {showFireAgeNotice ? (
                /* UR2-05 — zie de desktop-tegel. */
                <HeroKpiNotice guard={fireAgeNoticeGuard} compact />
              ) : (
                <>
              <div
                className={`${showFreeHero ? 'text-[15px] leading-tight' : 'text-[22px] leading-none'} font-black tracking-[-0.02em] tabular-nums`}
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                <span
                  className="inline px-1"
                  style={{
                    backgroundImage:
                      'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
                  }}
                >
                  {showFreeHero
                    ? freeHeroPhrase
                    : hasPerspectiveHero
                      ? (perspectiveHero!.fireAge !== null ? Math.round(perspectiveHero!.fireAge) : '–')
                      : heroFireAgeText}
                </span>
              </div>
              <div
                className="italic text-[10px] text-[var(--ink-3)] mt-1"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {showFreeHero ? '' : hasPerspectiveHero ? 'jaar' : heroFireAgeCaption(heroFireAge, 'jaar')}
              </div>
                </>
              )}
            </button>

            {/* KPI 2: Doelbedrag */}
            <button
              type="button"
              onClick={() => setShowFireTargetReceipt(true)}
              className="p-3 border-b border-[var(--rule-soft)] text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1">
                <Target className="h-3 w-3 shrink-0" aria-hidden />
                <span>{isFixedAnchorMode ? 'Vermogen bij stop' : 'Doelbedrag'}</span>
                <ReceiptCue />
              </div>
              {!hasPerspectiveHero && showFireTargetNotice ? (
                /* M6: onmogelijk/niet-berekenbaar doelbedrag — melding i.p.v. getal. */
                <HeroKpiNotice guard={fireTargetGuard} compact label={isNuStoppenMode ? 'Geen doelbedrag' : undefined} />
              ) : !hasPerspectiveHero && dualDoelRegels ? (
                <>
                  {/* Het doel op de GRONDSLAG van dit plan — het grote getal */}
                  <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                    <div
                      className="text-[18px] font-black leading-none tracking-[-0.02em]"
                      style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
                    >
                      <MaskedAmount value={dualDoelRegels[0].bedrag} tone="horizon" monoWhenVisible={false} approx />
                    </div>
                    <span
                      className="italic text-[10px] text-[var(--ink-3)]"
                      style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                    >
                      {dualDoelRegels[0].kwalificatie}
                    </span>
                  </div>
                  {/* Het doel op de ándere grondslag — kleiner en lichter, bewust ZONDER
                      module-accent. Een accent is een gebruikersinstelbaar identiteits-
                      token en draagt daarom nooit een grondslag of hiërarchie (besluit
                      19-09-2026). Tot 19-09 viel de tweede regel altijd samen met het
                      liquide doel; sinds de leesvolgorde de grondslag volgt is dat bij
                      Uitsluiten juist het doel MÉT huis, en markeerde de kleur dus niets
                      meer. Hiërarchie loopt nu via grootte + inkt, de grondslag via de
                      kwalificatie-woorden ernaast. */}
                  <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 mt-1">
                    <div
                      className="text-[13px] font-black leading-none tracking-[-0.02em] text-[var(--ink-2)]"
                      style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
                    >
                      <MaskedAmount value={dualDoelRegels[1].bedrag} tone="horizon" monoWhenVisible={false} approx />
                    </div>
                    <span
                      className="italic text-[10px] text-[var(--ink-3)]"
                      style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                    >
                      {dualDoelRegels[1].kwalificatie}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="text-[18px] font-black leading-none tracking-[-0.02em]"
                    style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
                  >
                    {hasPerspectiveHero
                      ? <MaskedAmount value={viewPerspectiveHeroFireTarget ?? perspectiveHero!.fireTarget} tone="horizon" monoWhenVisible={false} approx />
                      : <MaskedAmount value={isFixedAnchorMode ? (viewVermogenOpAnker ?? 0) : viewBalkVrijheidDoel} tone="horizon" monoWhenVisible={false} approx />}
                  </div>
                  <div
                    className="italic text-[10px] text-[var(--ink-3)] mt-1"
                    style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                  >
                    {fireTargetCaption}
                  </div>
                </>
              )}
            </button>

            {/* KPI 3: Opnamerate — verborgen in Eenvoudig-modus (hard-hide) én onder een
                vast anker (ADR 0129 F3b, bevinding 6). */}
            {!(isFixedAnchorMode && !hasPerspectiveHero) && (
            <HideInSimple>
            <button
              type="button"
              onClick={() => setShowSwrReceipt(true)}
              className="p-3 border-r border-[var(--rule-soft)] text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1">
                <Percent className="h-3 w-3 shrink-0" aria-hidden />
                <span>{isPensioenMode ? 'Mnd.' : isKernelDepleteRate ? 'Onttrekking' : 'Opnamerate'}</span>
                <ReceiptCue />
              </div>
              <div
                className="text-[18px] font-black leading-none tracking-[-0.02em]"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                {isPensioenMode && viewMonthlyWithdrawalAtAow != null
                  ? <MaskedAmount value={Math.round(viewMonthlyWithdrawalAtAow)} tone="horizon" monoWhenVisible={false} />
                  : isKernelDepleteRate
                    ? 'Interen'
                    : simResult?.implicitWithdrawalRate != null
                      ? `${(simResult.implicitWithdrawalRate * 100).toFixed(2)}%`
                      : `${(fireSwr * 100).toFixed(2)}%`}
              </div>
              <div
                className="italic text-[10px] text-[var(--ink-3)] mt-1"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {isPensioenMode ? 'per maand' : isKernelDepleteRate ? 'teert op vermogen' : simResult?.implicitWithdrawalRate != null ? 'impliciet' : 'ingesteld'}
              </div>
            </button>
            </HideInSimple>
            )}

            {/* KPI 4: Uitgave na pensioen — linkt naar verdiepingspagina */}
            <button
              type="button"
              onClick={openRetirementExpensePane}
              className="p-3 text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              data-testid="hero-stat-retirement-expense"
            >
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1">
                <Compass className="h-3 w-3 shrink-0" aria-hidden />
                <span>Na pensioen</span>
              </div>
              {showRetirementExpenseNotice ? (
                /* UR2-05 — zie de desktop-tegel. */
                <HeroKpiNotice guard={retirementExpenseGuard} compact />
              ) : (
                <>
              <div
                className="text-[18px] font-black leading-none tracking-[-0.02em]"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                <MaskedAmount value={hasPerspectiveHero ? perspectiveHero!.retirementExpense : (input?.yearlyMustExpenses ?? 0)} tone="horizon" monoWhenVisible={false} />
              </div>
              <div
                className="italic text-[10px] text-[var(--ink-3)] mt-1"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                per jaar
              </div>
              {!hasPerspectiveHero && haalbareUitgaveRegel && (
                <p
                  data-testid="haalbaar-bij-uitgave"
                  className={`mt-1 font-sans text-[10px] leading-snug ${haalbareUitgaveToon}`}
                >
                  {haalbareUitgaveRegel}
                </p>
              )}
                </>
              )}
            </button>
          </div>
    </>
  )
}
