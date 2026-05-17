'use client'

import { useState, useRef, useEffect, type ReactNode } from 'react'

/**
 * GlossaryTerm — wraps financial jargon with a hover/tap tooltip.
 *
 * Styling: dotted underline in module-active-700; on hover/tap a popover
 * appears with a short plain-language explanation.
 *
 * Usage:
 *   <GlossaryTerm term="SWR" explanation="Safe Withdrawal Rate — het percentage ...">
 *     SWR
 *   </GlossaryTerm>
 *
 * Or with the glossary data helper:
 *   <GlossaryTerm term="netto_vermogen">netto vermogen</GlossaryTerm>
 */

export interface GlossaryTermProps {
  /** The term key (used for lookup in GLOSSARY if no explanation prop). */
  term: string
  /** Override explanation text. If omitted, looks up `term` in GLOSSARY. */
  explanation?: string
  /** The visible jargon word(s). Defaults to `term` if omitted. */
  children?: ReactNode
}

export function GlossaryTerm({ term, explanation, children }: GlossaryTermProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)

  // Resolve explanation from glossary if not provided
  const text = explanation ?? GLOSSARY[term] ?? ''

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
    return <span>{children ?? term}</span>
  }

  return (
    <span ref={containerRef} className="relative inline">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline cursor-help border-b border-dotted border-[var(--module-active-700,var(--ink-3))] text-inherit font-inherit leading-inherit transition-colors hover:border-[var(--module-active-500,var(--ink-2))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        aria-describedby={`glossary-${term}`}
        style={{ fontSize: 'inherit', lineHeight: 'inherit' }}
      >
        {children ?? term}
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
          {term.replace(/_/g, ' ')}
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

// ── Built-in glossary ────────────────────────────────────────────
// Short, plain-language explanations for common financial terms.
// Can be extended or overridden via the `explanation` prop.

export const GLOSSARY: Record<string, string> = {
  netto_vermogen:
    'Alles wat je bezit (spaargeld, beleggingen, huis) min alles wat je schuldig bent (hypotheek, leningen). Het totaal dat overblijft is jouw netto vermogen.',
  SWR:
    'Safe Withdrawal Rate — het percentage van je vermogen dat je jaarlijks kunt opnemen zonder dat het opraakt. Vaak rond de 3-4%.',
  FIRE:
    'Financial Independence, Retire Early — het punt waarop je genoeg vermogen hebt om van te leven zonder te hoeven werken.',
  koopkracht:
    'De werkelijke waarde van je geld, gecorrigeerd voor inflatie. Door prijsstijgingen koop je over tijd minder met hetzelfde bedrag.',
  inflatie:
    'De jaarlijkse stijging van het algemene prijsniveau. Je geld wordt elk jaar iets minder waard als prijzen stijgen.',
  schuldgraad:
    'Het percentage van je bezittingen dat met schulden is gefinancierd. Lager is over het algemeen gezonder.',
  spaarquote:
    'Het deel van je netto-inkomen dat je maandelijks overhoudt en spaart of belegt. Hoe hoger, hoe sneller je financiele vrijheid bereikt.',
  box_3:
    'Het belastingvak voor vermogen in Nederland. Je betaalt belasting over een fictief rendement op je spaargeld en beleggingen boven de vrijstelling.',
  rendement:
    'De opbrengst van je beleggingen, uitgedrukt als percentage per jaar. Kan positief (winst) of negatief (verlies) zijn.',
  vermogensbelasting:
    'De belasting die je betaalt over je vermogen in Box 3. Gebaseerd op een door de overheid vastgesteld fictief rendement.',
  AOW:
    'Algemene Ouderdomswet — het basispensioen van de overheid dat je ontvangt vanaf je AOW-leeftijd (momenteel rond 67 jaar).',
  pensioen:
    'Het inkomen dat je ontvangt na je werkzame leven, opgebouwd via je werkgever of zelf aangevuld met beleggingen.',
  vrijheidstijd:
    'Het aantal jaren, maanden of dagen dat je kunt leven van je huidige vermogen zonder nieuw inkomen. Gebaseerd op je maandelijkse uitgaven.',
  Monte_Carlo:
    'Een simulatiemethode die duizenden mogelijke scenario\'s doorrekent met willekeurige rendementen. Geeft een kans van slagen in plaats van een enkel getal.',
  SORR:
    'Sequence of Returns Risk — het risico dat slechte rendementen vroeg in je pensioen je vermogen sneller uitputten dan gemiddelden suggereren.',
}
