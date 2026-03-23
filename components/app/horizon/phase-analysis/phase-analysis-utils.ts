/**
 * Shared utility helpers for phase analysis components.
 */

/** Tailwind text-color class based on Monte Carlo success rate. */
export function successColor(rate: number): string {
  if (rate >= 0.85) return 'text-[var(--positive)]'
  if (rate >= 0.65) return 'text-amber-600'
  return 'text-[var(--negative)]'
}

/** Tailwind background-color class based on Monte Carlo success rate. */
export function successBgColor(rate: number): string {
  if (rate >= 0.85) return 'bg-[var(--positive)]/10'
  if (rate >= 0.65) return 'bg-amber-600/10'
  return 'bg-[var(--negative)]/10'
}
