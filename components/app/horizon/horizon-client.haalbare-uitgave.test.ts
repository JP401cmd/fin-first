/**
 * Bron-grendel op de haalbare-uitgave-regel in de KPI-tegel "Na pensioen"
 * (spec 2026-09-18). Wat we vastpinnen:
 *  1. beide layouts (desktop + mobiel) tonen de regel via DEZELFDE helper — geen tweede
 *     berekening, geen tweede formulering;
 *  2. de kleur komt uit de semantische tokens, nooit uit een Tailwind-standaardkleur;
 *  3. de regel valt weg in huishoud-/partnerweergave (twee grondslagen niet mengen);
 *  4. de batch-uitkomst landt in state en wordt bij een fout teruggezet.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(
  join(process.cwd(), 'components', 'app', 'horizon', 'horizon-client.tsx'),
  'utf8',
)

/** Desktop-strip + mobiele strip. */
const LAYOUTS = 2

describe('haalbare uitgave — bron-grendel', () => {
  it('rendert de regel in beide KPI-layouts via één helper', () => {
    expect(source.match(/data-testid="haalbaar-bij-uitgave"/g) ?? []).toHaveLength(LAYOUTS)
    // Eén aanroep van de kopij-helper, hergebruikt in beide tegels.
    expect((source.match(/haalbaarBijUitgaveRegel\(/g) ?? []).length).toBe(1)
  })

  it('kleurt met de semantische tokens en niets anders', () => {
    const blokken = source.match(/data-testid="haalbaar-bij-uitgave"[\s\S]{0,400}/g) ?? []
    expect(blokken).toHaveLength(LAYOUTS)
    for (const b of blokken) {
      expect(b).toMatch(/haalbareUitgaveToon/)
      expect(b).not.toMatch(/text-(red|emerald|green|rose)-\d/)
      expect(b).not.toMatch(/#[0-9a-fA-F]{6}/)
    }
    expect(source).toMatch(/haalbareUitgaveToon\s*=[\s\S]{0,160}text-negative[\s\S]{0,80}text-positive/)
  })

  it('toont niets in huishoud-/partnerweergave', () => {
    expect((source.match(/!hasPerspectiveHero && haalbareUitgaveRegel/g) ?? [])).toHaveLength(LAYOUTS)
  })

  it('zet de batch-uitkomst in state én ruimt hem op bij een fout', () => {
    expect(source).toMatch(/setHaalbareUitgave\(batch\.haalbareUitgave \?\? null\)/)
    expect(source).toMatch(/setHaalbareUitgave\(null\)/)
  })

  it('geeft de override door aan de scenario-run', () => {
    expect(source).toMatch(/uitgaveNaPensioenPerJaar: scenarioUitgaveNaPensioen/)
  })
})
