'use client'

import { memo, useId, useMemo, useState } from 'react'
import Link from 'next/link'
import { formatMaskedApproxCurrency, formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { useEuroView } from '@/lib/hooks/use-euro-view'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { deflate } from '@/lib/euro-display'
import { fireAgeForDisplay, type FreedomFraming } from '@/lib/fire-strategy'
import { formatStopAge } from '@/lib/horizon/anker-copy'
import { computeConfidenceBand } from '@/lib/confidence-band'
import { SubtotalLine } from '@/components/editorial/subtotal-line'
import {
  LEVERAGE_STATUS_DOT,
  LEVERAGE_STATUS_LABEL,
  leverageStatusTextClass,
  type LeverageStatus,
} from '@/lib/leverage-status'
import type { VermogenOpbouw } from './vermogen-kassabon'
import type { HistoryPoint } from './networth-history-sheet'
import { NettoVermogenVenster } from './netto-vermogen-venster'
import { NW_LAYOUT, NW_PLOT, NW_SEAM_LEFT } from './networth-chart-layout'

const { PAD_TOP, FLOOR, PAST_PAD_LEFT, FUTURE_PAD_RIGHT } = NW_PLOT

/**
 * Eén rij geprojecteerd netto vermogen zoals de loader hem levert
 * (`DashboardData.simNetWorthRows`). Lokaal getypeerd met het optionele
 * `netWorthExclHome`: de bundel-type-update loopt via de rekenmotor.
 */
type SimNetWorthRow = {
  age: number
  /** NOMINAAL, al her-ankerd op de loader-grondslag. */
  netWorth: number
  /** Canonieke weergave-deflator van deze kernelrij (jaar 0 = 1.0). */
  inflationFactor?: number
  /**
   * NOMINAAL netto vermogen EXCL. eigen woning op hetzelfde tijdstip en dezelfde
   * grondslag als `netWorth`. Alleen aanwezig bij dubbele grondslag.
   */
  netWorthExclHome?: number
}

/**
 * MiniNetWorthChart — de netto-vermogen-grafiek op /overzicht, in twee kaarten.
 *
 * Bron-van-waarheid: dezelfde simulatie als /toekomst, als geprojecteerd
 * VOLLEDIG netto vermogen (`simNetWorthRows` uit de loader): FIRE-portefeuille
 * plús meegroeiende niet-liquide assets. Geen eigen groei-rate — de loader is
 * de enige bron.
 *
 * Opbouw (zie `networth-chart-layout.ts` voor het grid en de naad):
 *  - VERLEDEN-kaart (links): kicker "Netto vermogen", het exacte kopgetal, de
 *    excl.-eigen-woning-regel, en het verleden-deel van de lijn (eigen
 *    maand-schaal, minimaal 3 en maximaal 12 maanden). De hele kaart is één
 *    `<button>` die `NettoVermogenVenster` opent: opbouw + verloop in één venster.
 *  - TOEKOMST-kaart (rechts): de kop volgt het plan ("Vrij op", "Pensioen op",
 *    "Stoppen op", of de bereikt-kop), de bedragen op de knip-leeftijd, onder een
 *    vast stopanker de dekking van het plan, en het projectie-deel met band en
 *    eindmarker. De hele kaart is één `<Link href="/toekomst">`.
 *  - lg+: twee aparte kaarten (1 + 2 kolommen), de lijn loopt over de gap door;
 *    <lg: één kaart met de naad op 1/3.
 *
 * De twee grafiekdelen zijn aparte svg's met `preserveAspectRatio="none"` en
 * een 0..100-viewBox; de Y-schaal is gedeeld. Stippen en labels zijn HTML
 * (geen vervormde cirkels of tekst), lijnen dragen `non-scaling-stroke`.
 */
function MiniNetWorthChartComponent({
  netWorthHistory,
  currentNetWorth,
  currentAge,
  fireAge,
  endAge,
  isPensioenMode,
  stopAnchorFixed = false,
  stopAge = null,
  framing,
  simNetWorthRows,
  monthlySavings,
  netWorthExclHome,
  showExclHome = false,
  vermogenOpbouw = null,
  eigenHuisValue = null,
  mortgageBalance = null,
  dailyExpense,
  planCoveragePct = null,
  planStatus = 'neutral',
}: {
  netWorthHistory: { month: string; value: number }[]
  currentNetWorth: number
  currentAge: number | null
  fireAge: number | null
  endAge: number | null
  isPensioenMode?: boolean
  /**
   * ADR 0129 F3b — het stopmoment ligt VAST (aow/now/age). De knip ligt dan op het
   * STOPMOMENT (`stopAge`), de kop heet "Stoppen op", en "bereikt" staat er
   * alleen als `framing === 'free'` (anker bereikt ∧ dekking ≥ 100, D8) — nooit
   * omdat de kernel-`fireAge` (= het anker) toevallig ≤ de huidige leeftijd is.
   */
  stopAnchorFixed?: boolean
  stopAge?: number | null
  framing?: FreedomFraming
  /**
   * Per-jaar geprojecteerd VOLLEDIG netto vermogen uit de loader. Afwezig (sim
   * mislukt op server) → empty-state-CTA.
   *
   * GRONDSLAG (ADR 0090): `netWorth` (en `netWorthExclHome`) is NOMINAAL;
   * `inflationFactor` is de canonieke weergave-deflator van diezelfde kernelrij.
   * OPTIONEEL — consumeer met `?? 1`, nooit met een zelfberekende `Math.pow`.
   */
  simNetWorthRows?: SimNetWorthRow[] | null
  /**
   * Het liquide vrijheidsdoel. Wordt sinds de tweedeling NIET meer op deze kaart
   * getoond (het staat op /toekomst); de prop blijft bestaan zodat de loader-
   * aanroep en oudere bundels ongewijzigd compileren.
   */
  simRequiredPortfolio?: number | null
  /**
   * Geschatte maandelijkse vermogensgroei (spaarritme) — voor de back-cast van
   * ontbrekende historie-maanden. Null/undefined → vlak geschat verloop.
   */
  monthlySavings?: number | null
  /**
   * Nettovermogen EXCL. eigen woning VANDAAG (`horizonData.netWorthExclHome` —
   * perspectief-correct, niet zelf herrekenen). Subregel onder het kopgetal.
   */
  netWorthExclHome?: number | null
  /** Gate voor de excl.-grondslag ⇔ `horizonData.showDualHousingBasis`. */
  showExclHome?: boolean
  /**
   * De twee termen achter `currentNetWorth` — voedt de kassabon in het
   * samengevoegde venster (UR3-14 deel D). Afwezig → alleen het verloop.
   */
  vermogenOpbouw?: VermogenOpbouw | null
  /** `housingSplit.eigenHuisValue` — regel in de kassabon bij `showExclHome`. */
  eigenHuisValue?: number | null
  /** `housingSplit.mortgageBalance` — regel in de kassabon bij `showExclHome`. */
  mortgageBalance?: number | null
  /** Canoniek dagtarief (EUR/dag) uit de bundel. Nooit lokaal herrekenen. */
  dailyExpense?: number
  /**
   * De dekking van het plan in procenten onder een VAST stopanker — het
   * canonieke `freedomPct` uit de horizon-bundel, dat de loader onder een vast
   * anker als tijdsdekking bepaalt (ADR 0129/0145). CONSUME: geen eigen deling.
   * `null` onder `solved` (dan is het een kapitaalratio, geen dekking).
   */
  planCoveragePct?: number | null
  /**
   * Het plan-stoplicht (`resolvePlanStatus` in de loader) — dezelfde regel als de
   * vrijheidsbanner. Voedt het statuspunt naast "Je plan" en de kleur van het
   * oordeel. `neutral` = geen oordeel → geen punt.
   */
  planStatus?: LeverageStatus
}) {
  // Hooks vóór elke early-return (rules-of-hooks).
  const { masked } = useMaskedAmounts()
  // Euro-weergave: 'nominal' (= exact het huidige beeld) of 'real'.
  const { view: euroView } = useEuroView()
  // Weergavemodus — enige leespad is useDisplayMode() (SSoT). In 'simple'
  // versobert alleen de legenda en de kop-staart; de grafiek blijft gelijk.
  const { mode: displayMode } = useDisplayMode()
  const simple = displayMode === 'simple'
  const [vensterOpen, setVensterOpen] = useState(false)
  const baseId = useId()
  const ids = {
    gradient: `${baseId}-grad`,
    pastKicker: `${baseId}-past-kicker`,
    pastAmount: `${baseId}-past-amount`,
    pastExcl: `${baseId}-past-excl`,
    pastAction: `${baseId}-past-action`,
    futureKop: `${baseId}-future-kop`,
    futureAmounts: `${baseId}-future-amounts`,
    futureCoverage: `${baseId}-future-coverage`,
    futureStatus: `${baseId}-future-status`,
    futureAction: `${baseId}-future-action`,
  }

  // ── Geometrie in één memo op de data-inputs ──────────────────────
  // Puur t.o.v. de data-props; hangt NIET af van `masked`. `new Date()` in
  // `isoMonthBack` bevriest bewust "deze maand" per mount.
  const geometry = useMemo(() => {
    // ADR 0129 — onder een vast anker knipt de weergave op het STOPMOMENT en is
    // "bereikt" een gate (framing 'free'), geen leeftijdsvergelijking.
    const knipAge =
      stopAnchorFixed && stopAge != null && Number.isFinite(stopAge) ? stopAge : fireAge
    const fireReached = stopAnchorFixed
      ? framing === 'free'
      : knipAge != null && currentAge != null && knipAge <= currentAge
    // Weergave-grens via dezelfde seam als /toekomst (`fireAgeForDisplay`);
    // `fireReached` blijft op de rauwe waarde (drempel, zie fire-strategy.ts).
    const fireAgeCutoff = fireAgeForDisplay(knipAge)
    // Knipt de weergave op het vrijheids-/stopmoment zelf, of loopt ze door tot
    // de eindleeftijd (knip ≤ vandaag, bv. nu-stoppen)?
    const cutAtKnip = fireAgeCutoff != null && currentAge != null && fireAgeCutoff > currentAge
    const projectionEndAge =
      cutAtKnip
        ? fireAgeCutoff
        : endAge != null && currentAge != null && endAge > currentAge
          ? endAge
          : null

    if (
      currentAge == null ||
      projectionEndAge == null ||
      !simNetWorthRows ||
      simNetWorthRows.length === 0
    ) {
      return null
    }

    const startAge: number = currentAge
    const finalAge: number = projectionEndAge

    // Her-ankeren op de getoonde `currentNetWorth` met een vlakke euro-offset,
    // zodat de lijn zichtbaar naadloos doorloopt vanuit het Vandaag-punt.
    // Consume, don't recompute: dit verschuift de reeks, het herberekent niets.
    const projRowsInRange = simNetWorthRows.filter(
      (r) => r.age >= startAge && r.age <= finalAge,
    )
    const anchorOffset =
      projRowsInRange.length > 0 ? currentNetWorth - projRowsInRange[0].netWorth : 0
    // ── EURO-WEERGAVE — D7-volgorde (hard) ───────────────────────────────────
    // Eerst her-ankeren in NOMINALE ruimte, DAARNA pas delen door de rij-eigen
    // kernelfactor. Jaar 0 draagt factor 1.0 → het eerste projectiepunt valt in
    // beide views exact samen met het Vandaag-punt (naad zonder knik).
    const projection: { age: number; value: number }[] = [
      // euro-view: exempt — het Vandaag-punt is GEREALISEERD vermogen (D12).
      { age: startAge, value: currentNetWorth },
      ...projRowsInRange.map((r) => ({
        age: r.age,
        value: deflate(r.netWorth + anchorOffset, r.inflationFactor ?? 1, euroView),
      })),
    ]
    const seen = new Set<number>()
    const dedupedProjection = projection.filter((p) => {
      if (seen.has(p.age)) return false
      seen.add(p.age)
      return true
    })

    // Zonder projectierijen in het venster is er GEEN eindstand (5f, nazorg
    // R2+R3): bedragen en eindmarker hangen aan `hasProjection`.
    const hasProjection = projRowsInRange.length > 0
    const endValue =
      dedupedProjection[dedupedProjection.length - 1]?.value ?? currentNetWorth
    // Excl.-eigen-woning op dezelfde knip-rij. ZELFDE D7-volgorde als hierboven:
    // dezelfde nominale `anchorOffset` erbij, daarna pas de rij-factor. Geen
    // eigen overwaarde-aftrek — het veld komt uit de rekenmotor. Alleen voor een
    // échte projectierij (niet het Vandaag-punt).
    const lastRow = projRowsInRange[projRowsInRange.length - 1]
    const endValueExclHome =
      showExclHome && lastRow != null && lastRow.age > startAge && lastRow.netWorthExclHome != null
        ? deflate(lastRow.netWorthExclHome + anchorOffset, lastRow.inflationFactor ?? 1, euroView)
        : null
    const endLabel = stopAnchorFixed ? 'Stop' : isPensioenMode ? 'Pensioen' : 'Vrijheid'

    // ── Historie: minimaal 3 maanden ─────────────────────────────────
    // euro-view: exempt — alles links van Vandaag is GEREALISEERD vermogen; er
    // is geen kernelrij en dus geen canonieke deflator voor het verleden (D12).
    const MIN_HISTORY_MONTHS = 3
    const byMonth = new Map<string, { month: string; value: number }>()
    for (const h of netWorthHistory) {
      byMonth.set(h.month.slice(0, 7), h)
    }
    const realHistory = [...byMonth.values()].slice(-12)
    const savingsPerMonth = monthlySavings ?? 0

    function isoMonthBack(monthsBack: number): string {
      const d = new Date()
      d.setDate(1)
      d.setMonth(d.getMonth() - monthsBack)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }

    const historyPoints: (HistoryPoint & { monthsBack: number })[] =
      realHistory.map((h, i) => ({
        month: h.month,
        value: h.value,
        monthsBack: realHistory.length - i,
      }))
    if (historyPoints.length < MIN_HISTORY_MONTHS) {
      const anchorValue = historyPoints[0]?.value ?? currentNetWorth
      const anchorMonthsBack = historyPoints[0]?.monthsBack ?? 0
      const estimated: (HistoryPoint & { monthsBack: number })[] = []
      for (let mb = MIN_HISTORY_MONTHS; mb > anchorMonthsBack; mb--) {
        estimated.push({
          month: isoMonthBack(mb),
          value: anchorValue - savingsPerMonth * (mb - anchorMonthsBack),
          monthsBack: mb,
          estimated: true,
        })
      }
      historyPoints.unshift(...estimated)
    }
    const hasEstimatedHistory = historyPoints.some((p) => p.estimated)
    const HISTORY_WINDOW_MONTHS = Math.max(1, historyPoints[0]?.monthsBack ?? 1)

    // Onzekerheid als smalle P40–P60-band rond de projectie (σ×√t).
    const bandPoints = computeConfidenceBand(
      dedupedProjection.map((p) => ({ age: p.age, endPortfolio: p.value })),
    )

    // ── GEDEELDE Y-schaal (beide grafiekdelen) ───────────────────────
    // Ingezoomd op het databereik (eigenaarswens 15 sep 2026): de as begint
    // NIET op 0. Laagste → hoogste punt (incl. de band), met 12% marge van het
    // bereik aan beide kanten. Er staan geen y-waarden in beeld, dus de zoom
    // misleidt niet met een afgekapte schaal. Vlak verloop (bereik ≈ 0) krijgt
    // een minimumbereik van 5% van de piek, zodat ruis niet opgeblazen wordt.
    const allValues = [
      ...historyPoints.map((h) => h.value),
      ...dedupedProjection.map((p) => p.value),
      ...bandPoints.flatMap((b) => [b.high, b.low]),
      endValue,
      currentNetWorth,
    ]
    const dataPeak = Math.max(...allValues)
    const dataFloor = Math.min(...allValues)
    const span = Math.max(dataPeak - dataFloor, Math.abs(dataPeak) * 0.05, 1)
    const maxValue = dataPeak + span * 0.12
    const minValue = dataFloor - span * 0.12
    // Klem binnen [minValue, maxValue] — vangnet zodat lijnen het frame niet verlaten.
    function valueToY(v: number) {
      const clamped = Math.min(Math.max(v, minValue), maxValue)
      return PAD_TOP + (FLOOR - PAD_TOP) * (1 - (clamped - minValue) / (maxValue - minValue))
    }

    // ── X: twee svg's, elk 0..100 ────────────────────────────────────
    // Verleden: oudste punt op PAST_PAD_LEFT, Vandaag op 100 (de naad).
    function monthsBackToX(monthsBack: number) {
      const capped = Math.min(monthsBack, HISTORY_WINDOW_MONTHS)
      const fraction = 1 - capped / HISTORY_WINDOW_MONTHS
      return PAST_PAD_LEFT + fraction * (100 - PAST_PAD_LEFT)
    }
    // Toekomst: Vandaag op 0 (de naad), finalAge op 100 − FUTURE_PAD_RIGHT.
    const projYears = Math.max(1, finalAge - startAge)
    function ageToX(age: number) {
      return ((age - startAge) / projYears) * (100 - FUTURE_PAD_RIGHT)
    }

    const todayY = valueToY(currentNetWorth)
    const histPts = [
      ...historyPoints.map((h) => ({
        x: monthsBackToX(h.monthsBack),
        y: valueToY(h.value),
        estimated: h.estimated === true,
      })),
      { x: 100, y: todayY, estimated: false },
    ]
    const toPath = (pts: { x: number; y: number }[]) =>
      pts.length >= 2
        ? pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
        : ''
    // Geschat-prefix en echt-suffix; het grenspunt hoort bij beide paden.
    const firstRealIdx = histPts.findIndex((p) => !p.estimated)
    const estHistPath = firstRealIdx > 0 ? toPath(histPts.slice(0, firstRealIdx + 1)) : ''
    const realHistPath = firstRealIdx >= 0 ? toPath(histPts.slice(firstRealIdx)) : ''
    const histAreaPath =
      histPts.length >= 2
        ? `${toPath(histPts)} L100,${FLOOR} L${histPts[0].x.toFixed(1)},${FLOOR} Z`
        : ''

    const projPts = dedupedProjection.map((p) => ({ x: ageToX(p.age), y: valueToY(p.value) }))
    const projPath = projPts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ')
    const lastProjX = (projPts[projPts.length - 1]?.x ?? ageToX(finalAge)).toFixed(1)
    const projAreaPath =
      projPts.length >= 2 ? `${projPath} L${lastProjX},${FLOOR} L0,${FLOOR} Z` : ''
    const bandPath =
      bandPoints.length >= 2
        ? [
            ...bandPoints.map(
              (p, i) =>
                `${i === 0 ? 'M' : 'L'}${ageToX(p.age).toFixed(1)},${valueToY(p.high).toFixed(1)}`,
            ),
            ...[...bandPoints].reverse().map(
              (p) => `L${ageToX(p.age).toFixed(1)},${valueToY(p.low).toFixed(1)}`,
            ),
            'Z',
          ].join(' ')
        : ''

    const finalAgeLabel = Math.round(finalAge)
    // Loopt de weergave door tot de eindleeftijd (bereikt, of nu-stoppen waar de
    // knip ≤ vandaag ligt), dan is het eindpunt geen stop-/vrijheidsmoment maar
    // "Tot {eindleeftijd}" — anders zegt de marker "Stop 90" onder "Stoppen op 47".
    const endMarkerText =
      fireReached || !cutAtKnip ? `Tot ${finalAgeLabel}` : `${endLabel} ${finalAgeLabel}`

    // Leeftijds-ticks (stap 5 of 10 jaar). Posities zijn PERCENTAGES van het
    // toekomst-deel; ticks te dicht bij Vandaag of de eindmarker vervallen.
    // Korte horizon (bv. 46 → 48) krijgt fijnere stappen, anders valt er niets
    // tussen Vandaag en het eind. De eindleeftijd zelf staat altijd rechtsonder.
    const ageTickStep = projYears > 20 ? 10 : projYears > 10 ? 5 : projYears > 4 ? 2 : 1
    const ageTicks: { age: number; x: number }[] = []
    for (
      let a = Math.ceil((startAge + 1) / ageTickStep) * ageTickStep;
      a < finalAge;
      a += ageTickStep
    ) {
      const x = ageToX(a)
      if (x < 16 || x > 82) continue
      ageTicks.push({ age: a, x })
    }

    // Maand-ticks op het verleden-deel (lg: eigen as per kaart). Stap 1 bij een
    // kort venster, anders 3; ticks tegen "−N mnd" of "nu" aan vervallen.
    const monthTickStep = HISTORY_WINDOW_MONTHS > 6 ? 3 : 1
    const monthTicks: { monthsBack: number; x: number }[] = []
    for (let mb = monthTickStep; mb < HISTORY_WINDOW_MONTHS; mb += monthTickStep) {
      const x = monthsBackToX(mb)
      if (x < 18 || x > 86) continue
      monthTicks.push({ monthsBack: mb, x })
    }

    return {
      fireReached,
      cutAtKnip,
      startAge,
      finalAge,
      endValue,
      endValueExclHome,
      hasProjection,
      endLabel,
      finalAgeLabel,
      endMarkerText,
      historyPoints,
      hasEstimatedHistory,
      HISTORY_WINDOW_MONTHS,
      todayY,
      endX: ageToX(finalAge),
      endY: valueToY(endValue),
      ageTicks,
      monthTicks,
      estHistPath,
      realHistPath,
      histAreaPath,
      projPath,
      projAreaPath,
      bandPath,
    }
  }, [
    netWorthHistory,
    currentNetWorth,
    currentAge,
    fireAge,
    endAge,
    isPensioenMode,
    stopAnchorFixed,
    stopAge,
    framing,
    simNetWorthRows,
    monthlySavings,
    showExclHome,
    euroView,
  ])

  if (geometry === null) {
    return (
      <Link
        href="/toekomst"
        className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-4 sm:p-6 text-center hover:border-horizon-300 transition-colors min-h-[140px] h-full"
      >
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Vermogen door de tijd
        </div>
        <p className="mt-2 text-sm text-[var(--ink-2)]">
          Vul je profiel aan om je vermogensgroei tot{' '}
          {isPensioenMode ? 'pensioen' : 'vrijheid'} te zien.
        </p>
        <span className="mt-3 text-xs font-semibold text-horizon-700">
          Bekijk projectie →
        </span>
      </Link>
    )
  }

  const {
    fireReached,
    cutAtKnip,
    startAge,
    endValue,
    endValueExclHome,
    hasProjection,
    endLabel,
    finalAgeLabel,
    endMarkerText,
    historyPoints,
    hasEstimatedHistory,
    HISTORY_WINDOW_MONTHS,
    todayY,
    endX,
    endY,
    ageTicks,
    monthTicks,
    estHistPath,
    realHistPath,
    histAreaPath,
    projPath,
    projAreaPath,
    bandPath,
  } = geometry

  // ── Toekomst-kop: volgt het plan (read-only) ─────────────────────
  // De leeftijd in de kop: onder een vast anker het STOPMOMENT zelf (AOW kan
  // fractioneel zijn → `formatStopAge`), anders de afgeronde knip-leeftijd.
  const kopLeeftijd =
    stopAnchorFixed && stopAge != null && Number.isFinite(stopAge)
      ? formatStopAge(stopAge)
      : String(finalAgeLabel)
  // OVZ-4: in Eenvoudig vervalt de staart "— verloop tot 90".
  const toekomstKop = fireReached
    ? stopAnchorFixed
      ? simple
        ? 'Plan gedekt'
        : `Plan gedekt — verloop tot ${finalAgeLabel}`
      : simple
        ? `${endLabel} bereikt`
        : `${endLabel} bereikt — verloop tot ${finalAgeLabel}`
    : isPensioenMode
      ? `Pensioen op ${kopLeeftijd}`
      : stopAnchorFixed
        ? `Stoppen op ${kopLeeftijd}`
        : `Vrij op ${kopLeeftijd}`

  // Bedragen op de knip-leeftijd — alleen vóór "bereikt" en mét projectie, net
  // als de vroegere "Vermogen bij …"-kop. M5: prognose → "ca." + afgerond.
  // Ligt de knip-rij níét op de kop-leeftijd (nu-stoppen: de weergave loopt dan
  // door tot de eindleeftijd), dan zegt de regel op welke leeftijd het bedrag hoort.
  const toonBedragen = !fireReached && hasProjection
  const dubbeleGrondslag = showExclHome && endValueExclHome != null
  const bedragLeeftijd = cutAtKnip ? '' : ` op ${finalAgeLabel}`
  // Dekking van het plan onder een vast stopanker — geconsumeerd uit de bundel.
  const toonDekking =
    stopAnchorFixed && !fireReached && planCoveragePct != null && Number.isFinite(planCoveragePct)
  // Zo vroeg mogelijk zonder haalbaar stopmoment: dat is het rode oordeel, en het
  // hoort als tekst op de kaart — de kleur alleen draagt geen betekenis.
  const toonOnhaalbaar = !stopAnchorFixed && !fireReached && planStatus === 'bad'
  const toonStatus = planStatus !== 'neutral'
  const oordeelKleur = toonStatus ? leverageStatusTextClass(planStatus) : 'text-[var(--ink-3)]'

  const actionLabel = fireReached ? 'Bekijk afbouw →' : 'Bekijk projectie →'

  const pastLabelledBy = [
    ids.pastKicker,
    ids.pastAmount,
    showExclHome && netWorthExclHome != null ? ids.pastExcl : null,
    ids.pastAction,
  ]
    .filter(Boolean)
    .join(' ')
  const futureLabelledBy = [
    ids.futureKop,
    toonBedragen ? ids.futureAmounts : null,
    toonDekking || toonOnhaalbaar ? ids.futureCoverage : null,
    // Geen zichtbaar oordeel (bv. solved én haalbaar) → het sr-only-statuswoord.
    toonStatus && !toonDekking && !toonOnhaalbaar ? ids.futureStatus : null,
    ids.futureAction,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={NW_LAYOUT.wrapper}>
      {/* Sectiekop voor schermlezers — de twee kaarten zijn één onderwerp. */}
      <h3 className="sr-only">Netto vermogen door de tijd</h3>

      {/* ── Klikdoel 1: VERLEDEN — hele kaart (lg) / tik-zone (mobiel) ── */}
      {/* De toegankelijke naam komt uit de zichtbare tekst (kicker + bedrag +
          excl.-regel) via aria-labelledby, plus een sr-only actie: een
          aria-label zou het bedrag bij de schermlezer weghalen. */}
      <button
        type="button"
        onClick={() => setVensterOpen(true)}
        aria-labelledby={pastLabelledBy}
        data-testid="nw-kaart-verleden"
        className={`${NW_LAYOUT.pastFrame} ${NW_LAYOUT.frameInteractive}`}
      >
        <span id={ids.pastAction} className="sr-only">
          , bekijk de opbouw en het verloop van je netto vermogen
        </span>
      </button>

      {/* ── Klikdoel 2: TOEKOMST — hele kaart (lg) / tik-zone (mobiel) ── */}
      <Link
        href="/toekomst"
        aria-labelledby={futureLabelledBy}
        data-testid="nw-kaart-toekomst"
        className={`${NW_LAYOUT.futureFrame} ${NW_LAYOUT.frameInteractive}`}
      >
        <span id={ids.futureAction} className="sr-only">
          , bekijk je volledige projectie op Toekomst
        </span>
      </Link>

      {/* ── Tekst verleden ── (aria-hidden: de knop draagt deze tekst als naam) */}
      <div className={NW_LAYOUT.pastText} aria-hidden="true">
        <div className="flex items-baseline justify-between gap-2">
          <span id={ids.pastKicker} className={NW_LAYOUT.kicker}>
            Netto vermogen
          </span>
          <span className="text-[11px] font-semibold text-[var(--module-active-700)] whitespace-nowrap">
            Opbouw →
          </span>
        </div>
        <div
          id={ids.pastAmount}
          className="mt-1 font-serif text-xl font-semibold text-[var(--ink)] tabular-nums"
        >
          {formatMaskedCurrency(currentNetWorth, masked)}
        </div>
        {showExclHome && netWorthExclHome != null && (
          <div id={ids.pastExcl}>
            <SubtotalLine
              label="excl. eigen woning"
              amount={netWorthExclHome}
              className="!mt-1 !mb-0"
            />
          </div>
        )}
      </div>

      {/* ── Tekst toekomst ── */}
      <div className={NW_LAYOUT.futureText} aria-hidden="true">
        <div className="flex items-baseline justify-between gap-2">
          <span className="inline-flex items-center gap-1.5">
            <span className={NW_LAYOUT.kicker}>Je plan</span>
            {/* Status-punt: decoratief, zoals op de hefboomkaarten. De drager is
                het zichtbare oordeel (dekking/onhaalbaar) of de sr-only-regel. */}
            {toonStatus && (
              <span
                data-testid="nw-toekomst-status"
                data-status={planStatus}
                className={`h-2 w-2 shrink-0 rounded-full ${LEVERAGE_STATUS_DOT[planStatus]}`}
                title={LEVERAGE_STATUS_LABEL[planStatus]}
              />
            )}
          </span>
          <span className="text-[11px] font-semibold text-horizon-700 whitespace-nowrap">
            {actionLabel}
          </span>
        </div>
        <div
          id={ids.futureKop}
          className="mt-1 font-serif text-lg sm:text-xl font-semibold text-[var(--ink)]"
        >
          {toekomstKop}
        </div>
        <div className={NW_LAYOUT.futureMeta}>
        {toonBedragen && (
          <div
            id={ids.futureAmounts}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-[var(--ink-2)]"
          >
            <span data-testid="nw-toekomst-incl" className="font-mono tabular-nums">
              {formatMaskedApproxCurrency(endValue, masked)}
              {dubbeleGrondslag ? ' incl. woning' : ''}
              {bedragLeeftijd}
            </span>
            {dubbeleGrondslag && endValueExclHome != null && (
              <span data-testid="nw-toekomst-excl" className="font-mono tabular-nums">
                {formatMaskedApproxCurrency(endValueExclHome, masked)} excl. woning
                {bedragLeeftijd}
              </span>
            )}
          </div>
        )}
        {!fireReached && !hasProjection && (
          <div className="text-xs text-[var(--ink-3)]">Nog geen projectie</div>
        )}
        {toonDekking && planCoveragePct != null && (
          <div
            id={ids.futureCoverage}
            data-testid="nw-toekomst-dekking"
            className={`mt-0.5 text-xs ${oordeelKleur}`}
          >
            dekt {Math.round(planCoveragePct)}% van je plan
          </div>
        )}
        {toonOnhaalbaar && (
          <div
            id={ids.futureCoverage}
            data-testid="nw-toekomst-onhaalbaar"
            className={`mt-0.5 text-xs ${oordeelKleur}`}
          >
            niet haalbaar binnen je horizon
          </div>
        )}
        {toonStatus && !toonDekking && !toonOnhaalbaar && (
          <span id={ids.futureStatus} className="sr-only">
            , {LEVERAGE_STATUS_LABEL[planStatus]}
          </span>
        )}
        </div>
      </div>

      {/* ── Grafiekdeel verleden ── */}
      <div className={NW_LAYOUT.pastPlot} aria-hidden="true" data-nw-plot="verleden">
        <div className={NW_LAYOUT.drawing}>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
          >
            <defs>
              <linearGradient id={`${ids.gradient}-hist`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--ink-3, #6b7280)" stopOpacity="0.10" />
                <stop offset="100%" stopColor="var(--ink-3, #6b7280)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {histAreaPath && (
              <path d={histAreaPath} fill={`url(#${ids.gradient}-hist)`} stroke="none" />
            )}
            <line
              x1={PAST_PAD_LEFT}
              y1={FLOOR}
              x2={100}
              y2={FLOOR}
              stroke="var(--ink-4)"
              strokeWidth="0.5"
              opacity="0.35"
              vectorEffect="non-scaling-stroke"
            />
            {/* Geschat historie-segment — lichtere stippellijn (back-cast op
                spaarritme, geen echte waardering) */}
            {estHistPath && (
              <path
                d={estHistPath}
                data-nw-line="verleden-geschat"
                fill="none"
                stroke="var(--ink-4)"
                strokeWidth="2"
                strokeDasharray="3 4"
                strokeLinecap="round"
                opacity="0.8"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {/* Echte historie — stippellijn terug in de tijd */}
            {realHistPath && (
              <path
                d={realHistPath}
                data-nw-line="verleden"
                fill="none"
                stroke="var(--module-active-700)"
                strokeWidth="2"
                strokeDasharray="3 3"
                strokeLinecap="round"
                opacity="0.7"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {monthTicks.map(({ monthsBack, x }) => (
              <line
                key={monthsBack}
                className="hidden lg:inline"
                x1={x}
                y1={FLOOR}
                x2={x}
                y2={100}
                stroke="var(--ink-4)"
                strokeWidth="0.5"
                opacity="0.6"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        </div>
        <span
          className="absolute bottom-0 font-mono text-[9px] leading-none text-[var(--ink-4)] whitespace-nowrap"
          style={{ left: `${PAST_PAD_LEFT}%` }}
        >
          −{HISTORY_WINDOW_MONTHS} mnd
        </span>
        {/* Maand-ticks + "nu" — alleen op lg, waar deze kaart los te lezen is.
            Op mobiel is het deel 1/3 breed en draagt de naad het Vandaag-label. */}
        {monthTicks.map(({ monthsBack, x }) => (
          <span
            key={monthsBack}
            className="absolute bottom-0 hidden -translate-x-1/2 font-mono text-[9px] leading-none text-[var(--ink-4)] lg:block"
            style={{ left: `${x.toFixed(1)}%` }}
          >
            −{monthsBack}
          </span>
        ))}
        <span
          data-testid="nw-as-nu-verleden"
          className="absolute bottom-0 right-3 hidden font-mono text-[9px] leading-none text-[var(--ink-3)] whitespace-nowrap lg:block"
        >
          nu
        </span>
      </div>

      {/* ── Grafiekdeel toekomst ── */}
      <div className={NW_LAYOUT.futurePlot} aria-hidden="true" data-nw-plot="toekomst">
        <div className={NW_LAYOUT.drawing}>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
          >
            <defs>
              <linearGradient id={`${ids.gradient}-proj`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--module-active-500)" stopOpacity="0.16" />
                <stop offset="100%" stopColor="var(--module-active-500)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {projAreaPath && (
              <path d={projAreaPath} fill={`url(#${ids.gradient}-proj)`} stroke="none" />
            )}
            <line
              x1={0}
              y1={FLOOR}
              x2={100 - FUTURE_PAD_RIGHT}
              y2={FLOOR}
              stroke="var(--ink-4)"
              strokeWidth="0.5"
              opacity="0.35"
              vectorEffect="non-scaling-stroke"
            />
            {/* Onzekerheidsband P40–P60 — de Y-schaal neemt b.high mee. */}
            {bandPath && (
              <path d={bandPath} fill="var(--module-active-500)" opacity="0.14" stroke="none" />
            )}
            {/* Projectie-lijn — doorlopend van Vandaag (x=0) naar het eindpunt */}
            <path
              d={projPath}
              data-nw-line="toekomst"
              fill="none"
              stroke="var(--module-active-700)"
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {ageTicks.map(({ age, x }) => (
              <line
                key={age}
                x1={x}
                y1={FLOOR}
                x2={x}
                y2={100}
                stroke="var(--ink-4)"
                strokeWidth="0.5"
                opacity="0.6"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {hasProjection && (
              <line
                x1={endX}
                y1={PAD_TOP}
                x2={endX}
                y2={endY}
                stroke="var(--color-horizon-500)"
                strokeWidth="1"
                strokeDasharray="2 3"
                opacity="0.6"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* ── De naad (alleen <lg, één kaart): verticale Vandaag-lijn + stip.
              Op lg staat er tussen de twee kaarten niets: de lijnen eindigen en
              beginnen op dezelfde hoogte aan hun kaartrand (eigenaarswens 15 sep
              2026 — verbonden, maar elke kaart los te lezen). */}
          <span
            className="absolute inset-y-0 border-l border-dashed border-[var(--ink-4)] opacity-50 lg:hidden"
            style={{ left: NW_SEAM_LEFT }}
          />
          <span
            data-testid="nw-vandaag-punt"
            data-y={todayY.toFixed(1)}
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--module-active-700)] lg:hidden"
            style={{ left: NW_SEAM_LEFT, top: `${todayY.toFixed(1)}%` }}
          />
          {/* Eindmarker: vrijheidsmoment, of eindleeftijd bij "bereikt" —
              alleen mét projectierijen (5f). */}
          {hasProjection && (
            <>
              <span
                className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-horizon-500)]"
                style={{ left: `${endX.toFixed(1)}%`, top: `${endY.toFixed(1)}%` }}
              />
              <span
                className="absolute top-0 font-mono text-[9px] leading-none text-[var(--color-horizon-800)] whitespace-nowrap"
                style={{ right: `${FUTURE_PAD_RIGHT}%` }}
              >
                {endMarkerText}
              </span>
            </>
          )}
        </div>
        {/* As-labels in de 16px-strook onder het tekenvlak. */}
        {ageTicks.map(({ age, x }) => (
          <span
            key={age}
            className="absolute bottom-0 -translate-x-1/2 font-mono text-[9px] leading-none text-[var(--ink-4)]"
            style={{ left: `${x.toFixed(1)}%` }}
          >
            {age}
          </span>
        ))}
        {/* Eindleeftijd rechtsonder — de x-as heeft zo altijd een eindpunt,
            ook als er geen tussen-ticks passen. */}
        <span
          data-testid="nw-as-eind"
          className="absolute bottom-0 font-mono text-[9px] leading-none text-[var(--ink-3)] whitespace-nowrap"
          style={{ right: `${FUTURE_PAD_RIGHT}%` }}
        >
          {finalAgeLabel} jr
        </span>
        {/* <lg: één label op de naad. lg: "nu" linksonder in de eigen kaart. */}
        <span
          className="absolute bottom-0 -translate-x-1/2 bg-[var(--paper)] px-1 font-mono text-[9px] leading-none text-[var(--ink-3)] whitespace-nowrap lg:hidden"
          style={{ left: NW_SEAM_LEFT }}
        >
          Vandaag ({startAge})
        </span>
        <span
          data-testid="nw-as-nu-toekomst"
          className="absolute bottom-0 left-3 hidden font-mono text-[9px] leading-none text-[var(--ink-3)] whitespace-nowrap lg:block"
        >
          nu ({startAge})
        </span>
      </div>

      {/* ── Mobiele tik-zones over de grafiekdelen ── duplicaten van de twee
          klikdoelen hierboven (die op mobiel alleen de tekstrijen dekken).
          Buiten de tabvolgorde en de a11y-boom: dezelfde actie heeft al een
          benoemd, focusbaar element. Op lg dekken de frames alles. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => setVensterOpen(true)}
        data-testid="nw-zone-verleden"
        className={NW_LAYOUT.pastPlotZone}
      />
      <Link
        href="/toekomst"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="nw-zone-toekomst"
        className={NW_LAYOUT.futurePlotZone}
      />

      {/* ── Legenda ── */}
      <div className={NW_LAYOUT.legend}>
        {/* De legenda-container laat klikken op lg doorvallen naar de toekomst-
            link, maar de items zelf vangen de muis: hun `title`-uitleg moet
            ook op desktop verschijnen (de rondleiding leunt erop). */}
        <div className="flex items-center gap-3 flex-wrap text-[10px] text-[var(--ink-3)] [&>span]:pointer-events-auto">
          {/* OVZ-4 — Eenvoudig: "Historisch" + "Projectie" smelten samen tot
              "Verloop" (gestippeld = verleden, doorgetrokken = projectie). */}
          {simple && (
            <span
              className="inline-flex items-center gap-1.5"
              title="Links van Vandaag je werkelijke vermogen, rechts de projectie"
            >
              <svg width="16" height="2" aria-hidden="true">
                <line x1="0" y1="1" x2="7" y2="1" stroke="var(--module-active-700)" strokeWidth="1.5" strokeDasharray="3 2" />
                <line x1="8" y1="1" x2="16" y2="1" stroke="var(--module-active-500)" strokeWidth="2" />
              </svg>
              Verloop
            </span>
          )}
          {!simple && (
            <span
              className="inline-flex items-center gap-1.5"
              title={
                hasEstimatedHistory
                  ? 'Verleden deels geschat op basis van je spaarritme — er zijn nog weinig waarderingen vastgelegd'
                  : 'Gerealiseerde netto-vermogen-tracking uit het verleden'
              }
            >
              <svg width="16" height="2" aria-hidden="true">
                <line x1="0" y1="1" x2="16" y2="1" stroke="var(--module-active-700)" strokeWidth="1.5" strokeDasharray="3 2" />
              </svg>
              {hasEstimatedHistory ? 'Historisch (deels geschat)' : 'Historisch'}
            </span>
          )}
          {!simple && (
            <span
              className="inline-flex items-center gap-1.5"
              title={
                fireReached
                  ? stopAnchorFixed
                    ? 'Toekomst-projectie tot eindleeftijd — je plan is gedekt'
                    : `Toekomst-projectie tot eindleeftijd — ${endLabel.toLowerCase()} is bereikt`
                  : stopAnchorFixed
                    ? 'Toekomst-projectie tot je stopmoment'
                    : 'Toekomst-projectie tot vrijheidsmoment'
              }
            >
              <svg width="16" height="2" aria-hidden="true">
                <line x1="0" y1="1" x2="16" y2="1" stroke="var(--module-active-500)" strokeWidth="2" />
              </svg>
              Projectie
            </span>
          )}
          <span
            className="inline-flex items-center gap-1.5"
            title={
              simple
                ? 'De marge waarbinnen je vermogen zich waarschijnlijk beweegt'
                : 'P40–P60 bandbreedte op basis van marktvolatiliteit σ × √t'
            }
          >
            <span
              className="inline-block w-3 h-2 rounded-sm"
              style={{ background: 'var(--module-active-500)', opacity: 0.25 }}
              aria-hidden="true"
            />
            {simple ? 'Bandbreedte' : 'Onzekerheid (P40–P60)'}
          </span>
          {/* Eindmarker-duiding: de horizon-marker in de grafiek staat nooit
              zonder legenda-context. */}
          <span className="inline-flex items-center gap-1.5" title="Het eindpunt van de projectie">
            <span
              className="inline-block w-[2px] h-3 rounded-sm"
              style={{ background: 'var(--color-horizon-500)' }}
              aria-hidden="true"
            />
            {/* OVZ-4 — Eenvoudig: geen kaal leeftijdsgetal ("Tot 90") in de
                legenda; de marker houdt wél zijn legenda-regel. */}
            {simple
              ? fireReached
                ? 'Tot je eindleeftijd'
                : stopAnchorFixed
                  ? 'Stopmoment'
                  : 'Vrijheidsmoment'
              : endMarkerText}
          </span>
        </div>
      </div>

      {/* Het samengevoegde venster: opbouw (kassabon) + verloop. */}
      <NettoVermogenVenster
        open={vensterOpen}
        onClose={() => setVensterOpen(false)}
        history={historyPoints}
        currentNetWorth={currentNetWorth}
        dailyExpense={dailyExpense}
        opbouw={vermogenOpbouw}
        netWorthExclHome={netWorthExclHome ?? null}
        showExclHome={showExclHome}
        eigenHuisValue={eigenHuisValue}
        mortgageBalance={mortgageBalance}
      />
    </div>
  )
}

// memo(): de chart re-rendert alleen bij daadwerkelijk gewijzigde props. Werkt
// samen met de gestabiliseerde props uit de loader (stabiele lege-array-ref
// voor `netWorthHistory`, primitieve `?? null/0/false`-defaults).
export const MiniNetWorthChart = memo(MiniNetWorthChartComponent)
