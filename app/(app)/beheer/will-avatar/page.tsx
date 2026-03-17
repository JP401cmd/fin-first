'use client'

import { useState } from 'react'
import { WillDots, type WillDotsProps } from '@/components/app/will-dots'

type WillState = NonNullable<WillDotsProps['state']>

const STATES: { key: WillState; label: string; description: string }[] = [
  { key: 'idle',      label: 'Rust',      description: 'Driehoek, oogjes knipperen' },
  { key: 'talking',   label: 'Praten',    description: 'Punten stuiteren om de beurt' },
  { key: 'thinking',  label: 'Denken',    description: 'Driehoek draait langzaam rond' },
  { key: 'listening', label: 'Luisteren', description: 'Punten pulseren synchroon' },
  { key: 'streaming', label: 'Streaming', description: 'Golvende sequentiële beweging' },
  { key: 'success',   label: 'Succes',    description: 'Bounce-animatie, keert terug naar rust' },
  { key: 'error',     label: 'Fout',      description: 'Schudbeweging, keert terug naar rust' },
]

const SIZES = [24, 48, 80, 120] as const

export default function WillAvatarPage() {
  const [activeState, setActiveState] = useState<WillState>('idle')
  // Force re-render for one-shot animations (success/error)
  const [renderKey, setRenderKey] = useState(0)

  function selectState(s: WillState) {
    setActiveState(s)
    setRenderKey(k => k + 1)
  }

  return (
    <div className="space-y-10">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold text-[var(--ink)]">Will Avatar</h1>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Overzicht van alle WillDots animatie-states, formaten en achtergronden.
        </p>
      </div>

      {/* ── Interactive State Switcher ──────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--ink-3)]">
          State Switcher
        </h2>

        {/* Buttons */}
        <div className="flex flex-wrap gap-2">
          {STATES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => selectState(key)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                activeState === key
                  ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                  : 'border-[var(--border-ed)] bg-[var(--subtle)] text-[var(--ink-2)] hover:border-[var(--border-md)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Light + Dark preview side by side */}
        <div className="grid grid-cols-2 gap-4">
          {/* Light background */}
          <div className="flex flex-col items-center gap-3 rounded-xl border border-[var(--border-ed)] bg-white p-6">
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">
              Licht
            </span>
            <WillDots key={`light-${renderKey}`} size={120} state={activeState} />
            <span className="text-sm font-medium capitalize text-neutral-700">
              {STATES.find(s => s.key === activeState)?.label}
            </span>
          </div>

          {/* Dark background */}
          <div className="flex flex-col items-center gap-3 rounded-xl border border-neutral-700 bg-neutral-900 p-6">
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Donker
            </span>
            <WillDots key={`dark-${renderKey}`} size={120} state={activeState} />
            <span className="text-sm font-medium capitalize text-neutral-300">
              {STATES.find(s => s.key === activeState)?.label}
            </span>
          </div>
        </div>
      </section>

      {/* ── Sizes Section ──────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--ink-3)]">
          Formaten
        </h2>
        <div className="flex flex-wrap items-end gap-6 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] p-6">
          {SIZES.map(px => (
            <div key={px} className="flex flex-col items-center gap-2">
              <WillDots key={`size-${px}-${renderKey}`} size={px} state={activeState} />
              <span className="text-xs tabular-nums text-[var(--ink-3)]">{px}px</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── All States Grid ────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--ink-3)]">
          Alle States
        </h2>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {STATES.map(({ key, label, description }) => (
            <button
              key={key}
              onClick={() => selectState(key)}
              className={`flex flex-col items-center gap-3 rounded-xl border p-5 text-center transition-colors ${
                activeState === key
                  ? 'border-[var(--ink)] bg-[var(--paper)]'
                  : 'border-[var(--border-ed)] bg-[var(--subtle)] hover:border-[var(--border-md)]'
              }`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-3)]">
                {label}
              </span>
              <WillDots key={`grid-${key}-${renderKey}`} size={80} state={key} />
              <span className="text-xs text-[var(--ink-3)]">{description}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
