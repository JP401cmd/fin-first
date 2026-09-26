/**
 * Bron-grendels op de Plan-verdieping (blok Q–T) na de verhuizing naar
 * `plan-verdieping.tsx` (fase 1, ADR 0179, kaart §5.1 en valkuil V1):
 * - vrij-mogelijk-vanaf (gate-deel): de zichtbaarheidshook observeert de duiding-
 *   sectie in dít paneel en meldt de uitkomst aan de ouder, die hem latcht
 * - ADR 0168 / V10: de Huishoud-FIRE-sectie blijft op Plan gemount, alleen in Volledig
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const source = readSourceLF(join(process.cwd(), 'components', 'toekomst', 'plan', 'plan-verdieping.tsx'))

describe('plan-verdieping — zichtbaarheids-gate van katern III (V1)', () => {
  it('observeert de sectie in dit paneel, niet in een provider', () => {
    expect(source).toContain("import { useInViewOnce } from './use-in-view-once'")
    // Review fase 1 (W5): de sectie mount laat (hasRun, HideInSimple) — de
    // mount-conditie gaat als remountKey mee, anders haakt de observer nooit aan.
    expect(source).toContain("const duidingInView = useInViewOnce(duidingSectionRef, '600px', `${hasRun}:${displayMode}`)")
    expect(source).toContain('<section ref={duidingSectionRef}')
  })

  it('meldt "in beeld" aan de ouder pas als de sectie ook open is (mobiel ingeklapt, addendum 26 sep)', () => {
    expect(source).toMatch(/useEffect\(\(\) => \{\s*if \(duidingInView && open\) onDuidingInView\(\)\s*\}, \[duidingInView, open, onDuidingInView\]\)/)
  })

  it('de sectie mount op de hoofdrun, niet op de kaarten (anders start de batch onder solved nooit)', () => {
    expect(source).toMatch(/\{hasRun && \(\s*<HideInSimple>\s*<section ref=\{duidingSectionRef\}/)
  })

  it('draait de preset-batch niet zelf (die gate blijft in de ouder)', () => {
    expect(source).not.toContain('presetBatchNodig')
    expect(source).not.toContain('runScenarioPresetsAsync')
  })
})

describe("plan-verdieping — alleen de scenario's blijven (ADR 0179, addendum 26 sep)", () => {
  it('rendert geen levensinkomenstrook, radar, verloop-grid of geplande acties meer', () => {
    for (const weg of ['<LevensinkomenStrook', '<Dekkingsradar', '<HorizonTrendGrid', '<ActionCard', '<ScenarioChip', 'Geplande acties']) {
      expect(source, weg).not.toContain(weg)
    }
    expect(source).toContain('<ScenarioKaarten')
  })
})

describe('plan-verdieping — Huishoud-FIRE blijft op Plan (ADR 0168)', () => {
  it('rendert HouseholdFireSection binnen HideInSimple met de persoonlijke projectie', () => {
    expect(source).toMatch(/<HideInSimple>\s*<HouseholdFireSection personalProjection=\{personalHeroProjection\} \/>\s*<\/HideInSimple>/)
  })
})
