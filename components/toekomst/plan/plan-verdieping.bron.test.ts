/**
 * Bron-grendels op de Plan-verdieping (fase 1, ADR 0179, kaart §5.1):
 * - ADR 0168 / V10: de Huishoud-FIRE-sectie blijft op Plan gemount, alleen in Volledig.
 * - De preset-gate verhuisde in fase 4 met de scenario-kaarten naar katern Doelen
 *   (`components/toekomst/doelen/andere-paden.bron.test.ts` — één invariant, één bestand).
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const source = readSourceLF(join(process.cwd(), 'components', 'toekomst', 'plan', 'plan-verdieping.tsx'))

describe('plan-verdieping — de scenario-kaarten wonen in Doelen (ADR 0179 fase 4)', () => {
  it('rendert geen strook, radar, verloop, geplande acties of scenario-kaarten meer, en observeert niets', () => {
    for (const weg of ['<LevensinkomenStrook', '<Dekkingsradar', '<HorizonTrendGrid', '<ActionCard', '<ScenarioChip', 'Geplande acties', '<ScenarioKaarten', 'useInViewOnce', 'onDuidingInView']) {
      expect(source, weg).not.toContain(weg)
    }
  })
})

describe('plan-verdieping — Huishoud-FIRE blijft op Plan (ADR 0168)', () => {
  it('rendert HouseholdFireSection binnen HideInSimple met de persoonlijke projectie', () => {
    expect(source).toMatch(/<HideInSimple>\s*<HouseholdFireSection personalProjection=\{personalHeroProjection\} \/>\s*<\/HideInSimple>/)
  })
})
