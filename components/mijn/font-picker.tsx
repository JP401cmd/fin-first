'use client'

import { Check } from 'lucide-react'
import {
  useFontTheme,
  type FontTheme,
} from '@/components/app/module-color-provider'

/**
 * FontPicker — kiest tussen drie typografie-thema's die module-color-
 * provider ondersteunt:
 *  - editorial (default): Playfair Display + Source Serif Pro
 *  - andada: Andada Pro (Pakketten + body als één serif)
 *  - digital: Inter (modern sans-serif)
 *
 * Plan-context: A-2 stap 2 — typografie-keuze uit het legacy
 * /identity/instellingen ontmantelen naar /mijn/uiterlijk.
 *
 * Persistence loopt via setFontTheme in module-color-provider — die
 * gebruikt een API-call (geen pure localStorage) om DB-state bij te
 * werken. Geen extra werk hier; component is een dunne UI-wrapper.
 */

type FontThemeMeta = {
  label: string
  description: string
  preview: string
  /** Inline-style om previews te tonen in het juiste font, zonder de
   *  globale theme te veranderen op hover. */
  previewStyle: React.CSSProperties
}

const FONT_THEMES_META: Record<FontTheme, FontThemeMeta> = {
  editorial: {
    label: 'Editorial',
    description: 'Playfair Display + Source Serif Pro (default).',
    preview: 'Geld is opgeslagen tijd',
    previewStyle: {
      fontFamily: 'var(--font-playfair-default, var(--font-playfair, Georgia, serif))',
      fontStyle: 'italic',
    },
  },
  andada: {
    label: 'Andada',
    description: 'Andada Pro — één serif voor headlines en body.',
    preview: 'Geld is opgeslagen tijd',
    previewStyle: {
      fontFamily: 'var(--font-andada, Georgia, serif)',
      fontStyle: 'italic',
    },
  },
  digital: {
    label: 'Digital',
    description: 'Inter — modern sans-serif voor scherpe leesbaarheid.',
    preview: 'Geld is opgeslagen tijd',
    previewStyle: {
      fontFamily: 'var(--font-inter, -apple-system, BlinkMacSystemFont, sans-serif)',
      fontStyle: 'normal',
    },
  },
}

export function FontPicker() {
  const { fontTheme, setFontTheme } = useFontTheme()
  const themes = Object.entries(FONT_THEMES_META) as [FontTheme, FontThemeMeta][]

  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
        Typografie
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {themes.map(([key, theme]) => {
          const active = fontTheme === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFontTheme(key)}
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
              <div
                className="text-base font-semibold text-[var(--ink-2)]"
                style={theme.previewStyle}
              >
                {theme.preview}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
