'use client'

import { ColorPickerCard, type ColorPreset } from '@/components/app/color-picker-card'
import { useBudgetColors } from '@/components/app/module-color-provider'
import { DEFAULT_BUDGET_COLORS, type BudgetColorConfig } from '@/lib/color-palette'

/**
 * BudgetTintPicker — kleurkeuze per budget-categorie (income/expense/
 * savings/debt/other). Plan A-2 stap 4 — uitgekamerd uit legacy
 * /identity/instellingen?tab=weergave naar /mijn/uiterlijk.
 *
 * Per categorie één ColorPickerCard: ronde swatch met native color-input
 * (volledig eigen tint kiesbaar), live palettestrip, de 6 voorkeuze-tints
 * als presets, hex-weergave en een per-kaart reset naar de default.
 * Klik = setBudgetConfig — CSS-vars updaten instant + API-persist.
 *
 * Categorie-betekenis (uit DEFAULT_BUDGET_COLORS):
 *  - income   donkergroen — groei
 *  - expense  terracotta — uitstroom
 *  - savings  staalsblauw — opbouw
 *  - debt     bordeaux — verplichting
 *  - other    ink-2 neutraal
 */

type BudgetKey = keyof BudgetColorConfig

const BUDGET_SWATCHES: Record<BudgetKey, { label: string; presets: ColorPreset[] }> = {
  income: {
    label: 'Inkomen',
    presets: [
      { name: 'Donkergroen (default)', hex: '#2d6a4f' },
      { name: 'Emerald', hex: '#059669' },
      { name: 'Forest', hex: '#15803d' },
      { name: 'Mint', hex: '#10b981' },
      { name: 'Olijfgroen', hex: '#65a30d' },
      { name: 'Teal', hex: '#0d9488' },
    ],
  },
  expense: {
    label: 'Uitgaven',
    presets: [
      { name: 'Terracotta (default)', hex: '#6b3a2d' },
      { name: 'Roest', hex: '#9a3412' },
      { name: 'Amber', hex: '#d97706' },
      { name: 'Bordeaux', hex: '#9f1239' },
      { name: 'Bruin', hex: '#7c2d12' },
      { name: 'Slate', hex: '#475569' },
    ],
  },
  savings: {
    label: 'Sparen',
    presets: [
      { name: 'Staalsblauw (default)', hex: '#1d4e6b' },
      { name: 'Sky', hex: '#0284c7' },
      { name: 'Indigo', hex: '#4338ca' },
      { name: 'Cyaan', hex: '#0891b2' },
      { name: 'Royal', hex: '#1e40af' },
      { name: 'Violet', hex: '#7c3aed' },
    ],
  },
  debt: {
    label: 'Schulden',
    presets: [
      { name: 'Bordeaux (default)', hex: '#7a2d3a' },
      { name: 'Rood', hex: '#b91c1c' },
      { name: 'Rose', hex: '#be123c' },
      { name: 'Roest', hex: '#9a3412' },
      { name: 'Magenta', hex: '#a21caf' },
      { name: 'Donkerbruin', hex: '#451a03' },
    ],
  },
  other: {
    label: 'Overig',
    presets: [
      { name: 'Ink (default)', hex: '#4a4840' },
      { name: 'Slate', hex: '#475569' },
      { name: 'Stone', hex: '#57534e' },
      { name: 'Gray', hex: '#52525b' },
      { name: 'Neutral', hex: '#525252' },
      { name: 'Warm', hex: '#78716c' },
    ],
  },
}

export function BudgetTintPicker() {
  const { budgetConfig, setBudgetConfig } = useBudgetColors()

  function handlePick(type: BudgetKey, hex: string) {
    setBudgetConfig({ ...budgetConfig, [type]: hex })
  }

  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
        Budget-categorie-tints
      </div>
      {(Object.keys(BUDGET_SWATCHES) as BudgetKey[]).map((type) => {
        const { label, presets } = BUDGET_SWATCHES[type]
        return (
          <ColorPickerCard
            key={type}
            label={label}
            value={budgetConfig[type]}
            defaultValue={DEFAULT_BUDGET_COLORS[type]}
            presets={presets}
            onChange={(hex) => handlePick(type, hex)}
            contrastHint
          />
        )
      })}
    </div>
  )
}
