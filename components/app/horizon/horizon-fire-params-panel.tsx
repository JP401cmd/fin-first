'use client'

/**
 * HorizonFireParamsPanel — inline edit-panel voor FIRE-parameters op /horizon.
 *
 * Bevat: verwacht rendement, inflatie, eindstrategie.
 * Na wijzigen: projectie herberekent direct (geen reload).
 * Opslaan persisteert via PUT /api/parameters + PUT /api/fire-settings.
 */

import { useState, useCallback } from 'react'
import { Settings, ChevronDown, Check } from 'lucide-react'
import { BOX3_DRAG } from '@/lib/horizon-data'
import { type FireEndStrategy, STRATEGY_LABELS } from '@/lib/fire-strategy'
import { type FireParams, resolveFireParams } from '@/lib/fire-params'
import { KassabonShell } from '@/components/app/kassabon-shell'

function fmt(pct: number, decimals = 2) {
  return pct.toFixed(decimals).replace('.', ',') + '%'
}

export interface HorizonFireParamsPanelProps {
  fireParams: FireParams
  fireEndStrategy: FireEndStrategy
  fireEndAge: number
  onParamsChange: (params: FireParams) => void
  onStrategyChange: (strategy: FireEndStrategy, endAge: number) => void
}

export function HorizonFireParamsPanel({
  fireParams,
  fireEndStrategy,
  fireEndAge,
  onParamsChange,
  onStrategyChange,
}: HorizonFireParamsPanelProps) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Local state for sliders (percentage form, e.g. 7.0 for 7%)
  const [localReturn, setLocalReturn] = useState(fireParams.grossReturn * 100)
  const [localInflation, setLocalInflation] = useState(fireParams.inflationRate * 100)
  const [localStrategy, setLocalStrategy] = useState<FireEndStrategy>(fireEndStrategy)
  const [localEndAge, setLocalEndAge] = useState(String(fireEndAge))

  const box3Pct = BOX3_DRAG * 100
  const effectiveSwrPct = Math.max(0.1, localReturn - box3Pct - localInflation)
  const fireMultiplier = effectiveSwrPct > 0 ? (100 / effectiveSwrPct) : 0

  // Update local + parent state on slider change (live recalculation)
  const handleReturnChange = useCallback((val: number) => {
    setLocalReturn(val)
    const newParams = resolveFireParams({
      expected_return: val / 100,
      inflation_rate: localInflation / 100,
      box3_method: fireParams.box3Method,
      marginaal_tarief: fireParams.marginaalTarief,
    })
    onParamsChange(newParams)
  }, [localInflation, fireParams.box3Method, fireParams.marginaalTarief, onParamsChange])

  const handleInflationChange = useCallback((val: number) => {
    setLocalInflation(val)
    const newParams = resolveFireParams({
      expected_return: localReturn / 100,
      inflation_rate: val / 100,
      box3_method: fireParams.box3Method,
      marginaal_tarief: fireParams.marginaalTarief,
    })
    onParamsChange(newParams)
  }, [localReturn, fireParams.box3Method, fireParams.marginaalTarief, onParamsChange])

  const handleStrategyChange = useCallback((strategy: FireEndStrategy) => {
    setLocalStrategy(strategy)
    onStrategyChange(strategy, Number(localEndAge) || 90)
  }, [localEndAge, onStrategyChange])

  const handleEndAgeChange = useCallback((age: string) => {
    setLocalEndAge(age)
    onStrategyChange(localStrategy, Number(age) || 90)
  }, [localStrategy, onStrategyChange])

  // Persist to DB
  const handleSave = useCallback(async () => {
    setSaving(true)
    setMessage(null)
    try {
      // Save market assumptions
      const paramRes = await fetch('/api/parameters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expected_return: localReturn / 100,
          inflation_rate: localInflation / 100,
          box3_method: fireParams.box3Method,
          marginaal_tarief: fireParams.marginaalTarief === 0.3697 || fireParams.marginaalTarief === 0.4950
            ? fireParams.marginaalTarief
            : null,
        }),
      })
      if (!paramRes.ok) {
        const d = await paramRes.json()
        throw new Error(d.error ?? 'Opslaan parameters mislukt')
      }

      // Save fire strategy
      const stratRes = await fetch('/api/fire-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fire_end_strategy: localStrategy,
          fire_end_age: Number(localEndAge) || 90,
          fire_legacy_amount: null,
        }),
      })
      if (!stratRes.ok) {
        const d = await stratRes.json()
        throw new Error(d.error ?? 'Opslaan strategie mislukt')
      }

      setMessage({ type: 'success', text: 'Instellingen opgeslagen' })
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Opslaan mislukt' })
    } finally {
      setSaving(false)
    }
  }, [localReturn, localInflation, localStrategy, localEndAge, fireParams.box3Method, fireParams.marginaalTarief])

  return (
    <section className="mt-4 sm:mt-6">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-left transition-colors hover:border-horizon-200 hover:bg-horizon-50/30"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--subtle)]">
            <Settings className="h-4.5 w-4.5 text-horizon-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--ink-3)]">Geavanceerd</p>
            <p className="text-sm text-[var(--ink-2)]">
              {open ? 'Parameters aanpassen' : 'Berekening finetunen'}
            </p>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-4 sm:px-6 py-5">
          {/* Marktaannames */}
          <div className="mb-6">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Marktaannames</p>

            <div className="mb-6">
              <div className="mb-2 flex items-end justify-between">
                <label className="text-sm font-semibold text-[var(--ink)]">Verwacht bruto rendement</label>
                <span className="font-mono text-base font-bold tabular-nums text-horizon-700">{fmt(localReturn)}</span>
              </div>
              <input
                type="range" min={1} max={15} step={0.1} value={localReturn}
                onChange={e => handleReturnChange(Number(e.target.value))}
                className="w-full cursor-pointer accent-horizon-600"
              />
              <div className="mt-1.5 flex justify-between text-[10px] text-[var(--ink-4)]">
                <span>1% conservatief</span><span>7% historisch gem.</span><span>15% optimistisch</span>
              </div>
              <p className="mt-2 font-sans text-[11px] text-[var(--ink-3)]">
                Verwacht jaarlijks rendement op je beleggingsportefeuille vóór Box 3-heffing en inflatie.
              </p>
            </div>

            <div className="mb-4">
              <div className="mb-2 flex items-end justify-between">
                <label className="text-sm font-semibold text-[var(--ink)]">Verwachte inflatie</label>
                <span className="font-mono text-base font-bold tabular-nums text-horizon-700">{fmt(localInflation)}</span>
              </div>
              <input
                type="range" min={0} max={8} step={0.1} value={localInflation}
                onChange={e => handleInflationChange(Number(e.target.value))}
                className="w-full cursor-pointer accent-horizon-600"
              />
              <div className="mt-1.5 flex justify-between text-[10px] text-[var(--ink-4)]">
                <span>0% deflatie</span><span>2% NL-gemiddelde</span><span>8% hoog</span>
              </div>
            </div>

            {/* Live kassabon */}
            <KassabonShell>
              <div className="mb-3 text-center">
                <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">NETTO REËEL RENDEMENT</p>
                <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">Live berekening op basis van jouw aannames</p>
              </div>
              <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Bruto rendement</span>
                  <span className="tabular-nums text-[var(--ink)]">+ {fmt(localReturn)}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Box 3-heffing (wettelijk)</span>
                  <span className="tabular-nums text-[var(--ink-3)]">− {fmt(box3Pct, 3)}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Inflatie</span>
                  <span className="tabular-nums text-[var(--ink-3)]">− {fmt(localInflation)}</span>
                </div>
              </div>
              <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
                <span className="text-[var(--ink)]">Netto re��el rendement (SWR)</span>
                <span className="tabular-nums text-[var(--ink)]">{fmt(effectiveSwrPct, 2)}</span>
              </div>
              <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2">
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">FIRE Multiplier (1 ÷ SWR)</span>
                  <span className="tabular-nums font-bold text-[var(--ink)]">{fireMultiplier.toFixed(1)}×</span>
                </div>
              </div>
            </KassabonShell>
          </div>

          <div className="my-6 border-t border-dashed border-[var(--border-ed)]" />

          {/* Eindstrategie */}
          <div className="mb-6">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">FIRE Eindstrategie</p>
            <p className="mb-4 font-sans text-sm text-[var(--ink-3)]">
              Wat wil je doen met je vermogen?
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(Object.entries(STRATEGY_LABELS) as [FireEndStrategy, { name: string; subtitle: string }][]).map(([key, info]) => {
                const isSelected = localStrategy === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleStrategyChange(key)}
                    className={`rounded-xl border-2 p-3 text-left transition-all ${
                      isSelected ? 'border-horizon-600 bg-horizon-50' : 'border-[var(--border-ed)] hover:border-[var(--border-md)]'
                    }`}
                  >
                    <span className={`text-sm font-semibold ${isSelected ? 'text-horizon-700' : 'text-[var(--ink-2)]'}`}>
                      {info.name}
                    </span>
                    <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">{info.subtitle}</p>
                  </button>
                )
              })}
            </div>

            {/* End age input for deplete/legacy/pensioen */}
            {(localStrategy === 'deplete' || localStrategy === 'legacy') && (
              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">Eindleeftijd</label>
                <input
                  type="number"
                  min={50}
                  max={120}
                  value={localEndAge}
                  onChange={e => handleEndAgeChange(e.target.value)}
                  className="w-24 rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-1.5 text-sm font-mono tabular-nums text-[var(--ink)] focus:border-horizon-400 focus:outline-none focus:ring-1 focus:ring-horizon-400/30"
                />
                <span className="ml-2 text-xs text-[var(--ink-3)]">jaar</span>
              </div>
            )}
          </div>

          {/* Save button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-[var(--r)] bg-horizon-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-horizon-700 disabled:opacity-50"
            >
              {saving ? 'Opslaan...' : 'Opslaan'}
            </button>
            {message && (
              <span className={`inline-flex items-center gap-1 text-sm font-medium ${message.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                {message.type === 'success' && <Check className="h-3.5 w-3.5" />}
                {message.text}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
