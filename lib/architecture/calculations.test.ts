import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { buildArchimateModel } from './archimate-model'
import {
  CALCULATIONS,
  CALC_DOMAINS,
  calculationsByDomain,
  calculationsForElement,
  validateCalculations,
} from './calculations'

const model = buildArchimateModel({
  version: '0', generatedDate: '2026-06-10',
  stats: { api: 1, components: 1, providers: 1, tables: 1, migrations: 1 },
})

describe('calculations — catalogus', () => {
  it('is valide tegen het model (elementIds bestaan, ids uniek, bron aanwezig)', () => {
    expect(validateCalculations(model)).toEqual([])
  })

  it('dekt alle vier de domeinen', () => {
    const domains = new Set(CALCULATIONS.map((c) => c.domain))
    for (const d of CALC_DOMAINS) expect(domains.has(d)).toBe(true)
  })

  it('groepeert per domein in vaste volgorde', () => {
    const grouped = calculationsByDomain()
    expect(grouped.map((g) => g.domain)).toEqual(CALC_DOMAINS.filter((d) => CALCULATIONS.some((c) => c.domain === d)))
    expect(grouped.reduce((s, g) => s + g.items.length, 0)).toBe(CALCULATIONS.length)
  })

  it('kent de spaarquote-keten met de juiste bron', () => {
    const sq = CALCULATIONS.find((c) => c.id === 'spaarquote')!
    expect(sq.files).toContain('lib/savings-source.ts')
    expect(sq.elementIds).toContain('as-budget')
  })

  it('koppelt de unified projection aan de planningsdienst', () => {
    const cs = calculationsForElement('as-planning')
    expect(cs.some((c) => c.id === 'unified-projection')).toBe(true)
  })

  it('elke berekening heeft invoer en uitvoer', () => {
    for (const c of CALCULATIONS) {
      expect(c.inputs.length, `${c.id} mist invoer`).toBeGreaterThan(0)
      expect(c.outputs.length, `${c.id} mist uitvoer`).toBeGreaterThan(0)
    }
  })
})

// ── Waarheids-vangnet 1 — bestandsexistentie op files[] (Arch F5) ───────────
// Test-only: validateCalculations zelf blijft fs-vrij (client-bundelbaar);
// deze check draait uitsluitend hier, analoog aan de allowlist-integriteit in
// formula-drift-scan.test.ts.
describe('calculations — files[] bestaan echt op schijf', () => {
  const root = process.cwd()

  it('elke files[]-entry verwijst naar een bestaand bestand (of, bij een `dir/*.ts`-joker, een niet-lege map)', () => {
    const missing: string[] = []
    for (const c of CALCULATIONS) {
      for (const f of c.files) {
        if (f.includes('*')) {
          const dir = path.join(root, ...f.replace(/\/\*\.ts$/, '').split('/'))
          const hasTs = fs.existsSync(dir) && fs.readdirSync(dir).some((entry) => entry.endsWith('.ts'))
          if (!hasTs) missing.push(`${c.id}: ${f} (map leeg of ontbreekt)`)
          continue
        }
        const abs = path.join(root, ...f.split('/'))
        if (!fs.existsSync(abs)) missing.push(`${c.id}: ${f}`)
      }
    }
    expect(missing, `Verdwenen bronbestand(en) — update calculations.ts:\n${missing.join('\n')}`).toEqual([])
  })
})

describe('calculations — files[] sentinel-bewijs', () => {
  it('detecteert een verzonnen niet-bestaand pad', () => {
    const abs = path.join(process.cwd(), 'lib', 'architecture', 'dit-bestand-bestaat-niet-sentinel.ts')
    expect(fs.existsSync(abs)).toBe(false)
  })
})

// ── Waarheids-vangnet 2 — functions[] zijn gedefinieerd in files[] ──────────
// De rekenmotor-doorlichting van 2 sep 2026 vond vier entries waarvan een
// gelistte functie niet in de gelistte bestanden gedefinieerd was — of nergens
// bestond (`computePortfolioAllocation`) — terwijl elementIds + bestand groen
// bleven. Deze check maakt die driftklasse CI-rood. Test-only (fs), net als
// vangnet 1; validateCalculations zelf blijft fs-vrij (client-bundelbaar).
//
// Regels:
// - Een entry mag een toelichting tussen haakjes dragen
//   ('runMonteCarlo (wrappers/mc)'); die wordt weggeknipt vóór de match.
// - De naam moet in één van de files[] van dezelfde calc RESOLVEN: óf een
//   échte definitie — `function|const|let|var|class|enum NAME` (TS,
//   geëxporteerd of niet) of `FUNCTION [schema.]NAME(` (SQL) — óf een
//   expliciete import/re-export (`import { NAME } from`). Een consumerende
//   calc mag dus de motoren noemen die hij aanroept, zolang het gelistte
//   bestand ze ook echt importeert. Alleen genoemd/aangeroepen worden zonder
//   import telt niet, en een verzonnen of hernoemde naam resolvet nergens —
//   precies de drift die dit vangnet moet vangen.
// - Een `dir/*.ts`-joker in files[] telt alle .ts-bestanden in die map mee.

export function bareFunctionName(entry: string): string {
  return entry.replace(/\s*\([\s\S]*$/, '').trim()
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function definesIdentifier(source: string, name: string): boolean {
  const id = escapeRegExp(name)
  const ts = new RegExp(`\\b(?:function|const|let|var|class|enum)\\s+${id}\\b`)
  const sql = new RegExp(`\\bFUNCTION\\s+(?:\\w+\\.)?${id}\\s*\\(`, 'i')
  return ts.test(source) || sql.test(source)
}

export function importsIdentifier(source: string, name: string): boolean {
  const id = escapeRegExp(name)
  // `import { a, NAME, b } from '…'` / `export { NAME } from '…'` — ook
  // meerregelige import-blokken ([^}] matcht newlines). `import type {…}`
  // telt bewust niet: een functie is geen type.
  const named = new RegExp(`\\b(?:import|export)\\s*\\{[^}]*\\b${id}\\b[^}]*\\}\\s*from\\s*['"]`)
  return named.test(source)
}

export function resolvesIdentifier(source: string, name: string): boolean {
  return definesIdentifier(source, name) || importsIdentifier(source, name)
}

function resolveCalcFiles(root: string, files: string[]): string[] {
  const out: string[] = []
  for (const f of files) {
    if (f.includes('*')) {
      const dir = path.join(root, ...f.replace(/\/\*\.ts$/, '').split('/'))
      if (!fs.existsSync(dir)) continue
      for (const entry of fs.readdirSync(dir)) {
        if (entry.endsWith('.ts')) out.push(path.join(dir, entry))
      }
      continue
    }
    out.push(path.join(root, ...f.split('/')))
  }
  return out
}

describe('calculations — functions[] zijn gedefinieerd in files[]', () => {
  const root = process.cwd()
  const sourceCache = new Map<string, string>()
  const readSource = (abs: string): string => {
    const cached = sourceCache.get(abs)
    if (cached !== undefined) return cached
    const src = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : ''
    sourceCache.set(abs, src)
    return src
  }

  it('elke functions[]-entry resolvet (definitie of import) in één van de files[] van dezelfde calc', () => {
    const missing: string[] = []
    for (const c of CALCULATIONS) {
      const sources = resolveCalcFiles(root, c.files).map(readSource)
      for (const entry of c.functions) {
        const name = bareFunctionName(entry)
        if (!name) {
          missing.push(`${c.id}: lege functienaam in '${entry}'`)
          continue
        }
        if (!sources.some((src) => resolvesIdentifier(src, name))) {
          missing.push(`${c.id}: ${name} (uit '${entry}') is in geen van files[] gedefinieerd of geïmporteerd`)
        }
      }
    }
    expect(
      missing,
      `Catalogus-drift — functie hernoemd/verhuisd/verdwenen; werk functions[] of files[] in calculations.ts bij:\n${missing.join('\n')}`,
    ).toEqual([])
  })

  it('sentinel-bewijs: de matcher bijt op de vier driftgevallen die de doorlichting vond', () => {
    const allocation = readSource(path.join(root, 'lib', 'portfolio-allocation.ts'))
    // (1) De verzonnen naam uit de oude allocatie-entry — bestaat nergens.
    expect(resolvesIdentifier(allocation, 'computePortfolioAllocation')).toBe(false)
    // De echte functie in datzelfde bestand.
    expect(definesIdentifier(allocation, 'computeAllocationSlices')).toBe(true)
    // (2) Een veldnaam is geen functie: werkStrategieDelta staat als property in cf.ts.
    const cf = readSource(path.join(root, 'lib', 'horizon-kernel', 'tables', 'cf.ts'))
    expect(cf).toMatch(/werkStrategieDelta/)
    expect(resolvesIdentifier(cf, 'werkStrategieDelta')).toBe(false)
    // (3+4) Een definitie in een NIET-gelist bestand resolvet niet via een bestand dat
    // 'm alleen noemt: unified-projection.ts kent unifiedRowsToStackedRows niet.
    const unified = readSource(path.join(root, 'lib', 'unified-projection.ts'))
    expect(resolvesIdentifier(unified, 'unifiedRowsToStackedRows')).toBe(false)
    expect(definesIdentifier(readSource(path.join(root, 'lib', 'wealth-composition.ts')), 'unifiedRowsToStackedRows')).toBe(true)
    // Een aanroep zonder definitie of import telt niet.
    expect(resolvesIdentifier('const x = computeAllocationSlices(rows)', 'computeAllocationSlices')).toBe(false)
    // Een expliciete (meerregelige) import telt wél — de consumerende calc.
    expect(importsIdentifier("import {\n  a,\n  computeAllocationSlices,\n} from '@/lib/portfolio-allocation'", 'computeAllocationSlices')).toBe(true)
    expect(importsIdentifier("import type { computeAllocationSlices } from 'x'", 'computeAllocationSlices')).toBe(false)
    // Niet-geëxporteerde definitie telt wél (bv. buildWerkStrategie in adapter/events.ts).
    expect(definesIdentifier('function buildWerkStrategie(a: number) { return a }', 'buildWerkStrategie')).toBe(true)
    // SQL-definities (RPC's) met schema-prefix.
    expect(definesIdentifier('CREATE OR REPLACE FUNCTION public.spend_limit_rule_aggregate(', 'spend_limit_rule_aggregate')).toBe(true)
    // Toelichting tussen haakjes wordt weggeknipt.
    expect(bareFunctionName('runMonteCarlo (wrappers/mc)')).toBe('runMonteCarlo')
    expect(bareFunctionName('buildSimChartGeometry (mcPaths + mcMax)')).toBe('buildSimChartGeometry')
  })
})
