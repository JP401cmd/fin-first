/**
 * CI-bewaking van de in-app regressie-suite voor Budget CRUD
 * (lib/regression-tests/suites/kern-budget-crud.ts): aanmaken/bewerken/
 * verwijderen van budgetten, formuliervalidatie en categorie-koppeling
 * (budget↔transactie).
 *
 * Voert alle NIET-netwerk suite-tests ook onder vitest uit, zodat een
 * regressie in @/lib/budget-data (BUDGET_SLUGS, budgetOptionLabel,
 * buildBudgetSelectEntries) en @/lib/parsers/categorize
 * (categorizeTransaction) al bij `npm run test:run` rood wordt — niet pas
 * op /beheer/regressietest.
 *
 * De 2 tests die echte HTTP-aanroepen doen (via unauthenticatedFetch naar
 * DELETE/GET /api/budgets/[id]) worden overgeslagen: die zijn niet
 * deterministisch in CI zonder een lopende server.
 */
import { describe, it, expect } from 'vitest'
import { register } from '@/lib/regression-tests/suites/kern-budget-crud'
import { getTestsByCategory, clearRegistry } from '@/lib/regression-tests/test-registry'

const NETWORK_TEST_IDS = new Set([
  'budget-crud-delete-auth-guard',
  'budget-crud-get-auth-guard',
])

describe('kern-budget-crud regressie-suite (zonder netwerk)', () => {
  it('alle statische suite-tests slagen', async () => {
    clearRegistry()
    register()
    const tests = getTestsByCategory('kern.budget-crud')

    // 31 tests geregistreerd; 2 zijn netwerk-only (overgeslagen in vitest CI)
    expect(tests.length).toBe(31)

    const staticTests = tests.filter(t => !NETWORK_TEST_IDS.has(t.id))
    expect(staticTests.length).toBe(29)

    for (const t of staticTests) {
      await expect(
        Promise.resolve().then(() => t.fn()),
        `test "${t.id}" (${t.name})`,
      ).resolves.not.toThrow()
    }
  })
})
