import { describe, it, expect } from 'vitest'
import { buildPersonaInput, DEFAULT_PARAMS } from '@/app/(app)/beheer/horizon-tabellen/persona'
import { compareEngines } from '@/lib/horizon-engine/compare'

// Fase 3: rapporteert de verschillen tussen de productie-engine en de nieuwe
// grootboek-engine. Geen gelijkheids-assertie (de modellen verschillen bewust);
// wel een sanity-check dat beide engines een resultaat leveren.

describe('engine-vergelijking oud ↔ nieuw (Fase 3)', () => {
  it('beide engines leveren een resultaat + diff-rapport', () => {
    const diff = compareEngines(buildPersonaInput(DEFAULT_PARAMS), { yearlyExpenses: DEFAULT_PARAMS.yearlyExpenses })
    // eslint-disable-next-line no-console
    console.log('FIRE oud/nieuw:', diff.fireAgeOld, '/', diff.fireAgeNew, '(Δ', diff.fireAgeDeltaYears, 'jr)')
    // eslint-disable-next-line no-console
    console.log('Benodigd oud/nieuw:', diff.requiredOld, '/', diff.requiredNew)
    // eslint-disable-next-line no-console
    console.log('Eind-netto oud/nieuw:', diff.endNetWorthOld, '/', diff.endNetWorthNew)
    // eslint-disable-next-line no-console
    console.table(diff.perAge)
    expect(diff.perAge.length).toBeGreaterThan(0)
  })
})
