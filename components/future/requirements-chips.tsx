import type { CalculatorRequirement } from '@/lib/calculator/requirements'

/**
 * RequirementsChips — read-only chip-rij van vereisten.
 *
 * Wordt gebruikt op de bibliotheek-lijstkaart (compact, max 3 + "+N meer")
 * en eventueel op de detail-preview header (volledig). Toont alleen het
 * `label`-veld per vereiste — voor de uitgebreide uitleg + deeplinks
 * zie `<RequirementsChecklist>`.
 *
 * Pure presentatie, geen interactiviteit. Render-loos veilig als er
 * geen vereisten zijn (calculators die alleen safe-defaults gebruiken).
 */
const MAX_COMPACT = 3

export function RequirementsChips({
  requirements,
  compact = false,
}: {
  requirements: CalculatorRequirement[]
  compact?: boolean
}) {
  if (requirements.length === 0) return null

  const shown = compact ? requirements.slice(0, MAX_COMPACT) : requirements
  const overflow =
    compact && requirements.length > MAX_COMPACT
      ? requirements.length - MAX_COMPACT
      : 0

  return (
    <ul
      className="flex flex-wrap items-center gap-1.5"
      aria-label="Vereiste gegevens"
    >
      {shown.map((req) => (
        <li
          key={req.kind}
          className="inline-flex items-center rounded-full border border-[var(--border-ed)] bg-[var(--subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-2)]"
        >
          {req.label}
        </li>
      ))}
      {overflow > 0 && (
        <li className="inline-flex items-center text-[10px] font-medium text-[var(--ink-3)]">
          +{overflow} meer
        </li>
      )}
    </ul>
  )
}
