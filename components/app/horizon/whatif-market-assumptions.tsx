'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, LineChart } from 'lucide-react'

export interface AssetGroupReturn {
  assetType: string
  label: string
  /** Weighted average expected_return for this asset-type (decimal, e.g. 0.07 for 7%). */
  weightedReturn: number
}

interface Props {
  /** Per-asset-type delta in decimal (e.g. { investment: 0.02, cash: -0.005 }). Empty = no shift. */
  value: Record<string, number>
  onChange: (value: Record<string, number>) => void
  /** Per-asset-type baseline rendementen — only types with assets > 0. */
  assetGroups?: AssetGroupReturn[]
}

// Zichtbaar UI-bereik: ±0,03 (±3 pp). De parser-clamp (±0,05, toekomst-scenario.ts) blijft
// staan zodat opgeslagen deltas geldig blijven; een opgeslagen delta buiten ±0,03 verbreedt de
// UI-band tot die waarde (vangnet-principe, gelijk aan de slider-schaal in whatif-sliders.tsx).
const UI_MIN = -0.03
const UI_MAX = 0.03
const STEP = 0.005
const EPSILON = 0.0001

function formatPp(v: number): string {
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)} pp`
}

/** Randlabel voor de rendement-track (typografische min-teken, pp zonder overbodige decimaal). */
function formatPpEdge(v: number): string {
  const abs = Math.abs(v * 100)
  const num = abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(1)
  return `${v < 0 ? '−' : v > 0 ? '+' : ''}${num} pp`
}

/** UI-bereik dat een opgeslagen waarde buiten ±0,03 tot die waarde verbreedt (niets clampt). */
function uiRange(...values: number[]): { min: number; max: number } {
  return { min: Math.min(UI_MIN, ...values), max: Math.max(UI_MAX, ...values) }
}

/**
 * "Marktbias" override met master + finetune per asset-groep.
 * Master sleeper zet alle groepen tegelijk; daarna kan elke groep apart
 * worden bijgesteld. Schulden (interest_rate) zijn ongewijzigd.
 */
export function WhatIfMarketAssumptions({ value, onChange, assetGroups = [] }: Props) {
  const [open, setOpen] = useState(false)

  // Master = common value if all groups uniform, else 0 (with mixed indicator).
  const groupValues = assetGroups.map(g => value[g.assetType] ?? 0)
  const allSame = groupValues.length > 0
    && groupValues.every(v => Math.abs(v - groupValues[0]) < EPSILON)
  const masterValue = allSame ? groupValues[0] : 0
  const isMixed = !allSame && groupValues.some(v => Math.abs(v) > EPSILON)
  // Master-track dekt ±3 pp én elke opgeslagen groepswaarde daarbuiten (vangnet).
  const masterRange = uiRange(...groupValues, masterValue)

  const setMaster = (delta: number) => {
    if (Math.abs(delta) < EPSILON) {
      onChange({})
      return
    }
    const next: Record<string, number> = {}
    for (const g of assetGroups) next[g.assetType] = delta
    onChange(next)
  }

  const setGroupDelta = (assetType: string, delta: number) => {
    const next = { ...value }
    if (Math.abs(delta) < EPSILON) {
      delete next[assetType]
    } else {
      next[assetType] = delta
    }
    onChange(next)
  }

  const resetAll = () => onChange({})

  const divergedKeys = assetGroups
    .map(g => g.assetType)
    .filter(t => Math.abs(value[t] ?? 0) > EPSILON)
  const anyDiverged = divergedKeys.length > 0

  const summaryText = anyDiverged
    ? (allSame ? formatPp(masterValue) : `${divergedKeys.length}× gemengd`)
    : null

  return (
    <div className="card-editorial overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ink)]"
      >
        <div className="flex items-center gap-3">
          <LineChart className="h-4 w-4 text-[var(--ink-3)]" aria-hidden />
          <div>
            <p className="flex items-center gap-1.5 font-sans text-sm font-semibold text-[var(--ink)]">
              Marktbias
              {summaryText && (
                <span className="rounded-full border border-horizon-300 bg-horizon-50 px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-[0.05em] text-horizon-700">
                  {summaryText}
                </span>
              )}
            </p>
            <p className="mt-0.5 font-sans text-xs text-[var(--ink-3)]">
              Schuif rendement op alle assets, of finetune per groep
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
        )}
      </button>

      {open && (
        <div className="border-t border-[var(--border-ed)] px-4 pb-4 pt-3">
          {assetGroups.length === 0 ? (
            <p className="py-3 font-sans text-[11px] text-[var(--ink-4)]">
              Geen assets geregistreerd — voeg eerst bezittingen toe in Overzicht.
            </p>
          ) : (
            <>
              {/* ── Master slider ──────────────────────────── */}
              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-2)]">
                    Alle groepen tegelijk
                  </span>
                  <span className={`font-mono text-sm tabular-nums ${
                    isMixed ? 'italic text-[var(--ink-4)]' : 'text-[var(--ink)]'
                  }`}>
                    {isMixed ? 'gemengd' : formatPp(masterValue)}
                  </span>
                </div>
                <input
                  type="range"
                  min={masterRange.min}
                  max={masterRange.max}
                  step={STEP}
                  value={isMixed ? 0 : masterValue}
                  onChange={e => setMaster(Number(e.target.value))}
                  className="w-full accent-horizon-600"
                  aria-label="Master rendement-delta voor alle vermogensgroepen"
                />
                <div className="flex justify-between font-sans text-[10px] text-[var(--ink-4)]">
                  <span>{formatPpEdge(masterRange.min)}</span>
                  <span>0</span>
                  <span>{formatPpEdge(masterRange.max)}</span>
                </div>
              </div>

              {/* ── Per-asset-groep finetune ─────────────── */}
              <div className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)]/30 px-3 py-2.5">
                <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-4)]">
                  Finetune per groep
                </p>
                <div className="space-y-1.5">
                  {assetGroups.map(g => {
                    const delta = value[g.assetType] ?? 0
                    const baselinePct = g.weightedReturn * 100
                    const targetPct = baselinePct + delta * 100
                    const isDiverged = Math.abs(delta) > EPSILON
                    return (
                      <div
                        key={g.assetType}
                        className="grid grid-cols-[minmax(0,1fr)_minmax(120px,160px)_auto] items-center gap-2"
                      >
                        <span className="truncate font-sans text-[11px] text-[var(--ink-2)]">
                          {g.label}
                        </span>
                        <input
                          type="range"
                          min={uiRange(delta).min}
                          max={uiRange(delta).max}
                          step={STEP}
                          value={delta}
                          onChange={e => setGroupDelta(g.assetType, Number(e.target.value))}
                          className="h-1.5 w-full accent-horizon-600"
                          aria-label={`${g.label} rendement-delta`}
                        />
                        <span className={`shrink-0 text-right font-mono text-[10px] tabular-nums ${
                          isDiverged ? 'font-semibold text-horizon-700' : 'text-[var(--ink-3)]'
                        }`}>
                          {targetPct.toFixed(1)}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {anyDiverged && (
            <button
              type="button"
              onClick={resetAll}
              className="mt-3 w-full rounded-[var(--r)] border border-dashed border-[var(--border-md)] px-3 py-2 font-sans text-xs font-medium text-[var(--ink-3)] transition-colors hover:border-horizon-300 hover:text-horizon-700"
            >
              Alles terug naar 0 pp
            </button>
          )}

          <p className="mt-3 font-sans text-[10px] leading-snug text-[var(--ink-4)]">
            Master past op alle groepen tegelijk; finetune-sliders overrulen de
            master per groep. Schulden behouden hun eigen rente.
          </p>
        </div>
      )}
    </div>
  )
}
