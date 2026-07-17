'use client'

import { memo, type ReactNode } from 'react'
import { WidgetShell } from './widget-shell'
import { MaskedAmount } from '@/components/app/masked-amount'
import { isOverPositive, computeBarSegments, type BudgetType } from '@/components/app/budget-shared'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import type { WidgetSize } from '@/lib/widget-catalog'

interface FavBudget {
  id: string
  name: string
  icon: string
  budgetType: string
  limit: number
  spent: number
}

/* ── KPI-cel voor de XL-strip ── */
function KpiCell({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] leading-none">{label}</span>
      <span className={`text-[13px] font-semibold leading-none ${color || 'text-[var(--ink)]'}`}>{value}</span>
    </div>
  )
}

export const BudgetFavWidget = memo(function BudgetFavWidget({
  size,
  budget,
  dailyExp,
}: {
  size: WidgetSize
  budget: FavBudget
  /** Canoniek dagtarief (€/dag) uit de bundel — voedt de vrijheidstijd-regel. */
  dailyExp?: number
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 600 })
  const pct = budget.limit > 0 ? Math.min(budget.spent / budget.limit, 1) : 0
  const isOver = budget.spent > budget.limit && budget.limit > 0
  const typeOverPositive = isOverPositive(budget.budgetType as BudgetType)
  const overPositive = isOver && typeOverPositive
  const cssType = budget.budgetType === 'archive' ? 'other' : budget.budgetType

  const remaining = Math.max(budget.limit - budget.spent, 0)
  const today = new Date()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const daysLeft = daysInMonth - today.getDate()
  const daysLeftLabel = daysLeft === 0 ? 'laatste dag' : `nog ${daysLeft} ${daysLeft === 1 ? 'dag' : 'dagen'}`

  const daysPassed = today.getDate()
  const dailyAvg = daysPassed > 0 ? budget.spent / daysPassed : 0
  const remainingPerDay = daysLeft > 0 ? remaining / daysLeft : 0

  // ── Vrijheidstijd ("Geld is opgeslagen tijd") ──
  // Consume-don't-recompute: dagtarief komt uit de bundel, niet lokaal berekend.
  // Restant = vrijheid die je deze maand nog over hebt; limiet = de vrijheid die het
  // hele budget vertegenwoordigt.
  const hasRate = !!dailyExp && dailyExp > 0
  const freedomRemaining =
    hasRate && remaining > 0
      ? formatFreedomTimeString(calculateFreedomTime(remaining, dailyExp!), 'short')
      : null
  const freedomLimit =
    hasRate && budget.limit > 0
      ? formatFreedomTimeString(calculateFreedomTime(budget.limit, dailyExp!), 'short')
      : null

  // Ring dimensions: quarter=110, half=80 (compact for 1-row height), full=130, xl=150
  const ringSize = size === 'xl' ? 150 : size === 'full' ? 130 : size === 'half' ? 80 : 110
  const cx = ringSize / 2, cy = ringSize / 2
  const r = size === 'xl' ? 60 : size === 'full' ? 52 : size === 'half' ? 32 : 44
  const sw = size === 'xl' ? 10 : size === 'full' ? 9 : size === 'half' ? 6 : 7
  const circ = 2 * Math.PI * r
  const trackColor = 'var(--subtle)'
  const fillColor = isOver ? (overPositive ? 'var(--positive)' : 'var(--negative)') : `var(--color-${cssType}-500)`
  const barSeg = computeBarSegments(budget.spent, budget.limit, 80, { barHex: `var(--color-${cssType}-400)`, barHexWarn: `var(--color-${cssType}-600)` }, overPositive)

  const statusText = isOver ? (overPositive ? 'Doel bereikt' : 'Over budget') : 'Op schema'
  const statusTone = isOver
    ? (overPositive
      ? 'bg-[color-mix(in_oklab,var(--positive)_10%,transparent)] text-[var(--positive)]'
      : 'bg-[color-mix(in_oklab,var(--negative)_10%,transparent)] text-[var(--negative)]')
    : 'bg-[color-mix(in_oklab,var(--positive)_10%,transparent)] text-[var(--positive)]'

  // ── Mini: compact spent / limit ──
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker={budget.name} href={`/core/budgets?budget=${budget.id}`}>
        <p className={`leading-none truncate ${isOver ? (overPositive ? 'text-positive' : 'text-negative') : 'text-[var(--ink)]'}`}>
          <MaskedAmount value={budget.spent} tone="kern" className="text-[15px] font-semibold" /> / <MaskedAmount value={budget.limit} tone="kern" className="text-[15px] font-semibold" />
        </p>
      </WidgetShell>
    )
  }

  // ── XL (Double): brede budgetkaart — grote ring links, pacing + vrijheidstijd + KPI's rechts ──
  if (size === 'xl') {
    // Prognose op basis van huidig tempo (pure weergave-afleiding, zoals dailyAvg/pct)
    const projectedSpend = daysPassed > 0 ? dailyAvg * daysInMonth : budget.spent
    const projectedPct = budget.limit > 0 ? projectedSpend / budget.limit : 0
    const projOver = projectedPct > 1
    const projColor = projOver ? (typeOverPositive ? 'text-positive' : 'text-negative') : 'text-[var(--ink)]'
    return (
      <WidgetShell module="kern" size={size} kicker={budget.name} href={`/core/budgets?budget=${budget.id}`}>
        <div
          ref={ref}
          className="flex h-full items-stretch gap-6"
          style={{
            opacity: hasEntered ? 1 : 0,
            transform: hasEntered ? 'translateY(0)' : 'translateY(6px)',
            transition: 'opacity 400ms ease-out, transform 400ms ease-out',
          }}
        >
          {/* Links: grote ring + status */}
          <div className="flex w-[38%] shrink-0 flex-col items-center justify-center gap-2 border-r border-dashed border-[var(--border-ed)] pr-6">
            <div className="relative shrink-0">
              <svg width={ringSize} height={ringSize} aria-hidden="true">
                <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={sw} />
                <circle
                  cx={cx} cy={cy} r={r} fill="none" stroke={fillColor} strokeWidth={sw}
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={hasEntered ? circ * (1 - pct) : circ}
                  transform={`rotate(-90 ${cx} ${cy})`}
                  style={{ transition: hasEntered ? 'stroke-dashoffset 600ms cubic-bezier(.22,1,.36,1)' : 'none' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className={`font-mono text-3xl font-semibold tabular-nums leading-tight ${isOver ? (overPositive ? 'text-positive' : 'text-negative') : 'text-[var(--ink)]'}`}>
                  {Math.round(pct * 100)}%
                </p>
                <p className="text-[var(--ink-4)] leading-normal">
                  van <MaskedAmount value={budget.limit} tone="kern" className="text-[10px]" />
                </p>
              </div>
            </div>
            <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusTone}`}>
              {statusText}
            </div>
          </div>

          {/* Rechts: bedrag + vrijheidstijd, prognose, KPI-grid */}
          <div className="flex min-w-0 flex-1 flex-col justify-between py-1">
            {/* Besteed van limiet + vrijheidstijd-kader */}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Besteed deze maand</p>
              <p className="text-[var(--ink)]">
                <MaskedAmount value={budget.spent} tone="kern" className="text-2xl font-semibold" />
                <span className="text-[var(--ink-4)]"> van <MaskedAmount value={budget.limit} tone="kern" className="text-base" /></span>
              </p>
              {(freedomLimit || freedomRemaining) && (
                <p className="mt-0.5 font-serif italic text-[12px] text-[var(--ink-3)]">
                  {freedomLimit && <>Budget ≈ {freedomLimit} vrijheid</>}
                  {freedomLimit && freedomRemaining && <span className="text-[var(--ink-4)]"> · </span>}
                  {freedomRemaining && <>nog {freedomRemaining} over</>}
                </p>
              )}
            </div>

            {/* Prognose op huidig tempo */}
            <div className="rounded-[var(--r-md)] border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Op dit tempo</p>
              <p className="text-[var(--ink)]">
                <MaskedAmount value={projectedSpend} tone="kern" className={`text-base font-semibold ${projColor}`} />
                <span className="text-[var(--ink-4)]"> aan het eind van de maand · </span>
                <span className={`font-mono text-sm tabular-nums ${projColor}`}>{Math.round(projectedPct * 100)}%</span>
              </p>
            </div>

            {/* KPI-grid — benut de volle breedte */}
            <div className="grid grid-cols-3 gap-x-6 gap-y-3">
              <KpiCell label="Gem. per dag" value={<MaskedAmount value={dailyAvg} tone="kern" />} />
              <KpiCell
                label="Nog beschikbaar/dag"
                value={isOver ? <span className={overPositive ? 'text-positive' : 'text-negative'}>€ 0</span> : <MaskedAmount value={remainingPerDay} tone="kern" />}
                color={isOver ? undefined : 'text-positive'}
              />
              <KpiCell label="Resterende dagen" value={daysLeft === 0 ? 'laatste dag' : `${daysLeft} ${daysLeft === 1 ? 'dag' : 'dagen'}`} />
              <KpiCell
                label={isOver ? (overPositive ? 'Boven doel' : 'Over budget') : 'Nog beschikbaar'}
                value={isOver
                  ? <MaskedAmount value={budget.spent - budget.limit} tone="kern" />
                  : <MaskedAmount value={remaining} tone="kern" />}
                color={isOver ? (overPositive ? 'text-positive' : 'text-negative') : 'text-positive'}
              />
              <KpiCell label="Besteed" value={<MaskedAmount value={budget.spent} tone="kern" />} />
              <KpiCell label="Limiet" value={<MaskedAmount value={budget.limit} tone="kern" />} />
            </div>
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── Full: vertical layout — ring on top, details below ──
  if (size === 'full') {
    return (
      <WidgetShell module="kern" size={size} kicker={budget.name} href={`/core/budgets?budget=${budget.id}`} kickerPosition="left">
        <div ref={ref} className="flex flex-col items-center gap-3">
          {/* Ring chart centered */}
          <div className="relative shrink-0">
            <svg width={ringSize} height={ringSize} aria-hidden="true">
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={sw} />
              <circle
                cx={cx} cy={cy} r={r} fill="none" stroke={fillColor} strokeWidth={sw}
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={hasEntered ? circ * (1 - pct) : circ}
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{ transition: hasEntered ? 'stroke-dashoffset 600ms cubic-bezier(.22,1,.36,1)' : 'none' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className={`font-mono text-2xl font-semibold tabular-nums leading-tight ${isOver ? (overPositive ? 'text-positive' : 'text-negative') : 'text-[var(--ink)]'}`}>
                {Math.round(pct * 100)}%
              </p>
              <p className="text-[var(--ink-4)] leading-normal">
                van <MaskedAmount value={budget.limit} tone="kern" className="text-[10px]" />
              </p>
            </div>
          </div>

          {/* Details stacked below ring */}
          <div className="w-full space-y-2">
            {/* Status badge */}
            <div className="flex justify-center">
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusTone}`}>
                {statusText}
              </div>
            </div>

            {/* Spent vs limit */}
            <div className="text-center">
              <p className="text-[var(--ink)]">
                <MaskedAmount value={budget.spent} tone="kern" className="text-sm" /> <span className="text-[var(--ink-4)]">van <MaskedAmount value={budget.limit} tone="kern" className="text-sm" /></span>
              </p>
            </div>

            {/* Progress bar */}
            <div className="relative h-2 overflow-hidden rounded-full" style={{ background: trackColor }}>
              {/* Fill 1 — normaal */}
              <div
                className="absolute inset-y-0 left-0 rounded-l-full transition-all duration-500"
                style={{ width: `${barSeg.normalPct}%`, background: barSeg.normalColor }}
              />
              {/* Fill 2 — waarschuwing */}
              {barSeg.warnPct > 0 && (
                <div
                  className="absolute inset-y-0 rounded-r-full transition-all duration-500"
                  style={{ left: `${barSeg.warnLeft}%`, width: `${barSeg.warnPct}%`, background: barSeg.warnColor, transitionDelay: '30ms' }}
                />
              )}
              {/* Extension */}
              {barSeg.extensionPct > 0 && (
                <div
                  className="absolute inset-y-0 rounded-r-full transition-all duration-500"
                  style={{ left: `${barSeg.extensionLeft}%`, width: `${barSeg.extensionPct}%`, background: barSeg.extensionColor, opacity: 0.7, transitionDelay: '80ms' }}
                />
              )}
            </div>

            {/* Daily averages */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-[var(--ink-3)] uppercase tracking-wide">Gem. per dag</p>
                <p className="text-[var(--ink)]">
                  <MaskedAmount value={dailyAvg} tone="kern" className="text-sm" /><span className="text-[var(--ink-4)]">/dag</span>
                </p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--ink-3)] uppercase tracking-wide">Nog beschikbaar</p>
                <p className={isOver ? (overPositive ? 'text-positive' : 'text-negative') : 'text-positive'}>
                  {isOver ? <span className="font-mono tabular-nums text-sm">€ 0</span> : <MaskedAmount value={remainingPerDay} tone="kern" className="text-sm" />}<span className="text-[var(--ink-4)]">/dag</span>
                </p>
              </div>
            </div>

            {/* Remaining + days left */}
            <div className="flex items-baseline justify-between border-t border-[var(--border-ed)] pt-2">
              <p className={isOver ? (overPositive ? 'text-positive' : 'text-negative') : 'text-positive'}>
                {isOver ? (
                  <>
                    <MaskedAmount value={budget.spent - budget.limit} tone="kern" className="text-xs" />
                    {overPositive ? ' boven doel' : ' over budget'}
                  </>
                ) : (
                  <>
                    <MaskedAmount value={remaining} tone="kern" className="text-xs" /> over
                  </>
                )}
              </p>
              <p className="text-[10px] text-[var(--ink-4)]">
                {daysLeftLabel}
              </p>
            </div>

            {/* Vrijheidstijd-kader op het restant */}
            {freedomRemaining && !isOver && (
              <p className="text-center font-serif italic text-[11px] text-[var(--ink-3)]">
                ≈ {freedomRemaining} vrijheid over
              </p>
            )}
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── Half: compact ring + details side-by-side (smaller ring fits 1-row) ──
  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker={budget.name} href={`/core/budgets?budget=${budget.id}`} kickerPosition="left">
        <div ref={ref} className="flex gap-3 items-center">
          {/* Compact ring */}
          <div className="relative shrink-0">
            <svg width={ringSize} height={ringSize} aria-hidden="true">
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={sw} />
              <circle
                cx={cx} cy={cy} r={r} fill="none" stroke={fillColor} strokeWidth={sw}
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={hasEntered ? circ * (1 - pct) : circ}
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{ transition: hasEntered ? 'stroke-dashoffset 600ms cubic-bezier(.22,1,.36,1)' : 'none' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className={`font-mono text-lg font-semibold tabular-nums leading-tight ${isOver ? (overPositive ? 'text-positive' : 'text-negative') : 'text-[var(--ink)]'}`}>
                {Math.round(pct * 100)}%
              </p>
            </div>
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-[var(--ink)]">
              <MaskedAmount value={budget.spent} tone="kern" className="text-sm" /> <span className="text-[var(--ink-4)]">van <MaskedAmount value={budget.limit} tone="kern" className="text-sm" /></span>
            </p>

            {/* Progress bar */}
            <div className="relative h-1.5 overflow-hidden rounded-full" style={{ background: trackColor }}>
              {/* Fill 1 — normaal */}
              <div
                className="absolute inset-y-0 left-0 rounded-l-full transition-all duration-500"
                style={{ width: `${barSeg.normalPct}%`, background: barSeg.normalColor }}
              />
              {/* Fill 2 — waarschuwing */}
              {barSeg.warnPct > 0 && (
                <div
                  className="absolute inset-y-0 rounded-r-full transition-all duration-500"
                  style={{ left: `${barSeg.warnLeft}%`, width: `${barSeg.warnPct}%`, background: barSeg.warnColor, transitionDelay: '30ms' }}
                />
              )}
              {/* Extension */}
              {barSeg.extensionPct > 0 && (
                <div
                  className="absolute inset-y-0 rounded-r-full transition-all duration-500"
                  style={{ left: `${barSeg.extensionLeft}%`, width: `${barSeg.extensionPct}%`, background: barSeg.extensionColor, opacity: 0.7, transitionDelay: '80ms' }}
                />
              )}
            </div>

            <p className={isOver ? (overPositive ? 'text-positive' : 'text-negative') : 'text-positive'}>
              {isOver ? (
                <>
                  <MaskedAmount value={budget.spent - budget.limit} tone="kern" className="text-xs" />
                  {overPositive ? ' boven doel' : ' over budget'}
                </>
              ) : (
                <>
                  <MaskedAmount value={remaining} tone="kern" className="text-xs" /> over · {daysLeft === 0 ? 'laatste dag' : `nog ${daysLeft}d`}
                </>
              )}
            </p>

            {/* Vrijheidstijd op het restant */}
            {freedomRemaining && !isOver && (
              <p className="font-serif italic text-[10px] text-[var(--ink-3)] leading-none truncate">
                ≈ {freedomRemaining} vrijheid over
              </p>
            )}
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── Quarter: centered ring only ──
  return (
    <WidgetShell module="kern" size={size} kicker={budget.name} href={`/core/budgets?budget=${budget.id}`} kickerPosition="left">
      <div ref={ref} className="flex items-center justify-center h-full">
        <div className="relative shrink-0">
          <svg width={ringSize} height={ringSize} aria-hidden="true">
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={sw} />
            <circle
              cx={cx} cy={cy} r={r} fill="none" stroke={fillColor} strokeWidth={sw}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={hasEntered ? circ * (1 - pct) : circ}
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ transition: hasEntered ? 'stroke-dashoffset 600ms cubic-bezier(.22,1,.36,1)' : 'none' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className={`font-mono text-lg font-semibold tabular-nums leading-tight ${isOver ? (overPositive ? 'text-positive' : 'text-negative') : 'text-[var(--ink)]'}`}>
              {Math.round(pct * 100)}%
            </p>
            <p className="text-[var(--ink-3)] leading-normal mt-0.5 text-center">
              <MaskedAmount value={budget.spent} tone="kern" className="text-[9px]" />
              <br />
              <span className="text-[var(--ink-4)]">/ <MaskedAmount value={budget.limit} tone="kern" className="text-[9px]" /></span>
            </p>
          </div>
        </div>
      </div>
    </WidgetShell>
  )
})
