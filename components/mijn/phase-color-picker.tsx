'use client'

import { Check } from 'lucide-react'
import { usePhaseColors } from '@/components/app/module-color-provider'
import type { PhaseColorConfig } from '@/lib/color-palette'

/**
 * PhaseColorPicker — kleurkeuze voor de vier sovereignty-fases die
 * widget-progression aansturen: Recovery / Stability / Momentum / Mastery.
 *
 * Plan A-2 stap 5 — laatste uitkam-stap uit legacy /identity/
 * instellingen?tab=weergave naar /mijn/uiterlijk. Hiermee is de
 * uiterlijk-page een complete vervanging voor de weergave-tab.
 *
 * Per fase 6 voorkeuze-tints met semantische lading:
 *  - Recovery: warme rood-/oranje-tinten — urgentie/herstel
 *  - Stability: koel-blauw — fundament/rust
 *  - Momentum: paars/violet — vooruitgang/energie
 *  - Mastery: goud/amber — voltooiing/expertise
 */

type PhaseKey = keyof PhaseColorConfig
type Swatch = { label: string; hex: string }

const PHASE_SWATCHES: Record<PhaseKey, { label: string; description: string; swatches: Swatch[] }> = {
  phase_recovery: {
    label: 'Recovery',
    description: 'Herstel-fase — urgentie zichtbaar maken',
    swatches: [
      { label: 'Donkerrood (default)', hex: '#8b3a3a' },
      { label: 'Bordeaux', hex: '#9f1239' },
      { label: 'Roest', hex: '#9a3412' },
      { label: 'Rood', hex: '#b91c1c' },
      { label: 'Magenta', hex: '#a21caf' },
      { label: 'Bruin', hex: '#7c2d12' },
    ],
  },
  phase_stability: {
    label: 'Stability',
    description: 'Fundament-fase — rust en basis',
    swatches: [
      { label: 'Staalsblauw (default)', hex: '#355a78' },
      { label: 'Sky', hex: '#0284c7' },
      { label: 'Indigo', hex: '#4338ca' },
      { label: 'Slate', hex: '#475569' },
      { label: 'Cyaan', hex: '#0891b2' },
      { label: 'Royal', hex: '#1e40af' },
    ],
  },
  phase_momentum: {
    label: 'Momentum',
    description: 'Vooruitgang-fase — energie en versnelling',
    swatches: [
      { label: 'Plum (default)', hex: '#3d3048' },
      { label: 'Violet', hex: '#7c3aed' },
      { label: 'Indigo', hex: '#4f46e5' },
      { label: 'Magenta', hex: '#c026d3' },
      { label: 'Teal', hex: '#0d9488' },
      { label: 'Emerald', hex: '#059669' },
    ],
  },
  phase_mastery: {
    label: 'Mastery',
    description: 'Voltooiings-fase — expertise',
    swatches: [
      { label: 'Goud (default)', hex: '#c4a06b' },
      { label: 'Amber', hex: '#d97706' },
      { label: 'Olijfgroen', hex: '#65a30d' },
      { label: 'Roest', hex: '#9a3412' },
      { label: 'Camel', hex: '#a16207' },
      { label: 'Emerald', hex: '#059669' },
    ],
  },
}

export function PhaseColorPicker() {
  const { phaseConfig, setPhaseConfig } = usePhaseColors()

  function handlePick(phase: PhaseKey, hex: string) {
    setPhaseConfig({ ...phaseConfig, [phase]: hex })
  }

  return (
    <div className="space-y-4">
      <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
        Phase-kleuren
      </div>
      {(Object.keys(PHASE_SWATCHES) as PhaseKey[]).map((phase) => {
        const { label, description, swatches } = PHASE_SWATCHES[phase]
        const currentHex = phaseConfig[phase]
        return (
          <div key={phase}>
            <div className="text-xs font-semibold text-[var(--ink-2)] mb-0.5">
              {label}
            </div>
            <div className="text-[11px] text-[var(--ink-3)] mb-1.5">
              {description}
            </div>
            <div className="flex flex-wrap gap-2">
              {swatches.map((s) => {
                const active = currentHex.toLowerCase() === s.hex.toLowerCase()
                return (
                  <button
                    key={s.hex}
                    type="button"
                    onClick={() => handlePick(phase, s.hex)}
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
