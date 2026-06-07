/**
 * Box3SectionHeader — gedeelde editorial sectiekop voor de Box 3-deelschermen.
 *
 * Eén consistente kop voor elke Box 3-sectie (opbouw, heffingsvrij, mix,
 * tegenbewijs, partner, peildatum, stelsel-2028): een 28×1px teal box-streep
 * + UPPERCASE DM-Mono kicker links, met optioneel een romeins sectienummer
 * rechts (Playfair, italic, teal) — net als `SectionLabel`/`RomanSection` uit
 * de editorial-bibliotheek, maar met de Box 3-accent (teal) hardgezet i.p.v.
 * de cross-module-fallback, zodat de box-identiteit klopt op de belasting-hub.
 *
 * Server-compatible (geen hooks/state). Box-accent functioneel: teal #0d9488
 * onderscheidt Box 3 van Box 1 (amber) en Box 2 (violet) — verder grijswaarden.
 */

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const TEAL_500 = 'var(--color-teal-500)'
const TEAL_700 = 'var(--color-teal-700)'

export function Box3SectionHeader({
  children,
  num,
  className = '',
}: {
  /** UPPERCASE kicker-tekst (sectie-titel). */
  children: React.ReactNode
  /** Optioneel romeins/decimaal sectienummer rechts (bv. "3.1"). */
  num?: string
  className?: string
}) {
  return (
    <div
      className={`mb-4 flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] pb-2 ${className}`}
    >
      <span className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.20em] text-[var(--color-teal-700,#0f766e)]">
        <span
          aria-hidden
          className="inline-block h-px w-7 shrink-0"
          style={{ background: TEAL_500 }}
        />
        {children}
      </span>
      {num && (
        <span
          className="italic text-sm tabular-nums"
          style={{ fontFamily: PLAYFAIR, color: TEAL_700 }}
        >
          {num}
        </span>
      )}
    </div>
  )
}
