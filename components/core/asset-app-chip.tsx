'use client'

interface AssetAppChipProps {
  /** Of dit specifieke item door de app wordt gevolgd. */
  tracked: boolean
  /** App-label, sentence case (bv. "Budgetteren", "Holdings"). */
  appLabel: string
  /** Module-status — bij `false` rendert de chip niets. */
  moduleActive: boolean
}

/**
 * Subtiele read-only status-indicator op een asset-card.
 *
 * Twee zichtbare states wanneer de module aan staat:
 * - **Gekoppeld**: gevulde kern-700 stip + lowercase `in {appLabel}` in
 *   `text-kern-700`.
 * - **Niet gekoppeld**: open ink-4 border-stip + lowercase `niet in
 *   {appLabel}` in `text-[var(--ink-4)]` — ingehouden, maar zichtbaar
 *   zodat de gebruiker per item snel kan scannen welke items wél/niet
 *   meedoen.
 *
 * Stille off-state: als de module zelf uit staat rendert de chip niets —
 * een lijst met enkel "niet in {app}"-tekens zou ruis zijn. De
 * categorie-strip vertelt dan al dat de app uit is.
 *
 * Aanpassen van de tracking-status gebeurt **uitsluitend** in de detail-sheet
 * (`<AssetDetailSheet>`) met begeleidende uitleg en bevestigingsdialoog.
 */
export function AssetAppChip({
  tracked,
  appLabel,
  moduleActive,
}: AssetAppChipProps) {
  if (!moduleActive) return null

  if (!tracked) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-[var(--ink-4)]">
        <span
          className="block h-1.5 w-1.5 shrink-0 rounded-full border border-[var(--ink-4)]"
          aria-hidden="true"
        />
        <span>niet in {appLabel.toLowerCase()}</span>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-kern-700">
      <span
        className="block h-1.5 w-1.5 shrink-0 rounded-full bg-kern-700"
        aria-hidden="true"
      />
      <span>in {appLabel.toLowerCase()}</span>
    </span>
  )
}
