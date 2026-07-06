'use client'

import { memo, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { calculateFreedomTime, formatFreedomTimeString, dailyExpenseRate } from '@/lib/format'
import { MaskedAmount } from '@/components/app/masked-amount'
import { isOverPositive, computeBarSegments, getTypeColors, BudgetIcon, type BudgetType } from '@/components/app/budget-shared'
import type { DashboardData } from './widget-renderer'
import { LayoutGrid, Sparkles } from 'lucide-react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

type TopBudget = DashboardData['topBudgets'][number]

function progressPct(spent: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min((spent / limit) * 100, 100)
}

/** Benuttingsgraad — kant-en-klaar veld, geen financiële herberekening. */
function utilization(b: TopBudget): number {
  return b.limit > 0 ? b.spent / b.limit : 0
}

// ── Individuele budget-rij ────────────────────────────────────
//
// rich=false (quarter): [icon] naam … pct%  +  balk
// rich=true  (half/full): [icon] naam … €besteed/€limiet  +  balk  +  pct%

interface RowProps {
  budget:     TopBudget
  hasEntered: boolean
  rich:       boolean
}

function TopBudgetRow({ budget, hasEntered, rich }: RowProps) {
  const colors       = getTypeColors(budget.budgetType as BudgetType)
  const hasData      = budget.limit > 0
  const pct          = progressPct(budget.spent, budget.limit)
  const overBudget   = hasData && budget.spent > budget.limit
  const overPositive = isOverPositive(budget.budgetType as BudgetType)
  const pctLabel     = hasData ? `${Math.round(pct)}%` : '—'
  const seg          = computeBarSegments(budget.spent, budget.limit, 80, { barHex: colors.barHex, barHexWarn: colors.barHexWarn }, overPositive)

  const overTone = overPositive ? 'text-positive' : 'text-negative'
  const pctTone  = overBudget ? overTone : 'text-[var(--ink-4)]'

  return (
    <div className="space-y-0.5">

      {/* Laag 1: icoon + naam + rechter-metriek */}
      <div className="flex items-center gap-1.5">
        <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--r-sm)] ${colors.bg}`}>
          <BudgetIcon name={budget.icon} className={`h-2.5 w-2.5 ${colors.text}`} />
        </div>
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[var(--ink-2)]">
          {budget.name}
        </span>
        {rich ? (
          <span className={`shrink-0 font-mono tabular-nums text-[10px] ${overBudget ? overTone + ' font-semibold' : 'text-[var(--ink-3)]'}`}>
            {hasData ? (
              <><MaskedAmount value={budget.spent} tone="kern" /> / <MaskedAmount value={budget.limit} tone="kern" /></>
            ) : '—'}
          </span>
        ) : (
          <span className={`shrink-0 font-mono tabular-nums text-[10px] font-bold ${pctTone}`}>
            {pctLabel}
          </span>
        )}
      </div>

      {/* Laag 2: voortgangsbalk */}
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-ed)]">
        <div
          className="absolute inset-y-0 left-0 rounded-l-full"
          style={{
            width: hasEntered ? `${seg.normalPct}%` : '0%',
            backgroundColor: hasData ? seg.normalColor : 'transparent',
            transition: hasEntered ? 'width 500ms cubic-bezier(.22,1,.36,1)' : 'none',
          }}
        />
        {seg.warnPct > 0 && (
          <div
            className="absolute inset-y-0 rounded-r-full"
            style={{
              left: `${seg.warnLeft}%`,
              width: hasEntered ? `${seg.warnPct}%` : '0%',
              backgroundColor: seg.warnColor,
              transition: hasEntered ? 'width 500ms cubic-bezier(.22,1,.36,1) 30ms' : 'none',
            }}
          />
        )}
        {seg.extensionPct > 0 && (
          <div
            className="absolute inset-y-0 rounded-r-full"
            style={{
              left: `${seg.extensionLeft}%`,
              width: hasEntered ? `${seg.extensionPct}%` : '0%',
              backgroundColor: seg.extensionColor,
              opacity: 0.7,
              transition: hasEntered ? 'width 500ms cubic-bezier(.22,1,.36,1) 80ms' : 'none',
            }}
          />
        )}
      </div>

      {/* Laag 3 (rich): percentage onder de balk */}
      {rich && hasData && (
        <div className="flex justify-end">
          <span className={`text-[9px] font-bold ${overBudget ? overTone : 'text-[var(--ink-4)]'}`}>
            {pctLabel}
          </span>
        </div>
      )}

    </div>
  )
}

// ── Grootte-bewuste rijweergave ────────────────────────────────
//
// De widget heeft per size een VASTE kaarthoogte (WidgetShell/grid). Meer rijen
// renderen dan er passen gaf half-afgesneden budget-rijen. We meten de werkelijke
// beschikbare hoogte en tonen alleen rijen die er HELEMAAL op passen (nette
// afkapping), met optioneel "+N meer" als er nog vrije ruimte over is.

/**
 * Bepaal hoeveel rijen zichtbaar zijn zodat er nooit een half-afgesneden rij
 * ontstaat. `capacity` = aantal rijen dat volledig past (null = nog niet gemeten
 * → toon de gewenste desiredN, bv. tijdens SSR/eerste render). De "+N meer"-regel
 * verschijnt alleen als er een écht vrije rij-slot over is (offert nooit een
 * databudget-rij op).
 */
export function fittingRowPlan(capacity: number | null, desiredN: number, total: number) {
  const cap = capacity ?? desiredN
  const visible = Math.min(total, desiredN, cap)
  const hidden = total - visible
  return { visible, hidden, showMore: hidden > 0 && visible < cap }
}

/**
 * Meet de beschikbare kaarthoogte en bepaal hoeveel rijen er volledig op passen.
 * `estRowH` is een veilige bovengrens van de werkelijke rijhoogte (px); `gap` de
 * verticale tussenruimte (px). Retourneert `null` zolang niet gemeten (jsdom/SSR
 * hebben geen layout) → caller valt dan terug op desiredN.
 */
function useFittingRowCount(estRowH: number, gap: number) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [capacity, setCapacity] = useState<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const h = el.clientHeight
      if (h > 0) setCapacity(Math.max(1, Math.floor((h + gap) / (estRowH + gap))))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [estRowH, gap])

  return { ref, capacity }
}

interface FittingListProps {
  ranked:     TopBudget[]
  desiredN:   number
  rich:       boolean
  hasEntered: boolean
  /** Entrance-animatie-ref van useInViewAnimation; gemerged met de meet-ref. */
  inViewRef:  React.RefObject<HTMLDivElement | null>
}

function FittingBudgetList({ ranked, desiredN, rich, hasEntered, inViewRef }: FittingListProps) {
  // rich (half): 3-laags rij ~38px, gap-1.5 (6px). compact (quarter): 2-laags rij ~24px, gap-2 (8px).
  const estRowH  = rich ? 40 : 26
  const gapPx    = rich ? 6  : 8
  const gapClass = rich ? 'gap-1.5' : 'gap-2'

  const { ref: measureRef, capacity } = useFittingRowCount(estRowH, gapPx)
  const { visible, hidden, showMore } = fittingRowPlan(capacity, desiredN, ranked.length)
  const rows = ranked.slice(0, visible)

  const setRefs = (node: HTMLDivElement | null) => {
    measureRef.current = node
    inViewRef.current = node
  }

  return (
    <div ref={setRefs} className={`flex h-full flex-col justify-center overflow-hidden ${gapClass}`}>
      {rows.map((b) => (
        <TopBudgetRow key={b.id} budget={b} hasEntered={hasEntered} rich={rich} />
      ))}
      {showMore && (
        <p className="shrink-0 truncate text-[10px] font-medium text-[var(--ink-4)]">
          +{hidden} {hidden === 1 ? 'budget' : 'budgetten'} meer
        </p>
      )}
    </div>
  )
}

// ── Hoofd-component ────────────────────────────────────────────

export const BudgettenWidget = memo(function BudgettenWidget({ size, data, href }: Props) {
  const isFullSize = size === 'full'
  const { budgetTotals, monthlyExpenses, topBudgets } = data
  const { ref: inViewRef, hasEntered } = useInViewAnimation({ duration: 600 })

  // Geconfigureerde budgetten (limiet ingesteld) bepalen of er iets te tonen is.
  const configured = topBudgets.filter(b => b.limit > 0)
  const hasAnyBudget = configured.length > 0

  if (!hasAnyBudget) {
    // Géén href op de shell in de empty-state: de WidgetEmpty-CTA rendert een
    // eigen <Link> en een whole-card <a> eromheen zou <a>-in-<a> geven
    // (ongeldige HTML + hydration-error). In first-use is de CTA sowieso de
    // enige, intentionele navigatie — de kaart-link naar de (lege) hub verviel.
    return (
      <WidgetShell module="kern" size={size} kicker="Budgetten">
        {/* First-use empty state — onboarding moment per design bible. */}
        <WidgetEmpty
          variant="first-use"
          icon={LayoutGrid}
          title="Nog geen budgetten"
          description="Maak je eerste budget aan om je bestedingen te volgen."
          action={{ label: 'Maak je eerste budget aan', href: '/core/budgets/new' }}
        />
      </WidgetShell>
    )
  }

  // Budget-gezondheid: hoeveel budgetten op koers (spent <= limit, of over-limit
  // voor de positieve types income/savings/debt).
  const onTrackCount = configured.filter(b =>
    b.spent <= b.limit || isOverPositive(b.budgetType as BudgetType)
  ).length
  const configuredCount = configured.length

  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Budgetten" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {onTrackCount}/{configuredCount} op schema
        </p>
      </WidgetShell>
    )
  }

  // When user chose not to actively budget during onboarding, show activation hint
  if (!data.budgetingActive) {
    return (
      <WidgetShell module="kern" size={size} kicker="Budgetten" href={href}>
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--subtle)]">
            <Sparkles className="text-amber-500" size={16} />
          </div>
          <p className="text-sm font-medium text-[var(--ink)]">
            Activeer budgetteren
          </p>
          <p className="text-[11px] leading-snug text-[var(--ink-3)]">
            Je hebt budgetten klaarstaan. Activeer ze om inzicht te krijgen in je bestedingen en vrijheid op te bouwen.
          </p>
          <Link
            href="/core/budgets"
            className="mt-1 inline-flex items-center gap-1 rounded-lg bg-[var(--subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
          >
            Bekijk budgetten
          </Link>
        </div>
      </WidgetShell>
    )
  }

  // Top-N drukste budgetten — primair op benuttingsgraad (over-budget bovenaan).
  // De widget rankt/slicet alleen op kant-en-klare velden (consume-don't-recompute).
  const ranked = topBudgets
    .filter(b => b.limit > 0 || b.spent > 0)
    .sort((a, b) => utilization(b) - utilization(a))

  // ── Quarter: top-3 compacte rijen (naam + balk + pct) ──
  // Grootte-bewust: toont alleen rijen die volledig op de kaart passen (nooit
  // een half-afgesneden rij), met "+N meer" als er ruimte overblijft.
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Budgetten" href={href}>
        <FittingBudgetList ranked={ranked} desiredN={3} rich={false} hasEntered={hasEntered} inViewRef={inViewRef} />
      </WidgetShell>
    )
  }

  // ── Half: tot top-4 rich rijen (naam + bedrag + balk + pct) ──
  // Idem grootte-bewust: het werkelijke aantal past zich aan de kaarthoogte aan.
  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker="Budgetten" href={href}>
        <FittingBudgetList ranked={ranked} desiredN={4} rich hasEntered={hasEntered} inViewRef={inViewRef} />
      </WidgetShell>
    )
  }

  // ── Full: top-7 rijen + netto maandbalans (vrijheidstijd) ──
  const nettoBalans =
    budgetTotals.income.spent
    - budgetTotals.expense.spent
    - budgetTotals.savings.spent
    - budgetTotals.debt.spent

  const isNettoPositief = nettoBalans >= 0
  const dailyExp = dailyExpenseRate(monthlyExpenses)
  const freedomTime = dailyExp > 0 && Math.abs(nettoBalans) > 0
    ? calculateFreedomTime(Math.abs(nettoBalans), dailyExp)
    : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null

  const fullRows = ranked.slice(0, 7)

  return (
    <WidgetShell module="kern" size={size} kicker="Budgetten" href={href}>

      <div ref={inViewRef} className="flex flex-col gap-2">
        {fullRows.map((b) => (
          <TopBudgetRow key={b.id} budget={b} hasEntered={hasEntered} rich />
        ))}
      </div>

      {/* ── Netto maandbalans — vrijheidstijd-samenvatting ── */}
      <div className="mt-3 border-t border-dashed border-[var(--border-ed)]" />
      <div className={`mt-3 rounded-[var(--r-md)] px-3 py-2.5 ${isNettoPositief ? 'bg-positive/15' : 'bg-negative/15'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Netto maandbalans
            </p>
            <p className="mt-0.5 font-serif italic text-[11px] text-[var(--ink-4)]">
              Inkomen min alle uitgaven
            </p>
          </div>
          <div className="text-right">
            <p className={isNettoPositief ? 'text-positive' : 'text-negative'}>
              <MaskedAmount
                value={nettoBalans}
                signPrefix={isNettoPositief ? '+' : ''}
                tone="kern"
                className="text-2xl font-semibold"
              />
            </p>
            {freedomStr && (
              <p className="font-serif italic text-[11px] text-[var(--ink-3)]">
                {isNettoPositief ? `+${freedomStr} vrijheid` : `${freedomStr} achter`}
              </p>
            )}
          </div>
        </div>
      </div>

    </WidgetShell>
  )
})
