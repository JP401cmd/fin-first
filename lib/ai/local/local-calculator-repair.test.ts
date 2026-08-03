import { describe, it, expect } from 'vitest'
import {
  assembleLocalDefinition,
  repairLocalDefinition,
  LOCAL_SCENARIO_KEY,
} from './local-calculator-repair'
import { validateFormulas } from '@/lib/calculator/evaluate'
import { PREFILL_KEY_SET } from '@/lib/calculator/user-data-keys'
import { LOCAL_REPAIR_MAX_INPUTS } from './local-calculator-schema'
import type { LocalCalculatorInput, LocalCalculatorOutput } from './local-calculator-schema'

/**
 * De reparatie is DETERMINISTISCH — geen tweede generatie. Deze suite legt de
 * twee toegestane uitkomsten vast (onbekende naam wordt input, óf de output valt
 * weg) en het eerlijke falen wanneer er niets overblijft.
 *
 * Dat er geen model bij komt kijken, bewijst het bestand zelf: de functie is
 * synchroon en `local-calculator-repair.ts` importeert de runtime niet. Zou daar
 * ooit een generatie insluipen, dan kan de functie niet synchroon blijven en
 * breken deze tests op de typing.
 */

const input = (key: string, extra: Partial<LocalCalculatorInput> = {}): LocalCalculatorInput => ({
  key,
  label: key,
  kind: 'euro',
  default: 1000,
  ...extra,
})

const output = (key: string, formula: string): LocalCalculatorOutput => ({
  key,
  label: key,
  formula,
  format: 'euro',
})

describe('assembleLocalDefinition', () => {
  it('zet precies één scenario neer, zonder derived/narrative/compare', () => {
    const def = assembleLocalDefinition({
      inputs: [input('bedrag')],
      outputs: [output('totaal', 'bedrag * 2')],
      name: 'Test',
    })
    expect(def.scenarios).toEqual([{ key: LOCAL_SCENARIO_KEY, label: 'Berekening' }])
    expect(def.derived).toBeUndefined()
    expect(def.narrative).toBeUndefined()
    expect(def.compare).toBeUndefined()
  })

  it('laat lege omschrijving en lege aannames weg i.p.v. als leeg veld te zetten', () => {
    const def = assembleLocalDefinition({
      inputs: [input('bedrag')],
      outputs: [output('totaal', 'bedrag')],
      name: 'Test',
      description: '',
      assumptions: [],
    })
    expect('description' in def).toBe(false)
    expect('assumptions' in def).toBe(false)
  })
})

describe('repairLocalDefinition', () => {
  it('een schone definitie blijft ongemoeid', () => {
    const def = assembleLocalDefinition({
      inputs: [input('schuld'), input('maandbedrag')],
      outputs: [output('looptijd', 'schuld / (maandbedrag * 12)')],
      name: 'Aflossen',
    })
    const res = repairLocalDefinition(def, PREFILL_KEY_SET)
    expect(res.definition).not.toBeNull()
    expect(res.repairs).toEqual([])
    expect(validateFormulas(res.definition!, PREFILL_KEY_SET)).toEqual([])
  })

  it('onbekende variabele wordt een input met een passende soort', () => {
    const def = assembleLocalDefinition({
      inputs: [input('bedrag')],
      outputs: [output('kosten', 'bedrag * brandstofkosten')],
      name: 'Auto',
    })
    const res = repairLocalDefinition(def, PREFILL_KEY_SET)

    expect(res.definition).not.toBeNull()
    const bijgemaakt = res.definition!.inputs.find((i) => i.key === 'brandstofkosten')
    expect(bijgemaakt).toBeDefined()
    expect(bijgemaakt!.kind).toBe('euro')
    expect(res.definition!.outputs).toHaveLength(1)
    expect(validateFormulas(res.definition!, PREFILL_KEY_SET)).toEqual([])
  })

  it('raadt de eenheid uit de naam — rente wordt percent, looptijd wordt years', () => {
    const def = assembleLocalDefinition({
      inputs: [input('bedrag')],
      outputs: [output('eind', 'compound(bedrag, jaarrente, looptijd_jaren)')],
      name: 'Groei',
    })
    const res = repairLocalDefinition(def, PREFILL_KEY_SET)
    const byKey = new Map(res.definition!.inputs.map((i) => [i.key, i]))
    expect(byKey.get('jaarrente')?.kind).toBe('percent')
    expect(byKey.get('looptijd_jaren')?.kind).toBe('years')
  })

  it('een bestaande prefill-key is geen onbekende naam', () => {
    const def = assembleLocalDefinition({
      inputs: [input('extra')],
      outputs: [output('nieuw_vermogen', 'net_worth + extra')],
      name: 'Vermogen',
    })
    const res = repairLocalDefinition(def, PREFILL_KEY_SET)
    expect(res.repairs).toEqual([])
    expect(res.definition!.inputs).toHaveLength(1)
  })

  it('past het niet meer binnen de cap, dan valt die ene output weg', () => {
    const bestaande = Array.from({ length: LOCAL_REPAIR_MAX_INPUTS }, (_, i) => input(`veld_${i}`))
    const def = assembleLocalDefinition({
      inputs: bestaande,
      outputs: [output('goed', 'veld_0 + veld_1'), output('fout', 'veld_0 * onbekend_ding')],
      name: 'Vol',
    })
    const res = repairLocalDefinition(def, PREFILL_KEY_SET)

    expect(res.definition).not.toBeNull()
    expect(res.definition!.outputs.map((o) => o.key)).toEqual(['goed'])
    expect(res.definition!.inputs).toHaveLength(LOCAL_REPAIR_MAX_INPUTS)
    expect(validateFormulas(res.definition!, PREFILL_KEY_SET)).toEqual([])
  })

  it('een cyclus laat de betrokken output vallen', () => {
    const def = assembleLocalDefinition({
      inputs: [input('bedrag')],
      outputs: [output('a', 'b + 1'), output('b', 'a + 1'), output('c', 'bedrag * 2')],
      name: 'Cyclus',
    })
    const res = repairLocalDefinition(def, PREFILL_KEY_SET)

    expect(res.definition).not.toBeNull()
    expect(res.definition!.outputs.map((o) => o.key)).toContain('c')
    expect(validateFormulas(res.definition!, PREFILL_KEY_SET)).toEqual([])
  })

  it('blijft er geen enkele uitkomst over, dan falen we eerlijk (null)', () => {
    const bestaande = Array.from({ length: LOCAL_REPAIR_MAX_INPUTS }, (_, i) => input(`veld_${i}`))
    const def = assembleLocalDefinition({
      inputs: bestaande,
      outputs: [output('fout', 'spookvariabele * 2')],
      name: 'Leeg',
    })
    const res = repairLocalDefinition(def, PREFILL_KEY_SET)

    expect(res.definition).toBeNull()
    expect(res.restUnknown).toContain('spookvariabele')
  })

  it('muteert de meegegeven definitie niet', () => {
    const def = assembleLocalDefinition({
      inputs: [input('bedrag')],
      outputs: [output('kosten', 'bedrag * onbekend')],
      name: 'Kopie',
    })
    const voor = JSON.stringify(def)
    repairLocalDefinition(def, PREFILL_KEY_SET)
    expect(JSON.stringify(def)).toBe(voor)
  })
})
