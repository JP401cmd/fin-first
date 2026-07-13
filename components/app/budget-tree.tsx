'use client'

import { useState, memo } from 'react'
import { ChevronDown } from 'lucide-react'
import { BudgetIcon, getTypeColors, isOverPositive, computeBarSegments, anyChildOverBudget, BudgetOverWarningIcon, type BudgetType } from '@/components/app/budget-shared'
import type { Budget, BudgetWithChildren } from '@/lib/budget-data'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { useFlashChange } from '@/lib/hooks/use-flash-change'
import { MaskedAmount } from '@/components/app/masked-amount'

interface BudgetTreeProps {
  groups: BudgetWithChildren[]
  spending: Record<string, number>
  budgetType: BudgetType
  onNavigate: (budgetId: string) => void
  beschikbaarMap?: Record<string, number>
}

/* ── ChildBar ────────────────────────────────────────────────── */

function ChildBar({
  child,
  spent,
  beschikbaar,
  budgetType,
  onNavigate,
  hasEntered,
  rowIndex,
}: {
  child: Budget
  spent: number
  beschikbaar?: number
  budgetType: BudgetType
  onNavigate: (id: string) => void
  hasEntered: boolean
  rowIndex: number
}) {
  const limit = beschikbaar !== undefined ? beschikbaar + spent : Number(child.default_limit)
  const overBudget = spent > limit && limit > 0
  const alertThreshold = child.alert_threshold ?? 80
  const isHard = child.limit_type === 'hard'
  const colors = getTypeColors(budgetType)
  const overPositive = isOverPositive(budgetType)
  const seg = computeBarSegments(spent, limit, alertThreshold, colors, overPositive)

  // Flash-puls op het rest-bedrag (resterend budget = limit − spent) bij
  // waardeverandering: minder over → flash-down (rood), meer over → flash-up
  // (groen). Respecteert prefers-reduced-motion via de hook.
  const { flashClass } = useFlashChange(limit - spent)

  return (
    <div
      className="group cursor-pointer rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--subtle)]"
      onClick={() => onNavigate(child.id)}
      data-child-id={child.id}
      style={{
        animation: hasEntered ? `fadeUp 0.4s ease-out ${rowIndex * 60}ms both` : 'none',
        opacity: hasEntered ? undefined : 0,
      }}
    >
      {/* Row 1: icon + name + amount */}
      <div className="flex items-center gap-2.5">
        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${colors.bg}`}>
          <BudgetIcon name={child.icon} className={`h-3 w-3 ${colors.textLight}`} />
        </div>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--ink-2)]">
          {child.name}
        </span>
        <span className="shrink-0 font-mono text-xs tabular-nums">
          <span className={`${overBudget ? (overPositive ? 'text-positive' : 'text-negative') : 'text-[var(--ink-2)]'} ${flashClass}`}>
            {<MaskedAmount value={spent} tone="wil" />}
          </span>
          <span className="text-[var(--ink-3)]"> / {<MaskedAmount value={limit} tone="wil" />}</span>
        </span>
      </div>

      {/* Row 2: progress bar (aligned with name, after icon column) */}
      <div className="mt-2 pl-[30px]">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
          {/* Fill 1 — normaal (0 → threshold) */}
          <div
            className="absolute inset-y-0 left-0 rounded-l-full"
            style={{
              width: hasEntered ? `${seg.normalPct}%` : '0%',
              backgroundColor: seg.normalColor,
              transition: hasEntered
                ? `width 500ms cubic-bezier(.22,1,.36,1) ${150 + rowIndex * 60}ms`
                : 'none',
            }}
          />

          {/* Fill 2 — waarschuwing (threshold → 100%) */}
          {seg.warnPct > 0 && (
            <div
              className="absolute inset-y-0 rounded-r-full"
              style={{
                left: `${seg.warnLeft}%`,
                width: hasEntered ? `${seg.warnPct}%` : '0%',
                backgroundColor: seg.warnColor,
                transition: hasEntered
                  ? `width 500ms cubic-bezier(.22,1,.36,1) ${180 + rowIndex * 60}ms`
                  : 'none',
              }}
            />
          )}

          {/* Extension (100% → 105%) */}
          {seg.extensionPct > 0 && (
            <div
              className="absolute inset-y-0 rounded-r-full"
              style={{
                left: `${seg.extensionLeft}%`,
                width: hasEntered ? `${seg.extensionPct}%` : '0%',
                backgroundColor: seg.extensionColor,
                opacity: 0.7,
                transition: hasEntered
                  ? `width 500ms cubic-bezier(.22,1,.36,1) ${230 + rowIndex * 60}ms`
                  : 'none',
              }}
            />
          )}

          {/* Alert threshold marker */}
          {alertThreshold > 0 && alertThreshold < 100 && (
            <div
              className="absolute top-0 bottom-0 w-px border-l border-dashed border-zinc-400"
              style={{ left: `${seg.alertPosition}%`, marginTop: -2, marginBottom: -2 }}
            />
          )}

          {/* Limit boundary (the "fence") */}
          <div
            className={`absolute top-0 bottom-0 ${
              isHard ? 'w-0.5' : 'w-0.5 border-l border-dashed'
            }`}
            style={{
              left: `${seg.limitPosition}%`,
              marginTop: -2,
              marginBottom: -2,
              backgroundColor: isHard ? (overBudget ? seg.overColor : colors.hex) : undefined,
              borderColor: !isHard ? (overBudget ? seg.overColor : colors.hex) : undefined,
            }}
          />
        </div>
      </div>
    </div>
  )
}

/* ── TreeGroup (one parent + children) ───────────────────────── */

function TreeGroup({
  parent,
  spending,
  beschikbaarMap,
  budgetType,
  onNavigate,
}: {
  parent: BudgetWithChildren
  spending: Record<string, number>
  beschikbaarMap?: Record<string, number>
  budgetType: BudgetType
  onNavigate: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { ref: inViewRef, hasEntered } = useInViewAnimation({ duration: 900 })

  const colors = getTypeColors(budgetType)

  const totalSpent = parent.children.length > 0
    ? parent.children.reduce((sum, c) => sum + (spending[c.id] ?? 0), 0)
    : (spending[parent.id] ?? 0)
  const totalLimit = parent.children.length > 0
    ? parent.children.reduce((sum, c) =>
        sum + (beschikbaarMap?.[c.id] !== undefined
          ? beschikbaarMap[c.id] + (spending[c.id] ?? 0)
          : Number(c.default_limit)), 0)
    : (beschikbaarMap?.[parent.id] !== undefined
        ? beschikbaarMap[parent.id] + (spending[parent.id] ?? 0)
        : Number(parent.default_limit))

  const pct = totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0
  const overBudget = totalSpent > totalLimit && totalLimit > 0
  // Waarschuwing voor een (mogelijk ingeklapte) parent waarvan een deelbudget
  // over budget is, terwijl het totaal zelf nog binnen budget kan vallen.
  const childOverBudget = anyChildOverBudget(parent.children, spending, beschikbaarMap, budgetType)
  const overPositive = isOverPositive(budgetType)
  const seg = computeBarSegments(totalSpent, totalLimit, 80, colors, overPositive)

  // Flash-puls op het rest-bedrag (totaal resterend = totalLimit − totalSpent).
  const { flashClass } = useFlashChange(totalLimit - totalSpent)

  // No children — show single compact card (no expand)
  if (parent.children.length === 0) {
    return (
      <div
        ref={inViewRef}
        className="cursor-pointer rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 transition-shadow hover:shadow-[var(--s0)]"
        onClick={() => onNavigate(parent.id)}
        style={{
          animation: hasEntered ? 'fadeUp 0.4s ease-out both' : 'none',
          opacity: hasEntered ? undefined : 0,
        }}
      >
        <div className="flex items-center gap-3">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${colors.bgDark}`}>
            <BudgetIcon name={parent.icon} className={`h-4 w-4 ${colors.text}`} />
          </div>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--ink)]">
            {parent.name}
          </span>
          {/* Percentage badge */}
          <span className={`shrink-0 rounded-full bg-[var(--subtle)] px-2 py-0.5 text-xs font-medium ${
            overBudget ? (overPositive ? 'text-positive' : 'text-negative') : pct >= 80 ? `text-[${colors.barHexWarn}]` : 'text-[var(--ink-3)]'
          }`}>
            {pct}%
          </span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--ink-3)]">
            <span className={`${overBudget ? (overPositive ? 'text-positive' : 'text-negative') : 'text-[var(--ink-2)]'} ${flashClass}`}>{<MaskedAmount value={totalSpent} tone="wil" />}</span>
            {' / '}{<MaskedAmount value={totalLimit} tone="wil" />}
          </span>
        </div>
        {/* Progress bar */}
        <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
          {/* Fill 1 — normaal */}
          <div
            className="absolute inset-y-0 left-0 rounded-l-full"
            style={{
              width: hasEntered ? `${seg.normalPct}%` : '0%',
              backgroundColor: seg.normalColor,
              transition: hasEntered ? 'width 500ms cubic-bezier(.22,1,.36,1) 150ms' : 'none',
            }}
          />
          {/* Fill 2 — waarschuwing */}
          {seg.warnPct > 0 && (
            <div
              className="absolute inset-y-0 rounded-r-full"
              style={{
                left: `${seg.warnLeft}%`,
                width: hasEntered ? `${seg.warnPct}%` : '0%',
                backgroundColor: seg.warnColor,
                transition: hasEntered ? 'width 500ms cubic-bezier(.22,1,.36,1) 180ms' : 'none',
              }}
            />
          )}
          {/* Extension */}
          {seg.extensionPct > 0 && (
            <div
              className="absolute inset-y-0 rounded-r-full"
              style={{
                left: `${seg.extensionLeft}%`,
                width: hasEntered ? `${seg.extensionPct}%` : '0%',
                backgroundColor: seg.extensionColor,
                opacity: 0.7,
                transition: hasEntered ? 'width 500ms cubic-bezier(.22,1,.36,1) 230ms' : 'none',
              }}
            />
          )}
        </div>
      </div>
    )
  }

  // Has children — collapsible group
  return (
    <div
      ref={inViewRef}
      className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] transition-shadow hover:shadow-[var(--s0)]"
      style={{
        animation: hasEntered ? 'fadeUp 0.4s ease-out both' : 'none',
        opacity: hasEntered ? undefined : 0,
      }}
    >
      {/* Collapsed header row — always visible */}
      <div
        className="flex cursor-pointer items-center gap-3 p-4"
        onClick={() => setExpanded((v) => !v)}
      >
        <button
          type="button"
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${colors.bgDark} transition-transform hover:scale-110 hover:ring-2 hover:ring-[${colors.hex}]/30`}
          onClick={(e) => { e.stopPropagation(); onNavigate(parent.id) }}
          title="Details openen"
        >
          <BudgetIcon name={parent.icon} className={`h-4 w-4 ${colors.text}`} />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--ink)]">
          {parent.name}
        </span>
        {/* Waarschuwing: een deelbudget is over budget (ook zichtbaar bij inklappen) */}
        {childOverBudget && <BudgetOverWarningIcon />}
        {/* Percentage badge */}
        <span className={`shrink-0 rounded-full bg-[var(--subtle)] px-2 py-0.5 text-xs font-medium ${
          overBudget ? (overPositive ? 'text-positive' : 'text-negative') : pct >= 80 ? `text-[${colors.barHexWarn}]` : 'text-[var(--ink-3)]'
        }`}>
          {pct}%
        </span>
        {/* Amount */}
        <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--ink-3)]">
          <span className={`${overBudget ? (overPositive ? 'text-positive' : 'text-negative') : 'text-[var(--ink-2)]'} ${flashClass}`}>{<MaskedAmount value={totalSpent} tone="wil" />}</span>
          {' / '}{<MaskedAmount value={totalLimit} tone="wil" />}
        </span>
        {/* Chevron */}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </div>

      {/* Progress bar under header */}
      <div className="px-4 pb-4">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
          {/* Fill 1 — normaal */}
          <div
            className="absolute inset-y-0 left-0 rounded-l-full"
            style={{
              width: hasEntered ? `${seg.normalPct}%` : '0%',
              backgroundColor: seg.normalColor,
              transition: hasEntered ? 'width 500ms cubic-bezier(.22,1,.36,1) 150ms' : 'none',
            }}
          />
          {/* Fill 2 — waarschuwing */}
          {seg.warnPct > 0 && (
            <div
              className="absolute inset-y-0 rounded-r-full"
              style={{
                left: `${seg.warnLeft}%`,
                width: hasEntered ? `${seg.warnPct}%` : '0%',
                backgroundColor: seg.warnColor,
                transition: hasEntered ? 'width 500ms cubic-bezier(.22,1,.36,1) 180ms' : 'none',
              }}
            />
          )}
          {/* Extension */}
          {seg.extensionPct > 0 && (
            <div
              className="absolute inset-y-0 rounded-r-full"
              style={{
                left: `${seg.extensionLeft}%`,
                width: hasEntered ? `${seg.extensionPct}%` : '0%',
                backgroundColor: seg.extensionColor,
                opacity: 0.7,
                transition: hasEntered ? 'width 500ms cubic-bezier(.22,1,.36,1) 230ms' : 'none',
              }}
            />
          )}
        </div>
      </div>

      {/* Children — shown when expanded */}
      {expanded && (
        <div className="border-t border-[var(--border-ed)] py-1.5">
          {parent.children.map((child, index) => (
            <ChildBar
              key={child.id}
              child={child}
              spent={spending[child.id] ?? 0}
              beschikbaar={beschikbaarMap?.[child.id]}
              budgetType={budgetType}
              onNavigate={onNavigate}
              hasEntered={hasEntered}
              rowIndex={index}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── BudgetTree (top-level) ──────────────────────────────────── */

// memo(): props worden door budgets-client gestabiliseerd (groups/beschikbaarMap
// via useMemo, spending is state, onNavigate is een stabiele useCallback). Zo
// slaat de boom zijn render over bij ONgerelateerde re-renders van de host.
export const BudgetTree = memo(function BudgetTree({ groups, spending, budgetType, onNavigate, beschikbaarMap }: BudgetTreeProps) {
  if (groups.length === 0) return null

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <TreeGroup
          key={group.id}
          parent={group}
          spending={spending}
          beschikbaarMap={beschikbaarMap}
          budgetType={budgetType}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  )
})
