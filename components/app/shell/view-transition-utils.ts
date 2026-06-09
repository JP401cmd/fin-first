/**
 * Bepaalt of een View-Transitions-fout het loggen waard is.
 *
 * `document.startViewTransition()` reject zijn `ready`/`finished`/
 * `updateCallbackDone`-promises in twee verwachte, functioneel onschadelijke
 * gevallen — de DOM-mutatie draait dan alsnog, alleen de animatie wordt
 * overgeslagen:
 *
 *  - `AbortError`        — een nieuwe transitie verving deze (snelle navigatie).
 *  - `InvalidStateError` — het document was hidden / niet-"fully active" toen de
 *    transitie startte (achtergrond-tab, mid-hydration, snelle route-wissels).
 *    Chromium skipt de transitie en reject met "Transition was aborted because
 *    of invalid state".
 *
 * Beide zijn ruis in de dev-overlay, geen echte fouten. De `instanceof Error`-
 * gate blijft bewust behouden: niet-Error-waarden werden voorheen ook niet
 * gelogd, dus die blijven stil.
 */
export function shouldLogViewTransitionError(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.name !== 'AbortError' &&
    err.name !== 'InvalidStateError'
  )
}
