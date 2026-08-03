import { describe, it, expect } from 'vitest'
import {
  LocalCalculatorDefinitionSchema,
  LocalStep1InputsSchema,
  LocalStep2PrefillSchema,
  LocalStep3OutputsSchema,
  LocalStep4MetaSchema,
  LOCAL_MAX_FORMULA_CHARS,
  normalizeLocalKey,
} from './local-calculator-schema'
import { CalculatorDefinitionSchema } from '@/lib/calculator/types'

/**
 * Het gereduceerde schema is de POORT OP DE GENERATIE. Deze suite bewijst de
 * twee eigenschappen waar het hele lokale ontwerp op leunt:
 *   1. de rijke velden (derived, narrative, compare, meerdere scenario's,
 *      enum-inputs) komen er NIET doorheen — en worden ook niet stilzwijgend
 *      weggestript, want dan zou "lokaal levert nooit derived op" een toevallige
 *      eigenschap zijn in plaats van een afgedwongen;
 *   2. wat er wél doorheen komt, is per constructie een geldige canonieke
 *      CalculatorDefinition — dat is wat het opslag- en rendercontract
 *      ongewijzigd geldig houdt.
 */

const GELDIG = {
  name: 'Schuld aflossen',
  description: 'Hoe lang duurt het tot je schuld weg is?',
  inputs: [
    { key: 'schuld', label: 'Schuld', kind: 'euro', default: 10000, prefill: 'total_debts' },
    { key: 'maandbedrag', label: 'Maandbedrag', kind: 'euro', default: 250 },
  ],
  scenarios: [{ key: 'berekening', label: 'Berekening' }],
  outputs: [
    { key: 'looptijd', label: 'Looptijd', formula: 'schuld / (maandbedrag * 12)', format: 'years' },
  ],
  assumptions: ['Rente buiten beschouwing gelaten.'],
}

describe('LocalCalculatorDefinitionSchema — de subset', () => {
  it('accepteert een mini-definitie', () => {
    const res = LocalCalculatorDefinitionSchema.safeParse(GELDIG)
    expect(res.success).toBe(true)
  })

  it('wat erdoorheen komt is óók een geldige canonieke definitie', () => {
    const lokaal = LocalCalculatorDefinitionSchema.parse(GELDIG)
    const canoniek = CalculatorDefinitionSchema.safeParse(lokaal)
    expect(canoniek.success).toBe(true)
  })

  it('WEIGERT een definitie met derived (niet: strippen)', () => {
    const res = LocalCalculatorDefinitionSchema.safeParse({
      ...GELDIG,
      derived: [{ key: 'per_jaar', label: 'Per jaar', formula: 'maandbedrag * 12', format: 'euro' }],
    })
    expect(res.success).toBe(false)
  })

  it('WEIGERT een definitie met narrative', () => {
    const res = LocalCalculatorDefinitionSchema.safeParse({
      ...GELDIG,
      narrative: 'Je bent schuldvrij in {output:looptijd}.',
    })
    expect(res.success).toBe(false)
  })

  it('WEIGERT compare (dat hoort bij vergelijken, en er is één scenario)', () => {
    const res = LocalCalculatorDefinitionSchema.safeParse({
      ...GELDIG,
      compare: { outputKey: 'looptijd', betterDirection: 'lower' },
    })
    expect(res.success).toBe(false)
  })

  it('WEIGERT meer dan één scenario', () => {
    const res = LocalCalculatorDefinitionSchema.safeParse({
      ...GELDIG,
      scenarios: [
        { key: 'aflossen', label: 'Aflossen' },
        { key: 'beleggen', label: 'Beleggen' },
      ],
    })
    expect(res.success).toBe(false)
  })

  it('WEIGERT een enum-input', () => {
    const res = LocalCalculatorDefinitionSchema.safeParse({
      ...GELDIG,
      inputs: [
        {
          key: 'regime',
          label: 'Regime',
          kind: 'enum',
          default: 1,
          options: [{ value: 1, label: 'Box 1' }],
        },
      ],
    })
    expect(res.success).toBe(false)
  })

  it('WEIGERT meer dan 4 inputs en meer dan 3 outputs', () => {
    const teVeelInputs = {
      ...GELDIG,
      inputs: Array.from({ length: 5 }, (_, i) => ({
        key: `veld_${i}`,
        label: `Veld ${i}`,
        kind: 'euro',
        default: 1,
      })),
    }
    expect(LocalCalculatorDefinitionSchema.safeParse(teVeelInputs).success).toBe(false)

    const teVeelOutputs = {
      ...GELDIG,
      outputs: Array.from({ length: 4 }, (_, i) => ({
        key: `uit_${i}`,
        label: `Uit ${i}`,
        formula: 'schuld',
        format: 'euro',
      })),
    }
    expect(LocalCalculatorDefinitionSchema.safeParse(teVeelOutputs).success).toBe(false)
  })

  it('WEIGERT een formule die langer is dan de lokale cap', () => {
    const res = LocalCalculatorDefinitionSchema.safeParse({
      ...GELDIG,
      outputs: [
        {
          key: 'lang',
          label: 'Lang',
          formula: 'schuld + '.repeat(LOCAL_MAX_FORMULA_CHARS) + 'maandbedrag',
          format: 'euro',
        },
      ],
    })
    expect(res.success).toBe(false)
  })

  it('WEIGERT een prefill-key die niet in de whitelist staat', () => {
    const res = LocalCalculatorDefinitionSchema.safeParse({
      ...GELDIG,
      inputs: [{ key: 'schuld', label: 'Schuld', kind: 'euro', default: 1, prefill: 'total_debt' }],
    })
    expect(res.success).toBe(false)
  })
})

describe('normalizeLocalKey', () => {
  it('normaliseert naar snake_case, gelijk aan de canonieke KeyString', () => {
    expect(normalizeLocalKey('Bedrag')).toBe('bedrag')
    expect(normalizeLocalKey('maandLast')).toBe('maand_last')
    expect(normalizeLocalKey('rente-per-jaar')).toBe('rente_per_jaar')
    expect(normalizeLocalKey('2024waarde')).toBe('waarde')
  })
})

describe('deelstap-schemas', () => {
  it('stap 1 accepteert een string-default (coerce) — een schoonheidsfout kost geen run', () => {
    const res = LocalStep1InputsSchema.safeParse([
      { key: 'bedrag', label: 'Bedrag', kind: 'euro', default: '1000' },
    ])
    expect(res.success).toBe(true)
    if (res.success) expect(res.data[0].default).toBe(1000)
  })

  it('stap 2 laat een verzonnen prefill-key afketsen (gesloten keuze)', () => {
    expect(
      LocalStep2PrefillSchema.safeParse([{ input: 'bedrag', prefill: 'total_debts' }]).success,
    ).toBe(true)
    expect(
      LocalStep2PrefillSchema.safeParse([{ input: 'bedrag', prefill: 'schuld_totaal' }]).success,
    ).toBe(false)
  })

  it('stap 3 eist minstens één output', () => {
    expect(LocalStep3OutputsSchema.safeParse([]).success).toBe(false)
  })

  it('stap 4 leest het eerste object uit de array', () => {
    const res = LocalStep4MetaSchema.safeParse([{ name: 'Test', assumptions: ['Iets'] }])
    expect(res.success).toBe(true)
    if (res.success) expect(res.data[0].name).toBe('Test')
  })
})
