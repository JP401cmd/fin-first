'use client'

/**
 * ScenarioChip — kleine pill met een gestippelde ink-swatch, die de duidingsblokken
 * (levensinkomenstrook, guardrail-kompas, dekkingsradar) markeert zodra ze de scenario-
 * cijfers tonen i.p.v. de basis. Klik scrollt naar de sectie "Verken je aannames" (het
 * slider-lab). Puur presentational; de swatch spiegelt de wat-als-lijn in de grafiek
 * (ink-2, dash "6 4"). Zodra een doel is vastgelegd (`doelActief`) leest de pill "Jouw
 * doel" i.p.v. "Jouw wat-als" — zelfde dash-swatch, alleen de tekst wisselt.
 */

/** Anchor-id van de sectie "Verken je aannames" (slider-lab). */
export const VERKEN_SECTION_ID = 'verken-je-aannames'

export function ScenarioChip({
  className = '',
  doelActief = false,
}: {
  className?: string
  doelActief?: boolean
}) {
  const scrollToSection = () => {
    if (typeof document === 'undefined') return
    document
      .getElementById(VERKEN_SECTION_ID)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <button
      type="button"
      onClick={scrollToSection}
      aria-label={
        doelActief
          ? 'Toont je vastgelegde doel — ga naar Jouw doelsituatie'
          : 'Toont je wat-als-scenario — ga naar Verken je aannames'
      }
      className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-0.5 font-mono text-[10px] font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--ink-3)] ${className}`}
    >
      <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden className="shrink-0">
        <line
          x1="0"
          y1="4"
          x2="20"
          y2="4"
          stroke="var(--ink-2)"
          strokeWidth="2"
          strokeDasharray="6 4"
        />
      </svg>
      {doelActief ? 'Jouw doel' : 'Jouw wat-als'}
    </button>
  )
}
