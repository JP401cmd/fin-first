// Verplaatst uit components/app/horizon/horizon-client.tsx r5924–5952, r5954–6184, r6307–6506 @ c1b4849eb (fase 1, ADR 0179).
// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf
'use client'

/**
 * De KPI-strip van katern Plan (fase 2, ADR 0179 D2/D4, spec §4.3 en §4.9).
 *
 * Eén `FiguresStrip` voor alle breedtes. Tot fase 2 stonden hier drie weergaven van
 * hetzelfde kerngetal: een groot mobiel getal, een desktop-strip en een mobiele 2×2-strip.
 * De vrijheidsleeftijd staat nu precies twee keer per scherm: als tekst in de ankerregel
 * van de kop en als KPI 1 hier, die de kassabon (de exacte waarde) draagt. Geen tweede
 * weergavestijl van hetzelfde getal.
 *
 * - KPI 1: onder `solved` het hele jaar uit `formatHeroFireAge` (via `heroFireAgeText`),
 *   onderschrift "jaar"; onder een vast anker de canonieke "Reikt tot"-tegel
 *   (`ANKER_KPI_LABEL`, onderschrift uit `ankerKpiCaption`). Klik = kassabon.
 * - KPI 2: doelbedrag, of onder een vast anker het vermogen op je stopmoment.
 * - KPI 3: opnamerate — valt weg onder een vast anker (ADR 0129 F3b) en in Eenvoudig.
 * - KPI 4: uitgave na pensioen; klik = de pane.
 *
 * Eenvoudig = twee cellen (Vrijheidsleeftijd en Na pensioen) via `simpleFigures` van de
 * primitive — geen ternary op de modus (ADR 0026). Consume-only: elk getal komt als prop
 * uit de provider of als `view*`-feed van de euro-grens.
 */

import { instellingenRijHref } from '@/lib/toekomst/instellingen-rij'
import type { Dispatch, SetStateAction } from 'react'
import { FiguresStrip, type FigureProps } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import { formatDecimal } from '@/lib/format'
import type { RetirementExpenseMethod } from '@/lib/budget-utils'
import type { SimResult } from '@/lib/fire-simulation'
import type { FinancialInput } from '@/lib/horizon-data'
import type { FireDoelPaarRegel } from '@/lib/horizon/fire-doel-weergave'
import { type HeroFireAge, heroFireAgeCaption } from '@/lib/horizon/hero-fire-age'
import { MARKTCHECK_NIET_BINNEN_PLAN } from '@/lib/horizon/katern-copy'
import type { HorizonOutcomeGuard } from '@/lib/horizon/outcome-guard'
import { heroKpiNoticeDelen, ReceiptCue } from './plan-helpers'
import type { HouseholdHeroData } from '@/components/toekomst/state/types'

/**
 * KPI 1 bij een onbereikbaar plan: de canonieke korte vorm ("niet binnen je plan",
 * kopij-toets §7), met hoofdletter omdat hij hier op de plaats van het getal staat.
 * Zelfde betekenis als de ankerregel-zin in de kop; geen nieuwe tekst.
 */
const NIET_BINNEN_PLAN_KPI =
  MARKTCHECK_NIET_BINNEN_PLAN.charAt(0).toUpperCase() + MARKTCHECK_NIET_BINNEN_PLAN.slice(1)


/** KPI 4 → de rij Uitgave na pensioen in katern Instellingen (ADR 0179 fase 3). */
const UITGAVE_RIJ_HREF = instellingenRijHref('uitgave-na-pensioen')
export interface PlanKpiStripProps {
  isFixedAnchorMode: boolean
  hasPerspectiveHero: boolean
  setShowFireAgeReceipt: Dispatch<SetStateAction<boolean>>
  heroFireAge: HeroFireAge
  heroFireAgePending: boolean
  isPartnerView: boolean
  perspectiveHero: HouseholdHeroData | null
  showFireAgeNotice: boolean
  showFreeHero: boolean
  freeHeroLabel: string
  heroAgeLabel: string
  fireAgeNoticeGuard: HorizonOutcomeGuard
  freeHeroPhrase: string
  /** `formatHeroFireAge` — het hele jaar (precisiebesluit M5); de fractie staat alleen in de kassabon. */
  heroFireAgeText: string
  heroAgeCaptionBase: string
  setShowFireTargetReceipt: Dispatch<SetStateAction<boolean>>
  showFireTargetNotice: boolean
  fireTargetGuard: HorizonOutcomeGuard
  isNuStoppenMode: boolean
  dualDoelRegels: [FireDoelPaarRegel, FireDoelPaarRegel] | null
  viewPerspectiveHeroFireTarget: number | null
  viewVermogenOpAnker: number | null
  viewBalkVrijheidDoel: number
  fireTargetCaption: string
  setShowSwrReceipt: Dispatch<SetStateAction<boolean>>
  isPensioenMode: boolean
  isKernelDepleteRate: boolean
  viewMonthlyWithdrawalAtAow: number | null
  simResult: SimResult | null
  fireSwr: number
  openRetirementExpensePane: () => void
  retirementMethod: RetirementExpenseMethod
  showRetirementExpenseNotice: boolean
  retirementExpenseGuard: HorizonOutcomeGuard
  input: FinancialInput | null
  haalbareUitgaveRegel: string | null
  haalbareUitgaveToon: string
}

/** Kicker met het kassabon-spoor (M5): klein bonnetje rechts, plus sr-only belofte. */
function KickerMetBon({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span>{label}</span>
      <ReceiptCue />
    </span>
  )
}

export function PlanKpiStrip({
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
}: PlanKpiStripProps) {
  // ── KPI 1: Vrijheidsleeftijd / Reikt tot ─────────────────────────────────
  // UR2-05: geen onderbouwd kernantwoord ⇒ dezelfde melding als de Doelbedrag-cel,
  // niet een kaal getal of een streepje.
  const fireAgeNotice = showFireAgeNotice ? heroKpiNoticeDelen(fireAgeNoticeGuard) : null
  // Onder `solved` betekent 'onbekend' dat de kernel klaar is zonder leeftijd: niet
  // haalbaar binnen het plan. Dat is een antwoord, geen lege hand — dus geen streepje
  // met "jaar" en geen markeerblok (dat oogde als een laad-skeleton), maar de canonieke
  // korte vorm van de nul-tak van `ankerVrijZin`. 'berekenen' houdt "···" + aria-busy.
  const onbereikbaar =
    !fireAgeNotice && !showFreeHero && !hasPerspectiveHero && !isFixedAnchorMode && heroFireAge.status === 'onbekend'
  // Zonder getal (streepje) nooit het markeerblok: een gemarkeerd leeg vak leest als laden.
  const zonderGetal = hasPerspectiveHero
    ? perspectiveHero!.fireAge === null
    : heroFireAge.age == null && heroFireAge.status !== 'berekenen'
  const kpiLeeftijd: FigureProps = {
    kicker: <KickerMetBon label={showFireAgeNotice ? 'Vrijheidsleeftijd' : showFreeHero ? freeHeroLabel : heroAgeLabel} />,
    amount: fireAgeNotice
      ? fireAgeNotice.amount
      : showFreeHero
        ? <span className="text-[18px] sm:text-[20px] leading-tight">{freeHeroPhrase}</span>
        : onbereikbaar
          ? <span className="text-[18px] sm:text-[20px] leading-tight">{NIET_BINNEN_PLAN_KPI}</span>
          : hasPerspectiveHero
            ? (perspectiveHero!.fireAge !== null ? Math.round(perspectiveHero!.fireAge) : '–')
            : heroFireAgeText,
    sub: fireAgeNotice
      ? fireAgeNotice.sub
      : showFreeHero || onbereikbaar
        ? undefined
        : hasPerspectiveHero
          ? (isPartnerView ? `jaar (${perspectiveHero!.householdName})` : 'jaar (huishouden)')
          : heroFireAgeCaption(heroFireAge, heroAgeCaptionBase),
    variant: fireAgeNotice || zonderGetal ? 'neutral' : 'winner',
    onClick: () => setShowFireAgeReceipt(true),
    busy: !hasPerspectiveHero && heroFireAgePending,
    title: hasPerspectiveHero
      ? (isPartnerView ? `FIRE-leeftijd van ${perspectiveHero!.householdName}` : 'Gezamenlijke FIRE-leeftijd op basis van gecombineerd vermogen en gedeelde uitgaven')
      : isFixedAnchorMode ? 'Tot welke leeftijd je liquide vermogen reikt als je op je stopmoment stopt' : undefined,
    data: {
      'data-testid': 'hero-stat-fire-age',
      // Hardheid van het kernantwoord machineleesbaar (C1) — voedt de UAT-controle
      // "3-5x herladen geeft hetzelfde antwoord".
      'data-fire-age-status': hasPerspectiveHero ? 'perspectief' : heroFireAge.status,
    },
  }

  // ── KPI 2: Doelbedrag / Vermogen op je stopmoment ────────────────────────
  // M6: onmogelijk/niet-berekenbaar doelbedrag ⇒ melding i.p.v. getal.
  const fireTargetNotice =
    !hasPerspectiveHero && showFireTargetNotice
      ? heroKpiNoticeDelen(fireTargetGuard, isNuStoppenMode ? 'Geen doelbedrag' : undefined)
      : null
  // Het dubbele doel: het grote getal is het doel op de GRONDSLAG van dit plan; het
  // doel op de ándere grondslag staat eronder, kleiner en lichter, bewust ZONDER
  // module-accent (besluit 19-09-2026: een accent draagt nooit een grondslag of
  // hiërarchie). Hiërarchie via grootte en inkt, grondslag via de kwalificatie.
  const toonDubbel = !hasPerspectiveHero && !fireTargetNotice && dualDoelRegels != null
  const kpiDoel: FigureProps = {
    kicker: <KickerMetBon label={isFixedAnchorMode ? 'Vermogen op je stopmoment' : 'Doelbedrag'} />,
    amount: fireTargetNotice
      ? fireTargetNotice.amount
      : toonDubbel && dualDoelRegels
        ? <MaskedAmount value={dualDoelRegels[0].bedrag} tone="horizon" monoWhenVisible={false} approx />
        : hasPerspectiveHero
          ? <MaskedAmount value={viewPerspectiveHeroFireTarget ?? perspectiveHero!.fireTarget} tone="horizon" monoWhenVisible={false} approx />
          : <MaskedAmount value={isFixedAnchorMode ? (viewVermogenOpAnker ?? 0) : viewBalkVrijheidDoel} tone="horizon" monoWhenVisible={false} approx />,
    sub: fireTargetNotice
      ? fireTargetNotice.sub
      : toonDubbel && dualDoelRegels ? dualDoelRegels[0].kwalificatie : fireTargetCaption,
    sub2: toonDubbel && dualDoelRegels ? (
      <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 pt-1 not-italic">
        <span
          className="text-[13px] sm:text-[16px] font-black leading-none tracking-[-0.02em] text-[var(--ink-2)]"
          style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
        >
          <MaskedAmount value={dualDoelRegels[1].bedrag} tone="horizon" monoWhenVisible={false} approx />
        </span>
        <span className="italic">{dualDoelRegels[1].kwalificatie}</span>
      </span>
    ) : undefined,
    onClick: () => setShowFireTargetReceipt(true),
    title: hasPerspectiveHero
      ? (isPartnerView ? `FIRE-doelbedrag van ${perspectiveHero!.householdName}` : 'Gezamenlijk FIRE-doelbedrag op basis van gedeelde uitgaven')
      : isFixedAnchorMode ? 'Geprojecteerd liquide vermogen op je stopmoment' : undefined,
    data: { 'data-testid': 'hero-stat-fire-target' },
  }

  // ── KPI 3: Opnamerate / Onttrekking ──────────────────────────────────────
  const kpiOpname: FigureProps = {
    kicker: <KickerMetBon label={isPensioenMode ? 'Mnd. onttrekking' : isKernelDepleteRate ? 'Onttrekking' : 'Opnamerate'} />,
    amount:
      isPensioenMode && viewMonthlyWithdrawalAtAow != null
        ? <MaskedAmount value={Math.round(viewMonthlyWithdrawalAtAow)} tone="horizon" monoWhenVisible={false} />
        : isKernelDepleteRate
          ? 'Interen'
          : simResult?.implicitWithdrawalRate != null
            ? `${formatDecimal(simResult.implicitWithdrawalRate * 100, 2)}%`
            : `${formatDecimal(fireSwr * 100, 2)}%`,
    sub: isPensioenMode
      ? 'per maand'
      : isKernelDepleteRate
        ? 'je teert op je vermogen — geen vaste opnamerate'
        : simResult?.implicitWithdrawalRate != null ? 'impliciet' : 'ingesteld',
    onClick: () => setShowSwrReceipt(true),
    data: { 'data-testid': 'hero-stat-swr' },
  }

  // ── KPI 4: Na pensioen — linkt naar de rij (persoonlijk) of opent de huishoud-pane ───────────────────────────────────
  // UR2-05: de methode viel terug op de profielschatting en daarna op 0 — dat is geen
  // bestedingspatroon, dus geen bedrag.
  const retirementNotice = showRetirementExpenseNotice ? heroKpiNoticeDelen(retirementExpenseGuard) : null
  const kpiNaPensioen: FigureProps = {
    kicker: 'Na pensioen',
    amount: retirementNotice
      ? retirementNotice.amount
      : <MaskedAmount value={hasPerspectiveHero ? perspectiveHero!.retirementExpense : (input?.yearlyMustExpenses ?? 0)} tone="horizon" monoWhenVisible={false} />,
    sub: retirementNotice ? retirementNotice.sub : 'per jaar',
    sub2:
      !retirementNotice && !hasPerspectiveHero && haalbareUitgaveRegel ? (
        <span
          data-testid="haalbaar-bij-uitgave"
          className={`block font-sans not-italic leading-snug ${haalbareUitgaveToon}`}
        >
          {haalbareUitgaveRegel}
        </span>
      ) : undefined,
    // ADR 0179 fase 3: de persoonlijke uitgave na pensioen is een instelling — de tegel linkt
    // naar zijn rij in Instellingen (één ingang). In de huishoudweergave blijft de klik de
    // gezamenlijke aanpasflow openen (geen persoonlijke instelling).
    ...(hasPerspectiveHero ? { onClick: openRetirementExpensePane } : { href: UITGAVE_RIJ_HREF }),
    title: hasPerspectiveHero
      ? (isPartnerView
          ? `Uitgave na pensioen van ${perspectiveHero!.householdName}`
          : 'Gezamenlijke uitgave na pensioen — pas de methode aan in de huishoud-FIRE-sectie')
      : retirementMethod === 'custom_amount'
        ? 'Zelf samengesteld — aanpassen of herzien'
        : retirementMethod === 'current_income'
          ? 'Op basis van huidig inkomen — verfijnen'
          : 'Op basis van essentiële budgetten — verfijnen',
    data: { 'data-testid': 'hero-stat-retirement-expense' },
  }

  // Onder een vast anker valt de Opnamerate weg (ADR 0129 F3b, bevinding 6: uitgaven ÷
  // huidig vermogen zegt daar niets) — dan drie cellen.
  const zonderOpname = isFixedAnchorMode && !hasPerspectiveHero
  const figures: FigureProps[] = zonderOpname
    ? [kpiLeeftijd, kpiDoel, kpiNaPensioen]
    : [kpiLeeftijd, kpiDoel, kpiOpname, kpiNaPensioen]

  return (
    <FiguresStrip
      cols={zonderOpname ? 3 : 4}
      // B-025: vier kolommen op 640–767px gaf de Playfair-cijfers te weinig ruimte.
      colsFrom="md"
      figures={figures}
      // Eenvoudig (spec §4.7): Vrijheidsleeftijd en Na pensioen.
      simpleFigures={[kpiLeeftijd, kpiNaPensioen]}
      className="mt-0 mb-5"
    />
  )
}
