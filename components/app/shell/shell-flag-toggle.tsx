'use client'

/**
 * ShellFlagToggle — toggle voor de feature-flag `new_navigation_shell`. Twee
 * varianten zodat hij in zowel de oude AppHeader's profile-dropdown als de
 * nieuwe Sidebar's footer past:
 *
 *  - `'dropdown-row'` — past in een dropdown-menu (Inter 14px) met label
 *    links en AAN/UIT-status rechts. Voor `AppHeader.tsx`.
 *  - `'sidebar-footer'` — past tussen de FOOTER_LINKS in de sidebar (mono
 *    UPPERCASE 10px). Voor `Sidebar.tsx` FooterSection.
 *
 * Bij click: toggle de flag in localStorage en reload de pagina (server-render
 * moet opnieuw draaien zodat ResponsiveShell de andere tak rendert — een
 * SPA-update zou alleen client-side de top-level component swappen wat niet
 * het ResponsiveShell-niveau bereikt).
 *
 * Gebruik:
 *   <ShellFlagToggle variant="sidebar-footer" />
 *   <ShellFlagToggle variant="dropdown-row" onAfterToggle={() => setMenuOpen(false)} />
 */

import { useCallback } from 'react'
import { useFeatureFlag } from '@/lib/hooks/use-feature-flag'

const FLAG = 'new_navigation_shell'

type ShellFlagToggleProps = {
  variant: 'sidebar-footer' | 'dropdown-row'
  /** Optionele callback ná toggle (bv. `setMenuOpen(false)` voor dropdowns). */
  onAfterToggle?: () => void
}

export function ShellFlagToggle({ variant, onAfterToggle }: ShellFlagToggleProps) {
  const [enabled, setEnabled] = useFeatureFlag(FLAG)

  const handleToggle = useCallback(() => {
    setEnabled(!enabled)
    onAfterToggle?.()
    if (typeof window !== 'undefined') {
      // ResponsiveShell renderd op basis van de flag binnen `(app)/layout.tsx`.
      // SPA-update zou alleen de huidige page herschrijven; voor een schone
      // shell-swap moeten alle providers + layout opnieuw mounten.
      window.location.reload()
    }
  }, [enabled, setEnabled, onAfterToggle])

  if (variant === 'sidebar-footer') {
    return (
      <button
        type="button"
        onClick={handleToggle}
        aria-pressed={enabled}
        className="flex items-center justify-between gap-2 px-2 h-8 w-full text-left font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-3)] hover:bg-[var(--subtle)]/50 hover:text-[var(--ink)] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
      >
        <span>
          Nieuwe shell <span className="text-[var(--ink-4)] normal-case ml-1">beta</span>
        </span>
        <span
          aria-hidden
          className={`tabular-nums ${enabled ? 'text-[var(--module-active-700)]' : 'text-[var(--ink-4)]'}`}
        >
          {enabled ? 'AAN' : 'UIT'}
        </span>
      </button>
    )
  }

  // dropdown-row variant
  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-pressed={enabled}
      className="flex items-center justify-between gap-2 w-full px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors text-left"
    >
      <span className="flex items-center gap-1.5">
        Nieuwe shell
        <span className="text-[9px] uppercase tracking-[0.08em] font-mono text-[var(--ink-4)] border border-[var(--border-ed)] px-1 py-px">
          beta
        </span>
      </span>
      <span
        aria-hidden
        className={`text-[10px] uppercase tracking-[0.08em] font-mono ${enabled ? 'text-[var(--module-active-700)]' : 'text-[var(--ink-4)]'}`}
      >
        {enabled ? 'aan' : 'uit'}
      </span>
    </button>
  )
}
