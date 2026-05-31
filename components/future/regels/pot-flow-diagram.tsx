'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, ArrowRight } from 'lucide-react'
import {
  WEALTH_GROUP_LABELS,
  WEALTH_GROUP_COLORS,
  type WealthGroup,
} from '@/lib/wealth-composition'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import type { PotRulesConfig, SurplusGroup } from '@/lib/pot-rules'

type PotBalances = Record<WealthGroup, number>

/** Hoogste saldo voor schaal-normalisatie (minimaal 1 om deling door 0 te vermijden). */
function maxBalance(balances: PotBalances): number {
  return Math.max(1, ...Object.values(balances))
}

/**
 * Illustratieve pot-flow-weergave — toont de potten met hun huidige saldo.
 * mode 'order'  : genummerde drain-volgorde + optionele 1-jaar-uitgave-illustratie.
 * mode 'target' : markeert de doel-pot voor overschot/meevaller.
 */
export function PotFlowDiagram({
  balances,
  mode,
  orderedGroups,
  targetGroup,
  oneYearExpense,
}: {
  balances: PotBalances
  mode: 'order' | 'target'
  /** Voor mode 'order': de groepen in gekozen volgorde. */
  orderedGroups?: WealthGroup[]
  /** Voor mode 'target': de gekozen doel-pot. */
  targetGroup?: SurplusGroup
  /** Voor mode 'order': illustreer hoeveel één jaar uitgaven uit elke pot haalt. */
  oneYearExpense?: number
}) {
  const { masked } = useMaskedAmounts()
  const max = maxBalance(balances)
  const groups: WealthGroup[] =
    mode === 'order' && orderedGroups
      ? orderedGroups
      : (['spaargeld', 'beleggingen', 'pensioen', 'vastgoed', 'overig'] as WealthGroup[])

  // Bereken per-groep onttrekking voor één jaar uitgaven (mode 'order').
  let remaining = oneYearExpense ?? 0
  const drained: Partial<Record<WealthGroup, number>> = {}
  if (mode === 'order' && oneYearExpense && oneYearExpense > 0) {
    for (const g of groups) {
      const take = Math.min(remaining, balances[g])
      drained[g] = take
      remaining -= take
      if (remaining <= 0) break
    }
  }

  return (
    <div className="space-y-2">
      {groups.map((g, i) => {
        const bal = balances[g]
        const widthPct = Math.max(2, (bal / max) * 100)
        const drainedAmt = drained[g] ?? 0
        const drainPct = bal > 0 ? Math.min(100, (drainedAmt / bal) * 100) : 0
        const isTarget = mode === 'target' && targetGroup === g
        return (
          <div key={g} className="flex items-center gap-2">
            {mode === 'order' && (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--paper)] text-[10px] font-bold font-mono">
                {i + 1}
              </span>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold text-[var(--ink-2)] inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: WEALTH_GROUP_COLORS[g] }}
                    aria-hidden
                  />
                  {WEALTH_GROUP_LABELS[g]}
                  {isTarget && (
                    <span className="ml-1 inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wide font-bold text-[var(--module-active-700)]">
                      <ArrowRight className="h-3 w-3" /> hierheen
                    </span>
                  )}
                </span>
                <span className="font-mono tabular-nums text-[11px] text-[var(--ink-3)]">
                  {formatMaskedCurrency(bal, masked)}
                </span>
              </div>
              <div
                className={`mt-1 h-3 rounded-full bg-[var(--subtle)] overflow-hidden ${
                  isTarget ? 'ring-2 ring-[var(--module-active-500)]' : ''
                }`}
              >
                <div className="h-full rounded-full relative" style={{ width: `${widthPct}%`, background: WEALTH_GROUP_COLORS[g] }}>
                  {drainPct > 0 && (
                    <div
                      className="absolute inset-y-0 left-0 rounded-l-full"
                      style={{
                        width: `${drainPct}%`,
                        background:
                          'repeating-linear-gradient(45deg, rgba(0,0,0,0.28) 0 4px, transparent 4px 8px)',
                      }}
                      aria-hidden
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
      {mode === 'order' && oneYearExpense && oneYearExpense > 0 && (
        <p className="text-[10px] text-[var(--ink-3)] italic pt-1">
          Gearceerd = wat één jaar uitgaven ({formatMaskedCurrency(oneYearExpense, masked)}) uit elke pot zou halen.
        </p>
      )}
    </div>
  )
}

/** Herordenbare lijst van de 5 WealthGroups (omhoog/omlaag) — voor regel 3 & 5. */
export function GroupOrderEditor({
  groups,
  balances,
  onChange,
}: {
  groups: WealthGroup[]
  balances: Record<WealthGroup, number>
  onChange: (next: WealthGroup[]) => void
}) {
  const { masked } = useMaskedAmounts()
  function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= groups.length) return
    const next = [...groups]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  return (
    <div className="space-y-1.5">
      {groups.map((g, i) => (
        <div
          key={g}
          className="flex items-center gap-2 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--paper)] text-[10px] font-bold font-mono">
            {i + 1}
          </span>
          <span
            className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
            style={{ background: WEALTH_GROUP_COLORS[g] }}
            aria-hidden
          />
          <span className="flex-1 text-sm font-semibold text-[var(--ink)]">{WEALTH_GROUP_LABELS[g]}</span>
          <span className="font-mono tabular-nums text-[11px] text-[var(--ink-3)]">
            {formatMaskedCurrency(balances[g], masked)}
          </span>
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label={`${WEALTH_GROUP_LABELS[g]} omhoog`}
              className="text-[var(--ink-3)] hover:text-[var(--ink)] disabled:opacity-30"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === groups.length - 1}
              aria-label={`${WEALTH_GROUP_LABELS[g]} omlaag`}
              className="text-[var(--ink-3)] hover:text-[var(--ink)] disabled:opacity-30"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Gedeelde save-state + PUT naar /api/pot-rules voor de drie pot-bodies. */
export function usePotRulesSave(onClose: () => void, onSaved: () => void) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(config: PotRulesConfig) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/pot-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error ?? 'Opslaan mislukt')
        setSaving(false)
        return
      }
      setSaving(false)
      onClose()
      onSaved()
    } catch {
      setError('Opslaan mislukt — netwerkfout')
      setSaving(false)
    }
  }

  return { saving, error, save }
}
