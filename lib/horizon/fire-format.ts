/**
 * Horizon — leeftijd- & FIRE-formatteringshelpers (neutrale module, geen interne deps).
 * Pure functions. Onderdeel van de horizon-data-split (pure move, geen gedragswijziging).
 */

export function ageAtDate(dob: string, date: Date = new Date()): number {
  const birth = new Date(dob)
  let age = date.getFullYear() - birth.getFullYear()
  const m = date.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && date.getDate() < birth.getDate())) age--
  return age
}

export function formatFireAge(age: number | null): string {
  if (age === null) return '—'
  const years = Math.floor(age)
  const months = Math.round((age - years) * 12)
  return months > 0 ? `${years} jaar en ${months} mnd` : `${years} jaar`
}

export function formatFireAgeShort(age: number | null): string {
  if (age === null) return '—'
  return `${Math.floor(age)} jaar`
}

export function formatFireAgeDelta(delta: number): string {
  return `${delta < 0 ? '' : '+'}${delta.toFixed(1)} jaar`
}

export function formatCountdown(days: number): string {
  if (days <= 0) return 'Bereikt!'
  const years = Math.floor(days / 365)
  const remaining = days % 365
  const months = Math.floor(remaining / 30)
  if (years > 0 && months > 0) return `${years}j ${months}mnd`
  if (years > 0) return `${years}j`
  return `${months}mnd`
}

/**
 * Leeftijd als één decimaal met komma, hele getallen zonder decimaal: `45`, `58,5`, `—`.
 * Verhuisd uit `components/app/horizon/vrijheidsas.tsx` (ADR 0170: dat component verviel met
 * de marge-band), zodat de grafiek-as, de knoppen en de doel-teksten één formatter delen.
 */
export function formatAge(v: number | null): string {
  if (v === null) return '—'
  const rounded = Math.round(v * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',')
}
