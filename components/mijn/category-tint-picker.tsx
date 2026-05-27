'use client'

import { RotateCcw } from 'lucide-react'
import { ColorPickerCard } from '@/components/app/color-picker-card'
import {
  useCategoryTints,
  useCategoryTintPercents,
  DEFAULT_CATEGORY_TINTS,
  DEFAULT_CATEGORY_TINT_PERCENTS,
} from '@/lib/category-tints'

/**
 * CategoryTintPicker — kleuren + transparantie van de twee zones rond de
 * breuklijn op de Kern-categoriekaarten (/core). Plan A-2 stap 4 —
 * uitgekamerd uit legacy /identity/instellingen?tab=weergave naar
 * /mijn/uiterlijk. Laatste weergave-blok dat de monolith nog uniek had.
 *
 * State is localStorage-backed via useCategoryTints/useCategoryTintPercents
 * (self-persisting bij update) — geen nieuwe data-logica.
 */

const ZONES = [
  { key: 'assetAbove', label: 'Bezittingen — boven' },
  { key: 'assetBelow', label: 'Bezittingen — onder' },
  { key: 'debtAbove', label: 'Schulden — boven' },
  { key: 'debtBelow', label: 'Schulden — onder' },
] as const

export function CategoryTintPicker() {
  const [categoryTints, setCategoryTints] = useCategoryTints()
  const [categoryTintPercents, setCategoryTintPercents] = useCategoryTintPercents()

  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
        Categoriekaart-tinten
      </p>
      <p
        className="mb-3 text-[11px] italic text-[var(--ink-3)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        Kleuren van de twee zones rond de breuklijn op de Kern-categoriekaarten. Boven en onder de lijn
        krijgen elk een eigen tint; de breuklijn zelf blijft papierkleurig.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ZONES.map(({ key, label }) => (
          <ColorPickerCard
            key={key}
            label={label}
            sublabel={`${categoryTintPercents[key]}% over papier`}
            value={categoryTints[key]}
            defaultValue={DEFAULT_CATEGORY_TINTS[key]}
            onChange={(hex) => setCategoryTints({ ...categoryTints, [key]: hex })}
          />
        ))}
      </div>

      {/* Transparantie-sliders per zone */}
      <div className="mt-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Transparantie per zone
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ZONES.map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2"
            >
              <span className="flex-1 text-xs text-[var(--ink-2)]">{label}</span>
              <input
                type="range"
                min={0}
                max={20}
                step={0.5}
                value={categoryTintPercents[key]}
                aria-label={`Transparantie ${label}`}
                onChange={(e) =>
                  setCategoryTintPercents({
                    ...categoryTintPercents,
                    [key]: Number(e.target.value),
                  })
                }
                className="h-1 flex-1 cursor-pointer accent-[var(--ink-2)]"
              />
              <span className="w-10 text-right font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
                {categoryTintPercents[key].toFixed(1)}%
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setCategoryTints(DEFAULT_CATEGORY_TINTS)
            setCategoryTintPercents(DEFAULT_CATEGORY_TINT_PERCENTS)
          }}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Standaard
        </button>
        <span
          className="text-[11px] italic text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Direct opgeslagen — verschijnen meteen op /core.
        </span>
      </div>
    </div>
  )
}
