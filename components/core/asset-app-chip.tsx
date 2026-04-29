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
 * Toont uitsluitend een teken **wanneer een item gekoppeld is**: een kleine
 * kern-700 stip plus een lowercase label `in budgetteren` / `in holdings`.
 * Geen achtergrond, geen border, geen uppercase — afwezigheid van de
 * indicator is impliciet "niet gekoppeld" en hoeft geen eigen label.
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
  if (!tracked) return null

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
