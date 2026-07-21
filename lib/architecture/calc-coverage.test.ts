// ── Waarheids-vangnet 3 — dekkingstest exports↔catalogus (Arch F5) ──────────
// Precedent: formula-drift-scan.test.ts (scan van échte bestanden + allowlist-
// met-reden + sentinel-bewijs zonder een echte overtreding in de codebase).

import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import {
  CALC_COVERAGE_IGNORE,
  findUncoveredCalcFiles,
  scanTopLevelComputeFiles,
} from './calc-coverage'
import { CALCULATIONS } from './calculations'

describe('calc-coverage — elk top-level compute*/simulate*-bestand is gecatalogiseerd of expliciet genegeerd', () => {
  it('vindt geen blinde vlekken', () => {
    const uncovered = findUncoveredCalcFiles()
    expect(
      uncovered,
      `Niet-gecatalogiseerd rekenbestand — voeg toe aan een Calculation.files[] of aan CALC_COVERAGE_IGNORE met reden:\n${uncovered.join('\n')}`,
    ).toEqual([])
  })

  it('scant een niet-triviale set bestanden (scope intact)', () => {
    expect(scanTopLevelComputeFiles().length).toBeGreaterThan(20)
  })
})

describe('ignore-lijst-integriteit', () => {
  it('elk ignore-bestand bestaat, draagt nog een compute*/simulate*-export en heeft een reden', () => {
    const root = process.cwd()
    const scanned = new Set(scanTopLevelComputeFiles(root))
    for (const entry of CALC_COVERAGE_IGNORE) {
      const abs = path.join(root, ...entry.file.split('/'))
      expect(fs.existsSync(abs), `ontbreekt: ${entry.file}`).toBe(true)
      expect(scanned.has(entry.file), `${entry.file} draagt geen compute*/simulate*-export meer — verwijder van de ignore-lijst`).toBe(true)
      expect(entry.reason.trim().length, `${entry.file} heeft geen (voldoende) reden`).toBeGreaterThan(10)
    }
  })

  it('geen dubbele ignore-entries', () => {
    const files = CALC_COVERAGE_IGNORE.map((e) => e.file)
    expect(new Set(files).size).toBe(files.length)
  })

  it('geen ignore-entry staat óók al in een calc.files[] (overbodig)', () => {
    const catalogued = new Set(CALCULATIONS.flatMap((c) => c.files))
    for (const entry of CALC_COVERAGE_IGNORE) {
      expect(catalogued.has(entry.file), `${entry.file} staat al in een calc.files[] — haal van de ignore-lijst`).toBe(false)
    }
  })
})

describe('sentinel-bewijs', () => {
  it('markeert een synthetisch niet-gecatalogiseerd compute-bestand als blinde vlek', () => {
    // Bewijst dat de scanner een ECHTE nieuwe rekenmotor zou vangen, zonder een
    // permanente test-fixture in lib/ achter te laten: we simuleren de
    // vergelijkingsstap direct op een synthetische bestandslijst.
    const scanned = ['lib/sentinel-nieuwe-rekenmotor.ts']
    const catalogued = new Set(CALCULATIONS.flatMap((c) => c.files))
    const ignored = new Set(CALC_COVERAGE_IGNORE.map((e) => e.file))
    const uncovered = scanned.filter((f) => !catalogued.has(f) && !ignored.has(f))
    expect(uncovered).toEqual(['lib/sentinel-nieuwe-rekenmotor.ts'])
  })

  it('vindt compute*-export via zowel function- als const-declaratie', () => {
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'calc-coverage-'))
    try {
      fs.writeFileSync(path.join(dir, 'a.ts'), 'export function computeFoo() { return 1 }\n')
      fs.writeFileSync(path.join(dir, 'b.ts'), 'export const computeBar = () => 2\n')
      fs.writeFileSync(path.join(dir, 'c.ts'), 'export function notAMatch() { return 3 }\n')
      fs.mkdirSync(path.join(dir, 'lib'))
      fs.renameSync(path.join(dir, 'a.ts'), path.join(dir, 'lib', 'a.ts'))
      fs.renameSync(path.join(dir, 'b.ts'), path.join(dir, 'lib', 'b.ts'))
      fs.renameSync(path.join(dir, 'c.ts'), path.join(dir, 'lib', 'c.ts'))
      const hits = scanTopLevelComputeFiles(dir)
      expect(hits).toEqual(['lib/a.ts', 'lib/b.ts'])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
