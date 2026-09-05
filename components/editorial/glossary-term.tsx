'use client'

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'
import { GLOSSARY, GLOSSARY_ENTRIES } from '@/lib/glossary-data'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'

/**
 * GlossaryTerm — wraps financial jargon with a hover/tap tooltip.
 *
 * Styling: dotted underline in module-active-700; on hover/tap a popover
 * appears with a short plain-language explanation.
 *
 * WEERGAVEMODUS-BEWUST (S17). In **Eenvoudig** vervangt de component het
 * zichtbare jargon door `simpleLabel` uit `lib/glossary-data.ts` en verhuist de
 * vakterm naar de kop van de popover — precies de kaartregel "afkortingen
 * bestaan in Eenvoudig niet; wettelijke termen mogen, mét uitleg ter plekke".
 * In **Volledig** verandert er niets: zonder `simpleLabel` (de standaard, o.a.
 * voor Box 3, tegenbewijs, aanmerkelijk belang) is de render in beide modi
 * identiek. Wélke term wisselt is dus een DATASTRUCTUUR-keuze in glossary-data,
 * geen verboden-woordenlijst — een lijst kan niet weten of een treffer in
 * Eenvoudig zichtbaar is en geeft daardoor vals alarm.
 *
 * Seen-tracking: tracks which terms a user has already opened via localStorage.
 * - **Unseen** terms: bold text + thicker dotted underline (font-semibold, border-b-2)
 *   → draws attention to new jargon.
 * - **Seen** terms: normal weight + thin dotted underline (font-inherit, border-b)
 *   → subtle, non-distracting for terms already learned.
 *
 * Content wordt opgehaald uit `lib/glossary-data.ts` — dezelfde bron als
 * de glossary-popovers. Eén bron van waarheid.
 *
 * Usage:
 *   <GlossaryTerm term="swr">SWR</GlossaryTerm>
 *
 * Override explanation (rare, prefer adding to glossary-data.ts):
 *   <GlossaryTerm term="custom" explanation="Eigen uitleg hier">custom</GlossaryTerm>
 */

// ── localStorage seen-tracking ──────────────────────────────────
const STORAGE_KEY = 'glossary_seen_terms'

function getSeenTerms(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

function markTermSeen(term: string): void {
  try {
    const seen = getSeenTerms()
    if (seen.has(term)) return
    seen.add(term)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]))
  } catch {
    // localStorage unavailable (SSR, private mode, quota) — silent no-op
  }
}

// ── Eenvoudig-substitutie ───────────────────────────────────────

/**
 * Neemt de hoofdletter van het oorspronkelijke woord over. `simpleLabel` staat
 * in glossary-data bewust klein geschreven (het is een zinsdeel); stond het
 * jargon aan het begin van een zin of als kop ("Opnamerate"), dan hoort het
 * alternatief dat ook te doen.
 *
 * Een ALL-CAPS afkorting ("SWR", "FIRE") telt NIET als zinsbegin: die staat in
 * hoofdletters omdát het een afkorting is, niet vanwege z'n plek in de zin.
 * "Klassiek Opnamepercentage —" zou daar een valse hoofdletter van maken.
 */
function matchLeadingCase(label: string, source: string): string {
  const first = source.charAt(0)
  const isUpperFirst = first !== '' && first === first.toUpperCase() && first !== first.toLowerCase()
  if (!isUpperFirst) return label
  const rest = source.slice(1)
  const isAcronym = rest !== '' && rest === rest.toUpperCase()
  if (isAcronym) return label
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// ── Component ───────────────────────────────────────────────────

export interface GlossaryTermProps {
  /** The term key (used for lookup in GLOSSARY from lib/glossary-data.ts). */
  term: string
  /** Override explanation text. If omitted, looks up `term` in GLOSSARY. */
  explanation?: string
  /** The visible jargon word(s). Defaults to `term` if omitted. */
  children?: ReactNode
}

export function GlossaryTerm({ term, explanation, children }: GlossaryTermProps) {
  const { mode } = useDisplayMode()
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(true) // default to "seen" to avoid flash of bold on hydration
  const containerRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)

  // Resolve explanation: prop override → shared glossary → empty
  const text = explanation ?? GLOSSARY[term] ?? ''

  // Resolve display name: GLOSSARY_ENTRIES name → term with underscores replaced
  const entry = GLOSSARY_ENTRIES[term]
  const displayName = entry?.name ?? term.replace(/_/g, ' ')

  // Zichtbaar woord. In Eenvoudig wint `simpleLabel` — maar alléén wanneer het
  // kind PLATTE TEKST is: een ReactNode-kind (bv. <em>marktcheck</em>) draagt
  // eigen opmaak die we niet mogen weggooien, en zo'n kind is meestal al de
  // begrijpelijke variant.
  //
  // Zonder `children` (bv. een BEGRIPPEN-chip: `<GlossaryTerm term={term} />`)
  // is de rauwe sleutel ('netto_vermogen', 'Monte_Carlo') geen geldige
  // weergavetekst — die viel eerder letterlijk zo op het scherm. `displayName`
  // (de entry-naam, met een underscore-fallback voor onbekende termen) is de
  // enige tekst die we zonder kind mogen tonen.
  const fallbackChild = children ?? displayName
  const childIsPlain = children === undefined || typeof children === 'string'
  const sourceWord = typeof children === 'string' ? children : displayName
  const visible: ReactNode =
    mode === 'simple' && entry?.simpleLabel && childIsPlain
      ? matchLeadingCase(entry.simpleLabel, sourceWord)
      : fallbackChild

  // On mount, check localStorage for seen status
  useEffect(() => {
    setSeen(getSeenTerms().has(term))
  }, [term])

  // Mark term as seen when tooltip opens
  const handleOpen = useCallback(() => {
    setOpen(true)
    if (!seen) {
      markTermSeen(term)
      setSeen(true)
    }
  }, [term, seen])

  // Close on outside click/touch
  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  if (!text) {
    // No explanation available — render plain text without tooltip
    return <span>{visible}</span>
  }

  // Unseen: bold + thick dotted underline (attention-drawing)
  // Seen: normal weight + thin dotted underline (subtle)
  const buttonClass = seen
    ? 'inline cursor-help border-b border-dotted border-[var(--module-active-700,var(--ink-3))] text-inherit font-inherit leading-inherit transition-colors hover:border-[var(--module-active-500,var(--ink-2))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]'
    : 'inline cursor-help border-b-2 border-dotted border-[var(--module-active-600,var(--ink-2))] text-inherit font-semibold leading-inherit transition-colors hover:border-[var(--module-active-400,var(--ink))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]'

  return (
    <span ref={containerRef} className="relative inline">
      <button
        type="button"
        onClick={(e) => {
          // Voorkom dat een klik op de term een klikbare ouder (bv. een
          // role="button"-card) activeert — toon enkel de tooltip.
          e.stopPropagation()
          open ? setOpen(false) : handleOpen()
        }}
        onMouseEnter={handleOpen}
        onMouseLeave={() => setOpen(false)}
        className={buttonClass}
        aria-describedby={`glossary-${term}`}
        style={{ fontSize: 'inherit', lineHeight: 'inherit' }}
      >
        {visible}
      </button>

      {/* Use <span> instead of <div> so GlossaryTerm can safely live inside <p> elements */}
      <span
        ref={tooltipRef}
        id={`glossary-${term}`}
        role="tooltip"
        className={`absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg border border-[var(--border-ed)] bg-white p-3 text-xs leading-relaxed text-[var(--ink-2)] shadow-lg transition-all duration-150 ${
          open
            ? 'pointer-events-auto translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-1 opacity-0'
        }`}
      >
        <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--module-active-700,var(--ink-3))] mb-1">
          {displayName}
        </span>
        <span className="block font-serif text-[13px] leading-snug text-[var(--ink-2)]">
          {text}
        </span>
        {/* Arrow */}
        <span
          aria-hidden
          className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 h-2.5 w-2.5 rotate-45 border-b border-r border-[var(--border-ed)] bg-white"
        />
      </span>
    </span>
  )
}
