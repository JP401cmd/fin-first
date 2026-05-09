'use client'

import { useState, useRef, useEffect } from 'react'
import { Info, X } from 'lucide-react'

interface ChartTipsProps {
  /** Stable key (gebruikt voor a11y-id en eventuele state-keys). */
  storageKey: string
  /** 3-5 tips. Worden in editorial stijl (italic Source Serif, genummerd) gerenderd. */
  tips: string[]
  /** Header-tekst (default "Hoe lees je deze grafiek?"). */
  title?: string
  /**
   * Pop-over horizontale uitlijning t.o.v. de "i"-knop:
   * - `'right'` (default): popover groeit naar links — voor knoppen aan de rechter chart-rand
   * - `'left'`: popover groeit naar rechts — voor knoppen aan de linker chart-rand
   */
  align?: 'left' | 'right'
}

/**
 * Compacte "i"-trigger voor chart-uitleg.
 *
 * Render: kleine ronde knop (h-5 w-5) met `Info`-icoon, in-line te plaatsen
 * naast chart-toolbar-knoppen. Klik opent een editorial-styled popover met
 * 3-5 genummerde tips (italic Source Serif, linker module-active border,
 * label-editorial kicker, X-knop).
 *
 * Sluiten: klik buiten de popover of Esc-toets.
 *
 * Plaats deze component zelf in een container met logische positie
 * (bv. inline in een toolbar). De popover positioneert zich onder de knop.
 */
export function ChartTips({
  storageKey,
  tips,
  title = 'Hoe lees je deze grafiek?',
  align = 'right',
}: ChartTipsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen])

  if (tips.length === 0) return null

  const titleId = `chart-tips-title-${storageKey}`

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={title}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--ink-4)] transition-colors hover:text-[var(--module-active-700)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--module-active-500)] ${
          isOpen
            ? 'text-[var(--module-active-700)]'
            : ''
        }`}
        style={
          isOpen
            ? {
                background:
                  'color-mix(in oklch, var(--module-active-500) 14%, transparent)',
              }
            : undefined
        }
        data-testid={`chart-tips-trigger-${storageKey}`}
      >
        <Info className="h-3.5 w-3.5" strokeWidth={2} />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-labelledby={titleId}
          className={`absolute top-7 z-30 w-72 max-w-[calc(100vw-1.5rem)] sm:w-80 bg-[var(--paper)] shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          style={{
            border: '1px solid var(--ink)',
            borderLeftWidth: '4px',
            borderLeftColor: 'var(--module-active-500)',
            animation: 'fadeUp 220ms cubic-bezier(.22,1,.36,1) both',
          }}
          data-testid={`chart-tips-popover-${storageKey}`}
        >
          {/* Editorial kicker + close button */}
          <div className="flex items-center justify-between border-b border-[var(--rule-soft)] px-3 py-2">
            <span
              id={titleId}
              className="font-mono text-[10px] uppercase tracking-[0.20em] text-[var(--module-active-700)]"
            >
              {title}
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Sluiten"
              className="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded text-[var(--ink-4)] transition-colors hover:text-[var(--ink-2)]"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>

          {/* Editorial tip-list: genummerd in module-700 mono, italic Source Serif body */}
          <ol
            className="m-0 list-none space-y-2 px-3 py-3"
            style={{
              fontFamily: 'var(--font-source-serif, Georgia, serif)',
            }}
          >
            {tips.map((tip, idx) => (
              <li
                key={idx}
                className="flex gap-2.5 text-[13px] italic leading-snug text-[var(--ink-2)]"
              >
                <span
                  aria-hidden
                  className="not-italic select-none font-mono text-[10px] font-semibold tracking-[0.05em] text-[var(--module-active-700)] mt-[3px] tabular-nums"
                >
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <span>{tip}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
