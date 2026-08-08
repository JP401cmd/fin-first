/**
 * Gedeelde engine-checks voor de UAT-Beheer-acceptatiecriteria (`beheer.ts`).
 *
 * PURE module — geen vitest/DOM/Supabase-afhankelijkheden — zodat dezelfde lijst
 * checks kan draaien onder `beheer.engine.test.ts` (vitest/CI) én de in-app
 * regressiesuite (`lib/regression-tests/suites/uat-beheer.ts`).
 *
 * BEHEER is een admin-tooling-zone ZONDER rekenkern: er zijn **geen 'exact'-
 * criteria** (0). De 36 criteria zijn 13 × `consistency` (een getal komt aantoonbaar
 * uit een andere bron — bv. de architectuur-plaat-tellingen uit architecture.json,
 * de KPI-counts, de UAT-plaat-aggregatie), 2 × `oracle` (horizon-strategie/-kernel,
 * verifieerbaar via hun eigen transparantie-UI) en 21 × `ui-only`. Geen van die
 * kinds levert een deterministisch, in een pure vitest herleidbaar cijfer, dus deze
 * lijst is bewust **leeg** — de verificatie gebeurt live (Chrome DevTools) resp. via
 * de oracle-UI's, niet in de engine-suite. Zie `beheer.engine.test.ts` voor de
 * dekkings- en kind-borging.
 */

export interface BeheerEngineCheck {
  /** 'WF-BEHEER-NN' */
  workflow: string
  /** 'UAT-BEHEER-NN' */
  scenarioId: string
  /** Korte, mensleesbare omschrijving van wat deze check bewijst. */
  label: string
  /** Roept de échte rekenfunctie(s)/constante(n) aan en levert expected + actual. */
  run: () => { expected: number | string; actual: number | string }
}

// BEHEER = admin-tooling zonder rekenkern → geen exact-checks (bewust leeg).
export const BEHEER_ENGINE_CHECKS: BeheerEngineCheck[] = []
