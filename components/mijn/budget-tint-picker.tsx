'use client'

import { Check } from 'lucide-react'
import { useBudgetColors } from '@/components/app/module-color-provider'
import type { BudgetColorConfig } from '@/lib/color-palette'

/**
 * BudgetTintPicker — kleurkeuze per budget-categorie (income/expense/
 * savings/debt/other). Plan A-2 stap 4 — uitkamerd uit legacy
 * /identity/instellingen?tab=weergave naar /mijn/uiterlijk.
 *
 * Per categorie 6 voorkeuze-tints. Active = scale-110 + Check-icoon.
 * Klik = setBudgetConfig — CSS-vars updates instant + API-persist.
 *
 * Categorie-betekenis (uit DEFAULT_BUDGET_COLORS):
 *  - income   donkergroen — groei
 *  - expense  terracotta — uitstroom
 *  - savings  staalsblauw — opbouw
 *  - debt     bordeaux — verplichting
 *  - other    ink-2 neutraal
 */

type BudgetKey = keyof BudgetColorConfig
type Swatch = { label: string; hex: string }

const BUDGET_SWATCHES: Record<BudgetKey, { label: string; swatches: Swatch[] }> = {
  income: {
    label: 'Inkomen',
    swatches: [
      { label: 'Donkergroen (default)', hex: '#2d6a4f' },
      { label: 'Emerald', hex: '#059669' },
      { label: 'Forest', hex: '#15803d' },
      { label: 'Mint', hex: '#10b981' },
      { label: 'Olijfgroen', hex: '#65a30d' },
      { label: 'Teal', hex: '#0d9488' },
    ],
  },
  expense: {
    label: 'Uitgaven',
    swatches: [
      { label: 'Terracotta (default)', hex: '#6b3a2d' },
      { label: 'Roest', hex: '#9a3412' },
      { label: 'Amber', hex: '#d97706' },
      { label: 'Bordeaux', hex: '#9f1239' },
      { label: 'Bruin', hex: '#7c2d12' },
      { label: 'Slate', hex: '#475569' },
    ],
  },
  savings: {
    label: 'Sparen',
    swatches: [
      { label: 'Staalsblauw (default)', hex: '#1d4e6b' },
      { label: 'Sky', hex: '#0284c7' },
      { label: 'Indigo', hex: '#4338ca' },
      { label: 'Cyaan', hex: '#0891b2' },
      { label: 'Royal', hex: '#1e40af' },
      { label: 'Violet', hex: '#7c3aed' },
    ],
  },
  debt: {
    label: 'Schulden',
    swatches: [
      { label: 'Bordeaux (default)', hex: '#7a2d3a' },
      { label: 'Rood', hex: '#b91c1c' },
      { label: 'Rose', hex: '#be123c' },
      { label: 'Roest', hex: '#9a3412' },
      { label: 'Magenta', hex: '#a21caf' },
      { label: 'Donkerbruin', hex: '#451a03' },
    ],
  },
  other: {
    label: 'Overig',
    swatches: [
      { label: 'Ink (default)', hex: '#4a4840' },
      { label: 'Slate', hex: '#475569' },
      { label: 'Stone', hex: '#57534e' },
      { label: 'Gray', hex: '#52525b' },
      { label: 'Neutral', hex: '#525252' },
      { label: 'Warm', hex: '#78716c' },
    ],
  },
}

export function BudgetTintPicker() {
  const { budgetConfig, setBudgetConfig } = useBudgetColors()

  function handlePick(type: BudgetKey, hex: string) {
    setBudgetConfig({ ...budgetConfig, [type]: hex })
  }

  return (
    <div className="space-y-4">
      <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
        Budget-categorie-tints
      </div>
      {(Object.keys(BUDGET_SWATCHES) as BudgetKey[]).map((type) => {
        const { label, swatches } = BUDGET_SWATCHES[type]
        const currentHex = budgetConfig[type]
        return (
          <div key={type}>
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
                    onClick={() => handlePick(type, s.hex)}
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
