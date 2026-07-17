// ── Formule-drift guardrail — vitest gate (Arch F2, klasse 3) ───────────
//
// Draait de hardcoded-constante-scan over de echte bron zodat een NIEUWE kale
// `0.04`/forfait-literal in app/api of components de test rood maakt, en unit-
// test de pure detector tegen synthetische snippets (het "sentinel"-bewijs
// zonder een echte overtreding in de codebase achter te laten).

import { describe, it, expect } from 'vitest'
import {
  scanFormulaDrift,
  findRateLiterals,
  stripComments,
  collectScannedFiles,
  CANONICAL_RATE_LITERALS,
  RATE_LITERAL_ALLOWLIST,
} from './formula-drift-scan'
import * as fs from 'fs'
import * as path from 'path'

describe('scanFormulaDrift — geen hardcoded canonieke constanten buiten lib/', () => {
  it('vindt geen niet-allowlisted tarief-literals in app/api + components', () => {
    const violations = scanFormulaDrift()
    expect(
      violations,
      `Hardcoded constante(n) — gebruik de canonieke bron of allowlist met reden:\n${violations
        .map((v) => `  ${v.file}:${v.line}  ${v.value} (${v.label}) → ${v.canonical}`)
        .join('\n')}`,
    ).toEqual([])
  })

  it('scant een niet-triviale set bestanden (scope intact)', () => {
    expect(collectScannedFiles().length).toBeGreaterThan(50)
  })
})

describe('detector — sentinel-bewijs', () => {
  it('markeert een SWR-recompute via deling door 0.04', () => {
    const sentinel = 'const fireTarget = yearlyExpenses / 0.04'
    const hits = findRateLiterals(sentinel)
    expect(hits.map((h) => h.value)).toContain('0.04')
  })

  it('markeert een kale Box 3-forfaitliteral', () => {
    const sentinel = 'const rendement = spaargeld * 0.0588'
    expect(findRateLiterals(sentinel).map((h) => h.value)).toContain('0.0588')
  })

  it('markeert NIET een bare 0.04 buiten een deling (opacity/animatie/vermenigvuldiging)', () => {
    // Dit is de false-positive-klasse die een kale literal-selector wél zou
    // vangen; de division-mode sluit 'm bewust uit.
    expect(findRateLiterals('style={{ opacity: 0.04 }}').length).toBe(0)
    expect(findRateLiterals('transition={{ delay: i * 0.04 }}').length).toBe(0)
    expect(findRateLiterals('const huurnorm = woz * 0.04').length).toBe(0)
  })

  it('markeert NIET een langer getal dat de literal bevat', () => {
    expect(findRateLiterals('const x = 10.04').length).toBe(0)
    expect(findRateLiterals('const x = 0.045').length).toBe(0)
    expect(findRateLiterals('step={0.001}').length).toBe(0)
    expect(findRateLiterals('const x = amount / 0.045').length).toBe(0)
  })

  it('negeert de literal in een comment', () => {
    expect(findRateLiterals('// oude bug: 0.04 schaduwde NL_SWR').length).toBe(0)
    expect(findRateLiterals('/* 0.0588 */ const x = 1').length).toBe(0)
  })

  it('stripComments behoudt de regelstructuur', () => {
    expect(stripComments('a\n// weg\nb').split('\n').length).toBe(3)
  })
})

describe('allowlist-integriteit', () => {
  it('elke allowlist-regel bestaat nog, bevat de literal en heeft een reden', () => {
    const root = process.cwd()
    for (const entry of RATE_LITERAL_ALLOWLIST) {
      const abs = path.join(root, ...entry.file.split('/'))
      expect(fs.existsSync(abs), `ontbreekt: ${entry.file}`).toBe(true)
      const stripped = stripComments(fs.readFileSync(abs, 'utf-8'))
      expect(stripped.includes(entry.value), `literal ${entry.value} niet meer in ${entry.file}`).toBe(true)
      expect(entry.value, `allowlist-waarde niet in het scan-lexicon: ${entry.value}`).toBeDefined()
      expect(CANONICAL_RATE_LITERALS.map((c) => c.value)).toContain(entry.value)
      expect(entry.reason.trim().length).toBeGreaterThan(10)
    }
  })
})
