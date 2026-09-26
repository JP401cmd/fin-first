/**
 * Bron-grendels op de preset-gate van "Andere paden naast je doelscenario" (ADR 0179
 * fase 4; verhuisd uit plan-verdieping.bron.test.ts — één invariant, één bestand):
 * de zichtbaarheidshook observeert de sectie in dít paneel en meldt de uitkomst aan de
 * ouder, die hem latcht; de batch draait hier niet zelf.
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const source = readSourceLF(join(process.cwd(), 'components', 'toekomst', 'doelen', 'andere-paden.tsx'))

describe('andere-paden — zichtbaarheids-gate van de scenario-kaarten (V1, ADR 0145 D7a)', () => {
  it('observeert de sectie in dit paneel, niet in een provider', () => {
    expect(source).toContain("import { useInViewOnce } from '@/components/toekomst/plan/use-in-view-once'")
    // Review fase 1 (W5): de sectie mount laat (hasRun, HideInSimple) — de
    // mount-conditie gaat als remountKey mee, anders haakt de observer nooit aan.
    expect(source).toContain("const inBeeld = useInViewOnce(sectieRef, '600px', `${hasRun}:${displayMode}`)")
    expect(source).toContain('<section ref={sectieRef}')
  })

  it('meldt "in beeld" aan de ouder (die de grendel zet)', () => {
    expect(source).toMatch(/useEffect\(\(\) => \{\s*if \(inBeeld\) onDuidingInView\(\)\s*\}, \[inBeeld, onDuidingInView\]\)/)
    expect(source).toContain('onDuidingInView={markeerDuidingInView}')
  })

  it('de sectie mount op de hoofdrun, niet op de kaarten (anders start de batch onder solved nooit)', () => {
    expect(source).toContain('if (!hasRun) return null')
    expect(source).toMatch(/<HideInSimple>\s*<section ref=\{sectieRef\}/)
  })

  it('draait de preset-batch niet zelf (die gate blijft in de sim-hook)', () => {
    expect(source).not.toContain('presetBatchNodig')
    expect(source).not.toContain('runScenarioPresetsAsync')
  })
})
