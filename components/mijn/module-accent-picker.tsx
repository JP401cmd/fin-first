'use client'

import { ColorPickerCard, type ColorPreset } from '@/components/app/color-picker-card'
import { useModuleColors } from '@/components/app/module-color-provider'
import { DEFAULT_MODULE_COLORS, type ModuleColorConfig } from '@/lib/color-palette'

/**
 * ModuleAccentPicker — voor elk van de drie accentkleuren één
 * ColorPickerCard: ronde swatch met native color-input (volledig eigen
 * kleur kiesbaar), live 11-shade palettestrip, de 8 voorkeuze-tinten als
 * presets, hex-weergave en een per-kaart reset naar de TriFinity-default.
 * Effect direct zichtbaar via ModuleColorProvider CSS-vars (geen reload) +
 * debounced opgeslagen naar profiles.module_colors. De native color-input
 * vuurt onChange continu tijdens slepen — gewenst (live preview); de
 * provider persisteert debounced.
 *
 * Interne keys/CSS-vars (kern/wil/horizon, --color-kern-* etc.) blijven
 * ongewijzigd; alleen de gebruikerszichtbare labels zijn afgestemd op de
 * huidige IA — de oude modulenamen (Kern/Wil/Horizon) bestaan niet meer
 * als navigatie. We benoemen daarom wat de kleur in de app daadwerkelijk
 * kleurt:
 *  - kern    → Overzicht (de kern-financiën: bezittingen, budgetten, kassa)
 *  - wil     → Will & acties (coaching-meldingen, doelen, aanbevelingen)
 *  - horizon → Toekomst (FIRE, projecties, vrijheid)
 */

type ModuleKey = keyof ModuleColorConfig

/**
 * Hand-gekozen 8-kleur palet per accent (presets). Eerste is de TriFinity-
 * default (uit DEFAULT_MODULE_COLORS), gevolgd door 7 alternatieven die qua
 * verzadiging + lightness onderling onderscheidend zijn.
 */
const MODULE_SWATCHES: Record<
  ModuleKey,
  { label: string; sublabel: string; presets: ColorPreset[] }
> = {
  kern: {
    label: 'Overzicht',
    sublabel: 'De kleur van je kern-financiën — bezittingen, budgetten en transacties.',
    presets: [
      { name: 'Aardetint (default)', hex: '#6b4339' },
      { name: 'Amber', hex: '#d97706' },
      { name: 'Olive', hex: '#65a30d' },
      { name: 'Bordeaux', hex: '#9f1239' },
      { name: 'Teal', hex: '#0d9488' },
      { name: 'Slate', hex: '#475569' },
      { name: 'Indigo', hex: '#4338ca' },
      { name: 'Brown', hex: '#7c2d12' },
    ],
  },
  wil: {
    label: 'Will & acties',
    sublabel: 'De kleur van Will, coaching-meldingen, doelen en aanbevelingen.',
    presets: [
      { name: 'Plum (default)', hex: '#3d3048' },
      { name: 'Teal', hex: '#0d9488' },
      { name: 'Cyaan', hex: '#0891b2' },
      { name: 'Emerald', hex: '#059669' },
      { name: 'Violet', hex: '#7c3aed' },
      { name: 'Rose', hex: '#e11d48' },
      { name: 'Slate', hex: '#475569' },
      { name: 'Olive', hex: '#65a30d' },
    ],
  },
  horizon: {
    label: 'Toekomst',
    sublabel: 'De kleur van je tijdas — FIRE, projecties en financiële vrijheid.',
    presets: [
      { name: 'Camel (default)', hex: '#c4a06b' },
      { name: 'Violet', hex: '#8b5cf6' },
      { name: 'Sky', hex: '#0284c7' },
      { name: 'Magenta', hex: '#c026d3' },
      // Amber = #d97706 (niet #f59e0b): de 700-shade van een lichtere basis
      // haalt geen WCAG-AA-contrast voor witte knop-tekst en kickers.
      { name: 'Amber', hex: '#d97706' },
      { name: 'Emerald', hex: '#059669' },
      { name: 'Coral', hex: '#ea580c' },
      { name: 'Indigo', hex: '#4f46e5' },
    ],
  },
}

export function ModuleAccentPicker() {
  const { config, setConfig } = useModuleColors()

  function handlePick(module: ModuleKey, hex: string) {
    setConfig({ ...config, [module]: hex })
  }

  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
        Accentkleuren
      </div>
      {(Object.keys(MODULE_SWATCHES) as ModuleKey[]).map((module) => {
        const { label, sublabel, presets } = MODULE_SWATCHES[module]
        return (
          <ColorPickerCard
            key={module}
            label={label}
            sublabel={sublabel}
            value={config[module]}
            defaultValue={DEFAULT_MODULE_COLORS[module]}
            presets={presets}
            onChange={(hex) => handlePick(module, hex)}
            contrastHint
          />
        )
      })}
    </div>
  )
}
