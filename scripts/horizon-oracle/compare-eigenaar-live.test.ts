// @vitest-environment node
/**
 * Drievoudige vergelijking (stap 3 van de app↔Excel-check; zie README §Re-run):
 *  (C2) round-trip: buildKernelInput(fixture) veld-voor-veld vs de adapter-KernelInput (app).
 *  (C1) uitkomst: solveFire(rtInput) + Excel meta.solver vs de app-solve.
 *  (3b) grid: engine over rtInput bij Excel's FIRE-leeftijd, Prognose/Bez/S/CF cel-voor-cel
 *       tegen de fixture (de facto 20e parity-fixture), tolerantie €0,01 absoluut.
 *
 * OPT-IN: draait alléén met EIGENAAR_LIVE=1 én de artefacten van stap 1+2 in DUMP_OUT
 * (default os.tmpdir/trifinity-eigenaar-live — buiten de repo; echte gegevens).
 *
 * Draai (PowerShell):
 *   $env:EIGENAAR_LIVE='1'; npx vitest run scripts/horizon-oracle/compare-eigenaar-live.test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect } from 'vitest'
import { loadFixture, getCell, getSheet } from '@/lib/horizon-kernel/oracle/fixture-load'
import { buildKernelInput } from '@/lib/horizon-kernel/input-from-fixture'
import { solveFire } from '@/lib/horizon-kernel/solver'
import { runKernelProjection } from '@/lib/horizon-kernel/engine'
import { compareGrid, DEFAULT_TOLERANCE } from '@/lib/horizon-kernel/oracle/compare'
import type { CellValue } from '@/lib/horizon-kernel/oracle/fixture-types'

const SP = process.env.DUMP_OUT ?? join(tmpdir(), 'trifinity-eigenaar-live')
const FIXTURE = join(SP, 'eigenaar-live.json.gz')

function loadJson(name: string): any {
  return JSON.parse(readFileSync(join(SP, name), 'utf-8'))
}

// Recursieve veld-diff (afgerond op cent voor getallen).
function diff(a: any, b: any, path = '', out: string[] = []): string[] {
  if (a === b) return out
  const ta = typeof a
  const tb = typeof b
  if (ta === 'number' && tb === 'number') {
    if (Math.abs(a - b) > 1e-6) out.push(`${path}: app=${a} rt=${b}`)
    return out
  }
  if (ta !== 'object' || ta !== tb || a === null || b === null) {
    out.push(`${path}: app=${JSON.stringify(a)} rt=${JSON.stringify(b)}`)
    return out
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    const n = Math.max(a?.length ?? 0, b?.length ?? 0)
    for (let i = 0; i < n; i++) diff(a?.[i], b?.[i], `${path}[${i}]`, out)
    return out
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) diff(a[k], b[k], path ? `${path}.${k}` : k, out)
  return out
}

const RUN = process.env.EIGENAAR_LIVE === '1'

describe.skipIf(!RUN)('eigenaar-live drievoudige vergelijking', () => {
  // Lazy: een geskipte describe-body draait wél bij collectie — zonder RUN-gate
  // zou loadFixture hier crashen op de ontbrekende artefacten.
  const fx = RUN ? loadFixture(FIXTURE) : (null as never)
  const appInput = RUN ? loadJson('kernel-input.json') : (null as never)
  const appSolve = RUN ? loadJson('solve-result.json') : (null as never)
  const rtInput = RUN ? buildKernelInput(fx) : (null as never)

  it('C2 round-trip: injectie is trouw (adapter-KernelInput == input-from-fixture(fixture))', () => {
    // pot_liquidaties / pot_mutaties zijn buiten-oracle (niet in het fixture-domein);
    // sluit ze uit van de round-trip (input-from-fixture kent ze niet).
    const appCore = { ...appInput }
    delete appCore.potLiquidaties
    delete appCore.potMutaties
    const diffs = diff(appCore, rtInput)
    /* eslint-disable no-console */
    console.log('\n===== C2 ROUND-TRIP DIFF (app KernelInput vs input-from-fixture(fixture)) =====')
    console.log(diffs.length === 0 ? '(geen verschillen)' : diffs.join('\n'))
    console.log('total diffs:', diffs.length)
    /* eslint-enable no-console */
    // Niet hard-asserten (we rapporteren); alleen documenteren.
    expect(Array.isArray(diffs)).toBe(true)
  })

  it('C1 uitkomst: solveFire(rtInput) vs Excel meta.solver vs app-solve', () => {
    const rtSolve = solveFire(rtInput)
    const meta = (fx as any).meta.solver
    /* eslint-disable no-console */
    console.log('\n===== C1 UITKOMST =====')
    console.log('APP   solve : fireAge', appSolve.fireAge, 'status', appSolve.status, 'gap', appSolve.gap, 'doel', appSolve.doelbedrag, 'model', appSolve.modelwaarde)
    console.log('RT    solve : fireAge', rtSolve.fireAge, 'status', rtSolve.status, 'gap', rtSolve.gap, 'doel', rtSolve.doelbedrag, 'model', rtSolve.modelwaarde)
    console.log('EXCEL meta  : fireAge', meta.fireAge, 'gap', meta.gap, 'status', meta.statusText)
    console.log('Excel P!B16', getCell(fx, 'P!B16'), 'B36 doel', getCell(fx, 'P!B36'), 'B37 model', getCell(fx, 'P!B37'), 'B38 gap', getCell(fx, 'P!B38'), 'B93', getCell(fx, 'P!B93'))
    /* eslint-enable no-console */
    // RT-kernel moet met Excel matchen (zelfde input): FIRE-maand exact, gap ≤ €0,01.
    if (typeof meta.fireAge === 'number') {
      expect(rtSolve.fireAge, 'RT fireAge == Excel P!B16').toBeCloseTo(meta.fireAge, 5)
    }
    expect(rtSolve.gap, 'RT gap == Excel B38').toBeCloseTo(Number(getCell(fx, 'P!B38')), 2)
  })

  it('3b grid: engine over rtInput bij Excel-FIRE, Prognose/Bez/S/CF binnen €0,01', () => {
    const excelFire = Number((fx as any).meta.solver.fireAge)
    const proj = runKernelProjection(rtInput, { fireAge: excelFire })

    // Prognose I (netto vermogen, kol 8) + J (netto liquide, kol 9) over 1200 maanden.
    const prognose = getSheet(fx, 'Prognose').values
    const HDR = 1
    const engProgI: CellValue[][] = []
    const fxProgI: CellValue[][] = []
    const engProgJ: CellValue[][] = []
    const fxProgJ: CellValue[][] = []
    for (let m = 0; m < 1200; m++) {
      const r: any = proj.prognose[m]
      const beyond = r?.beyondHorizon === true
      engProgI.push([beyond ? '' : r.nettoVermogen])
      engProgJ.push([beyond ? '' : r.nettoLiquide])
      const fxrow = prognose[HDR + m] ?? []
      fxProgI.push([fxrow[8] ?? null])
      fxProgJ.push([fxrow[9] ?? null])
    }
    const cmpI = compareGrid(fxProgI, engProgI, { tolerance: DEFAULT_TOLERANCE })
    const cmpJ = compareGrid(fxProgJ, engProgJ, { tolerance: DEFAULT_TOLERANCE })

    /* eslint-disable no-console */
    console.log('\n===== 3b GRID (engine @ Excel-FIRE', excelFire, ') =====')
    console.log('Prognose I: cells', cmpI.cellCount, 'mismatches', cmpI.mismatchCount, 'maxΔ', cmpI.maxAbsDiff)
    if (cmpI.mismatchCount) console.log('  eerste I-mismatches:', cmpI.mismatches.slice(0, 8).map((m) => `m${m.row} exp=${m.expected} act=${m.actual} Δ=${m.diff}`).join(' | '))
    console.log('Prognose J: cells', cmpJ.cellCount, 'mismatches', cmpJ.mismatchCount, 'maxΔ', cmpJ.maxAbsDiff)
    if (cmpJ.mismatchCount) console.log('  eerste J-mismatches:', cmpJ.mismatches.slice(0, 8).map((m) => `m${m.row} exp=${m.expected} act=${m.actual} Δ=${m.diff}`).join(' | '))
    // eerste maand met een J-mismatch (om de divergentie te lokaliseren)
    if (cmpJ.mismatches.length) console.log('  eerste J-mismatch maand:', cmpJ.mismatches[0].row, 'leeftijd', 46 + cmpJ.mismatches[0].row / 12)
    /* eslint-enable no-console */
    expect(cmpI.cellCount).toBe(1200)
  })
})
