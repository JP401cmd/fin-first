'use client'

import { useState, useMemo } from 'react'
import { X, Sparkles } from 'lucide-react'
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

  const besparingVsSingle = result.belasting - manualSplit.totalTax

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-2xl bg-white shadow-xl overflow-y-auto"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h3 className="text-lg font-bold text-zinc-900">Verdeling fiscaal partner</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          <p className="mb-5 text-sm text-zinc-600">
            Verdeel het Box 3 vermogen over twee fiscaal partners. Elke partner heeft een eigen heffingsvrij vermogen.
          </p>

          {/* Optimal allocation button */}
          <button
            onClick={applyOptimal}
            className="mb-5 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700"
          >
            <Sparkles className="h-4 w-4" />
            Optimale verdeling toepassen
          </button>

          {optimal.besparingVsGelijk > 0 && (
            <div className="mb-5 rounded-lg bg-emerald-50 p-3 text-center">
              <p className="text-xs text-emerald-600">
                Optimale verdeling bespaart {formatCurrency(optimal.besparingVsGelijk)} ten opzichte van 50/50
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
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-[10px] font-semibold tracking-[0.15em] text-zinc-400 uppercase">Partner 1</p>
              <p className="mt-1 text-xl font-bold text-zinc-900">{formatCurrency(manualSplit.partner1Tax)}</p>
              <div className="mt-2 space-y-0.5 text-xs text-zinc-400">
                <p>Spaargeld: {formatCurrency(p1S)}</p>
                <p>Beleggingen: {formatCurrency(p1B)}</p>
                <p>Schulden: {formatCurrency(p1Sch)}</p>
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-[10px] font-semibold tracking-[0.15em] text-zinc-400 uppercase">Partner 2</p>
              <p className="mt-1 text-xl font-bold text-zinc-900">{formatCurrency(manualSplit.partner2Tax)}</p>
              <div className="mt-2 space-y-0.5 text-xs text-zinc-400">
                <p>Spaargeld: {formatCurrency(p2S)}</p>
                <p>Beleggingen: {formatCurrency(p2B)}</p>
                <p>Schulden: {formatCurrency(p2Sch)}</p>
              </div>
            </div>
          </div>

          {/* Total */}
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
            <p className="text-xs font-semibold text-amber-700/60 uppercase">Totaal met partner</p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{formatCurrency(manualSplit.totalTax)}</p>
            {besparingVsSingle > 0 && (
              <p className="mt-1 text-sm text-emerald-600">
                {formatCurrency(besparingVsSingle)} besparing t.o.v. alleen
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
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
        <p className="mb-1 text-xs font-medium text-zinc-600">{label}</p>
        <p className="text-xs text-zinc-400">Geen {label.toLowerCase()}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-600">{label} ({formatCurrency(total)})</p>
        <p className="text-xs text-zinc-500">{p1Pct}% / {100 - p1Pct}%</p>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={p1Pct}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-amber-500"
      />
      <div className="mt-0.5 flex justify-between text-[10px] text-zinc-400">
        <span>P1: {formatCurrency(p1Val)}</span>
        <span>P2: {formatCurrency(p2Val)}</span>
      </div>
    </div>
  )
}
