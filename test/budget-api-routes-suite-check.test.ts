/**
 * CI-bewaking van de in-app regressie-suite voor Budget API routes
 * (lib/regression-tests/suites/budget-api-routes.ts): DELETE /api/budgets/[id]
 * (archiveren, WF-BUDGET-11), PUT /api/budgets/favorites, GET /api/budget-trends,
 * GET /api/budget-variance, GET /api/cashflow-forecast.
 *
 * BEVINDING (deels opgelost 2026-07, rest bewust nog open):
 * - DELETE-sectie (A) beweerde eerder een hard-delete-cascade met
 *   rollovers_deleted/amounts_deleted/transactions_unlinked. Dat bestaat
 *   niet: de route is een niet-destructieve ARCHIVERING (alleen
 *   `budgets.is_archived`), zoals app/api/budgets/[id]/route.ts's eigen
 *   JSDoc stelt. De cases zijn gecorrigeerd naar de echte response-vorm; de
 *   authoritatieve gedragstoets (met vi.mock op Supabase) staat in
 *   app/api/budgets/[id]/route.test.ts — hier niet dupliceerbaar (zie
 *   onder).
 * - Variance-sectie (D, confidence-mapping + statistiek) en de forecast-
 *   frequency-case (E) roepen nu de ECHTE gedeelde motoren aan
 *   (@/lib/budget-forecast#computeBudgetForecast,
 *   @/lib/cashflow-forecast-math#recurringPerMonth) i.p.v. de formules lokaal
 *   te herimplementeren. Zie de comments bij die cases voor twee losse
 *   BEVINDINGEN: (1) computeBudgetForecast kent geen 'insufficient'-label
 *   (de route-eigen 4-waardige confidence-enum divergeert bewust), en
 *   (2) app/api/cashflow-forecast/route.ts herimplementeert de frequency→
 *   maand-formule LOKAAL i.p.v. recurringPerMonth te importeren — twee
 *   onafhankelijke kopieën die vandaag toevallig identiek zijn (drift-risico,
 *   niet hier gefixt: productiecode).
 * - Resterende cases (B: favorites, C: trends-aggregatie, D-summary, de
 *   overige E-forecast-cases, F: auth-guard) hebben GEEN losstaande, pure,
 *   geëxporteerde lib-functie om naar te tillen — de logica staat inline in
 *   het route-bestand. Route-handlers zelf zijn hier niet aanroepbaar: deze
 *   suite draait ook in de browser (/beheer/regressietest) en mag dus geen
 *   `vitest`/`vi.mock`/`next/server` importeren, en zonder module-mocking is
 *   `createClient()` niet te stubben. Die cases blijven lokale
 *   contract-/shape-mirrors; een echte contract-toets tegen die routes (via
 *   een los *.test.ts-bestand per route, zoals route.test.ts hierboven) is
 *   een aparte follow-up.
 *
 * Alle 22 cases zijn synchrone, netwerkloze functies — niets om over te
 * slaan.
 */
import { describe, it, expect } from 'vitest'
import { register } from '@/lib/regression-tests/suites/budget-api-routes'
import { getTestsByCategory, clearRegistry } from '@/lib/regression-tests/test-registry'

describe('budget-api-routes regressie-suite (kern.budgets-api)', () => {
  it('alle geregistreerde cases slagen', async () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('kern.budgets-api')

    // Vergrendel het aantal: een stille wijziging (test verwijderd/vergeten
    // te registreren) moet hier zichtbaar worden, niet pas op de beheerpagina.
    expect(tests.length).toBe(22)

    for (const t of tests) {
      await expect(
        Promise.resolve().then(() => t.fn()),
        `test "${t.id}" (${t.name})`,
      ).resolves.not.toThrow()
    }
  })
})
