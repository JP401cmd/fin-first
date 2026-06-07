import { formatCurrency } from '@/lib/format'

interface Bar {
  /** Label links van de staaf (bv. "Forfaitair", "Werkelijk rendement"). */
  label: string
  /** Numerieke waarde — bepaalt de staaflengte op de gedeelde schaal. */
  value: number
  /** Module-/box-kleur als CSS-variabele, bv. "var(--color-amber-500)". */
  colorVar: string
  /** Markeert de gunstigste optie → subtiele accent-rand. */
  isWinner?: boolean
}

interface GepaardeStavenProps {
  /** Twee of meer staven die op een gedeelde max-schaal vergeleken worden. */
  bars: Bar[]
  /** Optionele waarde-formattering (default: formatCurrency, nl-NL EUR). */
  format?: (n: number) => string
}

/**
 * Horizontale gepaarde staven voor A-vs-B(-vs-C) vergelijkingen op één
 * gedeelde max-schaal — zodat lengtes onderling vergelijkbaar zijn.
 *
 * Gebruik: forfaitair vs werkelijk rendement (Box 3, art. 3.2),
 * forfait vs aftrek (1.6), gecombineerde belastingdruk (2.1).
 *
 * Puur presentatie-component: props-gedreven, geen data-fetching,
 * server-compatible (geen hooks). Kleuren komen via `colorVar` per staaf.
 *
 * Vormgeving — Editorial Finance: scherpe staven (radius 0), het label in
 * Inter UI met een "gunstigst"-marker in italic Playfair (font-display), de
 * waarde als DM Mono tabular-num. De gunstigste staaf krijgt een platte
 * haarlijn-accentrand i.p.v. een schaduw-ring. Staven groeien in via een
 * width-keyframe (reduced-motion-safe).
 */
const PLAYFAIR = 'var(--font-display, Georgia, serif)'

export function GepaardeStaven({ bars, format = formatCurrency }: GepaardeStavenProps) {
  if (bars.length === 0) return null

  // Gedeelde schaal: alle staven delen dezelfde noemer zodat de lengtes
  // onderling vergelijkbaar zijn. Negatieve waarden worden op nul geklemd
  // voor de lengte (het cijfer rechts toont nog wel de echte waarde).
  const maxValue = Math.max(...bars.map((b) => Math.abs(b.value)), 1)

  return (
    <div
      role="img"
      aria-label={`Vergelijking: ${bars
        .map((b) => `${b.label} ${format(b.value)}${b.isWinner ? ' (gunstigst)' : ''}`)
        .join(', ')}`}
      className="flex flex-col gap-3.5"
    >
      {/* Per-instance grow-in keyframe; reduced-motion neutraliseert hem. */}
      <style>{`
        @keyframes gepaarde-grow {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="animation: gepaarde-grow"] {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>

      {bars.map((bar, i) => {
        const pct = Math.min(Math.max((Math.abs(bar.value) / maxValue) * 100, 0), 100)

        return (
          <div key={`${bar.label}-${i}`} className="flex flex-col gap-1.5">
            {/* Label-rij + waarde rechts */}
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-baseline gap-1.5 text-[11px] font-medium text-[var(--ink-2)]">
                {bar.label}
                {bar.isWinner && (
                  <span
                    className="text-[11px] italic leading-none"
                    style={{ fontFamily: PLAYFAIR, color: bar.colorVar }}
                  >
                    gunstigst
                  </span>
                )}
              </span>
              <span className="font-mono text-xs font-semibold tabular-nums text-[var(--ink)]">
                {format(bar.value)}
              </span>
            </div>

            {/* Staaf op gedeelde schaal — scherp, platte accentrand bij winner */}
            <div
              className="relative h-3 w-full overflow-hidden bg-[var(--subtle)]"
              style={
                bar.isWinner
                  ? { boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${bar.colorVar} 60%, transparent)` }
                  : undefined
              }
            >
              <div
                className="h-full origin-left"
                style={{
                  width: `${pct}%`,
                  backgroundColor: bar.colorVar,
                  opacity: bar.isWinner ? 1 : 0.72,
                  animation: `gepaarde-grow 600ms cubic-bezier(.22,1,.36,1) ${i * 70}ms both`,
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
