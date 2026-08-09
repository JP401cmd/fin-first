'use client'

import { Check } from 'lucide-react'
import { useDisplayMode, type DisplayMode } from '@/lib/hooks/use-display-mode'

/**
 * DisplayModePicker — de weergavekeuze "Eenvoudig" ⇄ "Volledig" als eerste blok
 * op /mijn/uiterlijk (APP-1, eenvoudige-weergave-audit fase 1).
 *
 * WAAROM HIER: de modus bestond al (ADR 0026) maar was uitsluitend via ⌘K te
 * bereiken. Wie eenvoudig start wist niet dat er meer is; wie volledig staat
 * wist niet dat het rustiger kan. Dit blok maakt de keuze vindbaar op de plek
 * waar de rest van het uiterlijk ook staat; ⌘K blijft de snelkoppeling.
 *
 * GEEN TWEEDE SCHRIJFPAD: de knoppen zetten `setMode` uit `useDisplayMode()` —
 * dezelfde optimistische state + `PUT /api/display-mode` die de ⌘K-actie
 * gebruikt, met rollback bij een mislukte call. Er komt hier dus géén eigen
 * fetch, geen localStorage-spiegel en geen tweede leespad bij.
 */

type ModeMeta = {
  label: string
  /** Wat je krijgt als je dit kiest — één zin, gewone taal. */
  description: string
}

const MODE_META: Record<DisplayMode, ModeMeta> = {
  simple: {
    label: 'Eenvoudig — de kern',
    description:
      'Alleen wat je nodig hebt om te zien hoe je ervoor staat. Verdieping — analyses, katernen en extra grafieken — blijft uit beeld.',
  },
  full: {
    label: 'Volledig — alle detail',
    description:
      'Alles in beeld: de analyses, de belastingkaternen, de extra grafieken en de fijnregelingen.',
  },
}

export function DisplayModePicker() {
  const { mode, setMode } = useDisplayMode()
  const modes = Object.entries(MODE_META) as [DisplayMode, ModeMeta][]

  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
        Weergave
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {modes.map(([key, meta]) => {
          const active = mode === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              aria-pressed={active}
              className={`group rounded-2xl border p-3 sm:p-4 text-left transition-all ${
                active
                  ? 'border-[var(--ink-2)] shadow-sm'
                  : 'border-[var(--border-ed)] hover:border-[var(--ink-3)]'
              }`}
            >
              <header className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-[var(--ink)]">{meta.label}</span>
                {active && (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--ink)] text-[var(--paper)]">
                    <Check className="w-3 h-3" aria-hidden="true" />
                  </span>
                )}
              </header>
              <p className="text-[11px] text-[var(--ink-3)] leading-snug">{meta.description}</p>
            </button>
          )
        })}
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
        Je keuze geldt voor alle pagina&apos;s en reist mee naar je andere apparaten. Snel wisselen
        kan ook met het zoekscherm (<kbd className="font-mono">⌘K</kbd> of{' '}
        <kbd className="font-mono">Ctrl</kbd>+<kbd className="font-mono">K</kbd>).
      </p>
    </div>
  )
}
