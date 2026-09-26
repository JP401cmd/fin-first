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
    expect(source).toContain('const duidingInView = useInViewOnce(duidingSectionRef)')
    expect(source).toContain('<section ref={duidingSectionRef}')
  })

  it('meldt "in beeld" aan de ouder zodra het zo is', () => {
    expect(source).toMatch(/useEffect\(\(\) => \{\s*if \(duidingInView\) onDuidingInView\(\)\s*\}, \[duidingInView, onDuidingInView\]\)/)
  })

  it('draait de preset-batch niet zelf (die gate blijft in de ouder)', () => {
    expect(source).not.toContain('presetBatchNodig')
    expect(source).not.toContain('runScenarioPresetsAsync')
  })
})

describe('plan-verdieping — Huishoud-FIRE blijft op Plan (ADR 0168)', () => {
  it('rendert HouseholdFireSection binnen HideInSimple met de persoonlijke projectie', () => {
    expect(source).toMatch(/<HideInSimple>\s*<HouseholdFireSection personalProjection=\{personalHeroProjection\} \/>\s*<\/HideInSimple>/)
  })
})
