'use client'

import { useState, useMemo } from 'react'
import { Sparkles } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { formatCurrency } from '@/lib/format'
import {
  calculatePartnerSplit,
  optimizePartnerAllocation,
  type Box3Input,
  type Box3Result,
} from '@/lib/box3-data'

export function Box3PartnerModal({
  input,
  result,
  onClose,
}: {
  input: Box3Input
  result: Box3Result
  onClose: () => void
}) {
  const totalS = result.totaalSpaargeld
  const totalB = result.totaalBeleggingen
  const totalSch = result.totaalBox3Schulden

  const [p1Pct, setP1Pct] = useState({ spaargeld: 50, beleggingen: 50, schulden: 50 })

  const p1S = totalS * (p1Pct.spaargeld / 100)
  const p1B = totalB * (p1Pct.beleggingen / 100)
  const p1Sch = totalSch * (p1Pct.schulden / 100)
  const p2S = totalS - p1S
  const p2B = totalB - p1B
  const p2Sch = totalSch - p1Sch

  const manualSplit = useMemo(
    () => calculatePartnerSplit(p1S, p1B, p1Sch, p2S, p2B, p2Sch, input.year),
    [p1S, p1B, p1Sch, p2S, p2B, p2Sch, input.year],
  )

  const optimal = useMemo(
    () => optimizePartnerAllocation(result, input),
    [result, input],
  )

  function applyOptimal() {
    if (totalS > 0) setP1Pct(prev => ({ ...prev, spaargeld: Math.round((optimal.partner1Spaargeld / totalS) * 100) }))
    if (totalB > 0) setP1Pct(prev => ({ ...prev, beleggingen: Math.round((optimal.partner1Beleggingen / totalB) * 100) }))
    if (totalSch > 0) setP1Pct(prev => ({ ...prev, schulden: Math.round((optimal.partner1Schulden / totalSch) * 100) }))
  }

  const besparingVsSingle = result.tax - manualSplit.totalTax

  return (
    <BottomSheet open={true} onClose={onClose} title="Verdeling fiscaal partner" size="lg">
        <div className="px-6 py-5">
          <p className="mb-5 text-sm text-[var(--ink-2)]">
            Verdeel het Box 3 vermogen over twee fiscaal partners. Elke partner heeft een eigen heffingsvrij vermogen.
          </p>

          {/* Optimal allocation button */}
          <button
            onClick={applyOptimal}
            className="mb-5 flex w-full items-center justify-center gap-2 rounded-lg bg-kern-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-kern-700"
          >
            <Sparkles className="h-4 w-4" />
            Optimale verdeling toepassen
          </button>

          {optimal.savingsVsEqual > 0 && (
            <div className="mb-5 rounded-lg bg-emerald-50 p-3 text-center">
              <p className="text-xs text-emerald-600">
                Optimale verdeling bespaart {formatCurrency(optimal.savingsVsEqual)} ten opzichte van 50/50
              </p>
            </div>
          )}

          {/* Sliders */}
          <div className="space-y-5">
            <SliderRow
              label="Spaargeld"
              total={totalS}
              p1Pct={p1Pct.spaargeld}
              onChange={v => setP1Pct(prev => ({ ...prev, spaargeld: v }))}
            />
            <SliderRow
              label="Beleggingen"
              total={totalB}
              p1Pct={p1Pct.beleggingen}
              onChange={v => setP1Pct(prev => ({ ...prev, beleggingen: v }))}
            />
            <SliderRow
              label="Schulden"
              total={totalSch}
              p1Pct={p1Pct.schulden}
              onChange={v => setP1Pct(prev => ({ ...prev, schulden: v }))}
            />
          </div>

          {/* Result */}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
              <p className="text-[10px] font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">Partner 1</p>
              <p className="mt-1 text-xl font-bold text-[var(--ink)]">{formatCurrency(manualSplit.partner1Tax)}</p>
              <div className="mt-2 space-y-0.5 text-xs text-[var(--ink-3)]">
                <p>Spaargeld: {formatCurrency(p1S)}</p>
                <p>Beleggingen: {formatCurrency(p1B)}</p>
                <p>Schulden: {formatCurrency(p1Sch)}</p>
              </div>
            </div>
            <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
              <p className="text-[10px] font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">Partner 2</p>
              <p className="mt-1 text-xl font-bold text-[var(--ink)]">{formatCurrency(manualSplit.partner2Tax)}</p>
              <div className="mt-2 space-y-0.5 text-xs text-[var(--ink-3)]">
                <p>Spaargeld: {formatCurrency(p2S)}</p>
                <p>Beleggingen: {formatCurrency(p2B)}</p>
                <p>Schulden: {formatCurrency(p2Sch)}</p>
              </div>
            </div>
          </div>

          {/* Total */}
          <div className="mt-4 rounded-[var(--r-lg)] border border-kern-200 bg-kern-50 p-4 text-center">
            <p className="text-xs font-semibold text-kern-700/60 uppercase">Totaal met partner</p>
            <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{formatCurrency(manualSplit.totalTax)}</p>
            {besparingVsSingle > 0 && (
              <p className="mt-1 text-sm text-emerald-600">
                {formatCurrency(besparingVsSingle)} besparing t.o.v. alleen
              </p>
            )}
          </div>
        </div>
    </BottomSheet>
  )
}

function SliderRow({
  label,
  total,
  p1Pct,
  onChange,
}: {
  label: string
  total: number
  p1Pct: number
  onChange: (v: number) => void
}) {
  const p1Val = total * (p1Pct / 100)
  const p2Val = total - p1Val

  if (total === 0) {
    return (
      <div>
        <p className="mb-1 text-xs font-medium text-[var(--ink-2)]">{label}</p>
        <p className="text-xs text-[var(--ink-3)]">Geen {label.toLowerCase()}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-medium text-[var(--ink-2)]">{label} ({formatCurrency(total)})</p>
        <p className="text-xs text-[var(--ink-3)]">{p1Pct}% / {100 - p1Pct}%</p>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={p1Pct}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-kern-500"
      />
      <div className="mt-0.5 flex justify-between text-[10px] text-[var(--ink-3)]">
        <span>P1: {formatCurrency(p1Val)}</span>
        <span>P2: {formatCurrency(p2Val)}</span>
      </div>
    </div>
  )
}
