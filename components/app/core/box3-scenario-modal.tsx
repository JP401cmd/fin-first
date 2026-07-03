'use client'

import { useState, useMemo } from 'react'
import { ArrowRightLeft, GitCompare } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { formatCurrency } from '@/lib/format'
import {
  calculateBox3,
  calculateBox3WithShift,
  BOX3_PARAMS,
  type Box3Input,
  type Box3Result,
  type TaxYear,
} from '@/lib/box3-data'
import { MaskedAmount } from '@/components/app/masked-amount'

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
    <BottomSheet open={true} onClose={onClose} title="Wat-als scenario's" size="lg">
        {/* Tabs */}
        <div className="flex border-b border-[var(--border-ed)] px-6">
          <button
            onClick={() => setTab('shift')}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'shift' ? 'border-kern-500 text-kern-700' : 'border-transparent text-[var(--ink-3)] hover:text-[var(--ink-2)]'
            }`}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Vermogen verschuiven
          </button>
          <button
            onClick={() => setTab('compare')}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'compare' ? 'border-kern-500 text-kern-700' : 'border-transparent text-[var(--ink-3)] hover:text-[var(--ink-2)]'
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
    </BottomSheet>
  )
}

function ShiftTab({ input, result }: { input: Box3Input; result: Box3Result }) {
  const maxShift = result.totaalBeleggingen
  const [shiftAmount, setShiftAmount] = useState(0)

  const shifted = useMemo(() => {
    if (shiftAmount === 0) return result
    return calculateBox3WithShift(input, shiftAmount)
  }, [input, result, shiftAmount])

  const delta = result.tax - shifted.tax
  const deltaVrijheid = result.freedomDays - shifted.freedomDays

  return (
    <div>
      <p className="mb-4 text-sm text-[var(--ink-2)]">
        Verschuif vermogen van beleggingen naar spaargeld. Spaargeld heeft een lager forfaitair rendement.
      </p>

      {/* Slider met module-active accent */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs text-[var(--ink-3)]">Beleggingen &rarr; Spaargeld</span>
          <span
            className="text-sm font-semibold tabular-nums"
            style={{ color: 'var(--module-active-700)' }}
          >
            {<MaskedAmount value={shiftAmount} tone="kern" />}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={maxShift}
          step={1000}
          value={shiftAmount}
          onChange={e => setShiftAmount(Number(e.target.value))}
          className="w-full"
          style={{ accentColor: 'var(--module-active-500)' }}
        />
        <div className="mt-1 flex justify-between text-[10px] text-[var(--ink-3)]">
          <span>{<MaskedAmount value={0} tone="kern" />}</span>
          <span>{<MaskedAmount value={maxShift} tone="kern" />}</span>
        </div>
      </div>

      {/* Result comparison — figures-strip-stijl met top+bottom borders */}
      <div className="grid grid-cols-2 border-t border-b border-[var(--ink)] my-3">
        <div className="p-3 sm:p-4 border-r border-[var(--rule-soft)]">
          <p className="text-[10px] font-semibold tracking-[0.18em] font-mono text-[var(--ink-3)] uppercase">Huidige situatie</p>
          <p
            className="mt-1.5 text-[20px] sm:text-[24px] font-black leading-none tracking-[-0.02em] tabular-nums text-[var(--ink)]"
            style={{ fontFamily: 'var(--font-playfair, serif)' }}
          >
            {<MaskedAmount value={result.tax} tone="kern" />}
          </p>
          <p
            className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            Box 3 belasting
          </p>
          <div className="mt-2 text-[11px] text-[var(--ink-3)] tabular-nums font-mono">
            <p>Spaargeld: {<MaskedAmount value={result.totaalSpaargeld} tone="kern" />}</p>
            <p>Beleggingen: {<MaskedAmount value={result.totaalBeleggingen} tone="kern" />}</p>
          </div>
        </div>
        <div className="p-3 sm:p-4">
          <p className="text-[10px] font-semibold tracking-[0.18em] font-mono text-[var(--ink-3)] uppercase">Na verschuiving</p>
          <p
            className="mt-1.5 text-[20px] sm:text-[24px] font-black leading-none tracking-[-0.02em] tabular-nums"
            style={{ fontFamily: 'var(--font-playfair, serif)', color: delta > 0 ? 'var(--positive)' : 'var(--ink)' }}
          >
            {delta > 0 ? (
              <span
                className="inline px-1"
                style={{
                  backgroundImage:
                    'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
                }}
              >
                {<MaskedAmount value={shifted.tax} tone="kern" />}
              </span>
            ) : (
              formatCurrency(shifted.tax)
            )}
          </p>
          <p
            className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            Box 3 belasting
          </p>
          <div className="mt-2 text-[11px] text-[var(--ink-3)] tabular-nums font-mono">
            <p>Spaargeld: {<MaskedAmount value={shifted.totaalSpaargeld} tone="kern" />}</p>
            <p>Beleggingen: {<MaskedAmount value={shifted.totaalBeleggingen} tone="kern" />}</p>
          </div>
        </div>
      </div>

      {/* Pull-quote-stijl uitkomst — alleen bij positieve besparing */}
      {delta > 0 && (
        <div
          className="relative border-t border-b border-[var(--ink)] py-3 pl-7 mt-4"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          <span
            aria-hidden
            className="absolute -top-1 -left-1 font-black not-italic text-[36px] leading-none"
            style={{ color: 'var(--module-active-500)' }}
          >
            &ldquo;
          </span>
          <p className="italic text-base leading-snug text-[var(--ink)]">
            Besparing van{' '}
            <strong
              className="font-bold not-italic"
              style={{
                color: 'var(--module-active-700)',
                backgroundImage:
                  'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
                padding: '0 0.25rem',
              }}
            >
              {<MaskedAmount value={delta} tone="kern" />}
            </strong>
            {' '}— dat is{' '}
            <strong
              className="font-bold not-italic"
              style={{ color: 'var(--module-active-700)' }}
            >
              {deltaVrijheid}
            </strong>
            {' '}vrijheidsdagen terug.
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

  const delta = result.tax - otherResult.tax
  const params1 = result.params
  const params2 = BOX3_PARAMS[otherYear]

  return (
    <div>
      <p className="mb-4 text-sm text-[var(--ink-2)]">
        Vergelijk de belastingdruk tussen {result.year} en {otherYear} met dezelfde vermogenssamenstelling.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[var(--r-lg)] border border-kern-200 bg-kern-50 p-4">
          <p className="text-xs font-semibold text-kern-700">{result.year}</p>
          <p className="mt-1 text-xl font-bold text-[var(--ink)]">{<MaskedAmount value={result.tax} tone="kern" />}</p>
          <div className="mt-3 space-y-1 text-xs text-[var(--ink-3)]">
            <p>Forfait spaargeld: {(params1.forfaitSpaargeld * 100).toFixed(2)}%</p>
            <p>Forfait beleggingen: {(params1.forfaitBeleggingen * 100).toFixed(2)}%</p>
            <p>Heffingsvrij: {<MaskedAmount value={result.hasPartner ? params1.heffingsvrijPartner : params1.heffingsvrijSingle} tone="kern" />}</p>
          </div>
        </div>
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
          <p className="text-xs font-semibold text-[var(--ink-2)]">{otherYear}</p>
          <p className="mt-1 text-xl font-bold text-[var(--ink)]">{<MaskedAmount value={otherResult.tax} tone="kern" />}</p>
          <div className="mt-3 space-y-1 text-xs text-[var(--ink-3)]">
            <p>Forfait spaargeld: {(params2.forfaitSpaargeld * 100).toFixed(2)}%</p>
            <p>Forfait beleggingen: {(params2.forfaitBeleggingen * 100).toFixed(2)}%</p>
            <p>Heffingsvrij: {<MaskedAmount value={result.hasPartner ? params2.heffingsvrijPartner : params2.heffingsvrijSingle} tone="kern" />}</p>
          </div>
        </div>
      </div>

      {delta !== 0 && (
        <div className={`mt-4 rounded-lg p-3 text-center ${delta > 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
          <p className={`text-sm font-semibold ${delta > 0 ? 'text-positive' : 'text-negative'}`}>
            {otherYear} is {<MaskedAmount value={Math.abs(delta)} tone="kern" />} {delta > 0 ? 'goedkoper' : 'duurder'}
          </p>
        </div>
      )}
    </div>
  )
}
