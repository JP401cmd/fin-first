'use client'

import { useMemo } from 'react'
import { Kicker } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { formatMaskedCurrency } from '@/lib/format'
import { summarizeFlow, type AnalysisTransaction, type FlowSummary } from '@/lib/transaction-insights'
import { isRealAggRow } from '@/lib/server-data/tx-aggregates'
import type { Budget } from '@/lib/budget-data'

/**
 * GeldstroomDaggrafiek — de dagelijkse in/uit-staven met cumulatieve saldolijn
 * en forecast-curve, verhuisd van de cashflow-hub (`components/app/cash-overview.tsx`)
 * naar de transactiepagina (UR3-28, fase 2b).
 *
 * ── WAAROM ALLEEN IN DE MAAND-STAND ──────────────────────────────────────────
 * Deze grafiek is fundamenteel MAAND-vormig: hij plot dag-van-de-maand op de
 * x-as, kent een "vandaag"-marker op `dayOfMonth`, en zijn forecast-curve loopt
 * tot `daysInMonth`. Een rollend 30-dagen-venster, een kwartaal of een jaar
 * heeft geen van die drie ankers. De call-site rendert 'm daarom uitsluitend
 * bij `period === 'month'`; voor de overige perioden dekken de heatmap en het
 * weekdag-patroon dezelfde textuur.
 *
 * ── CONSUME, DON'T RECOMPUTE ─────────────────────────────────────────────────
 * Elke optelling hier loopt via `summarizeFlow` — dezelfde functie die de
 * periode-samenvatting van de pagina maakt. Per dag (de staven), per
 * historische maanddag (het forecast-patroon). Daarmee is de som van de staven
 * per constructie gelijk aan `summary`, en beschrijven grafiek en cijfers op
 * hetzelfde scherm gegarandeerd dezelfde populatie — precies de eigenschap die
 * bevinding H6 op de hub miste. Het TOTAAL komt bovendien niet uit deze
 * component maar als prop binnen (`summary`), zodat de grafiek geen tweede
 * grondslag kan introduceren.
 *
 * De forecast-logica zelf is ONGEWIJZIGD overgenomen van de hub: historisch
 * dagpatroon over de 12 maanden vóór de periode, met terugval op het huidige
 * tempo. Het patroon komt uit rijen die de pagina al in geheugen heeft
 * (`resolveFetchWindow` haalt 12 maanden vóór de periode op) — geen extra query.
 */

/** Eén dag-van-de-maand-gemiddelde uit de 12 maanden vóór deze maand. */
type HistoricalDayPattern = Array<{ day: number; avgIncome: number; avgExpense: number }>

export function GeldstroomDaggrafiek({
  transactions,
  priorTransactions,
  budgets,
  summary,
  monthStart,
  monthLabel,
  now,
}: {
  /** Transacties van de gekozen kalendermaand (= `currentTxns` bij period 'month'). */
  transactions: AnalysisTransaction[]
  /** Rijen vóór de periode — voedt het historische dagpatroon van de forecast. */
  priorTransactions: AnalysisTransaction[]
  /** Volledige budgetrijen; leveren de maandlimiet-grondslag van de prognose. */
  budgets: Budget[]
  /** De periode-samenvatting van de call-site. Niet hier herberekend. */
  summary: FlowSummary
  /** ISO 'yyyy-mm-dd' van de eerste dag van de getoonde maand. */
  monthStart: string
  /** Leesbaar maandlabel, bv. "juni 2026". */
  monthLabel: string
  /** Expliciet meegeefbaar zodat de render deterministisch te testen is. */
  now?: Date
}) {
  const today = useMemo(() => now ?? new Date(), [now])

  const monthDate = useMemo(() => {
    const [y, m] = monthStart.split('-').map(Number)
    return new Date(y || today.getFullYear(), (m || 1) - 1, 1)
  }, [monthStart, today])

  const daysInMonth = useMemo(
    () => new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate(),
    [monthDate],
  )

  // Dagelijkse geldstroom — per dag één `summarizeFlow` over de rijen van die
  // dag, zodat classificatie en transfer-filter identiek zijn aan `summary`.
  const dailyFlow = useMemo(() => {
    const buckets: Array<{ day: number; income: number; expense: number; cumulative: number }> = []
    for (let i = 1; i <= daysInMonth; i++) buckets.push({ day: i, income: 0, expense: 0, cumulative: 0 })

    const perDay = new Map<number, AnalysisTransaction[]>()
    for (const t of transactions) {
      const day = Number(t.date.slice(8, 10))
      if (!Number.isFinite(day) || day < 1 || day > daysInMonth) continue
      const list = perDay.get(day)
      if (list) list.push(t)
      else perDay.set(day, [t])
    }

    let running = 0
    for (const b of buckets) {
      const rows = perDay.get(b.day)
      if (rows) {
        const s = summarizeFlow(rows)
        b.income = s.income
        b.expense = s.expense
      }
      running += b.income - b.expense
      b.cumulative = running
    }
    return buckets
  }, [transactions, daysInMonth])

  // `totalMonthlyBudget` = som van de expense-budget-limieten. Alleen bladeren
  // meetellen (een parent met kinderen zou dubbeltellen).
  const totalMonthlyBudget = useMemo(() => {
    const parentsWithChildren = new Set(
      budgets.filter((b) => b.parent_id).map((b) => b.parent_id as string),
    )
    let sum = 0
    for (const b of budgets) {
      if (b.budget_type !== 'expense') continue
      if (parentsWithChildren.has(b.id)) continue
      sum += Number(b.default_limit) || 0
    }
    return sum
  }, [budgets])

  // Historisch dagpatroon: per dag-van-de-maand het gemiddelde inkomen/uitgave
  // over de maanden vóór deze maand die die dag bevatten.
  const historicalDayPattern = useMemo<HistoricalDayPattern | null>(() => {
    const perMonthDay = new Map<string, Map<number, AnalysisTransaction[]>>()
    for (const t of priorTransactions) {
      // Overboekingen tellen niet mee — en dat moet HIER gebeuren, niet pas in
      // `summarizeFlow` hieronder. `monthCount` telt de maanden die in
      // `perMonthDay` staan; laat je transfers meebucketen, dan telt een maand
      // waarin het enige verkeer een interne of partner-overboeking was mee als
      // maand met €0. Dat verdunt élk dagelijks gemiddelde en daarmee de hele
      // prognosecurve. Waren álle voorafgaande maanden zo, dan gaf het oude pad
      // `null` (→ "op basis van je huidige tempo"); zonder deze regel ontstaat
      // een nullen-patroon dat zich als "o.b.v. 12 mnd" presenteert.
      if (!isRealAggRow(t)) continue
      const monthKey = t.date.slice(0, 7)
      const day = Number(t.date.slice(8, 10))
      if (!Number.isFinite(day)) continue
      let monthMap = perMonthDay.get(monthKey)
      if (!monthMap) {
        monthMap = new Map()
        perMonthDay.set(monthKey, monthMap)
      }
      const list = monthMap.get(day)
      if (list) list.push(t)
      else monthMap.set(day, [t])
    }
    if (perMonthDay.size === 0) return null

    const monthLengths = new Map<string, number>()
    for (const monthKey of perMonthDay.keys()) {
      const [y, m] = monthKey.split('-').map(Number)
      monthLengths.set(monthKey, new Date(y, m, 0).getDate())
    }

    const pattern: HistoricalDayPattern = []
    for (let d = 1; d <= 31; d++) {
      let sumIncome = 0
      let sumExpense = 0
      let monthCount = 0
      for (const [monthKey, monthMap] of perMonthDay.entries()) {
        const len = monthLengths.get(monthKey) ?? 31
        if (d > len) continue
        monthCount++
        const rows = monthMap.get(d)
        if (rows) {
          const s = summarizeFlow(rows)
          sumIncome += s.income
          sumExpense += s.expense
        }
      }
      if (monthCount > 0) {
        pattern.push({ day: d, avgIncome: sumIncome / monthCount, avgExpense: sumExpense / monthCount })
      }
    }
    return pattern.length > 0 ? pattern : null
  }, [priorTransactions])

  // Forecast / snelheid alléén voor de huidige maand. Ongewijzigd overgenomen
  // van de cashflow-hub: de curve volgt het historisch dagverloop; zonder
  // historie valt hij terug op een lineair verloop op basis van het tempo tot nu.
  const forecast = useMemo<CashflowForecast>(() => {
    const totalIncome = summary.income
    const totalExpenses = summary.expense
    const netAmount = summary.net
    const isCurrentMonth =
      today.getFullYear() === monthDate.getFullYear() && today.getMonth() === monthDate.getMonth()

    if (!isCurrentMonth) {
      return {
        isCurrentMonth: false,
        daysInMonth,
        dayOfMonth: daysInMonth,
        projectedExpenses: totalExpenses,
        projectedNet: netAmount,
        expectedByNow: 0,
        velocity: 0,
        forecastSource: 'actual' as const,
        forecastPath: [],
      }
    }

    const dayOfMonth = Math.min(today.getDate(), daysInMonth)
    const daysRemaining = Math.max(0, daysInMonth - dayOfMonth)

    const cumulativeToday = (() => {
      let running = 0
      for (let i = 0; i < dayOfMonth; i++) {
        const d = dailyFlow[i]
        if (d) running += d.income - d.expense
      }
      return running
    })()

    let forecastSource: 'historical' | 'current_pace'
    const forecastPath: Array<{ day: number; cumulative: number }> = []

    const usableHistory =
      historicalDayPattern && historicalDayPattern.length > 0 ? historicalDayPattern : null

    if (usableHistory) {
      forecastSource = 'historical'
      const byDay = new Map<number, { avgIncome: number; avgExpense: number }>()
      for (const p of usableHistory) byDay.set(p.day, { avgIncome: p.avgIncome, avgExpense: p.avgExpense })
      let running = cumulativeToday
      for (let d = dayOfMonth + 1; d <= daysInMonth; d++) {
        const entry = byDay.get(d)
        if (entry) running += entry.avgIncome - entry.avgExpense
        forecastPath.push({ day: d, cumulative: running })
      }
    } else {
      forecastSource = 'current_pace'
      const dailyNet = dayOfMonth > 0 ? cumulativeToday / dayOfMonth : 0
      let running = cumulativeToday
      for (let d = dayOfMonth + 1; d <= daysInMonth; d++) {
        running += dailyNet
        forecastPath.push({ day: d, cumulative: running })
      }
    }

    const projectedNet =
      forecastPath.length > 0 ? forecastPath[forecastPath.length - 1].cumulative : cumulativeToday

    let projectedIncomeRemaining = 0
    let projectedExpenseRemaining = 0
    if (usableHistory) {
      const byDay = new Map<number, { avgIncome: number; avgExpense: number }>()
      for (const p of usableHistory) byDay.set(p.day, { avgIncome: p.avgIncome, avgExpense: p.avgExpense })
      for (let d = dayOfMonth + 1; d <= daysInMonth; d++) {
        const e = byDay.get(d)
        if (e) {
          projectedIncomeRemaining += e.avgIncome
          projectedExpenseRemaining += e.avgExpense
        }
      }
    } else {
      const dailyExpenseRate = dayOfMonth > 0 ? totalExpenses / dayOfMonth : 0
      projectedExpenseRemaining = dailyExpenseRate * daysRemaining
      // Inkomen-extrapolatie zonder historie is bewust 0 — de meeste salarissen
      // komen één keer en zijn al binnen; een "tempo"-aanname zou het cijfer
      // opblazen.
    }
    const projectedExpenses = totalExpenses + projectedExpenseRemaining
    const projectedIncome = totalIncome + projectedIncomeRemaining

    const expectedByNow = totalMonthlyBudget * (dayOfMonth / daysInMonth)
    const velocity = expectedByNow > 0 ? totalExpenses / expectedByNow : 0

    return {
      isCurrentMonth: true,
      daysInMonth,
      dayOfMonth,
      projectedExpenses,
      projectedIncome,
      projectedNet,
      expectedByNow,
      velocity,
      forecastSource,
      forecastPath,
    }
  }, [today, monthDate, daysInMonth, dailyFlow, historicalDayPattern, summary, totalMonthlyBudget])

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {/* Blok-aanhef als `Kicker`, net als `PeriodeTrend`/`WeekdagPatroon`
            hiernaast — de analyseblokken op deze pagina dragen geen eigen kop,
            zodat de koppenvolgorde van de route niet uit één losse h3 bestaat. */}
        <div className="flex items-center gap-2">
          <Kicker>Geldstroom per dag</Kicker>
          <span
            className="text-[11px] italic text-[var(--ink-4)]"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            {monthLabel.toLowerCase()}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          <span className="flex items-center gap-1.5">
            <span className="block h-2 w-2 bg-positive" aria-hidden="true" />
            <span>Inkomsten</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="block h-2 w-2 bg-negative" aria-hidden="true" />
            <span>Uitgaven</span>
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            <span className="block h-px w-3 bg-[var(--ink-2)]" aria-hidden="true" />
            <span>Saldo</span>
          </span>
        </div>
      </div>

      <CashflowChart
        data={dailyFlow}
        netAmount={summary.net}
        totalIncome={summary.income}
        totalExpenses={summary.expense}
        totalMonthlyBudget={totalMonthlyBudget}
        forecast={forecast}
      />
    </div>
  )
}

// ── Geldstroom-grafiek ────────────────────────────────────────────
//
// SVG-grafiek over de getoonde maand. Per dag een groene balk omhoog
// (inkomsten) en rode balk omlaag (uitgaven), plus een dunne lijn die
// het cumulatieve saldo vanaf dag 1 traceert. Footer-strip toont totaal
// in/uit + snelheid + prognose in dezelfde regel.

interface CashflowForecast {
  isCurrentMonth: boolean
  daysInMonth: number
  dayOfMonth: number
  projectedExpenses: number
  projectedIncome?: number
  projectedNet: number
  expectedByNow: number
  velocity: number
  forecastSource: 'historical' | 'current_pace' | 'actual'
  forecastPath: Array<{ day: number; cumulative: number }>
}

interface CashflowChartProps {
  data: Array<{ day: number; income: number; expense: number; cumulative: number }>
  netAmount: number
  totalIncome: number
  totalExpenses: number
  totalMonthlyBudget: number
  forecast: CashflowForecast
}

function CashflowChart({
  data,
  netAmount,
  totalIncome,
  totalExpenses,
  totalMonthlyBudget,
  forecast,
}: CashflowChartProps) {
  // De y-as-labels zijn platte SVG-tekst en kunnen niet door `<MaskedAmount>`;
  // `formatMaskedCurrency` is de bron-variant daarvan. Op de hub stond hier een
  // kale `formatCurrency`, waarmee de bedragen dwars door de privacy-modus heen
  // lazen — bij de verhuizing rechtgezet.
  const { masked } = useMaskedAmounts()

  // Forecast cumulative voor toekomstige dagen — komt rechtstreeks uit
  // `forecast.forecastPath` (per dag), gebaseerd op het historisch
  // dagverloop van de afgelopen 12 maanden. Alleen actief in de huidige maand.
  const todayIdx = forecast.isCurrentMonth
    ? Math.min(forecast.dayOfMonth - 1, data.length - 1)
    : data.length - 1
  const cumToday = data[todayIdx]?.cumulative ?? 0

  // Eén gedeelde y-schaal voor bars (incomes + expenses) én cumulatief-lijn
  // én forecast-curve. Anders meten gebruikers in hun hoofd twee
  // verschillende waardes — een €100-bar leek even hoog als een €5.000-saldo.
  const forecastCumulatives = forecast.forecastPath.map((p) => p.cumulative)
  const allCumValues = [
    ...data.slice(0, todayIdx + 1).map((d) => d.cumulative),
    ...forecastCumulatives,
  ]
  const yMaxRaw = Math.max(0, ...allCumValues, ...data.map((d) => d.income))
  const yMinRaw = Math.min(0, ...allCumValues, ...data.map((d) => -d.expense))

  // Nice-step algoritme voor y-as ticks: round naar 1/2/5×10^n zodat
  // labels schoon zijn (€0, €100, €1.000, …) onafhankelijk van data-range.
  const range = Math.max(yMaxRaw - yMinRaw, 1)
  const niceStep = (() => {
    const target = range / 4
    const exp = Math.floor(Math.log10(target))
    const mag = Math.pow(10, exp)
    const norm = target / mag
    if (norm < 1.5) return 1 * mag
    if (norm < 3) return 2 * mag
    if (norm < 7) return 5 * mag
    return 10 * mag
  })()
  const yMax = Math.ceil(yMaxRaw / niceStep) * niceStep || niceStep
  const yMin = Math.floor(yMinRaw / niceStep) * niceStep
  const ySpan = Math.max(yMax - yMin, niceStep)

  const ticks: number[] = []
  for (let v = yMin; v <= yMax + niceStep * 0.001; v += niceStep) {
    // Rond naar dichtstbijzijnde integer-cent om floating-point-drift weg te
    // werken bij kleine stappen.
    ticks.push(Math.round(v * 100) / 100)
  }

  const W = 640
  const H = 200
  const padLeft = 56 // ruimte voor y-as labels
  const padX = 8
  const padTop = 8
  const padBottom = 20
  const innerW = W - padLeft - padX
  const innerH = H - padTop - padBottom

  const yToPixel = (v: number) => padTop + innerH - ((v - yMin) / ySpan) * innerH
  const baselineY = yToPixel(0)

  const slotW = innerW / Math.max(data.length, 1)
  const barW = Math.max(2, slotW * 0.55)

  const xForIdx = (i: number) => padLeft + slotW * i + slotW / 2

  // Cumulatieve lijn t/m vandaag (massief).
  const actualLinePath = data
    .slice(0, todayIdx + 1)
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xForIdx(i).toFixed(2)} ${yToPixel(d.cumulative).toFixed(2)}`)
    .join(' ')

  // Forecast-curve — gestippeld vanaf vandaag, volgt het historisch
  // dagverloop. We starten het pad bij (todayIdx, cumToday) en plotten
  // vervolgens elk forecast-punt; door dezelfde y-schaal te delen sluit
  // de curve naadloos aan op het actual-pad.
  const showForecast = forecast.isCurrentMonth && forecast.forecastPath.length > 0
  const forecastStartX = xForIdx(todayIdx)
  const forecastStartY = yToPixel(cumToday)
  const forecastPathStr = showForecast
    ? `M ${forecastStartX.toFixed(2)} ${forecastStartY.toFixed(2)} ` +
      forecast.forecastPath
        .map((p) => `L ${xForIdx(p.day - 1).toFixed(2)} ${yToPixel(p.cumulative).toFixed(2)}`)
        .join(' ')
    : ''

  const labelDays = data.map((d) => d.day).filter((d) => d === 1 || d === data.length || d % 5 === 0)

  const hasActivity = data.some((d) => d.income > 0 || d.expense > 0)

  // Snelheid-tone: <90% goed, 90-110% op tempo, >110% te snel.
  const velocityPct = forecast.velocity * 100
  const velocityTone =
    !forecast.isCurrentMonth || forecast.expectedByNow === 0
      ? 'text-[var(--ink-2)]'
      : velocityPct < 90
        ? 'text-positive'
        : velocityPct <= 110
          ? 'text-[var(--ink-2)]'
          : 'text-negative'
  const velocityLabel =
    !forecast.isCurrentMonth || forecast.expectedByNow === 0
      ? '—'
      : velocityPct < 90
        ? 'rustig'
        : velocityPct <= 110
          ? 'op tempo'
          : 'te snel'

  // Forecast-tone: prognose binnen budget = goed, daarboven = rood.
  const forecastOverBudget =
    forecast.isCurrentMonth &&
    totalMonthlyBudget > 0 &&
    forecast.projectedExpenses > totalMonthlyBudget
  const forecastTone = forecast.isCurrentMonth
    ? forecastOverBudget
      ? 'text-negative'
      : 'text-[var(--ink-2)]'
    : 'text-[var(--ink-3)]'

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[200px] w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Geldstroom per dag"
      >
        {/* Y-as gridlines + labels — stille horizontale rules + bedrag links */}
        {ticks.map((tick) => {
          const y = yToPixel(tick)
          const isZero = tick === 0
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                x2={W - padX}
                y1={y}
                y2={y}
                stroke="var(--border-md)"
                strokeWidth={isZero ? 1 : 0.5}
                opacity={isZero ? 1 : 0.4}
                strokeDasharray={isZero ? '' : '2 3'}
              />
              <text
                x={padLeft - 6}
                y={y + 3}
                textAnchor="end"
                fontSize={9}
                fill="var(--ink-4)"
                fontFamily="var(--font-mono, ui-monospace)"
              >
                {formatMaskedCurrency(tick, masked)}
              </text>
            </g>
          )
        })}

        {/* Vandaag-marker (verticale stippellijn) */}
        {forecast.isCurrentMonth && todayIdx < data.length - 1 && (
          <line
            x1={forecastStartX}
            x2={forecastStartX}
            y1={padTop}
            y2={padTop + innerH}
            stroke="var(--ink-4)"
            strokeWidth={1}
            strokeDasharray="2 3"
            opacity={0.6}
          />
        )}

        {/* Per-dag bars — alleen voor actuals (t/m vandaag in de huidige maand).
            Gebruikt dezelfde y-schaal als de cumulatief-lijn: een €100-bar
            staat exact op €100 op de y-as, naast een eventuele €5.000-saldolijn. */}
        {data.map((d, i) => {
          if (forecast.isCurrentMonth && i > todayIdx) return null
          const xCenter = xForIdx(i)
          const incTop = yToPixel(d.income)
          const expBottom = yToPixel(-d.expense)
          return (
            <g key={d.day}>
              {d.income > 0 && (
                <rect
                  x={xCenter - barW / 2}
                  y={incTop}
                  width={barW}
                  height={Math.max(0, baselineY - incTop)}
                  fill="var(--positive)"
                  opacity={0.85}
                />
              )}
              {d.expense > 0 && (
                <rect
                  x={xCenter - barW / 2}
                  y={baselineY}
                  width={barW}
                  height={Math.max(0, expBottom - baselineY)}
                  fill="var(--negative)"
                  opacity={0.8}
                />
              )}
            </g>
          )
        })}

        {/* Cumulatief saldo-lijn t/m vandaag */}
        {hasActivity && actualLinePath && (
          <path
            d={actualLinePath}
            fill="none"
            stroke="var(--ink-2)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Forecast-curve — gestippeld, volgt historisch dagpatroon */}
        {showForecast && (
          <path
            d={forecastPathStr}
            fill="none"
            stroke={forecastOverBudget ? 'var(--negative)' : 'var(--ink-3)'}
            strokeWidth={1.5}
            strokeDasharray="3 3"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {labelDays.map((day) => (
          <text
            key={day}
            x={xForIdx(day - 1)}
            y={H - 4}
            textAnchor="middle"
            fontSize={10}
            fill="var(--ink-4)"
            fontFamily="var(--font-mono, ui-monospace)"
          >
            {day}
          </text>
        ))}
      </svg>

      {!hasActivity && (
        <p
          className="mt-2 text-center text-xs italic text-[var(--ink-4)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Geen transacties deze maand
        </p>
      )}

      {/* Footer-strip: 4 KPI's — Inkomsten · Uitgaven (vs budget) · Snelheid · Prognose */}
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--border-ed)] pt-3 sm:grid-cols-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">Inkomsten</div>
          <div className="font-mono text-sm font-semibold tabular-nums text-positive">
            <MaskedAmount value={totalIncome} tone="kern" decimals />
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">Uitgaven</div>
          <div className="font-mono text-sm font-semibold tabular-nums text-negative">
            <MaskedAmount value={totalExpenses} tone="kern" decimals />
          </div>
          {totalMonthlyBudget > 0 && (
            <div className="mt-0.5 font-mono text-[10px] tabular-nums text-[var(--ink-4)]">
              van <MaskedAmount value={totalMonthlyBudget} tone="kern" decimals />
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">Snelheid</div>
          <div className={`font-mono text-sm font-semibold tabular-nums ${velocityTone}`}>
            {forecast.isCurrentMonth && forecast.expectedByNow > 0 ? `${velocityPct.toFixed(0)}%` : '—'}
          </div>
          <div
            className="mt-0.5 text-[10px] italic text-[var(--ink-4)]"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            {velocityLabel}
          </div>
        </div>
        <div className="text-left sm:text-right">
          <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            {forecast.isCurrentMonth ? 'Prognose' : 'Netto'}
          </div>
          <div
            className={`text-sm font-semibold ${
              forecast.isCurrentMonth
                ? forecastTone
                : netAmount >= 0
                  ? 'text-positive'
                  : 'text-negative'
            }`}
          >
            {forecast.isCurrentMonth ? (
              <MaskedAmount
                value={forecast.projectedExpenses}
                tone="kern"
                decimals
                className="text-sm font-semibold"
              />
            ) : (
              <MaskedAmount
                value={netAmount}
                signPrefix={netAmount >= 0 ? '+' : ''}
                tone="kern"
                decimals
                className="text-sm font-semibold"
              />
            )}
          </div>
          {forecast.isCurrentMonth && (
            <div className="mt-0.5 font-mono text-[10px] tabular-nums text-[var(--ink-4)]">
              {totalMonthlyBudget > 0 ? (
                forecastOverBudget ? (
                  <>
                    <MaskedAmount
                      value={forecast.projectedExpenses - totalMonthlyBudget}
                      signPrefix="+"
                      tone="kern"
                      decimals
                    />{' '}
                    over
                  </>
                ) : (
                  <>
                    <MaskedAmount
                      value={totalMonthlyBudget - forecast.projectedExpenses}
                      tone="kern"
                      decimals
                    />{' '}
                    ruimte
                  </>
                )
              ) : forecast.forecastSource === 'historical' ? (
                'o.b.v. 12 mnd'
              ) : (
                'o.b.v. tempo'
              )}
            </div>
          )}
          {forecast.isCurrentMonth && totalMonthlyBudget > 0 && (
            <div
              className="mt-0.5 text-[10px] italic text-[var(--ink-4)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              {forecast.forecastSource === 'historical' ? 'o.b.v. 12 mnd historie' : 'o.b.v. huidig tempo'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
