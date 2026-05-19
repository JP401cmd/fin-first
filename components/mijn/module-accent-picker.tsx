'use client'

import { Check } from 'lucide-react'
import { useModuleColors } from '@/components/app/module-color-provider'
import type { ModuleColorConfig } from '@/lib/color-palette'

/**
 * ModuleAccentPicker — voor elk van de drie modules (Kern, Wil, Horizon)
 * een rij van 8 voorkeuze-accent-kleuren. Klik = wissel; effect direct
 * zichtbaar via ModuleColorProvider CSS-vars (geen reload nodig).
 *
 * Plan-context: A-2 stap 3 — module-accent picker uit legacy
 * /identity/instellingen?tab=weergave uitkamerd naar /mijn/uiterlijk.
 *
 * Geen DB-persist hier; ModuleColorProvider/setConfig schrijft via een
 * API-call asynchroon naar profiles.module_colors_json. User ziet de
 * wijziging direct + persisteert automatisch.
 */

type ModuleKey = keyof ModuleColorConfig

type Swatch = { label: string; hex: string }

/**
 * Hand-gekozen 8-kleur palet per module. Eerste is de TriFinity-default
 * (uit DEFAULT_MODULE_COLORS), gevolgd door 7 alternatieven die qua
 * verzadiging + lightness onderling onderscheidend zijn.
 */
const MODULE_SWATCHES: Record<ModuleKey, { label: string; swatches: Swatch[] }> = {
  kern: {
    label: 'Kern',
    swatches: [
      { label: 'Aardetint (default)', hex: '#6b4339' },
      { label: 'Amber', hex: '#d97706' },
      { label: 'Olive', hex: '#65a30d' },
      { label: 'Bordeaux', hex: '#9f1239' },
      { label: 'Teal', hex: '#0d9488' },
      { label: 'Slate', hex: '#475569' },
      { label: 'Indigo', hex: '#4338ca' },
      { label: 'Brown', hex: '#7c2d12' },
    ],
  },
  wil: {
    label: 'Wil',
    swatches: [
      { label: 'Plum (default)', hex: '#3d3048' },
      { label: 'Teal', hex: '#0d9488' },
      { label: 'Cyaan', hex: '#0891b2' },
      { label: 'Emerald', hex: '#059669' },
      { label: 'Violet', hex: '#7c3aed' },
      { label: 'Rose', hex: '#e11d48' },
      { label: 'Slate', hex: '#475569' },
      { label: 'Olive', hex: '#65a30d' },
    ],
  },
  horizon: {
    label: 'Horizon',
    swatches: [
      { label: 'Camel (default)', hex: '#c4a06b' },
      { label: 'Violet', hex: '#8b5cf6' },
      { label: 'Sky', hex: '#0284c7' },
      { label: 'Magenta', hex: '#c026d3' },
      { label: 'Amber', hex: '#f59e0b' },
      { label: 'Emerald', hex: '#059669' },
      { label: 'Coral', hex: '#ea580c' },
      { label: 'Indigo', hex: '#4f46e5' },
    ],
  },
}

export function ModuleAccentPicker() {
  const { config, setConfig } = useModuleColors()

  function handlePick(module: ModuleKey, hex: string) {
    setConfig({ ...config, [module]: hex })
  }

  return (
    <div className="space-y-4">
      <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
        Module-accentkleuren
      </div>
      {(Object.keys(MODULE_SWATCHES) as ModuleKey[]).map((module) => {
        const { label, swatches } = MODULE_SWATCHES[module]
        const currentHex = config[module]
        return (
          <div key={module}>
            <div className="text-xs font-semibold text-[var(--ink-2)] mb-1.5">
              {label}
            </div>
            <div className="flex flex-wrap gap-2">
              {swatches.map((s) => {
                const active = currentHex.toLowerCase() === s.hex.toLowerCase()
                return (
                  <button
                    key={s.hex}
                    type="button"
                    onClick={() => handlePick(module, s.hex)}
                    aria-label={`${label}: ${s.label}`}
                    aria-pressed={active}
                    title={s.label}
                    className={`relative w-8 h-8 rounded-lg border-2 transition-all ${
                      active
                        ? 'border-[var(--ink-2)] scale-110 shadow-sm'
                        : 'border-[var(--border-ed)] hover:scale-105'
                    }`}
                    style={{ background: s.hex }}
                  >
                    {active && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <Check className="w-4 h-4 text-white drop-shadow" aria-hidden="true" />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
