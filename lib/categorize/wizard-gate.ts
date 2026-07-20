/**
 * Prefetch-gate voor de "Vraag Fin"-wizard.
 *
 * De categorisatie-motor (`runCombinedCategorization`) roept vóór elke AI-ronde
 * de `onBeforeRound`-hook aan. Deze gate koppelt dat aan de wizard-presentatie:
 * de motor mag vooruit prefetchen tot een venster (`window`) rondes vóór de
 * ronde die de gebruiker nu getoond krijgt. Zo staat er altijd een paar rondes
 * aan voorstellen klaar zonder de hele batch vooruit te draaien (en zonder de
 * gebruiker te laten wachten op een ronde die nog niet zichtbaar is).
 *
 * Semantiek:
 *  - De motor roept `onBeforeRound` vóór AI-ronde R (1-based; de gate telt zelf:
 *    de eerste aanroep is ronde 1, de tweede ronde 2, enz.).
 *  - De teruggegeven promise resolvet zodra `R <= shownRound + window`
 *    (`shownRound` start op 0). Bij `window = 2` mogen rondes 1 en 2 dus meteen
 *    door; ronde 3 wacht tot de wizard `releaseUpTo(1)` (of hoger) heeft gemeld.
 *  - `releaseUpTo(n)` zet `shownRound = max(huidig, n)` en resolvet alle
 *    wachtenden die daardoor toegestaan zijn.
 *  - `abort()` resolvet ALLE wachtenden onmiddellijk; de motor breekt daarna zelf
 *    af op zijn eigen `signal`-hercheck (de gate stopt de motor niet, hij laat
 *    'm enkel niet langer wachten).
 *
 * Puur: geen timers, geen React, geen externe dependencies.
 */

/**
 * Vensterbreedte voor het lokale (on-device) pad: de motor mag zoveel AI-rondes
 * vooruit prefetchen op de ronde die de wizard nu toont. Eén benoemde bron zodat
 * de sheet niet met een kaal getal `createPrefetchGate(2)` werkt.
 *
 * INVARIANT onder de gate-wiskunde: de motor draait per AI-ronde precies
 * `batchSize` groepen, en de sheet zet `batchSize === LOCAL_REP_BATCH_SIZE`
 * (de wizard-`repBatchSize`). De gate rekent rondes ↔ getoonde groepen om via
 * dat gelijke getal; wijkt één van beide af, dan klopt `releaseUpTo` niet meer.
 */
export const LOCAL_PREFETCH_WINDOW = 2

/** Handvat waarmee de wizard de motor-prefetch tegen de getoonde ronde afremt. */
export type PrefetchGate = {
  /** Aan de motor gegeven als `onBeforeRound`. Telt intern de ronde (1-based). */
  onBeforeRound: () => Promise<void>
  /**
   * Meld dat de wizard tot en met AI-ronde `shownRound` heeft getoond. Verhoogt
   * de drempel (nooit verlagen) en laat alle nu-toegestane rondes doorlopen.
   */
  releaseUpTo: (shownRound: number) => void
  /** Laat alle wachtende rondes onmiddellijk door (de motor stopt zelf op signal). */
  abort: () => void
}

/**
 * Maak een prefetch-gate met venstergrootte `window`: de motor mag `window`
 * rondes vooruit prefetchen op de ronde die de wizard nu toont.
 */
export function createPrefetchGate(window: number): PrefetchGate {
  let shownRound = 0
  let round = 0
  let aborted = false
  // Wachtenden: elk met de ronde waarop ze wachten en hun resolve-functie.
  let waiters: { round: number; resolve: () => void }[] = []

  const allowed = (r: number) => aborted || r <= shownRound + window

  return {
    onBeforeRound: () => {
      round += 1
      const r = round
      if (allowed(r)) return Promise.resolve()
      return new Promise<void>((resolve) => {
        waiters.push({ round: r, resolve })
      })
    },

    releaseUpTo: (n: number) => {
      if (n > shownRound) shownRound = n
      // Resolve + verwijder alle wachtenden die nu binnen het venster vallen.
      const stillWaiting: typeof waiters = []
      for (const w of waiters) {
        if (allowed(w.round)) w.resolve()
        else stillWaiting.push(w)
      }
      waiters = stillWaiting
    },

    abort: () => {
      aborted = true
      for (const w of waiters) w.resolve()
      waiters = []
    },
  }
}
