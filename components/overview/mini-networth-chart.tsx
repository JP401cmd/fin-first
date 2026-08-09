'use client'

import { memo, useId, useMemo, useState } from 'react'
import Link from 'next/link'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { useEuroView } from '@/lib/hooks/use-euro-view'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { deflate, factorAtAge } from '@/lib/euro-display'
import { fireAgeForDisplay } from '@/lib/fire-strategy'
import { computeConfidenceBand } from '@/lib/confidence-band'
import { SubtotalLine } from '@/components/editorial/subtotal-line'
import { NetWorthHistorySheet, type HistoryPoint } from './networth-history-sheet'

// SVG-dimensies — module-scope want puur constant, gedeeld door de
// geometrie-memo en de JSX (viewBox/assen). Geen render-afhankelijkheid.
const W = 420
const H = 140
const PAD_LEFT = 8
const PAD_RIGHT = 8
const PAD_TOP = 16
const PAD_BOTTOM = 18
const chartW = W - PAD_LEFT - PAD_RIGHT
const chartH = H - PAD_TOP - PAD_BOTTOM

/**
 * MiniNetWorthChart — compacte netto-vermogen-grafiek voor /overzicht hero.
 *
 * Bron-van-waarheid: gebruikt **dezelfde simulatie-data** als de grafiek
 * op /toekomst (`simRows` uit de horizon-kernel), maar dan als
 * **geprojecteerd VOLLEDIG netto vermogen** (`simNetWorthRows` uit de loader):
 * de FIRE-portefeuille (`endPortfolio`) plús meegroeiende niet-liquide assets
 * (huis) die uit de FIRE-pot zijn gefilterd. Hierdoor loopt de projectielijn
 * continu door vanuit het Vandaag-punt (= volledig netto vermogen incl. huis)
 * i.p.v. te dippen naar de FIRE-portefeuille zónder huis. Geen lineaire
 * benadering, geen eigen groei-rate — de loader is de enige bron.
 *
 * Visueel:
 *  - Twee tijdschalen: het verleden heeft een VAST segment van 25%
 *    met een eigen maand-schaal (venster = beschikbare data, minimaal
 *    3 en maximaal 12 maanden); de projectie rechts gebruikt een
 *    jaren-schaal. De x-as onderin (maand-label links, leeftijds-
 *    ticks rechts) maakt de schaal-breuk op de Vandaag-as expliciet.
 *  - Links van Vandaag: historisch netto vermogen — **minimaal 3
 *    maanden**. Echte waarderingen (uit `netWorthHistory`) als
 *    stippellijn in module-inkt; ontbrekende maanden worden aangevuld
 *    met een **geschat verloop** (trendlijn op spaarritme) in
 *    lichtere inkt.
 *  - Rechts van Vandaag: projectie als **doorlopende lijn**.
 *    De weergave stopt bij het vrijheidsmoment (fireAge); is vrijheid
 *    al bereikt, dan loopt de projectie door tot de eindleeftijd.
 *  - Onzekerheid als smalle P40–P60-band rond de projectie. De
 *    Y-schaal neemt de band mee zodat het onzekerheidsgebied volledig
 *    binnen het frame past.
 *
 * Interactie (twee klikzones):
 *  - Klik op het **verleden** (links van Vandaag) → popup met het
 *    netto-vermogen-verloop (NetWorthHistorySheet)
 *  - Klik op de **toekomst** (rechts van Vandaag) → /toekomst
 */
function MiniNetWorthChartComponent({
  netWorthHistory,
  currentNetWorth,
  currentAge,
  fireAge,
  endAge,
  isPensioenMode,
  simNetWorthRows,
  simRequiredPortfolio,
  monthlySavings,
  netWorthExclHome,
  showExclHome = false,
  dailyExpense,
}: {
  netWorthHistory: { month: string; value: number }[]
  currentNetWorth: number
  currentAge: number | null
  fireAge: number | null
  endAge: number | null
  isPensioenMode?: boolean
  /**
   * Per-jaar geprojecteerd VOLLEDIG netto vermogen (FIRE-pot + meegroeiende
   * niet-liquide assets) uit de loader (`DashboardData.simNetWorthRows`).
   * Wanneer aanwezig: de chart gebruikt deze waardes 1:1 — continu met het
   * Vandaag-punt. Wanneer afwezig (sim mislukt op server): empty-state-CTA.
   *
   * GRONDSLAG (ADR 0090): `netWorth` is NOMINAAL en al her-ankerd op het
   * Vandaag-punt; `inflationFactor` is de canonieke weergave-deflator van
   * diezelfde kernelrij (jaar 0 = 1.0). OPTIONEEL — mock-/oudere bundels
   * dragen hem niet; consumeer met `?? 1` (= geen deflatie), nooit met een
   * zelfberekende `Math.pow`.
   */
  simNetWorthRows?: { age: number; netWorth: number; inflationFactor?: number }[] | null
  /**
   * Vereist FIRE-portfolio bij vrijheidsmoment uit de simulatie — het LIQUIDE
   * vrijheidsdoel (€). Bewust APART van de netto-vermogen-as: het wordt als los
   * doel-label getoond, NIET als marker-hoogte (die hoogte = geprojecteerd
   * netto vermogen op de vrijheidsleeftijd). Verzekert dat /overzicht en
   * /toekomst exact hetzelfde "doelbedrag bij vrijheid" tonen.
   */
  simRequiredPortfolio?: number | null
  /**
   * Geschatte maandelijkse vermogensgroei (spaarritme) — gebruikt om
   * ontbrekende historie-maanden te back-casten wanneer er minder dan
   * 3 echte waarderingen zijn. Null/undefined → vlak geschat verloop.
   */
  monthlySavings?: number | null
  /**
   * Nettovermogen EXCL. eigen woning (`horizonData.netWorthExclHome` —
   * perspectief-correct, niet zelf herrekenen). Getoond als losse subtotaal-
   * regel onder het nettovermogen-kopgetal wanneer `showExclHome`. De grafiek-
   * lijn zelf blijft VOLLEDIG nettovermogen incl. huis (geen tweede lijn).
   */
  netWorthExclHome?: number | null
  /**
   * Gate voor de excl.-regel ⇔ `horizonData.showDualHousingBasis` (eigen woning
   * + strategie ≠ volledig meerekenen). Default false → geen extra regel
   * (byte-identiek aan voorheen).
   */
  showExclHome?: boolean
  /**
   * Canoniek dagtarief (EUR/dag) uit de dashboard-bundel — doorgegeven aan de
   * NetWorthHistorySheet voor de vrijheidstijd-equivalent van de periode-delta.
   * Afwezig -> sheet toont alleen het EUR-bedrag. Nooit lokaal herrekenen.
   */
  dailyExpense?: number
}) {
  // Netto vermogen + eindbedrag zijn saldi → honoreren de privacy-toggle.
  // Hooks vóór elke early-return aangeroepen (rules-of-hooks). De numerieke
  // chart-coördinaten blijven ongemoeid; alleen de zichtbare bedrag-tekst maskt.
  const { masked } = useMaskedAmounts()
  // Euro-weergave: 'nominal' (= exact het huidige beeld) of 'real' (koopkracht
  // van vandaag). Buiten een EuroViewProvider valt de hook terug op 'nominal',
  // dus bestaande tests en oppervlakken zonder provider blijven byte-identiek.
  const { view: euroView } = useEuroView()
  // Weergavemodus — enige leespad is useDisplayMode() (SSoT). In 'simple'
  // versobert alleen de LEGENDA en de kop-staart; de grafiek zelf (paden,
  // band, markers) blijft byte-identiek. Buiten een provider: 'simple'-
  // fallback zoals overal, maar /overzicht draait altijd binnen de provider.
  const { mode: displayMode } = useDisplayMode()
  const simple = displayMode === 'simple'
  const [historyOpen, setHistoryOpen] = useState(false)
  // Unieke gradient-id per instantie — voorkomt botsende SVG-defs wanneer
  // de chart meermaals op één pagina staat.
  const gradientId = useId()

  // ── Geometrie in één memo op de data-inputs ──────────────────────
  // De volledige coördinaat-/pad-berekening is puur t.o.v. de data-props en
  // hangt NIET af van `masked` (dat raakt alleen zichtbare bedrag-labels, die
  // in de body blijven). De memo bevat ook de fireReached/projectionEndAge-
  // afleiding en de empty-state-check (→ `null`) zodat ze samen één keer per
  // data-wijziging draaien i.p.v. bij elke re-render. Let op: `new Date()` in
  // `isoMonthBack` bevriest bewust "deze maand" per mount — de logica is niet
  // gewijzigd, alleen verplaatst.
  const geometry = useMemo(() => {
    // Eindleeftijd van de weergave: het vrijheidsmoment (fireAge) — de
    // afbouw-fase leeft op /toekomst. Is vrijheid al bereikt (fireAge ≤
    // currentAge), dan loopt de weergave dóór tot de eindleeftijd: er is
    // dan geen opbouw-verhaal meer, wel een "hoe loopt het verder"-verhaal.
    const fireReached =
      fireAge != null && currentAge != null && fireAge <= currentAge
    const projectionEndAge =
      fireAge != null && currentAge != null && fireAge > currentAge
        ? fireAge
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

    // Narrowed copies — guard hierboven sluit null uit.
    const startAge: number = currentAge
    const finalAge: number = projectionEndAge

    // Projectie-segment: simNetWorthRows (= geprojecteerd VOLLEDIG netto vermogen)
    // van vandaag → finalAge. Voeg het Vandaag-punt bovenaan toe (currentNetWorth)
    // zodat het startpunt scherp is.
    //
    // Continuïteit: de loader verankert simNetWorthRows al op zijn eigen netWorth-
    // grondslag, maar de `currentNetWorth`-prop kan (in huishoud-/partnerweergave
    // of door een temporeel/grondslag-verschil) een fractie afwijken van de
    // engine-start. We her-verankeren daarom op de getoonde `currentNetWorth` met
    // een vlakke euro-offset, zodat de lijn ZICHTBAAR naadloos doorloopt vanuit het
    // Vandaag-punt. Consume, don't recompute: dit verschuift de reeks, het
    // herberekent niets aan de engine-groei.
    const projRowsInRange = simNetWorthRows.filter(
      (r) => r.age >= startAge && r.age <= finalAge,
    )
    const anchorOffset =
      projRowsInRange.length > 0 ? currentNetWorth - projRowsInRange[0].netWorth : 0
    // ── EURO-WEERGAVE — D7-volgorde (hard, niet onderhandelbaar) ─────────────
    // Eerst her-ankeren in NOMINALE ruimte, DAARNA pas delen door de rij-eigen
    // kernelfactor. Andersom (eerst delen, dan ankeren) verschuift het
    // Vandaag-punt: de offset is in nominale euro's uitgedrukt en zou dan door
    // een factor gedeeld worden die niet bij hem hoort. Jaar 0 draagt factor
    // 1.0, dus in beide views valt het eerste projectiepunt exact samen met het
    // Vandaag-punt — dát is wat de naad historie↔projectie knikvrij houdt.
    const projection: { age: number; value: number }[] = [
      // euro-view: exempt — het Vandaag-punt is GEREALISEERD vermogen
      // (currentNetWorth) en staat dus per definitie al in euro's van vandaag.
      // Nooit delen (D12); dat zou de naad juist een knik geven.
      { age: startAge, value: currentNetWorth },
      ...projRowsInRange.map((r) => ({
        age: r.age,
        value: deflate(r.netWorth + anchorOffset, r.inflationFactor ?? 1, euroView),
      })),
    ]
    // Dedupe identieke leeftijden (currentAge kan al in simRows zitten);
    // hou de eerste — currentNetWorth is de waarheid voor vandaag.
    const seen = new Set<number>()
    const dedupedProjection = projection.filter((p) => {
      if (seen.has(p.age)) return false
      seen.add(p.age)
      return true
    })

    // Eindmarker-HOOGTE = geprojecteerd VOLLEDIG netto vermogen op de
    // vrijheidsleeftijd (laatste punt van de reeks), consistent met de netto-
    // vermogen-as. NIET simRequiredPortfolio: dat is het LIQUIDE vrijheidsdoel en
    // hoort niet op de netto-vermogen-as (zou de marker laten zweven t.o.v. de
    // lijn). Het doelbedrag tonen we apart als los label (zie freedomTargetLabel).
    const endValue =
      dedupedProjection[dedupedProjection.length - 1]?.value ?? currentNetWorth
    const endLabel = isPensioenMode ? 'Pensioen' : 'Vrijheid'

    // ── Historie: minimaal 3 maanden ─────────────────────────────────
    // euro-view: exempt — alles links van Vandaag is GEREALISEERD vermogen en
    // staat al in euro's van (ongeveer) vandaag; er is geen kernelrij en dus
    // geen canonieke deflator voor het verleden (D12). Ook het geschatte
    // back-cast-segment blijft nominaal: het is een terugrekening op het
    // spaarritme, geen projectie in toekomstige euro's.
    // Echte waarderingen (max 12 maanden, bron = net_worth_snapshots) als
    // werkelijkheid. Zijn er minder dan 3, dan vullen we de oudere maanden
    // aan met een GESCHAT verloop: back-cast vanaf het oudste bekende punt
    // (of vandaag) op het spaarritme. Geschatte punten zijn visueel
    // onderscheiden (lichtere inkt) en in de popup gelabeld als "geschat".
    const MIN_HISTORY_MONTHS = 3
    // Dedupe per kalendermaand (laatste waardering per maand telt) — de
    // snapshots-tabel kan meerdere waarderingen per maand bevatten en de
    // maand-as gaat uit van één punt per maand.
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

    // monthsBack per punt: oudste echte = realHistory.length, nieuwste = 1.
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

    // Vensterbreedte voor visuele schaling: het oudste aanwezige punt
    // begint ALTIJD op de linkerrand — ook met minder dan 12 maanden data
    // vult de historie het volledige linker-segment (user-feedback jun
    // 2026, vervangt de eerdere tijds-proportionele verdeling). Binnen het
    // venster blijven de punten onderling wél tijds-proportioneel.
    const HISTORY_WINDOW_MONTHS = Math.max(
      1,
      historyPoints[0]?.monthsBack ?? 1,
    )

    // Plan F-4 (herzien jun 2026): onzekerheid als smalle P40–P60-band
    // rond de projectie — de kern van de verwachting, niet de extremen.
    // Approximated via σ×√t (geen echte Monte Carlo).
    const bandPoints = computeConfidenceBand(
      dedupedProjection.map((p) => ({ age: p.age, endPortfolio: p.value })),
    )

    // Y-schaal: 0 → hoogste datapunt ÍNCLUSIEF de bovenkant van de
    // onzekerheidsband, met een kleine 8%-marge. Zo past het volledige
    // onzekerheidsgebied binnen de weergave (geen afgeknepen band meer
    // tegen het plafond).
    const dataPeak = Math.max(
      ...historyPoints.map((h) => h.value),
      ...dedupedProjection.map((p) => p.value),
      ...bandPoints.map((b) => b.high),
      endValue,
      1,
    )
    const maxValue = dataPeak * 1.08
    const yScale = chartH / maxValue
    function valueToY(v: number) {
      return PAD_TOP + chartH - v * yScale
    }
    // Klem een waarde binnen [0, maxValue] vóór projectie naar Y — vangnet
    // voor (geschatte) waardes onder nul zodat lijnen het frame niet verlaten.
    function valueToYClamped(v: number) {
      return valueToY(Math.min(Math.max(v, 0), maxValue))
    }

    // X-mapping (user-feedback jun 2026): het verleden heeft een VAST
    // segment van 25% met een EIGEN tijdschaal (maanden); de projectie
    // rechts gebruikt een jaren-schaal. Het beschikbare datavenster
    // (minimaal 3, maximaal 12 maanden) vult altijd het volledige
    // linker-segment — de leeftijds-x-as onderin maakt de schaal-breuk
    // op de Vandaag-as expliciet.
    //  - Vandaag op PAD_LEFT + chartW × 0.25
    //  - finalAge op de rechterrand (PAD_LEFT + chartW)
    const todayFraction = 0.25
    const todayX = PAD_LEFT + chartW * todayFraction
    const projXSpan = chartW * (1 - todayFraction)
    const projYears = Math.max(1, finalAge - startAge)

    function ageToX(age: number) {
      const yearsFromToday = age - startAge
      return todayX + (yearsFromToday / projYears) * projXSpan
    }

    // Historische lijn — oudste punt op de linkerrand, nieuwste loopt
    // naadloos door in het vandaag-punt (currentNetWorth op todayX) en
    // daarmee in de projectie-curve. Punten onderling tijds-proportioneel.
    function monthsBackToX(monthsBack: number) {
      const capped = Math.min(monthsBack, HISTORY_WINDOW_MONTHS)
      const fraction = 1 - capped / HISTORY_WINDOW_MONTHS
      return PAD_LEFT + fraction * (todayX - PAD_LEFT)
    }
    const histPts = [
      ...historyPoints.map((h) => ({
        x: monthsBackToX(h.monthsBack),
        y: valueToYClamped(h.value),
        estimated: h.estimated === true,
      })),
      { x: todayX, y: valueToYClamped(currentNetWorth), estimated: false },
    ]
    // Splits in geschat-prefix en echt-suffix; het grenspunt hoort bij
    // beide paden zodat de lijn zonder gat doorloopt.
    const firstRealIdx = histPts.findIndex((p) => !p.estimated)
    const toPath = (pts: { x: number; y: number }[]) =>
      pts.length >= 2
        ? pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
        : ''
    const estHistPath = firstRealIdx > 0 ? toPath(histPts.slice(0, firstRealIdx + 1)) : ''
    const realHistPath = firstRealIdx >= 0 ? toPath(histPts.slice(firstRealIdx)) : ''

    // Projectie-pad (vanaf today-x naar finalAge). Doorlopende lijn.
    const projPath = dedupedProjection
      .map(
        (p, i) =>
          `${i === 0 ? 'M' : 'L'}${ageToX(p.age).toFixed(1)},${valueToY(p.value).toFixed(1)}`,
      )
      .join(' ')

    // Schaduw-vlakken onder de lijnen: zachte verticale gradient van
    // lijn naar de vloer — geeft het grafiekgebied diepte zonder de
    // onzekerheidsband te overstemmen.
    const floorY = (H - PAD_BOTTOM).toFixed(1)
    const lastProjX = ageToX(
      dedupedProjection[dedupedProjection.length - 1]?.age ?? finalAge,
    ).toFixed(1)
    const projAreaPath =
      dedupedProjection.length >= 2
        ? `${projPath} L${lastProjX},${floorY} L${todayX.toFixed(1)},${floorY} Z`
        : ''
    const histAreaPath =
      histPts.length >= 2
        ? `${toPath(histPts)} L${todayX.toFixed(1)},${floorY} L${histPts[0].x.toFixed(1)},${floorY} Z`
        : ''

    // Polygon-path: heen langs P60 (high), terug langs P40 (low).
    const bandPath =
      bandPoints.length >= 2
        ? [
            ...bandPoints.map(
              (p, i) =>
                `${i === 0 ? 'M' : 'L'}${ageToX(p.age).toFixed(1)},${valueToYClamped(p.high).toFixed(1)}`,
            ),
            ...[...bandPoints].reverse().map(
              (p) =>
                `L${ageToX(p.age).toFixed(1)},${valueToYClamped(p.low).toFixed(1)}`,
            ),
            'Z',
          ].join(' ')
        : ''

    // Toon de eind-leeftijd gerond (in praktijk: integer uit DashboardData).
    const finalAgeLabel = Math.round(finalAge)
    const endMarkerText = fireReached
      ? `Tot ${finalAgeLabel}`
      : `${endLabel} ${finalAgeLabel}`

    // Klikzone-grens als percentage van de SVG-breedte. De SVG schaalt met
    // preserveAspectRatio="none", dus dit percentage klopt op elke breedte.
    const todayPct = (todayX / W) * 100

    // Leeftijds-ticks voor de projectie-as (rechts van Vandaag) — maakt
    // samen met het maand-label links expliciet dat de grafiek twee
    // tijdschalen gebruikt. Stap 5 of 10 jaar afhankelijk van de span;
    // ticks die botsen met het Vandaag-label of de rechterrand vervallen.
    const ageTickStep = projYears > 20 ? 10 : 5
    const ageTicks: number[] = []
    for (
      let a = Math.ceil((startAge + 1) / ageTickStep) * ageTickStep;
      a < finalAge;
      a += ageTickStep
    ) {
      const x = ageToX(a)
      if (x - todayX < 36 || x > W - 28) continue
      ageTicks.push(a)
    }

    return {
      fireReached,
      startAge,
      finalAge,
      endValue,
      endLabel,
      finalAgeLabel,
      endMarkerText,
      historyPoints,
      hasEstimatedHistory,
      HISTORY_WINDOW_MONTHS,
      todayX,
      todayPct,
      ageTicks,
      estHistPath,
      realHistPath,
      projPath,
      projAreaPath,
      histAreaPath,
      bandPath,
      valueToY,
      valueToYClamped,
      ageToX,
    }
  }, [
    netWorthHistory,
    currentNetWorth,
    currentAge,
    fireAge,
    endAge,
    isPensioenMode,
    simNetWorthRows,
    monthlySavings,
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
    startAge,
    finalAge,
    endValue,
    endLabel,
    finalAgeLabel,
    endMarkerText,
    historyPoints,
    hasEstimatedHistory,
    HISTORY_WINDOW_MONTHS,
    todayX,
    todayPct,
    ageTicks,
    estHistPath,
    realHistPath,
    projPath,
    projAreaPath,
    histAreaPath,
    bandPath,
    valueToY,
    valueToYClamped,
    ageToX,
  } = geometry

  // Liquide vrijheidsdoel (€) — APART, expliciet gelabeld. Niet op de as.
  // Blijft in de body: hangt af van de privacy-toggle (`masked`), niet van de
  // geometrie.
  //
  // euro-view: klasse S (FIRE-leeftijd). Dit is hetzelfde bedrag dat /toekomst
  // als `fireTarget` toont (simResult.requiredFirePortfolio), dus het MOET met
  // dezelfde deflator omgezet worden: de kernelfactor op de vrijheidsleeftijd,
  // niet een generieke "factor van nu". Dat is precies wat UAT-KRUIS-27 /
  // AC-F4 bewaakt — twee oppervlakken, één bedrag, één deflator.
  //
  // LEEFTIJDSBRON: de lookup loopt door de canonieke weergave-seam
  // `fireAgeForDisplay` (= Math.round), net als op /toekomst. De kernelrijen
  // staan op hele leeftijden en `factorAtAge` pakt de dichtstbijzijnde rij —
  // waarbij een leeftijd exact op .5 naar BENEDEN valt (eerste kleinste afstand
  // wint) terwijl afronden naar BOVEN gaat. Zonder deze normalisatie hangt de
  // gekozen factor-rij dus af van of de aanroeper een fractionele of een al
  // afgeronde leeftijd doorgeeft, en lezen /overzicht en /toekomst hetzelfde
  // doelbedrag met een andere deflator. De marker-/astekst blijft ongemoeid:
  // die gebruikt `fireAge` zoals binnengekomen.
  const freedomTargetFactor = factorAtAge(
    (simNetWorthRows ?? []).map((r) => ({ age: r.age, inflationFactor: r.inflationFactor ?? 1 })),
    fireAgeForDisplay(fireAge),
  )
  const viewSimRequiredPortfolio =
    simRequiredPortfolio == null
      ? null
      : deflate(simRequiredPortfolio, freedomTargetFactor, euroView)
  const freedomTargetLabel =
    !fireReached && viewSimRequiredPortfolio != null && viewSimRequiredPortfolio > 0
      ? `Vrijheidsdoel ${formatMaskedCurrency(viewSimRequiredPortfolio, masked)} liquide`
      : null

  return (
    <div className="flex flex-col rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4 transition-all h-full">
      <header className="mb-2 flex items-baseline justify-between gap-3">
        {/* Géén euro-weergave-badge meer hier. De weergave-status hangt sinds
            aug 2026 app-breed bovenaan de sidebar (`SidebarEuroViewBadge`) en de
            schakelaar in het zoekscherm (⌘K) — één statusplek en één knop, in
            plaats van een badge per grafiek. Zie ADR 0094. */}
        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Netto vermogen door de tijd
        </span>
        {/* OVZ-4: in Eenvoudig vervalt de staart "— verloop tot 90". Tot welke
            leeftijd de grafiek loopt staat in de pagina-'i' van /overzicht. */}
        <span className="text-xs font-mono tabular-nums text-[var(--ink-3)]">
          {fireReached
            ? simple
              ? `${endLabel} bereikt`
              : `${endLabel} bereikt — verloop tot ${finalAgeLabel}`
            : `Vermogen bij ${endLabel.toLowerCase()} → ${formatMaskedCurrency(endValue, masked)}`}
        </span>
      </header>
      <div className="font-serif text-xl font-semibold text-[var(--ink)] tabular-nums">
        {formatMaskedCurrency(currentNetWorth, masked)}
      </div>
      {/* Dubbele grondslag: nettovermogen EXCL. eigen woning als losse
          subtotaal-regel onder het kopgetal (headline-context → gedeelde
          SubtotalLine i.p.v. een compacte tegel-regel). Geen tweede grafieklijn:
          een excl.-lijn op een totaal-vermogen-as voegt niets toe. Bron =
          horizonData.netWorthExclHome (perspectief-correct). Margin-override
          omdat de SubtotalLine-default (-mt-3 mb-5) te ruim is voor deze plek. */}
      {showExclHome && netWorthExclHome != null && (
        <SubtotalLine
          label="excl. eigen woning"
          amount={netWorthExclHome}
          className="!mt-1 !mb-0"
        />
      )}
      {/* Grafiek met twee klikzones: verleden (popup) + toekomst (/toekomst).
          De zones liggen als onzichtbare hit-areas óver de SVG, gesplitst op
          de Vandaag-as. Focus-ring + hover-tint maken de zones ontdekbaar. */}
      <div className="relative flex-1 mt-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          aria-hidden="true"
          preserveAspectRatio="none"
          style={{ minHeight: '120px' }}
        >
          <defs>
            {/* Schaduw-gradients: van lijn-kleur naar transparant richting
                de vloer. Historie iets lichter dan de projectie. */}
            <linearGradient id={`${gradientId}-proj`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--module-active-500)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--module-active-500)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${gradientId}-hist`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ink-3, #6b7280)" stopOpacity="0.10" />
              <stop offset="100%" stopColor="var(--ink-3, #6b7280)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Schaduw-vlak onder de historie */}
          {histAreaPath && (
            <path d={histAreaPath} fill={`url(#${gradientId}-hist)`} stroke="none" />
          )}
          {/* Schaduw-vlak onder de projectie */}
          {projAreaPath && (
            <path d={projAreaPath} fill={`url(#${gradientId}-proj)`} stroke="none" />
          )}
          {/* Geschat historie-segment — lichtere stippellijn (back-cast
              op spaarritme, geen echte waardering) */}
          {estHistPath && (
            <path
              d={estHistPath}
              fill="none"
              stroke="var(--ink-4)"
              strokeWidth="2"
              strokeDasharray="3 4"
              strokeLinecap="round"
              opacity="0.8"
            />
          )}
          {/* Echte historie — stippellijn terug in de tijd */}
          {realHistPath && (
            <path
              d={realHistPath}
              fill="none"
              stroke="var(--module-active-700)"
              strokeWidth="2"
              strokeDasharray="3 3"
              strokeLinecap="round"
              opacity="0.7"
            />
          )}
          {/* Onzekerheidsband P40–P60 — zachte vulling rond de projectie.
              De Y-schaal neemt b.high mee, dus de band past in het frame. */}
          {bandPath && (
            <path
              d={bandPath}
              fill="var(--module-active-500)"
              opacity="0.14"
              stroke="none"
            />
          )}
          {/* Projectie-lijn — doorlopend van Vandaag naar het eindpunt */}
          <path
            d={projPath}
            fill="none"
            stroke="var(--module-active-700)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Vandaag-marker */}
          <circle
            cx={todayX}
            cy={valueToYClamped(currentNetWorth)}
            r="4"
            fill="var(--module-active-700)"
          />
          {/* Vandaag verticaal richtlijntje */}
          <line
            x1={todayX}
            y1={PAD_TOP}
            x2={todayX}
            y2={H - PAD_BOTTOM}
            stroke="var(--ink-4)"
            strokeWidth="0.5"
            strokeDasharray="2 3"
            opacity="0.5"
          />
          {/* X-as basislijn — verbindt beide tijdschalen visueel */}
          <line
            x1={PAD_LEFT}
            y1={H - PAD_BOTTOM}
            x2={W - PAD_RIGHT}
            y2={H - PAD_BOTTOM}
            stroke="var(--ink-4)"
            strokeWidth="0.5"
            opacity="0.35"
          />
          {/* Maand-schaal links: het verleden-segment heeft een eigen
              (maanden-)schaal — label markeert het begin van het venster */}
          <text
            x={PAD_LEFT}
            y={H - 4}
            textAnchor="start"
            className="fill-[var(--ink-4)] font-mono"
            fontSize="8"
          >
            −{HISTORY_WINDOW_MONTHS} mnd
          </text>
          {/* Leeftijds-schaal rechts: ticks per {ageTickStep} jaar op de
              projectie-as */}
          {ageTicks.map((a) => (
            <g key={a}>
              <line
                x1={ageToX(a)}
                y1={H - PAD_BOTTOM}
                x2={ageToX(a)}
                y2={H - PAD_BOTTOM + 3}
                stroke="var(--ink-4)"
                strokeWidth="0.5"
                opacity="0.6"
              />
              <text
                x={ageToX(a)}
                y={H - 4}
                textAnchor="middle"
                className="fill-[var(--ink-4)] font-mono"
                fontSize="8"
              >
                {a}
              </text>
            </g>
          ))}
          {/* Eindmarker rechts: vrijheidsmoment, of eindleeftijd wanneer
              vrijheid al bereikt is */}
          <line
            x1={ageToX(finalAge)}
            y1={PAD_TOP}
            x2={ageToX(finalAge)}
            y2={valueToY(endValue)}
            stroke="var(--color-horizon-500)"
            strokeWidth="1"
            strokeDasharray="2 3"
            opacity="0.6"
          />
          <circle cx={ageToX(finalAge)} cy={valueToY(endValue)} r="4" fill="var(--color-horizon-500)" />
          <text
            x={ageToX(finalAge)}
            y={PAD_TOP - 4}
            textAnchor="end"
            className="fill-[var(--color-horizon-800)] font-mono"
            fontSize="9"
          >
            {endMarkerText}
          </text>
          {/* Vandaag-label — links uitgelijnd wanneer de as dicht bij de
              linkerrand staat (weinig historie), anders gecentreerd. */}
          <text
            x={todayX < 70 ? Math.max(2, todayX - 4) : todayX}
            y={H - 4}
            textAnchor={todayX < 70 ? 'start' : 'middle'}
            className="fill-[var(--ink-3)] font-mono"
            fontSize="9"
          >
            Vandaag ({startAge})
          </text>
        </svg>
        {/* Klikzone verleden → popup met vermogensverloop */}
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          aria-label="Bekijk het verloop van je netto vermogen"
          title="Bekijk vermogensverloop"
          className="absolute inset-y-0 left-0 cursor-pointer bg-transparent transition-colors hover:bg-[var(--subtle)]/50 focus-visible:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-[var(--ink-3)]"
          style={{ width: `max(${todayPct}%, 44px)` }}
        />
        {/* Klikzone toekomst → volledige projectie op /toekomst */}
        <Link
          href="/toekomst"
          aria-label="Bekijk volledige projectie inclusief afbouw op /toekomst"
          title="Bekijk toekomstprojectie"
          className="absolute inset-y-0 right-0 cursor-pointer transition-colors hover:bg-[var(--subtle)]/50 focus-visible:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-[var(--ink-3)]"
          style={{ left: `max(${todayPct}%, 44px)` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap text-[10px] text-[var(--ink-3)]">
          {/* OVZ-4 — Eenvoudig: "Historisch" + "Projectie" smelten samen tot
              één regel "Verloop". Het swatch vertelt het onderscheid zelf
              (gestippeld = verleden, doorgetrokken = projectie) en de x-as
              markeert Vandaag; twee losse woorden zijn dan overbodig. */}
          {simple && (
            <span
              className="inline-flex items-center gap-1.5"
              title="Links van Vandaag je werkelijke vermogen, rechts de projectie"
            >
              <svg width="16" height="2" aria-hidden="true">
                <line
                  x1="0"
                  y1="1"
                  x2="7"
                  y2="1"
                  stroke="var(--module-active-700)"
                  strokeWidth="1.5"
                  strokeDasharray="3 2"
                />
                <line
                  x1="8"
                  y1="1"
                  x2="16"
                  y2="1"
                  stroke="var(--module-active-500)"
                  strokeWidth="2"
                />
              </svg>
              Verloop
            </span>
          )}
          {/* Historisch — stippellijn-indicator. Vermeldt "deels geschat"
              wanneer maanden zijn aangevuld met het spaarritme. */}
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
              <line
                x1="0"
                y1="1"
                x2="16"
                y2="1"
                stroke="var(--module-active-700)"
                strokeWidth="1.5"
                strokeDasharray="3 2"
              />
            </svg>
            {hasEstimatedHistory ? 'Historisch (deels geschat)' : 'Historisch'}
          </span>
          )}
          {/* Projectie — doorlopende lijn-indicator. */}
          {!simple && (
          <span
            className="inline-flex items-center gap-1.5"
            title={
              fireReached
                ? `Toekomst-projectie tot eindleeftijd — ${endLabel.toLowerCase()} is bereikt`
                : 'Toekomst-projectie tot vrijheidsmoment'
            }
          >
            <svg width="16" height="2" aria-hidden="true">
              <line
                x1="0"
                y1="1"
                x2="16"
                y2="1"
                stroke="var(--module-active-500)"
                strokeWidth="2"
              />
            </svg>
            Projectie
          </span>
          )}
          {/* Onzekerheidsband — gevuld rechthoekje. In Eenvoudig zonder
              percentiel-jargon: "Bandbreedte" (APP-5-taalregel, hier alvast
              toegepast op de enige P-notatie boven de vouw). */}
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
              style={{
                background: 'var(--module-active-500)',
                opacity: 0.25,
              }}
              aria-hidden="true"
            />
            {simple ? 'Bandbreedte' : 'Onzekerheid (P40–P60)'}
          </span>
          {/* Liquide vrijheidsdoel — APART van de netto-vermogen-as. De lijn toont
              je volledige vermogen (incl. huis); dit is het liquide bedrag dat je
              voor vrijheid nodig hebt. Bewust een los label, geen marker-hoogte. */}
          {freedomTargetLabel && (
            <span
              className="inline-flex items-center gap-1.5 font-mono tabular-nums"
              title="Het liquide vermogen dat je nodig hebt voor vrijheid (apart van je volledige netto vermogen incl. eigen woning)"
            >
              <span
                className="inline-block w-[2px] h-3 rounded-sm"
                style={{ background: 'var(--color-horizon-500)' }}
                aria-hidden="true"
              />
              {freedomTargetLabel}
            </span>
          )}
          {/* Eindmarker-duiding wanneer er geen apart liquide doel-label is
              (simRequiredPortfolio null/0 of vrijheid al bereikt): de SVG toont
              dan nog wél een horizon-eindmarker — zorg dat die kleur niet zonder
              legenda-context staat. Spiegelt de verticale lijn-marker. */}
          {!freedomTargetLabel && (
            <span
              className="inline-flex items-center gap-1.5"
              title="Het vrijheidsmoment in de projectie"
            >
              <span
                className="inline-block w-[2px] h-3 rounded-sm"
                style={{ background: 'var(--color-horizon-500)' }}
                aria-hidden="true"
              />
              {/* OVZ-4 — Eenvoudig: geen kaal leeftijdsgetal ("Tot 90") in de
                  legenda; die uitleg staat in de pagina-'i'. De marker houdt
                  wél zijn legenda-regel, anders zweeft er een gekleurde streep
                  in de grafiek zonder betekenis. */}
              {simple ? (fireReached ? 'Tot je eindleeftijd' : 'Vrijheidsmoment') : endMarkerText}
            </span>
          )}
        </div>
        <Link
          href="/toekomst"
          className="text-[11px] font-semibold text-horizon-700 hover:underline shrink-0"
        >
          {fireReached ? 'Bekijk afbouw →' : 'Bekijk projectie →'}
        </Link>
      </div>
      {/* Popup: netto-vermogen-verloop (klik op verleden-zone) */}
      <NetWorthHistorySheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        history={historyPoints}
        currentNetWorth={currentNetWorth}
        dailyExpense={dailyExpense}
      />
    </div>
  )
}

// memo(): de chart re-rendert alleen bij daadwerkelijk gewijzigde props. Werkt
// samen met de gestabiliseerde props uit OverzichtHero (stabiele lege-array-ref
// voor `netWorthHistory`, primitieve `?? null/0/false`-defaults) — anders zou
// een verse prop-referentie deze memo bij elke parent-render alsnog breken.
export const MiniNetWorthChart = memo(MiniNetWorthChartComponent)
