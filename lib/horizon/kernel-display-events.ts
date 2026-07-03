/**
 * Kernel-tak weergave-events (pure).
 *
 * Op de kernel-tak (`horizon_kernel_convergentie`) deelt de gebruiker één set
 * `effectiveLifeEvents` met de tijdlijn, de chart-markers en de EventPane. De
 * server levert echter VIRTUELE woning-verkoop-events (`resolveHousingEventsForSim`,
 * lib/horizon-data-loader.ts) die op een **v2-meetrun** zijn geresolved — hun
 * `target_age` (bv. een on_depletion-trigger rond 89j) is op de kernel-tak STALE:
 * de kernel verkoopt de woning op een eigen moment (`kernelHousingSale`, uit
 * lib/horizon-kernel/bridge.ts).
 *
 * Deze helper vervangt — alléén op de kernel-tak — het stale server-virtuele
 * VERKOOP-event door één kernel-afgeleid verkoop-event op de kernel-waarheid, zodat
 * de marker/tijdlijn het echte verkoopmoment tonen. De opeethypotheek-variant
 * (`event_type: 'opeethypotheek'`) is bewust GEEN verkoop en blijft ongemoeid;
 * echte gebruikers-events worden nooit aangeraakt.
 *
 * Bekende beperking (bewust): `kernelHousingSale` draagt alleen de EERSTE
 * verkoopmaand (`bridge.ts` breekt op de eerste `verkoopopbrengst > 0`) en deze
 * helper emit dus één marker. Meerdere `eigen_huis`-liquidaties op verschillende
 * momenten collapsen naar de eerste — acceptabel zolang de kernel het eigen huis
 * als één geaggregeerd woning-slot modelleert.
 *
 * Pure functie — geen React/Supabase/Date.now.
 */

import type { LifeEvent } from '@/lib/horizon-data'
import type { KernelHousingSale } from '@/lib/horizon-kernel/bridge'
import {
  isHousingStrategyEvent,
  HOUSING_STRATEGY_EVENT_ID_PREFIX,
  HOUSING_STRATEGY_EVENT_SOURCE,
} from '@/lib/housing-strategy'

/**
 * True voor een VIRTUEEL woning-verkoop-event (downsize). Alleen deze events zijn
 * op de kernel-tak stale; de virtuele opeethypotheek (`event_type 'opeethypotheek'`)
 * en alle echte gebruikers-events vallen er bewust buiten.
 */
export function isVirtualHousingSaleEvent(ev: { id: string; event_type: string }): boolean {
  return isHousingStrategyEvent(ev) && ev.event_type === 'verkoop_eigen_woning'
}

/**
 * Vervang op de kernel-tak het stale server-virtuele verkoop-event door één
 * kernel-afgeleid verkoop-event op `kernelHousingSale.age`.
 *
 * @param events            de gededupliceerde app-events (incl. de v2-server-virtuele).
 * @param kernelHousingSale het kernel-verkoopmoment, of `null` (geen verkoop binnen horizon).
 * @returns nieuwe event-array: virtuele verkoop-events gestript, en (bij een verkoop)
 *          één kernel-afgeleid verkoop-event toegevoegd. Bij `null` blijven de
 *          overige events over (geen verkoop → geen verkoop-marker).
 */
export function applyKernelHousingSaleToEvents(
  events: readonly LifeEvent[],
  kernelHousingSale: KernelHousingSale | null,
): LifeEvent[] {
  // Bewaar het stale server-event als sjabloon (behoudt icoon/copy/breakdown-
  // metadata); strip vervolgens alle virtuele verkoop-events uit de set.
  const template = events.find(isVirtualHousingSaleEvent) ?? null
  const stripped = events.filter((ev) => !isVirtualHousingSaleEvent(ev))

  // Geen kernel-verkoop binnen de horizon → geen verkoop-marker.
  if (kernelHousingSale === null) return stripped

  const age = kernelHousingSale.age
  const kernelSaleEvent: LifeEvent = template
    ? {
        // Zelfde event-vorm/copy als het server-event, maar op de KERNEL-waarheid
        // (leeftijd + netto-opbrengst) zodat tijdlijn/markers/EventPane kloppen.
        ...template,
        target_age: age,
        target_date: null,
        metadata: {
          ...(template.metadata ?? {}),
          saleProceeds: kernelHousingSale.proceeds,
          kernelDerived: true,
        },
      }
    : {
        // Kernel verkocht, maar de v2-meetrun leverde geen server-event (bv.
        // on_depletion die op v2 nooit afgaat) — bouw een minimaal verkoop-event.
        id: `${HOUSING_STRATEGY_EVENT_ID_PREFIX}downsize`,
        name: 'Verkoop eigen woning',
        event_type: 'verkoop_eigen_woning',
        target_age: age,
        target_date: null,
        one_time_cost: 0,
        monthly_cost_change: 0,
        monthly_income_change: 0,
        duration_months: 0,
        icon: 'Home',
        is_active: true,
        sort_order: 1000,
        is_indexed: false,
        metadata: {
          source: HOUSING_STRATEGY_EVENT_SOURCE,
          strategy: 'downsize',
          saleProceeds: kernelHousingSale.proceeds,
          kernelDerived: true,
        },
      }

  return [...stripped, kernelSaleEvent]
}
