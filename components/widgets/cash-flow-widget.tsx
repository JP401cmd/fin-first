'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { calculateFreedomTime, formatFreedomTimeString, dailyExpenseRate } from '@/lib/format'
import { currentMonthWindowLabel } from '@/lib/cashflow-cards'
import { transactionFreshness } from '@/lib/transaction-staleness'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { DashboardData } from './widget-renderer'
import { ArrowUpDown, TrendingUp, ShoppingCart, PiggyBank, CreditCard, Users, UserCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { usePerspective } from '@/components/app/perspective-provider'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// ── Category config — reuses BUDGET_TYPE_CONFIGS color pattern from budgetten-widget ──

interface CashFlowCategory {
  key:        'income' | 'expense' | 'savings' | 'debt'
  label:      string
  icon:       LucideIcon
  iconBg:     string
  iconText:   string
  labelText:  string
  barFillVar: string
}

const CATEGORIES: CashFlowCategory[] = [
  {
    key: 'income', label: 'Inkomen', icon: TrendingUp,
    iconBg: 'bg-income-50', iconText: 'text-income-600',
    labelText: 'text-income-700', barFillVar: 'var(--color-income-400)',
  },
  {
    key: 'expense', label: 'Uitgaven', icon: ShoppingCart,
    iconBg: 'bg-expense-50', iconText: 'text-expense-600',
    labelText: 'text-expense-700', barFillVar: 'var(--color-expense-400)',
  },
  {
    key: 'savings', label: 'Sparen', icon: PiggyBank,
    iconBg: 'bg-savings-50', iconText: 'text-savings-600',
    labelText: 'text-savings-700', barFillVar: 'var(--color-savings-400)',
  },
  {
    key: 'debt', label: 'Schulden', icon: CreditCard,
    iconBg: 'bg-debt-50', iconText: 'text-debt-600',
    labelText: 'text-debt-700', barFillVar: 'var(--color-debt-400)',
  },
]

// ── Category row with mini progress bar ──

interface CategoryRowProps {
  config: CashFlowCategory
  spent: number
  limit: number
  dailyExp: number
  hasEntered: boolean
}

function CategoryRow({ config, spent, limit, dailyExp, hasEntered }: CategoryRowProps) {
  const { icon: Icon, label, iconBg, iconText, labelText, barFillVar } = config
  const hasData = limit > 0
  const pct = hasData ? Math.min((spent / limit) * 100, 100) : 0

  // Freedom time for this category's spent amount
  const freedomTime = dailyExp > 0 && spent > 0
    ? calculateFreedomTime(spent, dailyExp)
    : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null

  return (
    <div className="space-y-0.5">
      {/* Icon + label + amount + freedom time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--r-sm)] ${iconBg}`}>
            <Icon className={iconText} size={9} strokeWidth={2} />
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-[0.09em] ${hasData ? labelText : 'text-[var(--ink-3)]'}`}>
            {label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--ink)]">
            <MaskedAmount value={spent} tone="kern" className="text-xs" />
          </span>
          {freedomStr && (
            <span className="font-serif italic text-[10px] text-[var(--ink-4)]">
              {freedomStr}
            </span>
          )}
        </div>
      </div>

      {/* Mini progress bar — compact */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--border-ed)]">
        <div
          className="h-full rounded-full"
          style={{
            width: hasEntered ? `${pct}%` : '0%',
            backgroundColor: hasData ? barFillVar : 'transparent',
            transition: hasEntered ? 'width 500ms cubic-bezier(.22,1,.36,1)' : 'none',
          }}
        />
      </div>
    </div>
  )
}

// ── Comparison bar chart: this month vs previous month ──

interface ComparisonBarProps {
  label: string
  current: number
  previous: number
  color: string
  hasEntered: boolean
  /**
   * Semantiek van de richting van het delta-%. Default `false` (omhoog = rood),
   * correct voor Uitgaven. Zet `true` voor grootheden waar méér beter is
   * (Inkomen, Netto): dan wordt omhoog groen/positief getoond.
   */
  higherIsBetter?: boolean
  /**
   * Is de LINKER balk een nog lopende (onvolledige) maand? Dan wordt het
   * delta-% ONDERDRUKT (H6).
   *
   * Waarom niet gewoon tonen: `current` is dan "augustus tot nu toe" en
   * `previous` een volledige juli. Op de 3e van de maand levert dat −95%
   * "minder inkomen" terwijl er niets aan de hand is — precies het soort getal
   * waar bevinding H6 over ging. De twee bedragen mogen náást elkaar staan (de
   * bijschriften zeggen wélk venster elk is), maar hun VERHOUDING is pas een
   * uitspraak zodra beide vensters even lang zijn.
   */
  currentPartial?: boolean
  /** Bijschrift onder de linker balk — benoemt het venster van `current`. */
  currentCaption?: string
  /** Bijschrift onder de rechter balk — benoemt het venster van `previous`. */
  previousCaption?: string
}

function ComparisonBar({
  label,
  current,
  previous,
  color,
  hasEntered,
  higherIsBetter = false,
  currentPartial = false,
  currentCaption,
  previousCaption,
}: ComparisonBarProps) {
  // Grondslag op magnitude zodat een negatieve (tekort-)waarde een zichtbare balk
  // krijgt i.p.v. te verdwijnen; het teken sturen we via kleur + het bedrag-label.
  const maxVal = Math.max(Math.abs(current), Math.abs(previous), 1)
  const currentPct = (Math.abs(current) / maxVal) * 100
  const previousPct = (Math.abs(previous) / maxVal) * 100
  const delta = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0
  // Richting duiden: default omhoog = negatief (Uitgaven); higherIsBetter draait om.
  const deltaUp = delta > 0
  const deltaGood = higherIsBetter ? deltaUp : delta < 0
  const deltaClass = delta === 0 ? 'text-[var(--ink-4)]' : deltaGood ? 'text-positive' : 'text-negative'
  // Een negatieve waarde (tekortmaand) leest als rood, ongeacht de reekskleur.
  const currentColor = current < 0 ? 'var(--color-negative)' : color
  const previousColor = previous < 0 ? 'var(--color-negative)' : color

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">{label}</span>
        {previous !== 0 && !currentPartial && (
          <span className={`text-[10px] font-mono tabular-nums ${deltaClass}`}>
            {deltaUp ? '+' : ''}{Math.round(delta)}%
          </span>
        )}
      </div>
      <div className="flex gap-1 items-end h-4">
        {/* This month */}
        <div className="flex-1 flex items-end h-full">
          <div
            className="w-full rounded-sm"
            style={{
              height: hasEntered ? `${currentPct}%` : '0%',
              backgroundColor: currentColor,
              transition: hasEntered ? 'height 500ms cubic-bezier(.22,1,.36,1)' : 'none',
              minHeight: current !== 0 ? '2px' : '0',
            }}
          />
        </div>
        {/* Previous month */}
        <div className="flex-1 flex items-end h-full">
          <div
            className="w-full rounded-sm opacity-40"
            style={{
              height: hasEntered ? `${previousPct}%` : '0%',
              backgroundColor: previousColor,
              transition: hasEntered ? 'height 500ms cubic-bezier(.22,1,.36,1) 100ms' : 'none',
              minHeight: previous !== 0 ? '2px' : '0',
            }}
          />
        </div>
      </div>
      <div className="flex gap-1 text-[9px] text-[var(--ink-4)]">
        <span className="flex-1 text-center">
          <MaskedAmount value={current} tone="kern" className="text-[9px]" />
        </span>
        <span className="flex-1 text-center">
          <MaskedAmount value={previous} tone="kern" className="text-[9px]" />
        </span>
      </div>
      {/* Vensterbijschriften (H6): zonder deze regel staan een halve en een hele
          maand naamloos naast elkaar en leest het verschil als een daling. */}
      {(currentCaption || previousCaption) && (
        <div className="flex gap-1 text-[8px] leading-tight text-[var(--ink-4)]">
          <span className="flex-1 truncate text-center">{currentCaption}</span>
          <span className="flex-1 truncate text-center">{previousCaption}</span>
        </div>
      )}
    </div>
  )
}

// ── Grootte-bewuste fit (spiegelt W1 Budgetten) ────────────────
//
// De full-tegel heeft een VASTE hoogte (widget-shell `SIZE_HEIGHT.full`). De
// zwaarste sectie ('Vergelijking vorige maand') paste er niet altijd op en werd
// dan HALVERWEGE afgeknipt door de scroll-fade → 'abrupt afgekapt'-gevoel. We
// meten de resterende kaarthoogte en tonen de vergelijking alleen als hij er
// HÉÉL op past; anders valt de sectie terug op de compacte netto-samenvatting die
// altijd past. Nooit een half-afgesneden grafiek, nooit een mid-sectie-scrollclip.

/** Minimale vrije hoogte (px) waarin de vergelijkingssectie volledig past. */
const COMPARISON_MIN_H = 84

/**
 * Meet de werkelijke clientHeight van het (flex-1) rest-gebied. `clientHeight===0`
 * (SSR/jsdom — geen layout) telt bewust als "nog niet gemeten" → `null`, zodat de
 * caller terugvalt op tonen (deterministisch voor tests). Spiegelt de
 * `capacity===null`-fallback van `useFittingRowCount` in budgetten-widget.
 */
function useMeasuredHeight() {
  const ref = useRef<HTMLDivElement | null>(null)
  const [height, setHeight] = useState<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const h = el.clientHeight
      if (h > 0) setHeight(h)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return { ref, height }
}

// ── Vergelijking vorige maand (compact, zonder legenda) ────────
//
// Header + delta% + de bedragen onder elke balk dragen de betekenis; de legenda
// ('deze maand / vorige maand') verviel bewust om de sectie binnen de tegelhoogte
// te houden (solid = deze maand, vervaagd = vorige maand blijft conventioneel).

interface MonthComparisonProps {
  income:           number
  expenses:         number
  cashFlow:         number
  prevMonthIncome:  number
  prevMonthExpenses:number
  prevCashFlow:     number
  hasEntered:       boolean
  /** Bijschrift voor de linker (huidige) balk, bv. "aug. tot nu toe". */
  currentCaption:   string
  /** Bijschrift voor de rechter (vorige) balk, bv. "juli". */
  previousCaption:  string
  /** Loopt de linker maand nog? Dan geen delta-% (zie `ComparisonBar`). */
  currentPartial:   boolean
}

function MonthComparison({
  income,
  expenses,
  cashFlow,
  prevMonthIncome,
  prevMonthExpenses,
  prevCashFlow,
  hasEntered,
  currentCaption,
  previousCaption,
  currentPartial,
}: MonthComparisonProps) {
  return (
    <div className="border-t border-dashed border-[var(--border-ed)] pt-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
        Vergelijking vorige maand
      </p>
      <div className="grid grid-cols-3 gap-3">
        <ComparisonBar
          label="Inkomen"
          current={income}
          previous={prevMonthIncome}
          color="var(--color-income-400)"
          hasEntered={hasEntered}
          higherIsBetter
          currentPartial={currentPartial}
          currentCaption={currentCaption}
          previousCaption={previousCaption}
        />
        <ComparisonBar
          label="Uitgaven"
          current={expenses}
          previous={prevMonthExpenses}
          color="var(--color-expense-400)"
          hasEntered={hasEntered}
          currentPartial={currentPartial}
          currentCaption={currentCaption}
          previousCaption={previousCaption}
        />
        <ComparisonBar
          label="Netto"
          current={cashFlow}
          previous={prevCashFlow}
          color="var(--color-savings-400)"
          hasEntered={hasEntered}
          higherIsBetter
          currentPartial={currentPartial}
          currentCaption={currentCaption}
          previousCaption={previousCaption}
        />
      </div>
    </div>
  )
}

// ── Compacte netto-samenvatting (fallback als de vergelijking niet past) ──
//
// inkomsten − uitgaven = netto. Vult het rest-gebied netjes wanneer er geen
// vorige-maand-vergelijking is (huishouden/partner) of die niet volledig past
// (mobiel). Het U+2212 minteken is de bewuste mojibake-fix — niet vervangen.

function NetSummaryRow({ income, expenses, cashFlow, isPositive }: { income: number; expenses: number; cashFlow: number; isPositive: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-[var(--r-sm)] bg-[var(--subtle)] px-2.5 py-1.5">
      <div className="flex items-center gap-3 text-[11px]">
        <span className="text-positive">
          <MaskedAmount value={income} signPrefix="+" tone="kern" />
        </span>
        <span className="text-[var(--ink-4)]">−</span>
        <span className="text-negative">
          <MaskedAmount value={expenses} tone="kern" />
        </span>
      </div>
      <span className={isPositive ? 'text-positive' : 'text-negative'}>
        = <MaskedAmount
          value={cashFlow}
          signPrefix={isPositive ? '+' : ''}
          tone="kern"
          className="text-[11px] font-semibold"
        />
      </span>
    </div>
  )
}

// ── Main widget ──

export const CashFlowWidget = memo(function CashFlowWidget({ size, data, href }: Props) {
  const { perspective, partnerName } = usePerspective()
  const isHouseholdView = perspective === 'household' && data.householdOverrides != null
  const isPartnerView = perspective === 'partner' && data.partnerOverrides != null

  // ── GRONDSLAG (H6) ────────────────────────────────────────────────────────
  //
  // Dit widget heette "Cashflow Maand" en rekende met `data.monthlyIncome/
  // monthlyExpenses` — de EFFECTIVE grondslag (`resolveEffectiveIncomeExpenses`,
  // ADR 0103: manual > budget > transactie > profiel). Bij `income_source='auto'`
  // is dat de 12-maands gerealiseerde budgetsom: een STRUCTURELE maandwaarde die
  // niets met de lopende maand te maken heeft. Eén klik verderop toonde
  // /overzicht/cashflow de GEREALISEERDE maand. Twee schermen, één label,
  // tegengesteld teken (+€3.606 vs −€3.618).
  //
  // Eigen perspectief consumeert daarom `currentMonth*` — hetzelfde bundelveld
  // dat de Transacties-kaart op /overzicht/cashflow sinds 30 jul 2026 leest
  // (lib/cashflow-cards.ts). Consume, don't recompute: geen eigen tel-lus, en het
  // aggregaat achter dit veld kan niet stil op `max_rows` afkappen (ADR 0073).
  //
  // HUISHOUDEN/PARTNER HOUDT DE EFFECTIVE GRONDSLAG. `householdOverrides`/
  // `partnerOverrides` dragen geen `currentMonth*`-equivalent (lib/types/dashboard.ts).
  // Dat is geen omissie die hier stil overbrugd mag worden met de eigen
  // gerealiseerde maand — dat zou het huishoud-getal uit de eigen transacties
  // opbouwen. De grondslag verschilt dus per perspectief, en daarom verschilt
  // ook het LABEL: `kickerLabel` hieronder zegt per geval welk venster je ziet.
  const overrides = isHouseholdView ? data.householdOverrides! : isPartnerView ? data.partnerOverrides! : null
  const income = overrides ? overrides.monthlyIncome : data.currentMonthIncome
  const expenses = overrides ? overrides.monthlyExpenses : data.currentMonthExpenses
  const { budgetTotals, prevMonthIncome, prevMonthExpenses } = data
  const cashFlow = income - expenses
  const isPositive = cashFlow >= 0
  const { ref: inViewRef, hasEntered } = useInViewAnimation({ duration: 600 })
  // Vóór alle size-early-returns aanroepen (rules-of-hooks); alleen de
  // full-size-weergave gebruikt de meting.
  const { ref: spaceRef, height: spaceH } = useMeasuredHeight()

  // Het venster-label. Voor het eigen perspectief de canonieke formulering uit
  // lib/cashflow-cards.ts ("augustus tot nu toe") — dezelfde woorden als de
  // Transacties-kaart waar dit widget nu naartoe linkt, zodat de twee
  // oppervlakken herkenbaar hetzelfde venster claimen. `now` blijft binnen de
  // render: dit is een klant-zijdig label zonder eigen cijfer.
  const now = new Date()
  const monthWindow = currentMonthWindowLabel(now)
  const kickerLabel = isHouseholdView
    ? 'Cashflow per maand — Huishouden'
    : isPartnerView
      ? `Cashflow per maand — ${partnerName ?? 'Partner'}`
      : `Cashflow — ${monthWindow}`

  // LEEG-TOETS op de juiste grondslag. Met `currentMonth*` is 0/0 óók de normale
  // stand op de 1e van de maand: dan is "importeer transacties" een leugen tegen
  // een gebruiker die gewoon nog niets geboekt heeft. Vorige-maand-data (zelfde
  // gerealiseerde grondslag) bewijst dat er wél historie is → dan €0 tonen mét
  // het venster-label, niet de lege staat.
  const hasAnyRealized = income !== 0 || expenses !== 0 || prevMonthIncome > 0 || prevMonthExpenses > 0
  const isEmpty = overrides ? income === 0 && expenses === 0 : !hasAnyRealized
  if (isEmpty) {
    // LEEG VENSTER ≠ LEGE ADMINISTRATIE (UR2-13). "Importeer transacties" bleef
    // ook staan voor een account met 407 transacties waarvan de jongste vijf
    // maanden oud was: die vallen buiten de huidige én de vorige maand, dus
    // `hasAnyRealized` is onwaar terwijl de data bestaat. Het bundelveld
    // `latestTransactionMonth` (zelfde 12-mnd aggregaat als `currentMonth*`) is
    // de enige toets die dat onderscheid kan maken — nooit een nul-som, en nooit
    // een eigen tel-lus over transacties. Het override-perspectief draagt geen
    // eigen versheidsveld en houdt daarom de generieke tekst.
    const freshness = transactionFreshness(overrides ? null : data.latestTransactionMonth, now)
    return (
      <WidgetShell module="kern" size={size} kicker={kickerLabel} href={href}>
        <WidgetEmpty
          icon={ArrowUpDown}
          message={
            freshness.hasHistory
              ? `Geen transacties in ${monthWindow}. Je laatste boeking is van ${freshness.latestMonthLabel}.`
              : 'Importeer transacties om je maandelijkse cashflow te zien.'
          }
        />
      </WidgetShell>
    )
  }

  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker={kickerLabel} href={href}>
        <p className={`leading-none truncate ${isPositive ? 'text-positive' : 'text-negative'}`}>
          <MaskedAmount
            value={cashFlow}
            signPrefix={isPositive ? '+' : ''}
            tone="kern"
            className="text-[15px] font-semibold"
          />
        </p>
      </WidgetShell>
    )
  }

  // Personal view: canoniek 12-mnd rolling dagtarief uit de bundel (KRUIS-20);
  // override-perspectief houdt zijn eigen (perspectief-eigen) uitgavenniveau.
  //
  // H6: de TERUGVAL rekent bewust op `data.monthlyExpenses` (de effective
  // maandwaarde) en NIET op de lokale `expenses` — die is sinds H6 de
  // gerealiseerde, halfvolle kalendermaand. Een dagtarief daarop is op de 3e van
  // de maand een factor 10 te laag en zou elke vrijheidsregel in dit widget
  // opblazen. Het bundelveld wint altijd; dit is puur het mock-/empty-vangnet.
  const dailyExp = overrides
    ? dailyExpenseRate(overrides.monthlyExpenses)
    : data.dailyExpenseRate ?? dailyExpenseRate(data.monthlyExpenses)
  const freedomDays = dailyExp > 0 && Math.abs(cashFlow) > 0
    ? Math.round(Math.abs(cashFlow) / dailyExp)
    : null
  const freedomTime = dailyExp > 0 && Math.abs(cashFlow) > 0
    ? calculateFreedomTime(Math.abs(cashFlow), dailyExp)
    : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null

  // ── Quarter-size: compact cashflow amount + freedom days label ──
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker={kickerLabel} href={href}>
        {(isHouseholdView || isPartnerView) && (
          <div className="mb-1 flex items-center gap-1 text-[10px] text-kern-600">
            {isPartnerView ? <UserCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
            {isPartnerView ? (partnerName ?? 'Partner') : 'Huishouden'}
          </div>
        )}
        <p className={isPositive ? 'text-positive' : 'text-negative'}>
          <MaskedAmount
            value={cashFlow}
            signPrefix={isPositive ? '+' : ''}
            tone="kern"
            className="text-lg font-semibold"
          />
        </p>
        {freedomDays !== null && (
          <p className="mt-1 font-serif italic text-[11px] text-[var(--ink-3)]">
            {isPositive
              ? `+${freedomDays}d vrijheid opgebouwd`
              : `${freedomDays}d vrijheid ingeleverd`}
          </p>
        )}
      </WidgetShell>
    )
  }

  // ── Half-size: horizontal layout — left cashflow, right breakdown ──
  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker={kickerLabel} href={href}>
        <div className="flex gap-3 h-full">
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            {(isHouseholdView || isPartnerView) && (
              <div className="mb-1 flex items-center gap-1 text-[10px] text-kern-600">
                {isPartnerView ? <UserCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                {isPartnerView ? (partnerName ?? 'Partner') : 'Huishouden'}
              </div>
            )}
            <p className={isPositive ? 'text-[var(--ink)]' : 'text-negative'}>
              <MaskedAmount
                value={cashFlow}
                signPrefix={isPositive ? '+' : ''}
                tone="kern"
                className="text-xl font-semibold"
              />
            </p>
            {freedomStr && (
              <p className="mt-0.5 font-serif italic text-[11px] text-[var(--ink-3)]">
                {isPositive ? `+${freedomStr} vrijheid` : `${freedomStr} ingeleverd`}
              </p>
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
            <div className="flex justify-between text-[11px] text-[var(--ink-3)]">
              <span>Inkomsten</span>
              <span className="text-positive">
                <MaskedAmount value={income} signPrefix="+" tone="kern" />
              </span>
            </div>
            <div className="flex justify-between text-[11px] text-[var(--ink-3)]">
              <span>Uitgaven</span>
              <span className="text-negative">
                <MaskedAmount value={expenses} signPrefix="-" tone="kern" />
              </span>
            </div>
            <div className="border-t border-dashed border-[var(--border-ed)] pt-1 flex justify-between text-[11px]">
              <span className="text-[var(--ink-3)]">Netto</span>
              <span className={isPositive ? 'text-positive' : 'text-negative'}>
                <MaskedAmount
                  value={cashFlow}
                  signPrefix={isPositive ? '+' : ''}
                  tone="kern"
                  className="font-medium"
                />
              </span>
            </div>
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── Full-size: hero + categories + (comparison OR compacte samenvatting) ──

  const prevCashFlow = prevMonthIncome - prevMonthExpenses
  // Vorige-maand vergelijking is per-gebruiker historie — alleen tonen in eigen perspectief
  const hasPrevMonth = !isHouseholdView && !isPartnerView && (prevMonthIncome > 0 || prevMonthExpenses > 0)

  // Bijschriften voor de vergelijking. Links de LOPENDE maand ("aug. tot nu
  // toe"), rechts de AFGESLOTEN vorige maand ("juli") — beide op de gerealiseerde
  // grondslag, maar niet even lang. Zolang de linker maand nog loopt is het
  // delta-% onderdrukt (zie `ComparisonBar.currentPartial`).
  const shortMonth = (d: Date) => new Intl.DateTimeFormat('nl-NL', { month: 'short' }).format(d)
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const currentCaption = `${shortMonth(now)} tot nu toe`
  const previousCaption = shortMonth(prevMonthDate)

  // Rest-gebied meten: toon de (zware) vergelijking alleen als hij HÉÉL past.
  // Niet gemeten (SSR/jsdom → null) telt als "past" zodat de weergave
  // deterministisch blijft (spiegelt W1).
  const showComparison = hasPrevMonth && (spaceH === null || spaceH >= COMPARISON_MIN_H)

  return (
    <WidgetShell module="kern" size={size} kicker={kickerLabel} href={href}>
      <div ref={inViewRef} className="flex h-full flex-col">
        {(isHouseholdView || isPartnerView) && (
          <div className="mb-1.5 flex shrink-0 items-center gap-1 text-[11px] text-kern-600">
            {isPartnerView ? <UserCheck className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
            {isPartnerView ? (partnerName ?? 'Partner') : 'Gecombineerd huishouden'}
          </div>
        )}

        {/* ── Netto cashflow hero — de belangrijke slotregel, altijd in beeld ── */}
        <div className="flex shrink-0 items-end justify-between">
          <div>
            {/* Het venster staat in het label zelf — niet alleen in de kicker,
                die op smalle tegels afkapt (`truncate` in WidgetShell). */}
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              {overrides ? 'Netto per maand' : `Netto — ${monthWindow}`}
            </p>
            <p className={isPositive ? 'text-[var(--ink)]' : 'text-negative'}>
              <MaskedAmount
                value={cashFlow}
                signPrefix={isPositive ? '+' : ''}
                tone="kern"
                className="text-2xl font-semibold"
              />
            </p>
          </div>
          {freedomStr && (
            <p className="font-serif italic text-[12px] text-[var(--ink-3)]">
              {isPositive ? `+${freedomStr} vrijheid` : `${freedomStr} ingeleverd`}
            </p>
          )}
        </div>

        {/* ── 4 budget categories with mini progress bars ── */}
        <div className="shrink-0">
          <div className="mt-2 border-t border-dashed border-[var(--border-ed)]" />
          <div className="mt-2 flex flex-col gap-1">
            {CATEGORIES.map((config) => {
              const typeData = budgetTotals[config.key]
              return (
                <CategoryRow
                  key={config.key}
                  config={config}
                  spent={typeData.spent}
                  limit={typeData.limit}
                  dailyExp={dailyExp}
                  hasEntered={hasEntered}
                />
              )
            })}
          </div>
        </div>

        {/* ── Rest-gebied: vergelijking (heel-of-niet) óf compacte samenvatting ── */}
        <div ref={spaceRef} className={`mt-2 flex min-h-0 flex-1 flex-col overflow-hidden ${showComparison ? 'justify-start' : 'justify-center'}`}>
          {showComparison ? (
            <MonthComparison
              income={income}
              expenses={expenses}
              cashFlow={cashFlow}
              prevMonthIncome={prevMonthIncome}
              prevMonthExpenses={prevMonthExpenses}
              prevCashFlow={prevCashFlow}
              hasEntered={hasEntered}
              currentCaption={currentCaption}
              previousCaption={previousCaption}
              // De vergelijking rendert alleen in het eigen perspectief
              // (`hasPrevMonth`), waar links per definitie de lopende maand staat.
              currentPartial
            />
          ) : (
            <NetSummaryRow
              income={income}
              expenses={expenses}
              cashFlow={cashFlow}
              isPositive={isPositive}
            />
          )}
        </div>
      </div>
    </WidgetShell>
  )
})
