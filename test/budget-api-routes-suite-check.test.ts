/**
 * CI-bewaking van de in-app regressie-suite voor Budget API routes
 * (lib/regression-tests/suites/budget-api-routes.ts): DELETE /api/budgets/[id]
 * cascade, PUT /api/budgets/favorites, GET /api/budget-trends,
 * GET /api/budget-variance, GET /api/cashflow-forecast.
 *
 * BEVINDING (niet hier opgelost): op @/lib/month-range#localMonthBounds na
 * importeert deze suite GEEN productiecode — de cascade-/trends-/variance-/
 * forecast-logica staat volledig lokaal in het testbestand nagebouwd en
 * wordt tegen zichzelf getoetst. Deze wrapper vergrendelt dus het huidige
 * (gedocumenteerde) gedrag van de suite tegen per-ongeluk-wijzigen, maar
 * bewaakt NIET dat app/api/budgets/**, /api/budget-trends,
 * /api/budget-variance of /api/cashflow-forecast dat gedrag ook echt
 * leveren. Een echte contract-toets tegen die routes is een aparte
 * follow-up (buiten de scope van dit CI-gat).
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
