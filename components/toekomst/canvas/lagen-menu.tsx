'use client'

/**
 * LagenMenu — de knop "Lagen" boven het canvas met het menu "Lagen op de grafiek"
 * (ADR 0179 D3, spec §4.4). Vervangt de losse pills en de `ChartOverlayExplainer`:
 * de uitleg per laag staat in het menu zelf (kopij uit `katern-copy`).
 *
 * - Desktop (≥ lg): een popover onder de knop; sluit bij Escape of een klik erbuiten
 *   en geeft de focus terug aan de knop. De app heeft geen gedeelde popover-primitive
 *   (de bestaande — `chat-settings-popover`, `toekomst-overlay`, `ChartTips` — zijn
 *   specifiek), dus dit is een kleine absolute laag; geen `fixed inset-0`, dus geen
 *   overlay in de zin van ADR 0039.
 * - Mobiel: `ShellOverlay kind="sheet"` (ADR 0039).
 * - Vaste lagen van het katern staan aangevinkt en niet te wijzigen, met "vast".
 * - Eenvoudig toont alleen `LAGEN_EENVOUDIG`; de rest staat in `HideInSimple`
 *   (ADR 0026, nooit een ternary op de weergavemodus).
 *
 * Presentational: de host (canvas-state) houdt `lagen` bij en verwerkt `onToggle`.
 */

import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Layers } from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { useIsLgUp } from '@/lib/hooks/use-media-query'
import {
  LAAG_VAST_LABEL,
  LAAG_VOLGORDE,
  LAGEN_EENVOUDIG,
  LAGEN_KNOP_LABEL,
  LAGEN_KOP,
  laagLabel,
  laagUitleg,
  type HoofdlijnGrondslag,
  type LaagId,
} from '@/lib/horizon/katern-copy'

export interface LagenMenuProps {
  /** Aan/uit per laag (de keuze van de gebruiker; vaste lagen tellen als aan). */
  lagen: Record<LaagId, boolean>
  /** Lagen die dit katern vast aanzet (Doelen: doelscenario en doelen). */
  vast: readonly LaagId[]
  /** Lagen die in deze modus/dit katern bestaan; de rest verschijnt niet in het menu. */
  beschikbaar: readonly LaagId[]
  onToggle: (id: LaagId) => void
  /**
   * Grondslag van de hoofdlijn (`effectiveChartPrimaryBasis`). De huislaag schakelt de
   * andere grondslag in en heet daarom "Met je huis" of "Zonder je huis".
   */
  hoofdlijn: HoofdlijnGrondslag
  className?: string
}

export function LagenMenu({ lagen, vast, beschikbaar, onToggle, hoofdlijn, className = '' }: LagenMenuProps) {
  const [open, setOpen] = useState(false)
  const isLg = useIsLgUp()
  const wrapRef = useRef<HTMLDivElement>(null)
  const knopRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const kopId = useId()

  useEffect(() => {
    if (!open || !isLg) return
    const klik = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        knopRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', klik)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', klik)
      document.removeEventListener('keydown', esc)
    }
  }, [open, isLg])

  if (beschikbaar.length === 0) return null

  const lijst = (
    <LagenLijst
      lagen={lagen}
      vast={vast}
      beschikbaar={beschikbaar}
      onToggle={onToggle}
      hoofdlijn={hoofdlijn}
      kopId={kopId}
    />
  )

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        ref={knopRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={isLg && open ? menuId : undefined}
        className="inline-flex min-h-[44px] items-center gap-1.5 border border-[var(--border-ed)] bg-[var(--paper)] px-3 text-[11px] font-medium text-[var(--ink-2)] transition-colors hover:border-horizon-300 hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] lg:min-h-[32px]"
        data-testid="lagen-knop"
      >
        <Layers className="h-3.5 w-3.5" aria-hidden="true" />
        {LAGEN_KNOP_LABEL}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {isLg && open && (
        <div
          id={menuId}
          className="absolute right-0 top-full z-30 mt-2 w-[440px] max-w-[calc(100vw-2rem)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 shadow-[0_8px_24px_rgba(26,25,22,0.12)]"
          data-testid="lagen-popover"
        >
          <p id={kopId} className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-horizon-700">
            {LAGEN_KOP}
          </p>
          {lijst}
        </div>
      )}

      {!isLg && (
        <ShellOverlay kind="sheet" open={open} onClose={() => setOpen(false)} title={LAGEN_KOP} size="md">
          <div className="px-5 pb-6 sm:px-6">
            <p id={kopId} className="sr-only">
              {LAGEN_KOP}
            </p>
            {lijst}
          </div>
        </ShellOverlay>
      )}
    </div>
  )
}

function LagenLijst({
  lagen,
  vast,
  beschikbaar,
  onToggle,
  hoofdlijn,
  kopId,
}: Omit<LagenMenuProps, 'className'> & { kopId: string }) {
  const zichtbaar = LAAG_VOLGORDE.filter((id) => beschikbaar.includes(id))
  return (
    <ul role="group" aria-labelledby={kopId} className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
      {zichtbaar.map((id) => {
        const rij = (
          <LaagRij
            key={id}
            id={id}
            label={laagLabel(id, hoofdlijn)}
            uitleg={laagUitleg(id, hoofdlijn)}
            aan={lagen[id]}
            vast={vast.includes(id)}
            onToggle={onToggle}
          />
        )
        return LAGEN_EENVOUDIG.includes(id) ? rij : <HideInSimple key={id}>{rij}</HideInSimple>
      })}
    </ul>
  )
}

function LaagRij({
  id,
  label,
  uitleg,
  aan,
  vast,
  onToggle,
}: {
  id: LaagId
  label: string
  uitleg: string
  aan: boolean
  vast: boolean
  onToggle: (id: LaagId) => void
}) {
  const inputId = useId()
  const uitlegId = useId()
  return (
    <li className="py-1.5" data-testid={`laag-${id}`}>
      <label htmlFor={inputId} className={`flex min-h-[44px] items-start gap-2 ${vast ? '' : 'cursor-pointer'}`}>
        <input
          id={inputId}
          type="checkbox"
          checked={vast || aan}
          disabled={vast}
          aria-describedby={uitlegId}
          onChange={() => onToggle(id)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-horizon-600"
        />
        <span className="min-w-0">
          <span className="block text-[13px] font-medium text-[var(--ink)]">
            {label}
            {vast && (
              <span className="ml-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                {LAAG_VAST_LABEL}
              </span>
            )}
          </span>
          <span id={uitlegId} className="block font-serif text-[12px] leading-snug text-[var(--ink-3)]">
            {uitleg}
          </span>
        </span>
      </label>
    </li>
  )
}
