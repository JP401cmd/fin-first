'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/format'
import type { WhatIfOverrides } from '@/components/app/horizon/whatif-sliders'
import {
  Briefcase, TrendingUp, PiggyBank, Rocket, Palmtree,
  UserMinus, SlidersHorizontal,
} from 'lucide-react'

// ── Preset definitions ──────────────────────────────────────────────────────

interface Preset {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  /** Compute the overrides to apply, given the baseline */
  apply: (baseline: WhatIfOverrides) => WhatIfOverrides
  /** Short summary of what changes */
  summary: (baseline: WhatIfOverrides) => string
  /** Only show for household users */
  householdOnly?: boolean
}

const PRESETS: Preset[] = [
  {
    id: 'part-time',
    label: 'Part-time',
    description: '4 dagen per week werken',
    icon: <Briefcase className="h-3.5 w-3.5" />,
    apply: (b) => ({
      ...b,
      workDaysPerWeek: 4,
      monthlyIncome: b.monthlyIncome,
    }),
    summary: (b) => b.workDaysPerWeek <= 4 ? '4 dagen/week' : `${b.workDaysPerWeek} → 4 dagen`,
  },
  {
    id: 'raise',
    label: 'Loonsverhoging',
    description: '+10% bruto inkomen',
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    apply: (b) => ({
      ...b,
      monthlyIncome: Math.round(b.monthlyIncome * 1.1 / 100) * 100,
    }),
    summary: (b) => `+${formatCurrency(Math.round(b.monthlyIncome * 0.1 / 100) * 100)}/mnd`,
  },
  {
    id: 'frugal',
    label: 'Zuinig leven',
    description: 'Spaarquote +15 procentpunt',
    icon: <PiggyBank className="h-3.5 w-3.5" />,
    apply: (b) => ({
      ...b,
      savingsRate: Math.min(80, b.savingsRate + 15),
    }),
    summary: (b) => `${Math.round(b.savingsRate)}% → ${Math.min(80, Math.round(b.savingsRate + 15))}%`,
  },
  {
    id: 'fire-sprinter',
    label: 'FIRE sprinter',
    description: 'Maximaal versnellen',
    icon: <Rocket className="h-3.5 w-3.5" />,
    apply: (b) => ({
      ...b,
      savingsRate: Math.min(80, b.savingsRate + 10),
      extraContribution: b.extraContribution + 300,
    }),
    summary: () => '+10% sparen, +€ 300 inleg',
  },
  {
    id: 'sabbatical',
    label: 'Mini-sabbatical',
    description: '3 dagen, lager inkomen',
    icon: <Palmtree className="h-3.5 w-3.5" />,
    apply: (b) => ({
      ...b,
      workDaysPerWeek: 3,
      monthlyIncome: b.monthlyIncome,
      savingsRate: Math.max(0, b.savingsRate - 10),
    }),
    summary: (b) => b.workDaysPerWeek <= 3 ? '3 dagen/week, −10% sparen' : `${b.workDaysPerWeek} → 3 dagen, −10% sparen`,
  },
  // ── Household-specific presets ──────────────────────────────
  {
    id: 'partner-stopt',
    label: 'Partner stopt',
    description: 'Partner stopt met werken — inkomen halveert',
    icon: <UserMinus className="h-3.5 w-3.5" />,
    householdOnly: true,
    apply: (b) => ({
      ...b,
      monthlyIncome: Math.round(b.monthlyIncome * 0.5 / 100) * 100,
      savingsRate: Math.max(0, b.savingsRate - 15),
    }),
    summary: (b) => `inkomen ${formatCurrency(b.monthlyIncome)} → ${formatCurrency(Math.round(b.monthlyIncome * 0.5 / 100) * 100)}, −15% sparen`,
  },
  {
    id: 'split-5050',
    label: '50/50 verdeling',
    description: 'Gelijke verdeling — alles 50/50 splitsen',
    icon: <SlidersHorizontal className="h-3.5 w-3.5" />,
    householdOnly: true,
    apply: (b) => ({
      ...b,
      // 50/50 split: no income change, but savings rate adjusts to reflect equal burden
      savingsRate: Math.max(0, Math.min(80, Math.round(b.savingsRate * 0.9))),
      extraContribution: 0,
    }),
    summary: (b) => `spaarquote ${Math.round(b.savingsRate)}% → ${Math.max(0, Math.min(80, Math.round(b.savingsRate * 0.9)))}%`,
  },
]

// ── WhatIfPresets component ─────────────────────────────────────────────────

export function WhatIfPresets({
  baseline,
  overrides,
  onChange,
  isHousehold = false,
}: {
  baseline: WhatIfOverrides
  overrides: WhatIfOverrides
  onChange: (overrides: WhatIfOverrides) => void
  isHousehold?: boolean
}) {
  const [activePreset, setActivePreset] = useState<string | null>(null)

  // Filter presets based on household status
  const visiblePresets = PRESETS.filter(p => !p.householdOnly || isHousehold)

  const handlePresetClick = (preset: Preset) => {
    if (activePreset === preset.id) {
      // Deactivate — reset to baseline
      setActivePreset(null)
      onChange(baseline)
    } else {
      // Apply preset
      setActivePreset(preset.id)
      onChange(preset.apply(baseline))
    }
  }

  // Clear active preset when user manually changes sliders
  // (detected by overrides not matching any preset's output)
  const isActivePresetStillMatching = activePreset
    ? JSON.stringify(overrides) === JSON.stringify(
        visiblePresets.find(p => p.id === activePreset)?.apply(baseline)
      )
    : false

  const effectiveActive = isActivePresetStillMatching ? activePreset : null

  // Separate personal and household presets for display
  const personalPresets = visiblePresets.filter(p => !p.householdOnly)
  const householdPresets = visiblePresets.filter(p => p.householdOnly)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {personalPresets.map(preset => {
          const isActive = effectiveActive === preset.id

          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={effectiveActive === preset.id}
              title={preset.description}
              onClick={() => handlePresetClick(preset)}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 py-2 transition-all ${
                isActive
                  ? 'border-horizon-400 bg-horizon-50 text-horizon-700 shadow-sm'
                  : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] hover:border-horizon-300 hover:shadow-sm'
              }`}
            >
              <span className={isActive ? 'text-horizon-600' : 'text-[var(--ink-3)]'}>
                {preset.icon}
              </span>
              <span className="font-sans text-xs font-semibold">
                {preset.label}
              </span>
            </button>
          )
        })}
      </div>

      {householdPresets.length > 0 && (
        <>
          <p className="font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-4)]">
            Huishouden
          </p>
          <div className="flex flex-wrap gap-2">
            {householdPresets.map(preset => {
              const isActive = effectiveActive === preset.id

              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={effectiveActive === preset.id}
                  title={preset.description}
                  onClick={() => handlePresetClick(preset)}
                  className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 py-2 transition-all ${
                    isActive
                      ? 'border-horizon-400 bg-horizon-50 text-horizon-700 shadow-sm'
                      : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] hover:border-horizon-300 hover:shadow-sm'
                  }`}
                >
                  <span className={isActive ? 'text-horizon-600' : 'text-[var(--ink-3)]'}>
                    {preset.icon}
                  </span>
                  <span className="font-sans text-xs font-semibold">
                    {preset.label}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
