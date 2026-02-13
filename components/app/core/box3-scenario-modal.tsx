'use client'

import { useState, useMemo } from 'react'
import { X, ArrowRightLeft, GitCompare } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import {
  calculateBox3,
  calculateBox3WithShift,
  BOX3_PARAMS,
  type Box3Input,
  type Box3Result,
  type TaxYear,
} from '@/lib/box3-data'

export function Box3ScenarioModal({
  input,
  result,
  onClose,
}: {
  input: Box3Input
  result: Box3Result
  onClose: () => void
}) {
  const [tab, setTab] = useState<'shift' | 'compare'>('shift')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-2xl bg-white shadow-xl overflow-y-auto"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h3 className="text-lg font-bold text-zinc-900">Wat-als scenario&apos;s</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-100 px-6">
          <button
            onClick={() => setTab('shift')}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'shift' ? 'border-amber-500 text-amber-700' : 'border-transparent text-zinc-400 hover:text-zinc-600'
            }`}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Vermogen verschuiven
          </button>
          <button
            onClick={() => setTab('compare')}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'compare' ? 'border-amber-500 text-amber-700' : 'border-transparent text-zinc-400 hover:text-zinc-600'
            }`}
          >
            <GitCompare className="h-3.5 w-3.5" />
            Vergelijk jaren
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {tab === 'shift' ? (
            <ShiftTab input={input} result={result} />
          ) : (
            <CompareTab input={input} result={result} />
          )}
        </div>
      </div>
    </div>
  )
}

function ShiftTab({ input, result }: { input: Box3Input; result: Box3Result }) {
  const maxShift = result.totaalBeleggingen
  const [shiftAmount, setShiftAmount] = useState(0)

  const shifted = useMemo(() => {
    if (shiftAmount === 0) return result
    return calculateBox3WithShift(input, shiftAmount)
  }, [input, result, shiftAmount])

  const delta = result.belasting - shifted.belasting
  const deltaVrijheid = result.vrijheidsdagen - shifted.vrijheidsdagen

  return (
    <div>
      <p className="mb-4 text-sm text-zinc-600">
        Verschuif vermogen van beleggingen naar spaargeld. Spaargeld heeft een lager forfaitair rendement.
      </p>

      {/* Slider */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs text-zinc-500">Beleggingen &rarr; Spaargeld</span>
          <span className="text-sm font-semibold text-amber-700">{formatCurrency(shiftAmount)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={maxShift}
          step={1000}
          value={shiftAmount}
          onChange={e => setShiftAmount(Number(e.target.value))}
          className="w-full accent-amber-500"
        />
        <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
          <span>{formatCurrency(0)}</span>
          <span>{formatCurrency(maxShift)}</span>
        </div>
      </div>

      {/* Result comparison */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-[10px] font-semibold tracking-[0.15em] text-zinc-400 uppercase">Huidige situatie</p>
          <p className="mt-1 text-xl font-bold text-zinc-900">{formatCurrency(result.belasting)}</p>
          <p className="text-xs text-zinc-500">Box 3 belasting</p>
          <div className="mt-2 text-xs text-zinc-400">
            <p>Spaargeld: {formatCurrency(result.totaalSpaargeld)}</p>
            <p>Beleggingen: {formatCurrency(result.totaalBeleggingen)}</p>
          </div>
        </div>
        <div className={`rounded-xl border p-4 ${delta > 0 ? 'border-emerald-200 bg-emerald-50' : 'border-zinc-200 bg-zinc-50'}`}>
          <p className="text-[10px] font-semibold tracking-[0.15em] text-zinc-400 uppercase">Na verschuiving</p>
          <p className="mt-1 text-xl font-bold text-zinc-900">{formatCurrency(shifted.belasting)}</p>
          <p className="text-xs text-zinc-500">Box 3 belasting</p>
          <div className="mt-2 text-xs text-zinc-400">
            <p>Spaargeld: {formatCurrency(shifted.totaalSpaargeld)}</p>
            <p>Beleggingen: {formatCurrency(shifted.totaalBeleggingen)}</p>
          </div>
        </div>
      </div>

      {delta > 0 && (
        <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-center">
          <p className="text-sm font-semibold text-emerald-700">
            Besparing: {formatCurrency(delta)}
          </p>
          <p className="text-xs text-emerald-600">
            {deltaVrijheid} vrijheidsdagen teruggewonnen
          </p>
        </div>
      )}
    </div>
  )
}

function CompareTab({ input, result }: { input: Box3Input; result: Box3Result }) {
  const otherYear: TaxYear = result.year === 2025 ? 2026 : 2025
  const otherResult = useMemo(
    () => calculateBox3({ ...input, year: otherYear }),
    [input, otherYear],
  )

  const delta = result.belasting - otherResult.belasting
  const params1 = result.params
  const params2 = BOX3_PARAMS[otherYear]

  return (
    <div>
      <p className="mb-4 text-sm text-zinc-600">
        Vergelijk de belastingdruk tussen {result.year} en {otherYear} met dezelfde vermogenssamenstelling.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold text-amber-700">{result.year}</p>
          <p className="mt-1 text-xl font-bold text-zinc-900">{formatCurrency(result.belasting)}</p>
          <div className="mt-3 space-y-1 text-xs text-zinc-500">
            <p>Forfait spaargeld: {(params1.forfaitSpaargeld * 100).toFixed(2)}%</p>
            <p>Forfait beleggingen: {(params1.forfaitBeleggingen * 100).toFixed(2)}%</p>
            <p>Heffingsvrij: {formatCurrency(result.hasPartner ? params1.heffingsvrijPartner : params1.heffingsvrijSingle)}</p>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-xs font-semibold text-zinc-600">{otherYear}</p>
          <p className="mt-1 text-xl font-bold text-zinc-900">{formatCurrency(otherResult.belasting)}</p>
          <div className="mt-3 space-y-1 text-xs text-zinc-500">
            <p>Forfait spaargeld: {(params2.forfaitSpaargeld * 100).toFixed(2)}%</p>
            <p>Forfait beleggingen: {(params2.forfaitBeleggingen * 100).toFixed(2)}%</p>
            <p>Heffingsvrij: {formatCurrency(result.hasPartner ? params2.heffingsvrijPartner : params2.heffingsvrijSingle)}</p>
          </div>
        </div>
      </div>

      {delta !== 0 && (
        <div className={`mt-4 rounded-lg p-3 text-center ${delta > 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
          <p className={`text-sm font-semibold ${delta > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            {otherYear} is {formatCurrency(Math.abs(delta))} {delta > 0 ? 'goedkoper' : 'duurder'}
          </p>
        </div>
      )}
    </div>
  )
}
