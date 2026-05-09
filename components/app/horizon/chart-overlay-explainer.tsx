'use client'

import { memo, type ReactNode } from 'react'

interface Props {
  /** Toon de explainer alleen wanneer `active` true is. */
  active: boolean
  /** De editorial uitleg-tekst — gebruik `<em>` voor accent-woorden. */
  children: ReactNode
}

/**
 * Compacte editorial quote-callout die uitlegt wat een chart-overlay toevoegt.
 *
 * Visueel: linker module-active accentlijn, drijvend quote-glyph, italic serif
 * body op `--ink-2`. Gemodelleerd naar de "Scenario-callout / regime-info"
 * patroon-kaart uit de ui-ux skill maar compacter (toggle-context, geen hero).
 *
 * Toon één per actieve overlay — max twee regels tekst aanbevolen.
 */
export const ChartOverlayExplainer = memo(function ChartOverlayExplainer({
  active,
  children,
}: Props) {
  if (!active) return null
  return (
    <div
      role="note"
      className="relative mb-2 border-l-2 border-l-[var(--module-active-500)] bg-[var(--paper)] py-2 pl-8 pr-3"
      style={{ animation: 'fadeUp 240ms cubic-bezier(.22,1,.36,1) both' }}
    >
      <span
        aria-hidden
        className="absolute left-2 top-1 select-none font-serif text-[26px] font-black leading-none text-[var(--module-active-500)] opacity-70"
      >
        &ldquo;
      </span>
      <p
        className="m-0 font-serif text-[12.5px] italic leading-snug text-[var(--ink-2)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        {children}
      </p>
    </div>
  )
})
