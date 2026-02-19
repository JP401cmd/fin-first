'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Users, User, Percent, ArrowRight, Scale,
  Wallet, UserCheck, Settings, PiggyBank,
  TrendingDown, Info, ChevronDown, ChevronUp,
} from 'lucide-react'
import { formatCurrency } from '@/components/app/budget-shared'
import {
  computeSharePct,
  SPLIT_MODE_LABELS,
  SPLIT_MODE_DESCRIPTIONS,
  type SplitMode,
} from '@/lib/household-data'

// ─── Types ────────────────────────────────────────────────────

export interface PartnerContribution {
  userId: string
  name: string
  isCurrentUser: boolean
  sharePct: number
  shareAmount: number
  income?: number
}

export interface CostSplitResult {
  mode: SplitMode
  totalAmount: number
  partners: PartnerContribution[]
  label: string
  description: string
}

interface CostSplitCalculatorProps {
  /** Total shared amount to split (e.g., total shared budget, debt, expense) */
  totalAmount: number
  /** Current split mode from household settings */
  splitMode: SplitMode
  /** Custom split percentage (0-100) for the primary payer */
  customSplitPct: number | null
  /** ID of the primary payer */
  primaryPayerId: string | null
  /** Current user's ID */
  userId: string
  /** Current user's display name */
  userName?: string
  /** Partner's user ID */
  partnerId?: string
  /** Partner's display name */
  partnerName?: string
  /** User's monthly income (for income_ratio mode) */
  myIncome?: number
  /** Partner's monthly income (for income_ratio mode) */
  partnerIncome?: number
  /** Label describing what's being split (e.g., "Gedeelde kosten", "Schuld") */
  itemLabel?: string
  /** Whether to show the mode selector (interactive) */
  showModeSelector?: boolean
  /** Callback when mode changes (for interactive use) */
  onModeChange?: (mode: SplitMode, customPct?: number) => void
  /** Compact mode for inline display */
  compact?: boolean
}

// ─── Calculation Engine ───────────────────────────────────────

/**
 * Calculate the cost split for all 4 modes given the inputs.
 * Returns per-partner contribution amounts.
 */
export function calculateCostSplit(
  totalAmount: number,
  mode: SplitMode,
  userId: string,
  partnerId: string,
  myIncome: number,
  partnerIncome: number,
  customSplitPct: number | null,
  primaryPayerId: string | null,
  userName: string,
  partnerName: string,
): CostSplitResult {
  const settings = { splitMode: mode, customSplitPct, primaryPayerId }

  const myPct = computeSharePct(settings, userId, myIncome, partnerIncome)
  const partnerPct = 100 - myPct

  const myAmount = totalAmount * (myPct / 100)
  const partnerAmount = totalAmount * (partnerPct / 100)

  return {
    mode,
    totalAmount,
    partners: [
      {
        userId,
        name: userName,
        isCurrentUser: true,
        sharePct: myPct,
        shareAmount: myAmount,
        income: myIncome,
      },
      {
        userId: partnerId,
        name: partnerName,
        isCurrentUser: false,
        sharePct: partnerPct,
        shareAmount: partnerAmount,
        income: partnerIncome,
      },
    ],
    label: SPLIT_MODE_LABELS[mode],
    description: SPLIT_MODE_DESCRIPTIONS[mode],
  }
}

/**
 * Calculate all 4 modes for comparison.
 */
export function calculateAllModes(
  totalAmount: number,
  userId: string,
  partnerId: string,
  myIncome: number,
  partnerIncome: number,
  customSplitPct: number | null,
  primaryPayerId: string | null,
  userName: string,
  partnerName: string,
): CostSplitResult[] {
  const modes: SplitMode[] = ['equal', 'income_ratio', 'custom', 'one_carries_all']
  return modes.map(mode =>
    calculateCostSplit(
      totalAmount, mode, userId, partnerId,
      myIncome, partnerIncome, customSplitPct, primaryPayerId,
      userName, partnerName,
    ),
  )
}

// ─── Mode Icons ───────────────────────────────────────────────

const MODE_ICONS: Record<SplitMode, typeof Scale> = {
  equal: Scale,
  income_ratio: TrendingDown,
  custom: Settings,
  one_carries_all: UserCheck,
}

const MODE_COLORS: Record<SplitMode, { bg: string; text: string; border: string; accent: string }> = {
  equal: { bg: 'bg-wil-50', text: 'text-wil-700', border: 'border-wil-200', accent: 'bg-wil-500' },
  income_ratio: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', accent: 'bg-blue-500' },
  custom: { bg: 'bg-kern-50', text: 'text-kern-700', border: 'border-kern-200', accent: 'bg-kern-500' },
  one_carries_all: { bg: 'bg-horizon-50', text: 'text-horizon-700', border: 'border-horizon-200', accent: 'bg-horizon-500' },
}

// ─── Per-Partner Contribution Bar ─────────────────────────────

function ContributionBar({
  partner,
  totalAmount,
  colorClass,
}: {
  partner: PartnerContribution
  totalAmount: number
  colorClass: string
}) {
  const pctWidth = totalAmount > 0 ? Math.max(2, (partner.shareAmount / totalAmount) * 100) : 50

  return (
    <div className="flex items-center gap-3" data-testid={`contribution-${partner.isCurrentUser ? 'me' : 'partner'}`}>
      <div className="flex items-center gap-1.5 w-24 shrink-0">
        {partner.isCurrentUser ? (
          <User className="h-3.5 w-3.5 text-zinc-600" />
        ) : (
          <Users className="h-3.5 w-3.5 text-wil-600" />
        )}
        <span className="text-xs font-medium text-zinc-700 truncate">
          {partner.isCurrentUser ? 'Jij' : partner.name || 'Partner'}
        </span>
      </div>
      <div className="flex-1 relative h-6 bg-zinc-100 rounded-full overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${colorClass}`}
          style={{ width: `${pctWidth}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-zinc-800 mix-blend-multiply">
          {partner.sharePct}%
        </span>
      </div>
      <span className="text-xs font-semibold text-zinc-800 w-20 text-right tabular-nums" data-testid={`amount-${partner.isCurrentUser ? 'me' : 'partner'}`}>
        {formatCurrency(partner.shareAmount)}
      </span>
    </div>
  )
}

// ─── Split Mode Card ──────────────────────────────────────────

function SplitModeCard({
  result,
  isActive,
  onSelect,
  compact,
}: {
  result: CostSplitResult
  isActive: boolean
  onSelect?: () => void
  compact?: boolean
}) {
  const colors = MODE_COLORS[result.mode]
  const Icon = MODE_ICONS[result.mode]

  if (compact) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all ${
          isActive
            ? `${colors.bg} ${colors.border} ${colors.text} shadow-sm`
            : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300'
        }`}
        data-testid={`split-mode-${result.mode}`}
        data-active={isActive ? 'true' : 'false'}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-xs font-medium">{result.label}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col gap-2 rounded-xl border-2 p-4 text-left transition-all ${
        isActive
          ? `${colors.bg} ${colors.border} ${colors.text} shadow-sm ring-1 ring-${colors.border}`
          : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50'
      }`}
      data-testid={`split-mode-${result.mode}`}
      data-active={isActive ? 'true' : 'false'}
    >
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
          isActive ? colors.accent + ' text-white' : 'bg-zinc-100 text-zinc-500'
        }`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${isActive ? colors.text : 'text-zinc-800'}`}>
            {result.label}
          </p>
          <p className="text-[10px] text-zinc-400 truncate">
            {result.description}
          </p>
        </div>
      </div>

      {/* Contribution bars */}
      <div className="space-y-1.5">
        {result.partners.map((partner) => (
          <ContributionBar
            key={partner.userId}
            partner={partner}
            totalAmount={result.totalAmount}
            colorClass={isActive ? colors.accent : 'bg-zinc-300'}
          />
        ))}
      </div>
    </button>
  )
}

// ─── Per-Partner Summary ──────────────────────────────────────

export function PartnerContributionSummary({
  result,
  itemLabel,
}: {
  result: CostSplitResult
  itemLabel?: string
}) {
  const colors = MODE_COLORS[result.mode]

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4" data-testid="partner-contribution-summary">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-zinc-800 flex items-center gap-1.5">
          <Users className="h-4 w-4 text-wil-600" />
          Kostenverdeling
        </h4>
        <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${colors.bg} ${colors.text}`}>
          {result.label}
        </span>
      </div>

      {/* Total */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-zinc-100">
        <span className="text-xs text-zinc-500">{itemLabel || 'Totaal gedeeld'}</span>
        <span className="text-sm font-bold text-zinc-900" data-testid="split-total-amount">
          {formatCurrency(result.totalAmount)}
        </span>
      </div>

      {/* Per-partner breakdown */}
      <div className="space-y-2">
        {result.partners.map((partner) => (
          <div
            key={partner.userId}
            className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2"
            data-testid={`partner-row-${partner.isCurrentUser ? 'me' : 'partner'}`}
          >
            <div className="flex items-center gap-2">
              {partner.isCurrentUser ? (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200">
                  <User className="h-3 w-3 text-zinc-600" />
                </div>
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-wil-100">
                  <Users className="h-3 w-3 text-wil-600" />
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-zinc-800">
                  {partner.isCurrentUser ? 'Jij' : partner.name || 'Partner'}
                </p>
                <p className="text-[10px] text-zinc-400">
                  {partner.sharePct}% aandeel
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-zinc-900 tabular-nums" data-testid={`partner-amount-${partner.isCurrentUser ? 'me' : 'partner'}`}>
                {formatCurrency(partner.shareAmount)}
              </p>
              {partner.income !== undefined && partner.income > 0 && (
                <p className="text-[10px] text-zinc-400 tabular-nums">
                  Inkomen: {formatCurrency(partner.income)}/mnd
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Fairness indicator for income_ratio mode */}
      {result.mode === 'income_ratio' && result.partners[0].income && result.partners[1].income && (
        <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-blue-50 px-3 py-2" data-testid="income-ratio-info">
          <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-[10px] text-blue-700">
            Verdeling gebaseerd op inkomenratio:{' '}
            <span className="font-medium">
              {formatCurrency(result.partners[0].income!)} vs {formatCurrency(result.partners[1].income!)}
            </span>
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Budget Split Display ─────────────────────────────────────

interface BudgetSplitItem {
  id: string
  name: string
  totalAmount: number
  ownership: 'personal' | 'shared'
}

export function SharedBudgetSplitList({
  budgets,
  splitResult,
}: {
  budgets: BudgetSplitItem[]
  splitResult: CostSplitResult
}) {
  const sharedBudgets = budgets.filter(b => b.ownership === 'shared')

  if (sharedBudgets.length === 0) return null

  const myPct = splitResult.partners.find(p => p.isCurrentUser)?.sharePct ?? 50
  const partnerPct = 100 - myPct
  const colors = MODE_COLORS[splitResult.mode]

  return (
    <div className="rounded-xl border border-zinc-200 bg-white" data-testid="shared-budget-split-list">
      <div className="flex items-center justify-between p-4 pb-2">
        <h4 className="text-sm font-semibold text-zinc-800 flex items-center gap-1.5">
          <Wallet className="h-4 w-4 text-kern-500" />
          Gedeelde budgetten
        </h4>
        <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${colors.bg} ${colors.text}`}>
          {splitResult.label}
        </span>
      </div>

      <div className="divide-y divide-zinc-100">
        {sharedBudgets.map((budget) => {
          const myAmount = budget.totalAmount * (myPct / 100)
          const partnerAmount = budget.totalAmount * (partnerPct / 100)

          return (
            <div key={budget.id} className="px-4 py-3" data-testid={`budget-split-${budget.id}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-zinc-700">{budget.name}</span>
                <span className="text-xs font-semibold text-zinc-900 tabular-nums">
                  {formatCurrency(budget.totalAmount)}
                </span>
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <User className="h-2.5 w-2.5" />
                  Jij: <span className="font-medium text-zinc-700 tabular-nums">{formatCurrency(myAmount)}</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <Users className="h-2.5 w-2.5" />
                  Partner: <span className="font-medium text-zinc-700 tabular-nums">{formatCurrency(partnerAmount)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Totals row */}
      <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-3 rounded-b-xl">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-zinc-700">Totaal gedeeld</span>
          <span className="text-sm font-bold text-zinc-900 tabular-nums">
            {formatCurrency(sharedBudgets.reduce((s, b) => s + b.totalAmount, 0))}
          </span>
        </div>
        <div className="flex gap-4">
          <span className="text-[10px] text-zinc-500">
            Jij: <span className="font-medium text-zinc-700 tabular-nums">
              {formatCurrency(sharedBudgets.reduce((s, b) => s + b.totalAmount * (myPct / 100), 0))}
            </span> ({myPct}%)
          </span>
          <span className="text-[10px] text-zinc-500">
            Partner: <span className="font-medium text-zinc-700 tabular-nums">
              {formatCurrency(sharedBudgets.reduce((s, b) => s + b.totalAmount * (partnerPct / 100), 0))}
            </span> ({partnerPct}%)
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Debt Split Display ───────────────────────────────────────

interface DebtSplitItem {
  id: string
  name: string
  currentBalance: number
  monthlyPayment: number
  ownership: 'personal' | 'shared'
}

export function SharedDebtSplitList({
  debts,
  splitResult,
}: {
  debts: DebtSplitItem[]
  splitResult: CostSplitResult
}) {
  const sharedDebts = debts.filter(d => d.ownership === 'shared')

  if (sharedDebts.length === 0) return null

  const myPct = splitResult.partners.find(p => p.isCurrentUser)?.sharePct ?? 50
  const partnerPct = 100 - myPct
  const colors = MODE_COLORS[splitResult.mode]

  return (
    <div className="rounded-xl border border-zinc-200 bg-white" data-testid="shared-debt-split-list">
      <div className="flex items-center justify-between p-4 pb-2">
        <h4 className="text-sm font-semibold text-zinc-800 flex items-center gap-1.5">
          <TrendingDown className="h-4 w-4 text-rose-500" />
          Gedeelde schulden
        </h4>
        <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${colors.bg} ${colors.text}`}>
          {splitResult.label}
        </span>
      </div>

      <div className="divide-y divide-zinc-100">
        {sharedDebts.map((debt) => {
          const myBalance = debt.currentBalance * (myPct / 100)
          const partnerBalance = debt.currentBalance * (partnerPct / 100)
          const myPayment = debt.monthlyPayment * (myPct / 100)
          const partnerPayment = debt.monthlyPayment * (partnerPct / 100)

          return (
            <div key={debt.id} className="px-4 py-3" data-testid={`debt-split-${debt.id}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-zinc-700">{debt.name}</span>
                <span className="text-xs font-semibold text-rose-600 tabular-nums">
                  {formatCurrency(debt.currentBalance)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-[10px] text-zinc-500">
                  <div className="flex items-center gap-1">
                    <User className="h-2.5 w-2.5" />
                    Jij
                  </div>
                  <div className="mt-0.5 font-medium text-zinc-700 tabular-nums">
                    Saldo: {formatCurrency(myBalance)}
                  </div>
                  {debt.monthlyPayment > 0 && (
                    <div className="font-medium text-zinc-700 tabular-nums">
                      Aflossing: {formatCurrency(myPayment)}/mnd
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-zinc-500">
                  <div className="flex items-center gap-1">
                    <Users className="h-2.5 w-2.5" />
                    Partner
                  </div>
                  <div className="mt-0.5 font-medium text-zinc-700 tabular-nums">
                    Saldo: {formatCurrency(partnerBalance)}
                  </div>
                  {debt.monthlyPayment > 0 && (
                    <div className="font-medium text-zinc-700 tabular-nums">
                      Aflossing: {formatCurrency(partnerPayment)}/mnd
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Totals row */}
      <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-3 rounded-b-xl">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-zinc-700">Totaal gedeelde schuld</span>
          <span className="text-sm font-bold text-rose-600 tabular-nums">
            {formatCurrency(sharedDebts.reduce((s, d) => s + d.currentBalance, 0))}
          </span>
        </div>
        <div className="flex gap-4">
          <span className="text-[10px] text-zinc-500">
            Jij: <span className="font-medium text-zinc-700 tabular-nums">
              {formatCurrency(sharedDebts.reduce((s, d) => s + d.currentBalance * (myPct / 100), 0))}
            </span> ({myPct}%)
          </span>
          <span className="text-[10px] text-zinc-500">
            Partner: <span className="font-medium text-zinc-700 tabular-nums">
              {formatCurrency(sharedDebts.reduce((s, d) => s + d.currentBalance * (partnerPct / 100), 0))}
            </span> ({partnerPct}%)
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Main CostSplitCalculator Component ───────────────────────

export function CostSplitCalculator({
  totalAmount,
  splitMode,
  customSplitPct,
  primaryPayerId,
  userId,
  userName = 'Jij',
  partnerId = 'partner',
  partnerName = 'Partner',
  myIncome = 0,
  partnerIncome = 0,
  itemLabel,
  showModeSelector = false,
  onModeChange,
  compact = false,
}: CostSplitCalculatorProps) {
  const [activeMode, setActiveMode] = useState<SplitMode>(splitMode)
  const [localCustomPct, setLocalCustomPct] = useState<number>(customSplitPct ?? 50)
  const [showAllModes, setShowAllModes] = useState(false)

  // Update when props change
  useEffect(() => {
    setActiveMode(splitMode)
  }, [splitMode])

  useEffect(() => {
    setLocalCustomPct(customSplitPct ?? 50)
  }, [customSplitPct])

  // Calculate active split result
  const activeResult = useMemo(() =>
    calculateCostSplit(
      totalAmount, activeMode, userId, partnerId,
      myIncome, partnerIncome,
      activeMode === 'custom' ? localCustomPct : customSplitPct,
      primaryPayerId, userName, partnerName,
    ),
  [totalAmount, activeMode, userId, partnerId, myIncome, partnerIncome, localCustomPct, customSplitPct, primaryPayerId, userName, partnerName])

  // Calculate all modes for comparison
  const allResults = useMemo(() =>
    showAllModes
      ? calculateAllModes(
          totalAmount, userId, partnerId,
          myIncome, partnerIncome, localCustomPct,
          primaryPayerId, userName, partnerName,
        )
      : [],
  [showAllModes, totalAmount, userId, partnerId, myIncome, partnerIncome, localCustomPct, primaryPayerId, userName, partnerName])

  const handleModeChange = useCallback((mode: SplitMode) => {
    setActiveMode(mode)
    onModeChange?.(mode, mode === 'custom' ? localCustomPct : undefined)
  }, [onModeChange, localCustomPct])

  const handleCustomPctChange = useCallback((pct: number) => {
    const clamped = Math.max(0, Math.min(100, pct))
    setLocalCustomPct(clamped)
    if (activeMode === 'custom') {
      onModeChange?.('custom', clamped)
    }
  }, [activeMode, onModeChange])

  // ─── Compact Mode ─────────────────────────────────────────

  if (compact) {
    const me = activeResult.partners.find(p => p.isCurrentUser)
    const partner = activeResult.partners.find(p => !p.isCurrentUser)

    return (
      <div className="flex items-center gap-2 text-xs" data-testid="cost-split-calculator-compact">
        <span className="text-zinc-400">{SPLIT_MODE_LABELS[activeMode]}:</span>
        <span className="font-medium text-zinc-700 tabular-nums">
          Jij {me?.sharePct}% ({formatCurrency(me?.shareAmount ?? 0)})
        </span>
        <ArrowRight className="h-3 w-3 text-zinc-300" />
        <span className="font-medium text-zinc-700 tabular-nums">
          {partnerName} {partner?.sharePct}% ({formatCurrency(partner?.shareAmount ?? 0)})
        </span>
      </div>
    )
  }

  // ─── Full Mode ────────────────────────────────────────────

  return (
    <div className="space-y-4" data-testid="cost-split-calculator">
      {/* Active mode summary */}
      <PartnerContributionSummary result={activeResult} itemLabel={itemLabel} />

      {/* Mode selector (interactive) */}
      {showModeSelector && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-zinc-700 flex items-center gap-1.5">
              <Settings className="h-4 w-4 text-zinc-400" />
              Verdelingsmodus
            </h4>
            <button
              type="button"
              onClick={() => setShowAllModes(!showAllModes)}
              className="flex items-center gap-1 text-[10px] font-medium text-wil-600 hover:text-wil-700"
              data-testid="toggle-all-modes"
            >
              {showAllModes ? 'Minder' : 'Vergelijk alle modi'}
              {showAllModes ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>

          {/* Mode buttons */}
          {showAllModes ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {allResults.map((result) => (
                <SplitModeCard
                  key={result.mode}
                  result={result}
                  isActive={result.mode === activeMode}
                  onSelect={() => handleModeChange(result.mode)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(['equal', 'income_ratio', 'custom', 'one_carries_all'] as SplitMode[]).map((mode) => (
                <SplitModeCard
                  key={mode}
                  result={calculateCostSplit(
                    totalAmount, mode, userId, partnerId,
                    myIncome, partnerIncome,
                    mode === 'custom' ? localCustomPct : customSplitPct,
                    primaryPayerId, userName, partnerName,
                  )}
                  isActive={mode === activeMode}
                  onSelect={() => handleModeChange(mode)}
                  compact
                />
              ))}
            </div>
          )}

          {/* Custom percentage slider */}
          {activeMode === 'custom' && (
            <div className="rounded-xl border border-kern-200 bg-kern-50 p-4" data-testid="custom-pct-editor">
              <label className="block text-xs font-medium text-kern-700 mb-2">
                Jouw aandeel: {localCustomPct}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={localCustomPct}
                onChange={(e) => handleCustomPctChange(Number(e.target.value))}
                className="w-full h-2 bg-kern-200 rounded-lg appearance-none cursor-pointer accent-kern-500"
                data-testid="custom-pct-slider"
              />
              <div className="flex justify-between mt-1 text-[10px] text-kern-600">
                <span>0% (partner betaalt alles)</span>
                <span>100% (jij betaalt alles)</span>
              </div>
              <div className="flex justify-between mt-2 text-xs">
                <span className="font-medium text-kern-700">
                  Jij: {formatCurrency(totalAmount * (localCustomPct / 100))}
                </span>
                <span className="font-medium text-kern-700">
                  Partner: {formatCurrency(totalAmount * ((100 - localCustomPct) / 100))}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
