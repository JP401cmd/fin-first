/**
 * Gedeelde status-semantiek voor hefboom-stijl kaarten (HefbomenNav op
 * /overzicht én CashflowLandingCards op /overzicht/budget).
 *
 * Pure module (géén 'use client') zodat zowel server-components (die de
 * status afleiden uit data) als client-components (die hem renderen) deze
 * helpers kunnen importeren. De stoplicht-kleuren (emerald/amber/red) zijn
 * bewust hardcoded Tailwind-palette — dit is status-semantiek (op koers /
 * aandacht / risico), géén module-accent, en moet 1-op-1 matchen met de
 * vier-hefbomen-rij en het lever-kompas.
 */

export type LeverageStatus = 'good' | 'warn' | 'bad' | 'neutral'

/** Achtergrond-kleur van de status-dot rechtsboven op de kaart. */
export const LEVERAGE_STATUS_DOT: Record<LeverageStatus, string> = {
  good: 'bg-emerald-500',
  warn: 'bg-amber-500',
  bad: 'bg-red-500',
  neutral: 'bg-stone-300',
}

/** Tooltip-label bij de status-dot. */
export const LEVERAGE_STATUS_LABEL: Record<LeverageStatus, string> = {
  good: 'Goed op koers',
  warn: 'Aandacht',
  bad: 'Risico',
  neutral: 'Geen score',
}

/**
 * Score → status. Drempels identiek aan de financial-health pillars
 * (>=70 goed, >=50 aandacht, anders risico; null = neutraal).
 */
export function pillarStatus(score: number | null | undefined): LeverageStatus {
  if (score == null) return 'neutral'
  if (score >= 70) return 'good'
  if (score >= 50) return 'warn'
  return 'bad'
}

/** Tekst-kleur voor status-substext en drill-down-tekst. */
export function leverageStatusTextClass(status: LeverageStatus): string {
  return status === 'good'
    ? 'text-emerald-700'
    : status === 'warn'
      ? 'text-amber-700'
      : status === 'bad'
        ? 'text-red-700'
        : 'text-[var(--ink-3)]'
}

/** Achtergrond-tint voor het uitklap-paneel onder een kaart. */
export function leverageStatusBgClass(status: LeverageStatus): string {
  return status === 'good'
    ? 'bg-emerald-50/50'
    : status === 'warn'
      ? 'bg-amber-50/50'
      : status === 'bad'
        ? 'bg-red-50/50'
        : 'bg-[var(--subtle)]'
}
