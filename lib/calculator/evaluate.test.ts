import { describe, it, expect } from 'vitest'
import {
  evaluateCalculator,
  resolveInitialInputs,
  validateFormulas,
} from './evaluate'
import type { CalculatorDefinition } from './types'
import { PREFILL_KEY_SET } from './user-data-keys'

function def(overrides: Partial<CalculatorDefinition> = {}): CalculatorDefinition {
  return {
    name: 'Test',
    inputs: [{ key: 'inleg', label: 'Inleg', kind: 'euro', default: 1000 }],
    scenarios: [{ key: 'a', label: 'A' }],
    outputs: [
      { key: 'uit', label: 'Uitkomst', formula: 'inleg * 2', format: 'euro' },
    ],
    assumptions: [],
    ...overrides,
  }
}

describe('evaluateCalculator — basis', () => {
  it('evalueert simpele formule met input', () => {
    const r = evaluateCalculator(def(), { inleg: 1000 }, {})
    expect(r.values.a.uit).toBe(2000)
    expect(r.errors).toEqual([])
  })

  it('gebruikt prefill-waarden in formules', () => {
    const d = def({
      outputs: [{ key: 'uit', label: 'U', formula: 'net_worth + inleg', format: 'euro' }],
    })
    const r = evaluateCalculator(d, { inleg: 500 }, { net_worth: 200000 })
    expect(r.values.a.uit).toBe(200500)
  })

  it('whitelisted compound() werkt', () => {
    const d = def({
      outputs: [{ key: 'fv', label: 'FV', formula: 'compound(inleg, 0.07, 10)', format: 'euro' }],
    })
    const r = evaluateCalculator(d, { inleg: 1000 }, {})
    expect(Math.round(r.values.a.fv!)).toBe(1967)
  })

  it('annuity() berekent maandlast', () => {
    const d = def({
      outputs: [{ key: 'm', label: 'M', formula: 'annuity(200000, 0.04, 30)', format: 'euro' }],
    })
    const r = evaluateCalculator(d, {}, {})
    // €200k, 4%, 30 jaar ≈ €955/mnd
    expect(Math.round(r.values.a.m!)).toBeGreaterThan(940)
    expect(Math.round(r.values.a.m!)).toBeLessThan(970)
  })

  it('if(cond,a,b) en scenario-string werken', () => {
    const d = def({
      scenarios: [
        { key: 'aflossen', label: 'Aflossen' },
        { key: 'beleggen', label: 'Beleggen' },
      ],
      outputs: [
        {
          key: 'res',
          label: 'R',
          formula: 'if(scenario == "beleggen", compound(inleg, 0.07, 10), inleg)',
          format: 'euro',
        },
      ],
    })
    const r = evaluateCalculator(d, { inleg: 1000 }, {})
    expect(r.values.aflossen.res).toBe(1000)
    expect(Math.round(r.values.beleggen.res!)).toBe(1967)
  })
})

describe('evaluateCalculator — winnaar-bepaling', () => {
  it('kiest hoogste bij betterDirection higher', () => {
    const d = def({
      scenarios: [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
      outputs: [
        { key: 'uit', label: 'U', formula: 'if(scenario == "b", 2000, 1000)', format: 'euro' },
      ],
      compare: { outputKey: 'uit', betterDirection: 'higher' },
    })
    const r = evaluateCalculator(d, {}, {})
    expect(r.winner).toBe('b')
  })

  it('kiest laagste bij betterDirection lower', () => {
    const d = def({
      scenarios: [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
      outputs: [
        { key: 'kosten', label: 'K', formula: 'if(scenario == "a", 500, 800)', format: 'euro' },
      ],
      compare: { outputKey: 'kosten', betterDirection: 'lower' },
    })
    const r = evaluateCalculator(d, {}, {})
    expect(r.winner).toBe('a')
  })
})

describe('evaluateCalculator — veiligheid', () => {
  it('blokkeert toegang tot process/global', () => {
    const d = def({
      outputs: [{ key: 'x', label: 'X', formula: 'process', format: 'number' }],
    })
    const r = evaluateCalculator(d, {}, {})
    expect(r.values.a.x).toBeNull()
    expect(r.errors.length).toBeGreaterThan(0)
  })

  it('blokkeert constructor-escape', () => {
    const d = def({
      outputs: [{ key: 'x', label: 'X', formula: 'constructor', format: 'number' }],
    })
    const r = evaluateCalculator(d, {}, {})
    expect(r.values.a.x).toBeNull()
  })

  it('vangt onzin-formule netjes af', () => {
    const d = def({
      outputs: [{ key: 'x', label: 'X', formula: 'inleg +* 2', format: 'number' }],
    })
    const r = evaluateCalculator(d, { inleg: 1 }, {})
    expect(r.values.a.x).toBeNull()
    expect(r.errors.length).toBe(1)
  })

  it('NaN/Infinity → null met fout', () => {
    const d = def({
      outputs: [{ key: 'x', label: 'X', formula: 'inleg / 0', format: 'number' }],
    })
    const r = evaluateCalculator(d, { inleg: 1 }, {})
    expect(r.values.a.x).toBeNull()
  })
})

describe('resolveInitialInputs', () => {
  it('gebruikt prefill als beschikbaar, anders default', () => {
    const d = def({
      inputs: [
        { key: 'schuld', label: 'Schuld', kind: 'euro', default: 100000, prefill: 'mortgage_balance' },
        { key: 'rente', label: 'Rente', kind: 'percent', default: 0.04 },
      ],
    })
    const init = resolveInitialInputs(d, { mortgage_balance: 250000 })
    expect(init.schuld).toBe(250000)
    expect(init.rente).toBe(0.04)
  })

  it('valt terug op default als prefill-key ontbreekt in data', () => {
    const d = def({
      inputs: [
        { key: 'schuld', label: 'S', kind: 'euro', default: 100000, prefill: 'mortgage_balance' },
      ],
    })
    const init = resolveInitialInputs(d, {})
    expect(init.schuld).toBe(100000)
  })
})

describe('validateFormulas', () => {
  it('geen onbekende namen → leeg', () => {
    const d = def({
      outputs: [{ key: 'u', label: 'U', formula: 'inleg * net_worth', format: 'euro' }],
    })
    expect(validateFormulas(d, PREFILL_KEY_SET)).toEqual([])
  })

  it('detecteert onbekende variabele', () => {
    const d = def({
      outputs: [{ key: 'u', label: 'U', formula: 'inleg * verzonnen_key', format: 'euro' }],
    })
    expect(validateFormulas(d, PREFILL_KEY_SET)).toContain('verzonnen_key')
  })

  it('whitelisted fns + scenario tellen als bekend', () => {
    const d = def({
      outputs: [{ key: 'u', label: 'U', formula: 'if(scenario == "a", compound(inleg, 0.05, 5), 0)', format: 'euro' }],
    })
    expect(validateFormulas(d, PREFILL_KEY_SET)).toEqual([])
  })

  it('output mag verwijzen naar eerder gedefinieerde output', () => {
    const d = def({
      outputs: [
        { key: 'maandlast', label: 'Maandlast', formula: 'inleg / 12', format: 'euro' },
        { key: 'totaal', label: 'Totaal', formula: 'maandlast * 36', format: 'euro' },
      ],
    })
    expect(validateFormulas(d, PREFILL_KEY_SET)).toEqual([])
  })

  it('output mag ook naar LATERE output verwijzen — wordt topo-gesorteerd', () => {
    const d = def({
      outputs: [
        { key: 'totaal', label: 'Totaal', formula: 'maandlast * 36', format: 'euro' },
        { key: 'maandlast', label: 'Maandlast', formula: 'inleg / 12', format: 'euro' },
      ],
    })
    expect(validateFormulas(d, PREFILL_KEY_SET)).toEqual([])
  })

  it('detecteert directe cyclus (zelf-referentie)', () => {
    const d = def({
      outputs: [
        { key: 'a', label: 'A', formula: 'a + 1', format: 'number' },
      ],
    })
    const errs = validateFormulas(d, PREFILL_KEY_SET)
    expect(errs.some((e) => e.startsWith('cyclus'))).toBe(true)
  })

  it('detecteert indirecte cyclus a→b→a', () => {
    const d = def({
      outputs: [
        { key: 'a', label: 'A', formula: 'b + 1', format: 'number' },
        { key: 'b', label: 'B', formula: 'a + 1', format: 'number' },
      ],
    })
    const errs = validateFormulas(d, PREFILL_KEY_SET)
    expect(errs.some((e) => e.startsWith('cyclus'))).toBe(true)
  })
})

describe('evaluateCalculator — output→output referenties', () => {
  it('berekent dependent outputs in juiste volgorde', () => {
    const d = def({
      inputs: [{ key: 'bedrag', label: 'B', kind: 'euro', default: 1200 }],
      outputs: [
        // bewust in "verkeerde" volgorde — topo-sort moet maandlast eerst doen
        { key: 'jaarlast', label: 'Jaar', formula: 'maandlast * 12', format: 'euro' },
        { key: 'maandlast', label: 'Maand', formula: 'bedrag / 12', format: 'euro' },
      ],
    })
    const r = evaluateCalculator(d, { bedrag: 1200 }, {})
    expect(r.values.a.maandlast).toBe(100)
    expect(r.values.a.jaarlast).toBe(1200)
    // cells worden in definition-volgorde geleverd voor UI-stabiliteit
    expect(r.cells.map((c) => c.outputKey)).toEqual(['jaarlast', 'maandlast'])
  })

  it('mengt output-refs met scenario-conditionals', () => {
    const d = def({
      inputs: [{ key: 'p', label: 'P', kind: 'euro', default: 1000 }],
      scenarios: [
        { key: 'lo', label: 'Laag' },
        { key: 'hi', label: 'Hoog' },
      ],
      outputs: [
        { key: 'tarief', label: 'Tarief', formula: 'if(scenario == "lo", 0.1, 0.2)', format: 'percent' },
        { key: 'bedrag', label: 'Bedrag', formula: 'p * tarief', format: 'euro' },
      ],
    })
    const r = evaluateCalculator(d, { p: 1000 }, {})
    expect(r.values.lo.bedrag).toBe(100)
    expect(r.values.hi.bedrag).toBe(200)
  })
})

describe('evaluateCalculator — derived rows', () => {
  it('berekent derived rij op eerste scenario', () => {
    const d = def({
      inputs: [
        { key: 'kamers', label: 'K', kind: 'number', default: 2 },
        { key: 'huur', label: 'H', kind: 'euro', default: 750 },
      ],
      derived: [
        { key: 'maand_huur', label: 'Maand', formula: 'kamers * huur', format: 'euro' },
        { key: 'jaar_huur', label: 'Jaar', formula: 'maand_huur * 12', format: 'euro' },
      ],
    })
    const r = evaluateCalculator(d, { kamers: 2, huur: 750 }, {})
    expect(r.derived).toHaveLength(2)
    expect(r.derived[0].value).toBe(1500)
    expect(r.derived[1].value).toBe(18000)
  })

  it('derived mag output van eerste scenario gebruiken', () => {
    const d = def({
      inputs: [{ key: 'p', label: 'P', kind: 'euro', default: 1000 }],
      outputs: [
        { key: 'belasting', label: 'B', formula: 'p * 0.36', format: 'euro' },
      ],
      derived: [
        { key: 'netto', label: 'N', formula: 'p - belasting', format: 'euro' },
      ],
    })
    const r = evaluateCalculator(d, { p: 1000 }, {})
    expect(r.derived[0].value).toBe(640)
  })
})

describe('evaluateCalculator — applicability', () => {
  it('classificeert appliesWhen-resultaat naar yes/maybe/no', () => {
    const d = def({
      inputs: [{ key: 'huur', label: 'H', kind: 'euro', default: 5000 }],
      scenarios: [
        {
          key: 'vrij',
          label: 'Vrijstelling',
          appliesWhen: 'if(huur <= 6633, 1, 0)',
          notApplicableReason: 'huur overschrijdt vrijstellingsgrens',
        },
        {
          key: 'box3',
          label: 'Box 3',
          appliesWhen: 'if(huur > 6633, 1, 0)',
        },
      ],
    })
    const rUnder = evaluateCalculator(d, { huur: 5000 }, {})
    expect(rUnder.applicability.vrij.status).toBe('yes')
    expect(rUnder.applicability.box3.status).toBe('no')
    expect(rUnder.applicability.box3.reason).toBeUndefined()

    const rOver = evaluateCalculator(d, { huur: 18000 }, {})
    expect(rOver.applicability.vrij.status).toBe('no')
    expect(rOver.applicability.vrij.reason).toBe('huur overschrijdt vrijstellingsgrens')
    expect(rOver.applicability.box3.status).toBe('yes')
  })

  it('appliesWhen met fout valt failsafe terug op yes', () => {
    const d = def({
      scenarios: [
        { key: 'a', label: 'A', appliesWhen: 'verzonnen_var' },
      ],
    })
    const r = evaluateCalculator(d, { inleg: 1000 }, {})
    expect(r.applicability.a.status).toBe('yes')
  })
})

describe('evaluateCalculator — narrative', () => {
  it('vervangt placeholders met winnaar-context', () => {
    const d = def({
      inputs: [{ key: 'p', label: 'P', kind: 'euro', default: 1000 }],
      scenarios: [
        { key: 'a', label: 'Aflossen' },
        { key: 'b', label: 'Beleggen' },
      ],
      outputs: [
        {
          key: 'netto',
          label: 'Netto',
          formula: 'if(scenario == "a", 5000, 4500)',
          format: 'euro',
        },
      ],
      compare: { outputKey: 'netto', betterDirection: 'higher' },
      narrative: '{winner_label} levert {compare_output} op.',
    })
    const r = evaluateCalculator(d, { p: 1000 }, {})
    expect(r.winner).toBe('a')
    expect(r.narrative).toBe('Aflossen levert €5.000 op.')
  })

  it('output:key en derived:key placeholders werken', () => {
    const d = def({
      inputs: [{ key: 'p', label: 'P', kind: 'euro', default: 1000 }],
      derived: [{ key: 'extra', label: 'X', formula: 'p * 2', format: 'euro' }],
      outputs: [{ key: 'totaal', label: 'T', formula: 'p + 100', format: 'euro' }],
      narrative: 'T = {output:totaal}, X = {derived:extra}',
    })
    const r = evaluateCalculator(d, { p: 1000 }, {})
    expect(r.narrative).toBe('T = €1.100, X = €2.000')
  })

  it('onbekende placeholder blijft intact zodat fout zichtbaar is', () => {
    const d = def({
      narrative: '{output:nonexistent}',
    })
    const r = evaluateCalculator(d, { inleg: 1000 }, {})
    expect(r.narrative).toBe('{output:nonexistent}')
  })
})

describe('validateFormulas — DNA-velden', () => {
  it('derived-keys mogen in outputs gebruikt worden', () => {
    const d = def({
      inputs: [{ key: 'p', label: 'P', kind: 'euro', default: 1000 }],
      derived: [{ key: 'context', label: 'C', formula: 'p * 2', format: 'euro' }],
      outputs: [{ key: 'totaal', label: 'T', formula: 'context + 100', format: 'euro' }],
    })
    expect(validateFormulas(d, PREFILL_KEY_SET)).toEqual([])
  })

  it('appliesWhen-formule wordt gevalideerd op onbekende namen', () => {
    const d = def({
      scenarios: [{ key: 'a', label: 'A', appliesWhen: 'verzonnen_key > 0' }],
    })
    expect(validateFormulas(d, PREFILL_KEY_SET)).toContain('verzonnen_key')
  })
})
