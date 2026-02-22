import type { WidgetPref } from './widget-catalog'

/**
 * Rebuild order values as 0-based sequential integers,
 * preserving the current array order.
 */
export function reassignOrders(prefs: WidgetPref[]): WidgetPref[] {
  return prefs.map((p, i) => ({ ...p, order: i }))
}

/**
 * Move widget with id `fromId` to the position of widget with id `toId`,
 * then reassign all orders sequentially.
 */
export function moveWidget(prefs: WidgetPref[], fromId: string, toId: string): WidgetPref[] {
  if (fromId === toId) return prefs

  const fromIdx = prefs.findIndex(p => p.id === fromId)
  const toIdx = prefs.findIndex(p => p.id === toId)

  if (fromIdx === -1 || toIdx === -1) return prefs

  const result = [...prefs]
  const [removed] = result.splice(fromIdx, 1)
  result.splice(toIdx, 0, removed)

  return reassignOrders(result)
}
