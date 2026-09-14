import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * BRON-GRENDEL (precedent: horizon-client.nu-stoppen.test.ts) op de bedrading van de
 * tweede run "vrij mogelijk vanaf" (ADR 0129 D7) — lab-haalbaarheid Task 0 (15 sep 2026).
 *
 * Live gemeten: onder een vast anker bleef de hero-tegel "—" zolang de preset-batch niet
 * draaide, want die wachtte op `duidingInView` (en met `?whatif=open` haakte de observer
 * soms nooit aan). Daarom:
 *  1. onder een vast anker draait de batch zonder te wachten op de duiding (`presetBatchNodig`);
 *  2. de tegel kent een rekenstand (`solvedPending`) en een gefaalde batch beëindigt die;
 *  3. de batch rekent op dezelfde profielrij als elke andere kernel-run: mét de ADR 0103-injectie.
 */
const SOURCE_PATH = join(process.cwd(), 'components', 'app', 'horizon', 'horizon-client.tsx')
const src = readFileSync(SOURCE_PATH, 'utf8')

function presetEffect(): string {
  const gate = src.indexOf('const presetBatchNodig')
  expect(gate).toBeGreaterThan(-1)
  const eind = src.indexOf('// eslint-disable-next-line react-hooks/exhaustive-deps', gate)
  expect(eind).toBeGreaterThan(gate)
  // t/m de dependency-array
  return src.slice(gate, src.indexOf('])', eind) + 2)
}

describe('preset-batch onder een vast anker wacht niet op scrollen', () => {
  it('de gate is een benoemde afleiding: vast anker OF (volledig + duiding in beeld)', () => {
    expect(src).toContain("const presetBatchNodig = isFixedAnchorMode || (displayMode === 'full' && duidingInView)")
    expect(presetEffect()).toContain('if (!presetBatchNodig) { setScenarioPresets(null); setScenarioPresetsLoading(false); return }')
    expect(src).not.toContain("if (displayMode !== 'full' || !duidingInView) {")
  })

  it('isFixedAnchorMode staat in de dependency-array en is vóór het effect gedeclareerd (geen TDZ)', () => {
    const deps = presetEffect().slice(presetEffect().lastIndexOf('}, ['))
    expect(deps).toContain('isFixedAnchorMode')
    expect(src.indexOf('const isFixedAnchorMode')).toBeGreaterThan(-1)
    expect(src.indexOf('const isFixedAnchorMode')).toBeLessThan(src.indexOf('const presetBatchNodig'))
  })

  it('een gefaalde batch beëindigt de rekenstand: de catch zet solvedRun op null-waarden', () => {
    const effect = presetEffect()
    const c = effect.indexOf('.catch(')
    expect(c).toBeGreaterThan(-1)
    expect(effect.slice(c)).toContain('setSolvedRun({ fireAge: null, endAge: null })')
  })

  it('de hero-drieslag krijgt de rekenstand: vast anker én nog geen batch-antwoord', () => {
    expect(src).toContain('solvedPending={isFixedAnchorMode && solvedRun === null}')
  })
})

describe('preset-batch draait op de geïnjecteerde profielrij (ADR 0103 × ADR 0129 D7)', () => {
  it('runScenarioPresetsAsync krijgt withResolvedKernelBedragen(kernelRawProfile, …), niet de rauwe rij', () => {
    const start = src.indexOf('runScenarioPresetsAsync({')
    expect(start).toBeGreaterThan(-1)
    const call = src.slice(start, src.indexOf('})', start))
    expect(call).toContain('profile: withResolvedKernelBedragen(kernelRawProfile, {')
    expect(call).toContain('monthlyIncome: effectiveInput.monthlyIncome')
    expect(call).toContain('monthlyExpenses: effectiveInput.monthlyExpenses')
    expect(call).not.toContain('profile: kernelRawProfile,')
  })

  it('de helper wordt uit de canonieke module geïmporteerd', () => {
    expect(src).toContain("import { withResolvedKernelBedragen } from '@/lib/horizon/kernel-profile-basis'")
  })
})
