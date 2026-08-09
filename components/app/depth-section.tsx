'use client'

/**
 * DepthSection — een inklapbare "diepte"-sectie waarvan de standaard-open-stand
 * door de profiel-brede weergavemodus (`useDisplayMode`) wordt bepaald:
 *   'simple' → standaard INGEKLAPT (rustig, beginnervriendelijk).
 *   'full'   → standaard OPEN (expert).
 *
 * Een handmatige klik op de header overschrijft dit voor de huidige sessie
 * (ephemeral — GEEN persist). Wisselt de gebruiker daarna de modus, dan bewegen
 * alle secties weer mee met de nieuwe modus.
 *
 * Visuele basis + a11y zijn overgenomen uit `collapsible-section.tsx` (echte
 * `<button>`, `aria-expanded`, chevron `aria-hidden`, max-height-transitie),
 * maar de open-stand komt uit de modus i.p.v. localStorage. `prefers-reduced-
 * motion` schakelt de transitie uit.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'

interface DepthSectionProps {
  /** Sectietitel (altijd zichtbaar). */
  title: string
  /** 1-regel samenvatting, getoond wanneer ingeklapt. */
  summary?: string
  /** Volledige inhoud, zichtbaar wanneer uitgeklapt. */
  children: ReactNode
  /** Optioneel icoon naast de titel. */
  icon?: ReactNode
}

export function DepthSection({ title, summary, children, icon }: DepthSectionProps) {
  const { mode } = useDisplayMode()
  const [open, setOpen] = useState(mode === 'full')

  // Modus-wissel beweegt alle secties mee; een handmatige klik (setOpen) geldt
  // tot de volgende modus-wissel (ephemeral, géén persist).
  useEffect(() => {
    setOpen(mode === 'full')
  }, [mode])

  return (
    <div
      className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden"
      data-testid="depth-section"
      data-collapsed={!open ? 'true' : 'false'}
    >
      {/* Header — altijd zichtbaar, klikbaar om te togglen. */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-3 p-5 text-left transition-colors hover:bg-[var(--subtle)]"
        aria-expanded={open}
        data-testid="depth-section-toggle"
      >
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--subtle)]">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[var(--ink)]" data-testid="depth-section-title">{title}</h3>
          {!open && summary && (
            <p className="mt-0.5 truncate text-xs text-[var(--ink-3)]" data-testid="depth-section-summary">{summary}</p>
          )}
        </div>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 motion-reduce:transition-none ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Uitklapbare inhoud.
          `inert` bij dicht is GEEN cosmetica: `max-h-0 opacity-0 overflow-hidden`
          maakt de inhoud onzichtbaar maar laat 'm in de toegankelijkheidsboom én
          in de tab-volgorde staan. Zonder dit tabt een toetsenbordgebruiker in
          knoppen die niemand ziet (en die sheets openen die bij een dichtgeklapte
          sectie horen), en leest een schermlezer het hele blok voor. Dat raakt het
          defaultpad: nieuwe accounts staan op Eenvoudig, waar deze sectie dicht
          begint. `inert` (React 19) haalt de subtree uit beide tegelijk en is
          daarmee correcter dan `tabIndex={-1}`, dat alleen de tab-volgorde dekt.
          Bewust NIET `hidden`/`visibility:hidden`: die zouden de uitklap-transitie
          breken. */}
      <div
        data-testid="depth-section-content"
        inert={!open}
        className={`transition-all duration-300 ease-in-out motion-reduce:transition-none ${
          open ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
        }`}
      >
        <div className="border-t border-[var(--border-ed)] p-5">
          {children}
        </div>
      </div>
    </div>
  )
}
