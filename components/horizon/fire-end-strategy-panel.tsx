'use client'

import { type FireEndStrategy, STRATEGY_LABELS } from '@/lib/fire-strategy'
import { EINDSTRATEGIE_VOLGORDE, toontEindleeftijd } from '@/lib/horizon/eindstrategie-volgorde'

export interface FireEndStrategyPanelValue {
  strategy: FireEndStrategy
  endAge: string
  legacyAmount: string
}

export interface FireEndStrategyPanelProps {
  value: FireEndStrategyPanelValue
  onChange: (next: FireEndStrategyPanelValue) => void
}

export function FireEndStrategyPanel({ value, onChange }: FireEndStrategyPanelProps) {
  const { strategy, endAge, legacyAmount } = value

  return (
    <div className="mb-6">
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">FIRE Eindstrategie</p>
      <p className="mb-4 font-sans text-sm text-[var(--ink-3)]">
        Wat wil je doen met je vermogen op het einde van de rit?
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Volgorde uit één bron (ADR 0127) — `Object.entries` gaf de
            declaratievolgorde van de map, wat toevallig klopte maar niets vastlegde. */}
        {EINDSTRATEGIE_VOLGORDE.map((key) => {
          const info = STRATEGY_LABELS[key]
          const isSelected = strategy === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange({ ...value, strategy: key })}
              className={`rounded-xl border-2 p-4 text-left transition-all ${
                isSelected ? 'border-zinc-900 bg-zinc-50' : 'border-[var(--border-ed)] hover:border-[var(--border-md)]'
              }`}
            >
              <span className={`text-sm font-semibold ${isSelected ? 'text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}>
                {info.name}
              </span>
              <p className="mt-1 text-xs text-[var(--ink-3)]">{info.subtitle}.</p>
            </button>
          )
        })}
      </div>

      {/* ADR 0127 — onder 'Nu stoppen' is de eindleeftijd juist BETÉKENISVOL: hij is
          de lat waar het vermogen tot moet reiken. De handmatige drieledige
          conditie liet 'm daar weg; `toontEindleeftijd` sluit alleen 'perpetual' uit. */}
      {toontEindleeftijd(strategy) && (
        <div className="mt-4">
          <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
            {strategy === 'pensioen' ? 'Eindleeftijd simulatie' : 'Eindleeftijd'}
          </label>
          <input
            type="number"
            min={50}
            max={120}
            step={1}
            value={endAge}
            onChange={e => onChange({ ...value, endAge: e.target.value })}
            className="mt-1.5 w-32 rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm font-mono text-[var(--ink)] outline-none focus:border-zinc-500"
          />
          <span className="ml-2 text-sm text-[var(--ink-3)]">jaar</span>
          {strategy === 'pensioen' && (
            <p className="mt-1.5 font-sans text-[11px] text-[var(--ink-3)]">
              Tot welke leeftijd de simulatie doorloopt. Het resterende vermogen wordt als nalatenschap getoond.
            </p>
          )}
          {strategy === 'nu-stoppen' && (
            <p className="mt-1.5 font-sans text-[11px] text-[var(--ink-3)]">
              Tot deze leeftijd moet je vermogen reiken als je nu stopt.
            </p>
          )}
        </div>
      )}
      {strategy === 'legacy' && (
        <div className="mt-4">
          <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">Na te laten bedrag (&euro;)</label>
          <input
            type="number"
            min={0}
            step={10000}
            value={legacyAmount}
            onChange={e => onChange({ ...value, legacyAmount: e.target.value })}
            placeholder="bv. 100000"
            className="mt-1.5 w-full rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm font-mono text-[var(--ink)] outline-none focus:border-zinc-500"
          />
        </div>
      )}
      <p className="mt-3 font-sans text-[11px] text-[var(--ink-3)]">
        De gekozen strategie bepaalt hoeveel vermogen je nodig hebt voor FIRE en hoe de simulatiegrafiek eruitziet.
      </p>
    </div>
  )
}
