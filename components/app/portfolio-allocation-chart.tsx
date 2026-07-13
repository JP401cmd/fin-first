'use client'

import { useState, useMemo, memo } from 'react'
import { Target, ArrowRightLeft, BarChart3, Globe, Briefcase, Edit3, Check, Info } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

import {
  type AllocationViewMode,
  type HoldingForAllocation,
  type TargetAllocation,
  type AllocationSlice,
  computeAllocationSlices,
  computeRebalancingSuggestions,
  VIEW_MODE_LABELS,
  CATEGORY_LABELS,
  ASSET_CLASS_LABELS,
  SECTOR_LABELS,
  GEOGRAPHY_LABELS,
  DEFAULT_TARGETS,
  ALLOCATION_COLORS,
} from '@/lib/portfolio-allocation'
import { MaskedAmount } from '@/components/app/masked-amount'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { formatMaskedCurrency } from '@/lib/format'

// Re-export types and utilities for consumers
export type { AllocationViewMode, HoldingForAllocation, TargetAllocation, AllocationSlice }
export { computeAllocationSlices, computeRebalancingSuggestions, ASSET_CLASS_LABELS, SECTOR_LABELS, GEOGRAPHY_LABELS, DEFAULT_TARGETS, ALLOCATION_COLORS }

// ── View mode icons ─────────────────────────────────────────

const VIEW_MODE_ICONS: Record<AllocationViewMode, typeof Briefcase> = {
  asset_class: Briefcase,
  sector: BarChart3,
  geography: Globe,
}

// ── Donut Chart SVG ─────────────────────────────────────────

function AllocationDonut({
  slices,
  total,
  size = 160,
  hasEntered = true,
}: {
  slices: AllocationSlice[]
  total: number
  size?: number
  hasEntered?: boolean
}) {
  const { masked } = useMaskedAmounts()
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.35
  const strokeWidth = size * 0.17

  const circumference = 2 * Math.PI * r
  let offset = 0

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      data-testid="allocation-donut-chart"
    >
      {/* Background ring if empty */}
      {slices.length === 0 && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e4e4e7" strokeWidth={strokeWidth} />
      )}
      {slices.map((seg, segIdx) => {
        const dash = (seg.pct / 100) * circumference
        const gap = circumference - dash
        const currentOffset = offset
        offset += dash
        const animDelay = segIdx * 60
        return (
          <circle
            key={seg.key}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={hasEntered ? `${dash} ${gap}` : `0 ${circumference}`}
            strokeDashoffset={-currentOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{
              transition: hasEntered
                ? `stroke-dasharray 500ms cubic-bezier(.22,1,.36,1) ${animDelay}ms`
                : 'none',
            }}
          />
        )
      })}
      <text x={cx} y={cy - 6} textAnchor="middle" className="font-mono tabular-nums" fontSize="12" fontWeight="700" fill="#18181b">
        {formatMaskedCurrency(total, masked)}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize="8" fill="#a1a1aa">
        totaal
      </text>
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize="8" fill="#a1a1aa">
        {slices.length} categorie{slices.length !== 1 ? 'ën' : ''}
      </text>
    </svg>
  )
}

// ── Comparison Bar ──────────────────────────────────────────

function ComparisonBar({
  label,
  currentPct,
  targetPct,
  color,
  hasEntered = true,
}: {
  label: string
  currentPct: number
  targetPct: number
  color: string
  hasEntered?: boolean
}) {
  const drift = currentPct - targetPct
  const isOver = drift > 2
  const isUnder = drift < -2

  return (
    <div className="space-y-1" data-testid={`comparison-bar-${label}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[var(--ink-2)] truncate">{label}</span>
        <span className="shrink-0 ml-2">
          <span className={`font-semibold ${isOver ? 'text-red-600' : isUnder ? 'text-kern-600' : 'text-[var(--ink)]'}`}>
            {currentPct.toFixed(1)}%
          </span>
          <span className="text-[var(--ink-3)] mx-1">→</span>
          <span className="text-[var(--ink-3)]">{targetPct.toFixed(0)}%</span>
        </span>
      </div>
      <div className="relative h-3 w-full rounded-full bg-zinc-100 overflow-hidden">
        {/* Current allocation bar */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: hasEntered ? `${Math.min(currentPct, 100)}%` : '0%',
            backgroundColor: color,
            opacity: 0.7,
            transition: hasEntered ? 'width 600ms cubic-bezier(.22,1,.36,1)' : 'none',
          }}
        />
        {/* Target marker */}
        <div
          className="absolute inset-y-0 w-0.5 bg-zinc-800"
          style={{ left: `${Math.min(targetPct, 100)}%` }}
          title={`Doel: ${targetPct}%`}
        />
      </div>
      {Math.abs(drift) > 2 && (
        <p className={`text-[10px] ${isOver ? 'text-red-500' : 'text-kern-500'}`}>
          {isOver ? `+${drift.toFixed(1)}% boven doel` : `${drift.toFixed(1)}% onder doel`}
        </p>
      )}
    </div>
  )
}

// ── Target Editor Modal ─────────────────────────────────────

function TargetEditor({
  mode,
  targets,
  onSave,
  onClose,
}: {
  mode: AllocationViewMode
  targets: TargetAllocation[]
  onSave: (targets: TargetAllocation[]) => void
  onClose: () => void
}) {
  const labels = CATEGORY_LABELS[mode]
  const allKeys = Object.keys(labels)
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const t of targets) {
      map[t.category] = String(t.target_pct)
    }
    return map
  })

  const totalPct = Object.values(draft).reduce((s, v) => s + (Number(v) || 0), 0)
  const isValid = Math.abs(totalPct - 100) < 0.5

  function handleSave() {
    const result: TargetAllocation[] = []
    for (const [category, pct] of Object.entries(draft)) {
      const val = Number(pct)
      if (val > 0) {
        result.push({ category, target_pct: val })
      }
    }
    onSave(result)
  }

  return (
    <BottomSheet open={true} onClose={onClose} title="Doelverdeling instellen" size="sm">
      <div className="p-5" data-testid="target-editor-modal">
        <p className="text-xs text-[var(--ink-3)] mb-4">
          {VIEW_MODE_LABELS[mode]} — percentages moeten optellen tot 100%
        </p>

        <div className="space-y-2 max-h-72 overflow-y-auto">
          {allKeys.map((key) => (
            <div key={key} className="flex items-center gap-3">
              <span className="flex-1 text-sm text-[var(--ink-2)] truncate">{labels[key]}</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={draft[key] ?? ''}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  className="w-16 border border-[var(--border-ed)] px-2 py-1.5 text-right text-sm"
                  placeholder="0"
                />
                <span className="text-xs text-[var(--ink-3)]">%</span>
              </div>
            </div>
          ))}
        </div>

        <div className={`mt-4 flex items-center justify-between p-2 text-sm ${
          // eslint-disable-next-line no-restricted-syntax -- validatie-status (som=100%), geen winst/verlies
          isValid ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          <span className="font-medium">Totaal: {totalPct.toFixed(0)}%</span>
          {isValid ? (
            <Check className="h-4 w-4" />
          ) : (
            <span className="text-xs">{totalPct < 100 ? `Nog ${(100 - totalPct).toFixed(0)}% over` : `${(totalPct - 100).toFixed(0)}% teveel`}</span>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid}
            className="bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
            data-testid="target-save-btn"
          >
            Opslaan
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

// ── Main Component ──────────────────────────────────────────

const PortfolioAllocationVisualization = memo(function PortfolioAllocationVisualization({
  holdings,
  totalValue,
}: {
  holdings: HoldingForAllocation[]
  totalValue: number
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 700 })
  const [viewMode, setViewMode] = useState<AllocationViewMode>('asset_class')
  const [showTargetComparison, setShowTargetComparison] = useState(false)
  const [showTargetEditor, setShowTargetEditor] = useState(false)
  const [customTargets, setCustomTargets] = useState<Record<AllocationViewMode, TargetAllocation[]>>(
    DEFAULT_TARGETS,
  )

  const slices = useMemo(
    () => computeAllocationSlices(holdings, viewMode),
    [holdings, viewMode],
  )

  const targets = customTargets[viewMode]
  const suggestions = useMemo(
    () => computeRebalancingSuggestions(slices, targets, totalValue),
    [slices, targets, totalValue],
  )

  // Check if any holdings have classification data for this mode
  const hasClassificationData = useMemo(() => {
    return holdings.some((h) => {
      const field = h[viewMode]
      return field && field !== '' && field !== 'anders'
    })
  }, [holdings, viewMode])

  function handleTargetSave(newTargets: TargetAllocation[]) {
    setCustomTargets((prev) => ({
      ...prev,
      [viewMode]: newTargets,
    }))
    setShowTargetEditor(false)
  }

  if (holdings.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-[var(--ink-3)]" data-testid="allocation-empty">
        Voeg holdings toe om de verdeling te zien.
      </div>
    )
  }

  return (
    <div ref={ref} data-testid="portfolio-allocation-visualization">
      {/* View mode tabs */}
      <div className="flex items-center gap-1 mb-4" data-testid="allocation-view-tabs">
        {(Object.keys(VIEW_MODE_LABELS) as AllocationViewMode[]).map((mode) => {
          const Icon = VIEW_MODE_ICONS[mode]
          return (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              data-testid={`view-tab-${mode}`}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === mode
                  ? 'bg-kern-100 text-kern-700'
                  : 'text-[var(--ink-3)] hover:text-[var(--ink-2)] hover:bg-[var(--subtle)]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {VIEW_MODE_LABELS[mode]}
            </button>
          )
        })}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setShowTargetComparison(!showTargetComparison)}
            data-testid="toggle-comparison"
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
              showTargetComparison
                ? 'bg-purple-100 text-purple-700'
                : 'text-[var(--ink-3)] hover:text-[var(--ink-2)] hover:bg-[var(--subtle)]'
            }`}
          >
            <Target className="h-3.5 w-3.5" />
            Doel
          </button>
        </div>
      </div>

      {/* No classification data notice */}
      {!hasClassificationData && (
        <div className="mb-4 flex items-start gap-2 border border-kern-200 bg-kern-50 p-3" data-testid="no-classification-notice">
          <Info className="h-4 w-4 shrink-0 text-kern-500 mt-0.5" />
          <p className="text-xs text-kern-700">
            Je holdings hebben nog geen {VIEW_MODE_LABELS[viewMode].toLowerCase()}-classificatie.
            Alle holdings staan onder &quot;Overig&quot;. Classificeer je holdings via de API of bewerk ze om een betere verdeling te zien.
          </p>
        </div>
      )}

      {/* Chart + Legend */}
      <div className="flex items-start gap-6">
        <AllocationDonut slices={slices} total={totalValue} hasEntered={hasEntered} />
        <div className="flex-1 space-y-1.5 max-h-52 overflow-y-auto">
          {slices.map((slice) => (
            <div key={slice.key} className="flex items-center gap-2" data-testid={`slice-${slice.key}`}>
              <span
                className="inline-block h-3 w-3 shrink-0"
                style={{ backgroundColor: slice.color }}
              />
              <span className="flex-1 text-xs text-[var(--ink-2)] truncate">
                {slice.label}
                <span className="ml-1 text-[var(--ink-3)]">({slice.holdingCount})</span>
              </span>
              <span className="text-xs font-medium text-[var(--ink)] shrink-0" data-testid={`slice-pct-${slice.key}`}>
                {slice.pct.toFixed(1)}%
              </span>
              <span className="text-xs text-[var(--ink-3)] shrink-0">{<MaskedAmount value={slice.value} tone="kern" />}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Target allocation comparison */}
      {showTargetComparison && (
        <div className="mt-6 rounded-[var(--r-lg)] border border-purple-100 bg-purple-50/30 p-4" data-testid="target-comparison-section">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-purple-600" />
              <h3 className="text-sm font-semibold text-[var(--ink-2)]">Huidige vs. doelverdeling</h3>
            </div>
            <button
              onClick={() => setShowTargetEditor(true)}
              data-testid="edit-targets-btn"
              className="inline-flex items-center gap-1 border border-purple-200 px-2.5 py-1 text-xs font-medium text-purple-600 hover:bg-purple-50"
            >
              <Edit3 className="h-3 w-3" />
              Doelen bewerken
            </button>
          </div>

          {targets.length === 0 ? (
            <div className="text-center py-4" data-testid="no-targets">
              <p className="text-xs text-[var(--ink-3)] mb-2">
                Geen doelverdeling ingesteld voor {VIEW_MODE_LABELS[viewMode].toLowerCase()}.
              </p>
              <button
                onClick={() => setShowTargetEditor(true)}
                className="text-xs font-medium text-purple-600 hover:text-purple-700"
              >
                Doelverdeling instellen →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {targets.map((t) => {
                const slice = slices.find((s) => s.key === t.category)
                const allLabels = { ...ASSET_CLASS_LABELS, ...SECTOR_LABELS, ...GEOGRAPHY_LABELS }
                return (
                  <ComparisonBar
                    key={t.category}
                    label={allLabels[t.category] || t.category}
                    currentPct={slice?.pct ?? 0}
                    targetPct={t.target_pct}
                    color={slice?.color ?? '#a1a1aa'}
                    hasEntered={hasEntered}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Rebalancing suggestions */}
      {showTargetComparison && suggestions.length > 0 && (
        <div className="mt-4 rounded-[var(--r-lg)] border border-kern-100 bg-kern-50/30 p-4" data-testid="rebalancing-section">
          <div className="flex items-center gap-2 mb-3">
            <ArrowRightLeft className="h-4 w-4 text-kern-600" />
            <h3 className="text-sm font-semibold text-[var(--ink-2)]">Herbalanceringsuggesties</h3>
          </div>
          <div className="space-y-2">
            {suggestions.map((s) => (
              <div
                key={s.category}
                className={`flex items-center gap-3 border p-2.5 ${
                  s.action === 'buy'
                    ? 'border-positive/30 bg-positive-bg'
                    : 'border-negative/30 bg-negative-bg'
                }`}
                data-testid={`rebalance-${s.category}`}
              >
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center ${
                  s.action === 'buy' ? 'bg-positive-bg' : 'bg-negative-bg'
                }`}>
                  <ArrowRightLeft className={`h-3.5 w-3.5 ${
                    s.action === 'buy' ? 'text-positive' : 'text-negative'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[var(--ink)]">
                    {s.action === 'buy' ? 'Bijkopen' : 'Afbouwen'}: {s.label}
                  </p>
                  <p className="text-[10px] text-[var(--ink-3)]">
                    {s.current_pct}% → {s.target_pct}% (drift: {s.drift > 0 ? '+' : ''}{s.drift}%)
                  </p>
                </div>
                <span className={`shrink-0 text-xs font-semibold ${
                  s.action === 'buy' ? 'text-positive' : 'text-negative'
                }`}>
                  {s.action === 'buy' ? '+' : '-'}{<MaskedAmount value={s.amount} tone="kern" />}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-[var(--ink-3)]">
            * Suggesties zijn indicatief en gebaseerd op je doelverdeling. Drift-drempel: 2%.
          </p>
        </div>
      )}

      {/* Target editor modal */}
      {showTargetEditor && (
        <TargetEditor
          mode={viewMode}
          targets={targets}
          onSave={handleTargetSave}
          onClose={() => setShowTargetEditor(false)}
        />
      )}
    </div>
  )
})

export default PortfolioAllocationVisualization
