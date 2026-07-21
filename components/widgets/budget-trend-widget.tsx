'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { calculateFreedomTime, formatFreedomTimeString, dailyExpenseRate } from '@/lib/format'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { DashboardData } from './widget-renderer'
import { TrendingUp, ShoppingCart, PiggyBank, CreditCard } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

type BudgetType = 'income' | 'expense' | 'savings' | 'debt'

interface Props {
  budgetType: BudgetType
  size: WidgetSize
  data: DashboardData
  href?: string
}

interface TypeConfig {
  kicker: string
  icon: LucideIcon
  strokeColor: string
  fillColor: string
  iconBg: string
  iconText: string
  emptyMessage: string
  /** Is een STIJGING gunstig? income/savings = ja, expense/debt = nee.
   *  Bepaalt de kleur (positief/negatief) van de MoM-indicator; méér uitgeven
   *  hoort rood, niet groen. Alleen de kleur draait — de pijl volgt de richting. */
  goodWhenUp: boolean
  /** Aantal maanden dat de XL-histogram probeert te tonen. Degradeert netjes naar
   *  de beschikbare bundelhistorie (nu ~12 mnd) als er minder is. Inkomen krijgt
   *  een breder venster (24) omdat de dubbele breedte daar ruimte voor biedt. */
  xlHistoryMonths: number
  /** Woord voor de referentielijn/streefwaarde. Inkomen heeft geen "budget" maar
   *  een streven → per type een passend label i.p.v. het generieke "budget". */
  limitLabel: string
  /** Is de reeks een SALDO/voorraad (schuld) i.p.v. een maandstroom (inkomen/
   *  uitgaven/sparen)? Schuld toont het openstaand saldo (Optie B): een maand-budget-
   *  referentielijn is dan betekenisloos en de vrijheidstijd is geen "/maand"-stroom
   *  maar de vrijheid die je terugkoopt door de schuld af te lossen. */
  isStock: boolean
}

const TYPE_CONFIGS: Record<BudgetType, TypeConfig> = {
  income: {
    kicker: 'Inkomentrend',
    icon: TrendingUp,
    strokeColor: 'var(--color-income-500)',
    fillColor: 'var(--color-income-100)',
    iconBg: 'bg-income-50',
    iconText: 'text-income-600',
    emptyMessage: 'Nog geen inkomsten geregistreerd.',
    goodWhenUp: true,
    xlHistoryMonths: 24,
    limitLabel: 'streven',
    isStock: false,
  },
  expense: {
    kicker: 'Uitgaventrend',
    icon: ShoppingCart,
    strokeColor: 'var(--color-expense-500)',
    fillColor: 'var(--color-expense-100)',
    iconBg: 'bg-expense-50',
    iconText: 'text-expense-600',
    emptyMessage: 'Nog geen uitgaven geregistreerd.',
    goodWhenUp: false,
    xlHistoryMonths: 12,
    limitLabel: 'budget',
    isStock: false,
  },
  savings: {
    kicker: 'Spaartrend',
    icon: PiggyBank,
    strokeColor: 'var(--color-savings-500)',
    fillColor: 'var(--color-savings-100)',
    iconBg: 'bg-savings-50',
    iconText: 'text-savings-600',
    emptyMessage: 'Nog geen spaartransacties geregistreerd.',
    goodWhenUp: true,
    xlHistoryMonths: 12,
    limitLabel: 'doel',
    isStock: false,
  },
  debt: {
    kicker: 'Schuldtrend',
    icon: CreditCard,
    strokeColor: 'var(--color-debt-500)',
    fillColor: 'var(--color-debt-100)',
    iconBg: 'bg-debt-50',
    iconText: 'text-debt-600',
    emptyMessage: 'Nog geen schuld geregistreerd.',
    goodWhenUp: false,
    xlHistoryMonths: 12,
    limitLabel: 'plan',
    isStock: true,
  },
}

// ── Maandlabels (YYYY-MM → NL-afkorting) ─────────────────────
const NL_MONTHS_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
function monthShort(m: string): string {
  const mm = parseInt(m.slice(5, 7), 10)
  return NL_MONTHS_SHORT[mm - 1] ?? ''
}

// ── Sparkline SVG ────────────────────────────────────────────

function formatCompact(v: number): string {
  if (v >= 10000) return `${(v / 1000).toFixed(0)}k`
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`.replace('.0k', 'k')
  return v.toFixed(0)
}

function Sparkline({
  points,
  width,
  height,
  strokeColor,
  fillColor,
  limitValue,
  hasEntered,
  showLabels = false,
  ariaLabel,
}: {
  points: { month: string; value: number }[]
  width: number
  height: number
  strokeColor: string
  fillColor: string
  limitValue?: number
  hasEntered: boolean
  showLabels?: boolean
  ariaLabel?: string
}) {
  if (points.length < 2) return null

  const values = points.map(p => p.value)
  const allValues = limitValue != null ? [...values, limitValue] : values
  const max = Math.max(...allValues)
  const min = Math.min(0, ...allValues)
  const range = max - min || 1
  const labelPadX = showLabels ? 28 : 0
  const pad = 2

  const toX = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2 - labelPadX)
  const toY = (v: number) => height - pad - ((v - min) / range) * (height - pad * 2)

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${toX(points.length - 1).toFixed(1)},${height} L${toX(0).toFixed(1)},${height} Z`

  const firstVal = points[0].value
  const lastVal = points[points.length - 1].value
  const fontSize = height >= 50 ? 8 : 7

  // Clamp label Y so it stays within the SVG bounds (min fontSize from top, max height - 2 from bottom)
  const firstY = toY(firstVal)
  const lastY = toY(lastVal)
  const startLabelY = Math.max(fontSize + 1, Math.min(firstY - 4, height - 2))
  // End label: position beside the line endpoint, clamped to bounds
  const endLabelY = Math.max(fontSize + 1, Math.min(lastY + 3, height - 2))

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      className="block"
      role="img"
      aria-label={ariaLabel}
    >
      {/* Gradient fill under line */}
      <path
        d={areaPath}
        fill={fillColor}
        opacity={hasEntered ? 0.4 : 0}
        style={{ transition: 'opacity 600ms ease' }}
      />
      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={hasEntered ? 0 : 1}
        style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(.22,1,.36,1)' }}
      />
      {/* Budget limit reference line */}
      {limitValue != null && limitValue > 0 && (
        <line
          x1={pad}
          y1={toY(limitValue)}
          x2={width - pad}
          y2={toY(limitValue)}
          stroke="var(--ink-4)"
          strokeWidth={0.75}
          strokeDasharray="3 2"
          opacity={hasEntered ? 0.5 : 0}
          style={{ transition: 'opacity 600ms ease 300ms' }}
        />
      )}
      {/* Start and end value labels */}
      {showLabels && hasEntered && (
        <>
          <text
            x={toX(0)}
            y={startLabelY}
            fontSize={fontSize}
            fill="var(--ink-3)"
            fontFamily="var(--font-mono)"
            textAnchor="start"
          >
            {formatCompact(firstVal)}
          </text>
          <text
            x={toX(points.length - 1) + 4}
            y={endLabelY}
            fontSize={fontSize}
            fill={strokeColor}
            fontFamily="var(--font-mono)"
            fontWeight={600}
            textAnchor="start"
          >
            {formatCompact(lastVal)}
          </text>
        </>
      )}
    </svg>
  )
}

// ── Budget-histogram (XL) ────────────────────────────────────
// 12-maands staafhistogram met budgetband: per maand een staaf, de
// gestreepte lijn = de budgetlimiet. Maanden bóven de limiet krijgen
// een vollere staaf zodat "over budget" in één oogopslag leest.
function BudgetHistogram({
  points,
  width,
  height,
  barColor,
  limitValue,
  limitLabel = 'budget',
  hasEntered,
  showValueLabels = false,
  ariaLabel,
}: {
  points: { month: string; value: number }[]
  width: number
  height: number
  barColor: string
  limitValue?: number
  limitLabel?: string
  hasEntered: boolean
  /** Toont per maand het waarde-bedrag boven de staaf (compact, bv. "1.2k").
   *  Opt-in zodat de andere trend-varianten (inkomen/uitgaven/schuld) ongewijzigd
   *  blijven tenzij ze het bewust aanzetten. */
  showValueLabels?: boolean
  ariaLabel?: string
}) {
  if (points.length === 0) return null

  const values = points.map(p => p.value)
  const hasLimit = limitValue != null && limitValue > 0
  const max = Math.max(...values, hasLimit ? limitValue! : 0, 1)
  // Extra kopruimte wanneer waarde-labels boven de staven staan.
  const padTop = showValueLabels ? 16 : 8
  const padBottom = 16
  const padX = 2
  const innerH = height - padTop - padBottom
  const baseY = padTop + innerH
  const n = points.length
  const step = (width - padX * 2) / n
  const barW = Math.min(step * 0.6, 20)
  const toX = (i: number) => padX + step * i + (step - barW) / 2
  const toY = (v: number) => padTop + innerH - (Math.max(0, v) / max) * innerH
  const limitY = hasLimit ? toY(limitValue!) : null
  // Toon niet elke maandlabel bij veel maanden — anders overlappen ze.
  // Bij 24 mnd (inkomen-XL) elke 3e, bij 9-16 mnd elke 2e, daaronder alle.
  const labelEvery = n > 16 ? 3 : n > 8 ? 2 : 1

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      className="block"
      role="img"
      aria-label={ariaLabel}
    >
      {points.map((p, i) => {
        const over = hasLimit && p.value > limitValue!
        const y = toY(p.value)
        const h = Math.max(0, baseY - y)
        return (
          <rect
            key={p.month}
            x={toX(i)}
            y={y}
            width={barW}
            height={h}
            rx={1}
            fill={barColor}
            opacity={hasEntered ? (over ? 0.95 : 0.55) : 0}
            style={{ transition: `opacity 500ms ease ${i * 40}ms` }}
          />
        )
      })}

      {/* Per-maand waarde-labels boven de staven (opt-in) */}
      {showValueLabels &&
        points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text
              key={`val-${p.month}`}
              x={toX(i) + barW / 2}
              y={Math.max(7, toY(p.value) - 3)}
              fontSize={7}
              fill="var(--ink-3)"
              fontFamily="var(--font-mono)"
              textAnchor="middle"
              opacity={hasEntered ? 0.9 : 0}
              style={{ transition: `opacity 500ms ease ${i * 40 + 200}ms` }}
            >
              {formatCompact(p.value)}
            </text>
          ) : null,
        )}

      {/* Budgetband */}
      {limitY != null && (
        <>
          <line
            x1={padX}
            y1={limitY}
            x2={width - padX}
            y2={limitY}
            stroke="var(--ink-3)"
            strokeWidth={0.75}
            strokeDasharray="3 2"
            opacity={hasEntered ? 0.7 : 0}
            style={{ transition: 'opacity 600ms ease 300ms' }}
          />
          <text
            x={width - padX}
            y={Math.max(7, limitY - 3)}
            fontSize={7}
            fill="var(--ink-3)"
            fontFamily="var(--font-mono)"
            textAnchor="end"
            opacity={hasEntered ? 0.8 : 0}
            style={{ transition: 'opacity 600ms ease 300ms' }}
          >
            {limitLabel}
          </text>
        </>
      )}

      {/* Maandlabels */}
      {points.map((p, i) =>
        i % labelEvery === 0 ? (
          <text
            key={`lbl-${p.month}`}
            x={toX(i) + barW / 2}
            y={height - 4}
            fontSize={7}
            fill="var(--ink-4)"
            fontFamily="var(--font-mono)"
            textAnchor="middle"
          >
            {monthShort(p.month)}
          </text>
        ) : null,
      )}
    </svg>
  )
}

// ── Main component ───────────────────────────────────────────

export const BudgetTrendWidget = memo(function BudgetTrendWidget({ budgetType, size, data, href }: Props) {
  const config = TYPE_CONFIGS[budgetType]
  const history = data.budgetTypeHistory[budgetType]
  const { ref: inViewRef, hasEntered } = useInViewAnimation({ duration: 600 })
  const { icon: Icon } = config

  if (!history || history.length === 0) {
    return (
      <WidgetShell module="kern" size={size} kicker={config.kicker} href={href}>
        <WidgetEmpty icon={config.icon} message={config.emptyMessage} />
      </WidgetShell>
    )
  }

  // Current and previous month values
  const current = history[history.length - 1]
  const prev = history.length >= 2 ? history[history.length - 2] : null
  const momDelta = prev && prev.value > 0
    ? ((current.value - prev.value) / prev.value) * 100
    : null
  const isUp = momDelta != null && momDelta > 0
  // Kleur volgt de betekenis, niet de richting: méér uitgeven/schuld = rood,
  // méér inkomen/sparen = groen. De pijl blijft de feitelijke richting tonen.
  const isGood = momDelta != null && isUp === config.goodWhenUp
  const trendToneClass = momDelta == null ? '' : isGood ? 'text-positive' : 'text-negative'
  const trendWord = momDelta == null ? 'stabiel' : isUp ? 'gestegen' : 'gedaald'
  const sparkAria = momDelta != null
    ? `${config.kicker}: ${trendWord} ${Math.abs(momDelta).toFixed(0)}% t.o.v. vorige maand`
    : `${config.kicker}: verloop laatste maanden`

  // Budget limit for this type (for reference line in full). Voor schuld tonen we
  // het openstaand SALDO (Optie B); een maand-aflossingsbudget als referentielijn is
  // daar betekenisloos, dus onderdrukt (0 = geen lijn/telling).
  const budgetLimit = config.isStock ? 0 : data.budgetTotals[budgetType].limit

  // Sparkline data slicing
  const sparkData6 = history.slice(-6)
  const sparkData12 = history.slice(-12)

  // Averages
  const avg = (arr: { value: number }[]) =>
    arr.length > 0 ? arr.reduce((s, p) => s + p.value, 0) / arr.length : 0
  const avg3m = avg(history.slice(-3))
  const avg6m = avg(history.slice(-6))

  // Freedom time for full size
  // Canoniek 12-mnd rolling dagtarief uit de bundel (KRUIS-20); fallback voor mocks.
  const dailyExp = data.dailyExpenseRate ?? dailyExpenseRate(data.monthlyExpenses)
  // Stromen (inkomen/uitgaven/sparen): vrijheidstijd van de gemiddelde MAANDstroom
  // → "≈ X/maand". Schuld is een saldo (voorraad): de vrijheidstijd van het huidige
  // openstaande saldo = de vrijheid die je terugkoopt door het af te lossen.
  const freedomBase = config.isStock ? current.value : avg(history)
  const freedomTime = dailyExp > 0 && freedomBase > 0
    ? calculateFreedomTime(freedomBase, dailyExp)
    : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null
  // Label-suffix bij de "≈"-regel: maandstroom vs. terug te kopen vrijheid.
  const freedomSuffix = config.isStock ? ' terug te kopen' : '/maand'

  // ── Mini ─────────────────────────────────────────────────
  if (size === 'mini') {
    const trendColor = momDelta != null ? trendToneClass : 'text-[var(--ink)]'
    const trendArrow = momDelta != null ? (isUp ? '↑ ' : '↓ ') : ''

    return (
      <WidgetShell module="kern" size="mini" kicker={config.kicker} href={href}>
        <p className={`leading-none truncate ${trendColor}`}>
          <span className="font-mono">{trendArrow}</span>
          <MaskedAmount value={current.value} tone="kern" className="text-[15px] font-semibold" />
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter ────────────────────────────────────────────────
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker={config.kicker} href={href}>
        <div ref={inViewRef} className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--r-sm)] ${config.iconBg}`}>
              <Icon className={config.iconText} size={9} strokeWidth={2} />
            </div>
            <span className="text-[var(--ink)]">
              <MaskedAmount value={current.value} tone="kern" className="text-lg font-semibold" />
            </span>
          </div>

          {/* Trend indicator */}
          {momDelta != null && (
            <p className={`text-[11px] font-medium ${trendToneClass}`}>
              {isUp ? '↑' : '↓'} {Math.abs(momDelta).toFixed(0)}% vs vorige maand
            </p>
          )}

          {/* Mini sparkline */}
          {sparkData6.length >= 2 && (
            <div className="mt-auto">
              <Sparkline
                points={sparkData6}
                width={140}
                height={28}
                strokeColor={config.strokeColor}
                fillColor={config.fillColor}
                hasEntered={hasEntered}
                showLabels
                ariaLabel={sparkAria}
              />
            </div>
          )}
        </div>
      </WidgetShell>
    )
  }

  // ── Half ───────────────────────────────────────────────────
  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker={config.kicker} href={href}>
        <div ref={inViewRef} className="flex flex-col gap-1.5 h-full">
          {/* Header: current + delta */}
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[var(--ink)]">
              <MaskedAmount value={current.value} tone="kern" className="text-lg font-semibold" />
            </span>
            {momDelta != null && (
              <span className={`text-[11px] font-medium ${trendToneClass}`}>
                {isUp ? '↑' : '↓'} {Math.abs(momDelta).toFixed(0)}%
              </span>
            )}
          </div>

          {/* Sparkline */}
          {sparkData6.length >= 2 && (
            <div className="flex-1 min-h-0">
              <Sparkline
                points={sparkData6}
                width={220}
                height={40}
                strokeColor={config.strokeColor}
                fillColor={config.fillColor}
                hasEntered={hasEntered}
                showLabels
                ariaLabel={sparkAria}
              />
            </div>
          )}

          {/* Monthly average (stroom) resp. gemiddeld saldo (schuld) */}
          <p className="font-serif italic text-[11px] text-[var(--ink-3)]">
            {config.isStock ? 'Gem. saldo ' : 'Gem. '}
            <MaskedAmount value={avg6m} tone="kern" />
            {config.isStock ? '' : '/maand'}
          </p>
        </div>
      </WidgetShell>
    )
  }

  // ── XL (Double): breed 12-maands staafhistogram met budgetband ────────────
  // Wat de kleinere maten niet kunnen: per-maand over/onder-budget zichtbaar
  // maken + een compacte cijferstrip. Alleen op desktop (Double is opt-in en
  // zakt op mobiel via downsizeForMobile terug naar full).
  if (size === 'xl') {
    // Tot 24 mnd waar de bundel historie levert; degradeert netjes naar minder.
    const xlData = history.slice(-config.xlHistoryMonths)
    const hasLimit = budgetLimit > 0
    // "Goede" maanden t.o.v. de referentie: inkomen/sparen = op of boven het
    // streven/doel, uitgaven/schuld = binnen het budget/plan.
    const goodMonths = hasLimit
      ? xlData.filter(p => (config.goodWhenUp ? p.value >= budgetLimit : p.value <= budgetLimit)).length
      : null
    const countHeader = config.goodWhenUp ? `Boven ${config.limitLabel}` : `Binnen ${config.limitLabel}`
    const limitStripHeader = hasLimit
      ? `${config.limitLabel.charAt(0).toUpperCase()}${config.limitLabel.slice(1)}/maand`
      : config.isStock ? 'Gem. saldo' : 'Gem./maand'
    const histAria = `${config.kicker} per maand, laatste ${xlData.length} maanden${
      hasLimit ? `, met ${config.limitLabel}lijn` : ''
    }`
    return (
      <WidgetShell module="kern" size={size} kicker={config.kicker} href={href}>
        <div ref={inViewRef} className="flex h-full flex-col gap-3">
          {/* Header: huidige waarde + MoM + vrijheidstijd */}
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <span className="text-[var(--ink)]">
                <MaskedAmount value={current.value} tone="kern" className="text-2xl font-semibold" />
              </span>
              {momDelta != null && (
                <span className={`text-xs font-medium ${trendToneClass}`}>
                  {isUp ? '↑' : '↓'} {Math.abs(momDelta).toFixed(0)}% vs vorige maand
                </span>
              )}
            </div>
            {freedomStr && (
              <p className="font-serif italic text-[11px] text-[var(--ink-3)] text-right">
                ≈ {freedomStr}{freedomSuffix}
              </p>
            )}
          </div>

          {/* Staafhistogram (tot 24 mnd) met streef-/budgetband + maandlabels */}
          {xlData.length >= 1 && (
            <div className="flex-1 min-h-0">
              <BudgetHistogram
                points={xlData}
                width={620}
                height={150}
                barColor={config.strokeColor}
                limitValue={hasLimit ? budgetLimit : undefined}
                limitLabel={config.limitLabel}
                hasEntered={hasEntered}
                showValueLabels={budgetType === 'savings'}
                ariaLabel={histAria}
              />
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-dashed border-[var(--border-ed)]" />

          {/* Cijferstrip */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">3-maands gem.</p>
              <p className="text-[var(--ink)]">
                <MaskedAmount value={avg3m} tone="kern" className="text-base font-semibold" />
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">6-maands gem.</p>
              <p className="text-[var(--ink)]">
                <MaskedAmount value={avg6m} tone="kern" className="text-base font-semibold" />
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">
                {limitStripHeader}
              </p>
              <p className="text-[var(--ink)]">
                <MaskedAmount
                  value={hasLimit ? budgetLimit : avg(history)}
                  tone="kern"
                  className="text-base font-semibold"
                />
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">{countHeader}</p>
              {goodMonths != null ? (
                <p className="font-mono text-base font-semibold tabular-nums text-[var(--ink)]">
                  {goodMonths}<span className="text-xs text-[var(--ink-3)]">/{xlData.length} mnd</span>
                </p>
              ) : (
                <p className="font-mono text-base font-semibold tabular-nums text-[var(--ink-4)]">—</p>
              )}
            </div>
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── Full ───────────────────────────────────────────────────
  return (
    <WidgetShell module="kern" size={size} kicker={config.kicker} href={href}>
      <div ref={inViewRef} className="flex flex-col gap-2 h-full">
        {/* Header: current + delta */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[var(--ink)]">
            <MaskedAmount value={current.value} tone="kern" className="text-xl font-semibold" />
          </span>
          {momDelta != null && (
            <span className={`text-xs font-medium ${trendToneClass}`}>
              {isUp ? '↑' : '↓'} {Math.abs(momDelta).toFixed(0)}% vs vorige maand
            </span>
          )}
        </div>

        {/* 12-month sparkline with budget reference line */}
        {sparkData12.length >= 2 && (
          <div className="flex-1 min-h-0">
            <Sparkline
              points={sparkData12}
              width={300}
              height={60}
              strokeColor={config.strokeColor}
              fillColor={config.fillColor}
              limitValue={budgetLimit > 0 ? budgetLimit : undefined}
              hasEntered={hasEntered}
              showLabels
              ariaLabel={sparkAria}
            />
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-dashed border-[var(--border-ed)]" />

        {/* Averages + freedom time */}
        <div className="flex items-end justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-[10px] text-[var(--ink-3)]">
              <span className="font-semibold">3m</span> <MaskedAmount value={avg3m} tone="kern" />
              <span className="mx-1.5 text-[var(--border-md)]">·</span>
              <span className="font-semibold">6m</span> <MaskedAmount value={avg6m} tone="kern" />
            </p>
            {budgetLimit > 0 && (
              <p className="text-[10px] text-[var(--ink-4)]">
                Budget: <MaskedAmount value={budgetLimit} tone="kern" />/maand
              </p>
            )}
          </div>
          {freedomStr && (
            <p className="font-serif italic text-[11px] text-[var(--ink-3)] text-right">
              ≈ {freedomStr}{freedomSuffix}
            </p>
          )}
        </div>
      </div>
    </WidgetShell>
  )
})
