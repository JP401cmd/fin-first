// Stopwatch voor de server-opsplitsing van de (app)-layout (Snelheid 0).
// Staat buiten de component zodat de layout zelf puur blijft (react-hooks/
// purity + globals): de klok en de module-level cold-start-vlag wonen hier.
// Puur lokale performance.now()-markers — geen extra query, geen I/O.

import type { LayoutServerTimings } from './server-timing'

// De eerste layout-render op een verse serverinstantie is de cold start; daarna
// blijft de vlag staan zolang de instantie leeft. Alleen een boolean, gedeeld
// tussen requests — niets gebruikersgebonden.
let serverInstanceWarm = false

type Mark = 'auth' | 'batch' | 'leverStart' | 'lever' | 'guideStart' | 'guide'

export function startLayoutTimer() {
  const cold = !serverInstanceWarm
  serverInstanceWarm = true
  const t0 = performance.now()
  const marks: Partial<Record<Mark, number>> = {}

  return {
    mark(name: Mark) {
      marks[name] = performance.now()
    },
    /**
     * De stappen uit de diagnose; wat ertussen zit telt alleen mee in het totaal.
     * Sinds Snelheid B1 lopen lever en guide PARALLEL aan de batch: hun waarde is
     * de eigen duur van die stap (start → oplossen), niet meer een sequentieel
     * blok. De stappen tellen dus niet op tot `totalMs`; de winst staat in het totaal.
     */
    finish(): LayoutServerTimings {
      const at = (m: Mark) => marks[m] ?? t0
      return {
        authMs: at('auth') - t0,
        batchMs: at('batch') - at('auth'),
        leverMs: at('lever') - at('leverStart'),
        guideMs: at('guide') - at('guideStart'),
        totalMs: performance.now() - t0,
        cold,
        renderedAt: Date.now(),
      }
    },
  }
}
