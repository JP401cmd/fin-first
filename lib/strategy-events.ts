/**
 * strategy-events — herkent welke levensgebeurtenissen door een multi-step
 * strategie worden beheerd. Generaliseert het housing-specifieke
 * `isHousingStrategyEvent` zodat de gebeurtenissen-lijst en de tijdas een
 * beheerd event naar de juiste strategie-modal kunnen routeren i.p.v. naar
 * het generieke bewerk-formulier.
 */

import { isHousingStrategyEvent } from '@/lib/housing-strategy'

export type ManagedStrategy = 'aow' | 'pensioen' | 'huis'

/**
 * Welke strategie (indien aanwezig) beheert dit event.
 * `null` = vrij bewerkbaar via EventBewerkenSheet.
 *
 * Huis-events zijn virtueel (id-prefix 'housing-strategy:'); AOW en Pensioen
 * zijn echte life_events-rijen, herkenbaar aan hun event_type.
 */
export function isStrategyManagedEvent(
  event: { id: string; event_type: string },
): ManagedStrategy | null {
  if (isHousingStrategyEvent(event)) return 'huis'
  if (event.event_type === 'aow') return 'aow'
  if (event.event_type === 'pension') return 'pensioen'
  return null
}

export const STRATEGY_BADGE_LABEL: Record<ManagedStrategy, string> = {
  aow: 'Beheerd via AOW-strategie',
  pensioen: 'Beheerd via Pensioen-strategie',
  huis: 'Beheerd via Eigen-woning-strategie',
}
