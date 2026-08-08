import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  runTestSuite,
  setRoleSwitcher,
  clearRoleSwitcher,
  setInitialRunnerRole,
} from './test-runner'
import { registerCategory, registerTests, clearRegistry } from './test-registry'
import type { TestCase } from './test-types'

// ── Rolwissel-vangnet in de regressierunner ─────────────────────────────────
//
// Regressie voor WF-BEHEER-25-bug5: de runner ging stil door met de OUDE rol
// wanneer de rolwissel mislukte, en nam bovendien aan dat het testaccount
// 'user' was. Beide maakten elk `requiredRole: 'user'`-resultaat waardeloos —
// de test draaide dan als superadmin en meldde misleidend 'Gefaald' op precies
// de categorie die een echte toegangscontrole-regressie moet vangen.

const CAT = 'rolwissel.vangnet'

function makeTest(overrides: Partial<TestCase> = {}): TestCase {
  return {
    id: 'rolwissel-doelwit',
    name: 'Doelwit-test',
    description: 'Registreert of hij is uitgevoerd',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 1,
    fn: () => {},
    ...overrides,
  }
}

function runOnly(): ReturnType<typeof runTestSuite> {
  return runTestSuite({ categories: [CAT], timeoutMs: 2000 })
}

beforeEach(() => {
  clearRegistry()
  registerCategory({ id: CAT, label: 'Rolwissel', description: '', testCount: 0 })
})

afterEach(() => {
  clearRoleSwitcher()
  clearRegistry()
  vi.restoreAllMocks()
})

describe('ensureRole — hard-fail-vangnet', () => {
  it('rapporteert een mislukte rolwissel als "error", niet als "fail"', async () => {
    const body = vi.fn()
    setInitialRunnerRole('superadmin')
    setRoleSwitcher(async () => false) // wissel mislukt
    registerTests([makeTest({ requiredRole: 'user', fn: body })])

    const report = await runOnly()
    const result = report.categories[0].results[0]

    expect(result.status).toBe('error')
    expect(result.errorMessage).toContain("wisselen naar 'user'")
    // Kern van de bug: de testbody mag NIET onder de verkeerde rol draaien.
    expect(body).not.toHaveBeenCalled()
  })

  it('draait de test wél wanneer de wissel slaagt', async () => {
    const body = vi.fn()
    const switcher = vi.fn(async () => true)
    setInitialRunnerRole('superadmin')
    setRoleSwitcher(switcher)
    registerTests([makeTest({ requiredRole: 'user', fn: body })])

    const report = await runOnly()

    expect(report.categories[0].results[0].status).toBe('pass')
    expect(switcher).toHaveBeenCalledWith('user')
    expect(body).toHaveBeenCalled()
  })

  it('een echte assertion-failure blijft "fail" (geen severity-inflatie)', async () => {
    setInitialRunnerRole('user')
    setRoleSwitcher(async () => true)
    registerTests([
      makeTest({
        requiredRole: 'user',
        fn: () => {
          throw new Error('verwachtte redirect, kreeg 200')
        },
      }),
    ])

    const report = await runOnly()
    expect(report.categories[0].results[0].status).toBe('fail')
  })
})

describe('setInitialRunnerRole — geverifieerde beginstand', () => {
  it('wisselt naar "user" wanneer het account in werkelijkheid superadmin is', async () => {
    const switcher = vi.fn(async () => true)
    setInitialRunnerRole('superadmin') // wat de server-runner uit de DB las
    setRoleSwitcher(switcher)
    registerTests([makeTest({ requiredRole: 'user' })])

    await runOnly()

    // Dit is de regressie: met de oude hardcoded aanname 'user' zou
    // ensureRole() short-circuiten en nooit wisselen.
    expect(switcher).toHaveBeenCalledWith('user')
  })

  it('wisselt niet als de beginstand de doelrol al is', async () => {
    const switcher = vi.fn(async () => true)
    setInitialRunnerRole('user')
    setRoleSwitcher(switcher)
    registerTests([makeTest({ requiredRole: 'user' })])

    await runOnly()

    expect(switcher).not.toHaveBeenCalled()
  })
})
