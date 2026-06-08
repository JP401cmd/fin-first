/**
 * Box3SectionHeader — gedeelde editorial sectiekop voor de Box 3-deelschermen.
 *
 * Eén consistente kop voor elke Box 3-sectie (opbouw, heffingsvrij, mix,
 * tegenbewijs, partner, peildatum, stelsel-2028): een 28×1px box-accent-streep
 * + UPPERCASE DM-Mono kicker links, met optioneel een romeins sectienummer
 * rechts (Playfair, italic, accent) — net als `SectionLabel`/`RomanSection` uit
 * de editorial-bibliotheek, met de box-accent uit de actieve module-context.
 *
 * Server-compatible (geen hooks/state). Box-accent functioneel via
 * `--module-active-*` (de box-layout zet de teal-ramp voor Box 3) — zo
 * onderscheidt Box 3 zich van Box 1 (amber) en Box 2 (violet) zonder hardcoded
 * hex; verder grijswaarden.
 */

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
// Box-accent via de actieve module-context (de box-layout zet --module-active-*).
// Geen hardcoded teal meer, zodat de kop dezelfde box-kleur volgt als de hub.
const ACCENT_500 = 'var(--module-active-500)'
const ACCENT_700 = 'var(--module-active-700)'

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
      <span
        className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.20em]"
        style={{ color: ACCENT_700 }}
      >
        <span
          aria-hidden
          className="inline-block h-px w-7 shrink-0"
          style={{ background: ACCENT_500 }}
        />
        {children}
      </span>
      {num && (
        <span
          className="italic text-sm tabular-nums"
          style={{ fontFamily: PLAYFAIR, color: ACCENT_700 }}
        >
          {num}
        </span>
      )}
    </div>
  )
}
