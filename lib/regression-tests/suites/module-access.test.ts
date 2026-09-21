/**
 * Draait de in-app regressiesuite "Module Access" (categorie `modules`) ook
 * headless in vitest. Alle cases zijn puur (geen DB, geen netwerk), dus de
 * poort van Krant 2A — "regressiesuite module-access groen" — is hiermee in
 * `npm run test:run` meetbaar en niet alleen via /beheer/regressietest.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { clearRegistry, getTestsByCategory } from '../test-registry'
import { register } from './module-access'

describe('regressiesuite module-access', () => {
  beforeAll(() => {
    clearRegistry()
    register()
  })

  it('registreert de gedragsbehoud-cases van Krant 2A', () => {
    const ids = getTestsByCategory('modules').map((t) => t.id)
    for (const id of [
      'mod-resolve-existing-null',
      'mod-resolve-existing-all',
      'mod-resolve-existing-home',
      'mod-resolve-fail-open',
      'mod-home-news-only',
    ]) {
      expect(ids).toContain(id)
    }
  })

  it('elke case is groen', async () => {
    const tests = getTestsByCategory('modules')
    expect(tests.length).toBeGreaterThan(0)
    const failures: string[] = []
    for (const t of tests) {
      try {
        await t.fn()
      } catch (err) {
        failures.push(`${t.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    expect(failures).toEqual([])
  })
})
