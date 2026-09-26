/**
 * De legenda van de vermogensgrafiek op /toekomst zegt "Je plan" en "Je doelscenario"
 * (ADR 0179 fase 4; wireframe §4.3 "─ plan ┄ doelscenario"). "Jouw wat-als" is sinds
 * ADR 0144/0145 het doelscenario.
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'
import { CANVAS_LEGENDA_DOELSCENARIO, CANVAS_LEGENDA_PLAN } from '@/lib/horizon/katern-copy'

const lees = (...p: string[]) => readSourceLF(join(process.cwd(), ...p))

describe('legenda-kopij op /toekomst', () => {
  it('de teksten', () => {
    expect(CANVAS_LEGENDA_PLAN).toBe('Je plan')
    expect(CANVAS_LEGENDA_DOELSCENARIO).toBe('Je doelscenario')
  })

  it('het canvas geeft "Je plan" aan de grafiek; de doellijn heet "Je doelscenario"', () => {
    expect(lees('components', 'toekomst', 'canvas', 'canvas-grafiek.tsx')).toContain('hoofdlijnLabel={CANVAS_LEGENDA_PLAN}')
    const scenario = lees('components', 'toekomst', 'state', 'use-toekomst-scenario.ts')
    expect(scenario).toContain('label: CANVAS_LEGENDA_DOELSCENARIO,')
    expect(scenario).not.toMatch(/label: `Jouw \$\{/)
  })

  it('geen "wat-als" meer in de zichtbare kopij van het lab', () => {
    expect(lees('components', 'toekomst', 'doelen', 'doelen-lab.tsx')).not.toMatch(/jouw wat-als/i)
  })
})
