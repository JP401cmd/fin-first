'use client'

import { Check } from 'lucide-react'
import {
  usePaletteTheme,
  PALETTE_THEMES,
  type PaletteTheme,
} from '@/components/app/module-color-provider'

/**
 * PalettePicker — visuele preset-keuze tussen de 3 beschikbare cream-
 * palettes (cream / licht / fd-bruin) die in module-color-provider zijn
 * gedefinieerd. Eén klik wisselt het hele design-token-systeem.
 *
 * Plan-context: backlog-item "Module-color als instelbare accent".
 * Persistence loopt via localStorage (`tf-palette-theme`) in de bestaande
 * provider — geen DB-migratie nodig. Server-render valt terug op
 * default ('cream') bij ontbrekende client-state.
 *
 * Visueel: drie cards met swatch-strip die de werkelijke kleuren toont
 * (bg + paper + subtle + borderEd). User ziet meteen wat hij krijgt.
 */
export function PalettePicker() {
  const { paletteTheme, setPaletteTheme } = usePaletteTheme()
  const themes = Object.entries(PALETTE_THEMES) as [
    PaletteTheme,
    (typeof PALETTE_THEMES)[PaletteTheme],
  ][]

  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
        Palet
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {themes.map(([key, theme]) => {
          const active = paletteTheme === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setPaletteTheme(key)}
              aria-pressed={active}
              className={`group rounded-2xl border p-3 sm:p-4 text-left transition-all ${
                active
                  ? 'border-[var(--ink-2)] shadow-sm'
                  : 'border-[var(--border-ed)] hover:border-[var(--ink-3)]'
              }`}
            >
              <header className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-[var(--ink)]">
                  {theme.label}
                </span>
                {active && (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--ink)] text-[var(--paper)]">
                    <Check className="w-3 h-3" aria-hidden="true" />
                  </span>
                )}
              </header>
              <p className="text-[11px] text-[var(--ink-3)] leading-snug mb-3">
                {theme.description}
              </p>
              <div className="flex h-8 rounded-lg overflow-hidden border border-[var(--border-ed)]">
                <div className="flex-1" style={{ background: theme.bg }} />
                <div className="flex-1" style={{ background: theme.paper }} />
                <div className="flex-1" style={{ background: theme.subtle }} />
                <div className="flex-1" style={{ background: theme.borderEd }} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
