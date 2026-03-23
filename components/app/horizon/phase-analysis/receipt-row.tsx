'use client'

/**
 * Shared ReceiptRow component for kassabon-style receipt lines.
 * Used in phase modals (opbouw, overgang, onttrekking) for waterfall breakdowns.
 *
 * Props:
 * - label: text label (left side)
 * - value: formatted value string (right side, font-mono tabular-nums)
 * - positive: green color on value, "+ " prefix on label
 * - negative: red color on value, "− " prefix on label
 * - subtle: reduced opacity + smaller text (for sub-breakdowns)
 */
export function ReceiptRow({
  label,
  value,
  positive,
  negative,
  subtle,
}: {
  label: string
  value: string
  positive?: boolean
  negative?: boolean
  subtle?: boolean
}) {
  return (
    <div className={`flex items-baseline justify-between gap-2 py-0.5 ${subtle ? 'opacity-70' : ''}`}>
      <span className={`min-w-0 shrink font-sans ${subtle ? 'text-xs' : 'text-xs sm:text-sm'} text-[var(--ink-2)]`}>
        {positive && !negative ? '+ ' : ''}{negative ? '\u2212 ' : ''}{label}
      </span>
      <span className={`shrink-0 font-mono text-xs tabular-nums ${
        positive ? 'text-[var(--positive)]' :
        negative ? 'text-[var(--negative)]' :
        'text-[var(--ink)]'
      }`}>
        {value}
      </span>
    </div>
  )
}
