import type { CSSProperties } from 'react'

/**
 * TaxTimeline — horizontale tijdlijn met markers + labels voor fiscale
 * ijkpunten (aangiftedeadlines, voorlopige aanslagen, peildatum Box 3, etc.).
 *
 * Puur presentatie: geen data-fetching, geen hooks. Server-compatible.
 * Box-kleur komt uit een interne map; valt terug op var(--ink-3).
 *
 * Vormgeving — Editorial Finance: de tijdlijn is één doorlopende haarlijn met
 * scherpe ruit-markers (radius 0) op elk ijkpunt; het belangrijkste ijkpunt
 * krijgt een grotere ruit + dunne accent-omtrek (geen schaduw-ring). Datums in
 * DM Mono tabular-nums in de box-accentkleur, labels in Inter UI, sublabels in
 * mono. Box-accenten volgen de brief: Box 1 amber, Box 2 violet, Box 3 teal —
 * functioneel, alleen ter onderscheiding. Markers verschijnen via een korte
 * fade-in (reduced-motion-safe).
 */

export interface TaxTimelineItem {
  /** ISO-datum (YYYY-MM-DD) — bepaalt de getoonde datumlabel */
  date: string
  /** Primaire omschrijving van het ijkpunt */
  label: string
  /** Optionele toelichting onder het label */
  sublabel?: string
  /** Fiscale box — kleurt de marker en de datum */
  box?: 1 | 2 | 3
  /** Markeert het ijkpunt als belangrijkst (grotere marker + omtrek) */
  highlight?: boolean
}

interface TaxTimelineProps {
  items: TaxTimelineItem[]
}

/** Box → accentkleur (brief: Box 1 amber, Box 2 violet, Box 3 teal). */
const BOX_COLOR: Record<1 | 2 | 3, string> = {
  1: 'var(--color-amber-700, #b45309)',
  2: 'var(--color-violet-600, #7c3aed)',
  3: 'var(--color-teal-600, #0d9488)',
}

function colorFor(box?: 1 | 2 | 3): string {
  return box ? BOX_COLOR[box] : 'var(--ink-3)'
}

function formatDate(dateStr: string): string {
  // 'T00:00:00' voorkomt tijdzone-verschuiving bij kale datums
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function TaxTimeline({ items }: TaxTimelineProps) {
  if (items.length === 0) return null

  return (
    <div className="overflow-x-auto" role="list" aria-label="Fiscale tijdlijn">
      {/* Fade-in van de markers; reduced-motion neutraliseert hem. */}
      <style>{`
        @keyframes timeline-mark-in {
          from { opacity: 0; transform: translateY(2px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="animation: timeline-mark-in"] {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>

      <div className="flex min-w-max items-start gap-0 px-1 py-2">
        {items.map((item, i) => {
          const color = colorFor(item.box)
          const markSize = item.highlight ? 13 : 8
          const isFirst = i === 0
          const isLast = i === items.length - 1
          // Scherpe ruit (radius 0) — 45°-gedraaid vierkant.
          const markStyle: CSSProperties = {
            width: markSize,
            height: markSize,
            backgroundColor: color,
            transform: 'rotate(45deg)',
            outline: item.highlight ? `1px solid ${color}` : undefined,
            outlineOffset: item.highlight ? 2 : undefined,
            animation: `timeline-mark-in 420ms ease-out ${i * 50}ms both`,
          }

          return (
            <div
              key={`${item.date}-${i}`}
              role="listitem"
              className="flex w-32 shrink-0 flex-col items-center text-center"
            >
              {/* Connector + marker row */}
              <div className="relative flex h-5 w-full items-center justify-center">
                {/* Doorlopende haarlijn links */}
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1/2 h-px -translate-y-1/2"
                  style={{
                    width: '50%',
                    backgroundColor: isFirst ? 'transparent' : 'var(--border-ed)',
                  }}
                />
                {/* Doorlopende haarlijn rechts */}
                <span
                  aria-hidden="true"
                  className="absolute right-0 top-1/2 h-px -translate-y-1/2"
                  style={{
                    width: '50%',
                    backgroundColor: isLast ? 'transparent' : 'var(--border-ed)',
                  }}
                />
                {/* Scherpe ruit-marker, papier-omkadering zodat de lijn 'm niet raakt */}
                <span
                  className="relative z-10 block ring-2 ring-[var(--paper)]"
                  style={markStyle}
                  aria-hidden="true"
                />
              </div>

              {/* Datum — mono tabular, box-accentkleur */}
              <p
                className="mt-2.5 font-mono text-[10px] font-semibold tabular-nums tracking-[0.02em]"
                style={{ color }}
              >
                {formatDate(item.date)}
              </p>

              {/* Label */}
              <p
                className={`mt-1 px-1 text-[11px] leading-tight ${
                  item.highlight ? 'font-semibold text-[var(--ink)]' : 'font-medium text-[var(--ink-2)]'
                }`}
              >
                {item.label}
              </p>

              {/* Sublabel — mono, ondergeschikt */}
              {item.sublabel && (
                <p className="mt-0.5 px-1 font-mono text-[10px] leading-tight tabular-nums text-[var(--ink-4)]">
                  {item.sublabel}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
