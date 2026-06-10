'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { computeConfidenceBand } from '@/lib/confidence-band'
import { NetWorthHistorySheet, type HistoryPoint } from './networth-history-sheet'

/**
 * MiniNetWorthChart — compacte netto-vermogen-grafiek voor /overzicht hero.
 *
 * Bron-van-waarheid: gebruikt **dezelfde simulatie-data** als de grafiek
 * op /toekomst (`simRows` uit `runUnifiedProjection`). Geen lineaire
 * benadering, geen eigen groei-rate — exact dezelfde curve als
 * /toekomst toont voor het vandaag → vrijheid-segment. Hierdoor komen
 * vrijheidsleeftijd én doelbedrag bij vrijheid 1:1 overeen tussen de
 * twee pagina's.
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
export function MiniNetWorthChart({
  netWorthHistory,
  currentNetWorth,
  currentAge,
  fireAge,
  endAge,
  isPensioenMode,
  simRows,
  simRequiredPortfolio,
  monthlySavings,
}: {
  netWorthHistory: { month: string; value: number }[]
  currentNetWorth: number
  currentAge: number | null
  fireAge: number | null
  endAge: number | null
  isPensioenMode?: boolean
  /**
   * Per-jaar projectie-rijen uit `runUnifiedProjection`. Wanneer aanwezig:
   * de chart gebruikt deze waardes 1:1 (consistent met /toekomst). Wanneer
   * afwezig (sim mislukt op server): empty-state-CTA.
   */
  simRows?: { age: number; endPortfolio: number }[] | null
  /**
   * Vereist FIRE-portfolio bij vrijheidsmoment uit de simulatie. Wanneer
   * gegeven gebruikt de chart deze waarde voor het eind-marker-bedrag
   * i.p.v. de simRows-waarde op fireAge. Verzekert dat /overzicht en
   * /toekomst exact hetzelfde "doelbedrag bij vrijheid" tonen.
   */
  simRequiredPortfolio?: number | null
  /**
   * Geschatte maandelijkse vermogensgroei (spaarritme) — gebruikt om
   * ontbrekende historie-maanden te back-casten wanneer er minder dan
   * 3 echte waarderingen zijn. Null/undefined → vlak geschat verloop.
   */
  monthlySavings?: number | null
}) {
  // Netto vermogen + eindbedrag zijn saldi → honoreren de privacy-toggle.
  // Hooks vóór elke early-return aangeroepen (rules-of-hooks). De numerieke
  // chart-coördinaten blijven ongemoeid; alleen de zichtbare bedrag-tekst maskt.
  const { masked } = useMaskedAmounts()
  const [historyOpen, setHistoryOpen] = useState(false)
  // Unieke gradient-id per instantie — voorkomt botsende SVG-defs wanneer
  // de chart meermaals op één pagina staat.
  const gradientId = useId()

  // SVG-dimensies
  const W = 420
  const H = 140
  const PAD_LEFT = 8
  const PAD_RIGHT = 8
  const PAD_TOP = 16
  const PAD_BOTTOM = 18
  const chartW = W - PAD_LEFT - PAD_RIGHT
  const chartH = H - PAD_TOP - PAD_BOTTOM

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

  if (currentAge == null || projectionEndAge == null || !simRows || simRows.length === 0) {
    return (
      <Link
        href="/toekomst"
        className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-4 sm:p-6 text-center hover:border-violet-300 transition-colors min-h-[140px] h-full"
      >
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Vermogen door de tijd
        </div>
        <p className="mt-2 text-sm text-[var(--ink-2)]">
          Vul je profiel aan om je vermogensgroei tot{' '}
          {isPensioenMode ? 'pensioen' : 'vrijheid'} te zien.
        </p>
        <span className="mt-3 text-xs font-semibold text-violet-700">
          Bekijk projectie →
        </span>
      </Link>
    )
  }

  // Narrowed copies — guard hierboven sluit null uit.
  const startAge: number = currentAge
  const finalAge: number = projectionEndAge

  // Projectie-segment: simRows van vandaag → finalAge. Voeg vandaag-punt
  // bovenaan toe (currentNetWorth) zodat het startpunt scherp is en niet
  // mogelijk verschilt van simRows[0] (dat het einde van jaar 0 is).
  const projRowsInRange = simRows.filter(
    (r) => r.age >= startAge && r.age <= finalAge,
  )
  const projection: { age: number; value: number }[] = [
    { age: startAge, value: currentNetWorth },
    ...projRowsInRange.map((r) => ({ age: r.age, value: r.endPortfolio })),
  ]
  // Dedupe identieke leeftijden (currentAge kan al in simRows zitten);
  // hou de eerste — currentNetWorth is de waarheid voor vandaag.
  const seen = new Set<number>()
  const dedupedProjection = projection.filter((p) => {
    if (seen.has(p.age)) return false
    seen.add(p.age)
    return true
  })

  // Eindwaarde komt primair uit simRequiredPortfolio (= "doelbedrag bij
  // vrijheid" zoals /toekomst dat ook toont). Bij bereikte vrijheid is
  // het marker-bedrag de gesimuleerde stand op de eindleeftijd, niet het
  // (al gehaalde) doelbedrag.
  const endValue =
    !fireReached && simRequiredPortfolio != null && simRequiredPortfolio > 0
      ? simRequiredPortfolio
      : dedupedProjection[dedupedProjection.length - 1]?.value ?? currentNetWorth
  const endLabel = isPensioenMode ? 'Pensioen' : 'Vrijheid'

  // ── Historie: minimaal 3 maanden ─────────────────────────────────
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

  return (
    <div className="flex flex-col rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4 transition-all h-full">
      <header className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Netto vermogen door de tijd
        </span>
        <span className="text-xs font-mono tabular-nums text-[var(--ink-3)]">
          {fireReached
            ? `${endLabel} bereikt — verloop tot ${finalAgeLabel}`
            : `→ ${formatMaskedCurrency(endValue, masked)} bij ${endLabel.toLowerCase()}`}
        </span>
      </header>
      <div className="font-serif text-xl font-semibold text-[var(--ink)] tabular-nums">
        {formatMaskedCurrency(currentNetWorth, masked)}
      </div>
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
              <stop offset="0%" stopColor="var(--module-active-500, #10b981)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--module-active-500, #10b981)" stopOpacity="0" />
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
              stroke="var(--module-active-700, #047857)"
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
              fill="var(--module-active-500, #10b981)"
              opacity="0.14"
              stroke="none"
            />
          )}
          {/* Projectie-lijn — doorlopend van Vandaag naar het eindpunt */}
          <path
            d={projPath}
            fill="none"
            stroke="var(--module-active-700, #047857)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Vandaag-marker */}
          <circle
            cx={todayX}
            cy={valueToYClamped(currentNetWorth)}
            r="4"
            fill="var(--module-active-700, #047857)"
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
            stroke="var(--horizon-500, #8b5cf6)"
            strokeWidth="1"
            strokeDasharray="2 3"
            opacity="0.6"
          />
          <circle cx={ageToX(finalAge)} cy={valueToY(endValue)} r="4" fill="var(--horizon-500, #8b5cf6)" />
          <text
            x={ageToX(finalAge)}
            y={PAD_TOP - 4}
            textAnchor="end"
            className="fill-[var(--horizon-700,#6d28d9)] font-mono"
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
          {/* Historisch — stippellijn-indicator. Vermeldt "deels geschat"
              wanneer maanden zijn aangevuld met het spaarritme. */}
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
                stroke="var(--module-active-700, #10b981)"
                strokeWidth="1.5"
                strokeDasharray="3 2"
              />
            </svg>
            {hasEstimatedHistory ? 'Historisch (deels geschat)' : 'Historisch'}
          </span>
          {/* Projectie — doorlopende lijn-indicator. */}
          <span
            className="inline-flex items-center gap-1.5"
            title={
              fireReached
                ? 'Toekomst-projectie tot eindleeftijd — vrijheid is bereikt'
                : 'Toekomst-projectie tot vrijheidsmoment'
            }
          >
            <svg width="16" height="2" aria-hidden="true">
              <line
                x1="0"
                y1="1"
                x2="16"
                y2="1"
                stroke="var(--module-active-500, #10b981)"
                strokeWidth="2"
              />
            </svg>
            Projectie
          </span>
          {/* Onzekerheidsband — gevuld rechthoekje. */}
          <span
            className="inline-flex items-center gap-1.5"
            title="P40–P60 bandbreedte op basis van marktvolatiliteit σ × √t"
          >
            <span
              className="inline-block w-3 h-2 rounded-sm"
              style={{
                background: 'var(--module-active-500, #10b981)',
                opacity: 0.25,
              }}
              aria-hidden="true"
            />
            Onzekerheid (P40–P60)
          </span>
        </div>
        <Link
          href="/toekomst"
          className="text-[11px] font-semibold text-violet-700 hover:underline shrink-0"
        >
          Bekijk afbouw →
        </Link>
      </div>
      {/* Popup: netto-vermogen-verloop (klik op verleden-zone) */}
      <NetWorthHistorySheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        history={historyPoints}
        currentNetWorth={currentNetWorth}
      />
    </div>
  )
}
