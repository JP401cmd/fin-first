/**
 * Kan de ene EventPane van /toekomst renderen? (ADR 0179 fase 6, spec §4.2 regel 8)
 *
 * De overlay-host mount de pane alleen als de kern-invoer er is. De gebeurtenissenlijst
 * onder het plan delegeert naar die pane (`openEventPane`) — maar alleen als hij ook echt
 * rendert; anders zou "Toevoegen" een dode knop zijn en valt de lijst terug op zijn eigen
 * pane. Eén voorwaarde, twee lezers: de host (`toekomst-overlays.tsx`) en de lijst
 * (`gebeurtenissen-view.tsx`) lezen allebei deze functie, zodat ze nooit uit elkaar lopen
 * en er nooit twee panes tegelijk staan.
 *
 * Pure module, geen React.
 */

export interface EventPaneInvoer<I, P, S, W> {
  input: I | null | undefined
  fireParams: P | null | undefined
  fireStrategy: S | null | undefined
  withdrawalStrategyConfig: W | null | undefined
}

/** De vernauwde invoer van de host-pane, of `null` als hij niet kan renderen. */
export function eventPaneBron<I, P, S, W>(
  invoer: EventPaneInvoer<I, P, S, W>,
): { input: I; fireParams: P; fireStrategy: S; withdrawalStrategyConfig: W } | null {
  const { input, fireParams, fireStrategy, withdrawalStrategyConfig } = invoer
  if (input == null || fireParams == null || fireStrategy == null || withdrawalStrategyConfig == null) return null
  return { input, fireParams, fireStrategy, withdrawalStrategyConfig }
}

/**
 * Rendert de host-pane? De overlay-host rendert niets zonder `fire` (hij geeft dan `null`
 * terug), dus die telt hier mee. `null` = buiten de provider.
 */
export function eventPaneBeschikbaar(
  sim: (EventPaneInvoer<unknown, unknown, unknown, unknown> & { fire: unknown }) | null,
): boolean {
  return sim != null && sim.fire != null && eventPaneBron(sim) != null
}
