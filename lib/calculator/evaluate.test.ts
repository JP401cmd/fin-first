import { describe, it, expect } from 'vitest'
import {
  clampToInputRange,
  evaluateCalculator,
  resolveInitialInputs,
  validateFormulas,
  validateNarrative,
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

  it('member-access (.) is een parse-fout — sluit de constructor-escape', () => {
    // Dit was de exploiteerbare expr-eval-kwetsbaarheid:
    //   scenario.constructor.constructor("…kwaadaardige JS…")()
    const d = def({
      outputs: [
        {
          key: 'x',
          label: 'X',
          formula: 'scenario.constructor.constructor("return 1")()',
          format: 'number',
        },
      ],
    })
    const r = evaluateCalculator(d, {}, {})
    expect(r.values.a.x).toBeNull()
    expect(r.errors.length).toBeGreaterThan(0)
  })

  it('bracket-index, __proto__ en property-toegang leveren null op', () => {
    const d = def({
      outputs: [
        { key: 'a', label: 'A', formula: 'scenario["constructor"]', format: 'number' },
        { key: 'b', label: 'B', formula: '__proto__', format: 'number' },
        { key: 'c', label: 'C', formula: 'inleg.toString', format: 'number' },
      ],
    })
    const r = evaluateCalculator(d, { inleg: 1 }, {})
    expect(r.values.a.a).toBeNull()
    expect(r.values.a.b).toBeNull()
    expect(r.values.a.c).toBeNull()
  })

  it('assignment (=) wordt niet ondersteund', () => {
    const d = def({
      outputs: [{ key: 'x', label: 'X', formula: 'inleg = 5', format: 'number' }],
    })
    const r = evaluateCalculator(d, { inleg: 1 }, {})
    expect(r.values.a.x).toBeNull()
  })

  it('formule kan het globale prototype niet vervuilen', () => {
    const probe = {} as Record<string, unknown>
    const before = probe.polluted
    const d = def({
      outputs: [
        { key: 'x', label: 'X', formula: 'constructor("x")', format: 'number' },
        { key: 'y', label: 'Y', formula: 'toString()', format: 'number' },
      ],
    })
    evaluateCalculator(d, {}, {})
    expect(({} as Record<string, unknown>).polluted).toBe(before)
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

/**
 * WF-REKEN-01-bug1 — een prefill-waarde is RUWE gebruikersdata en hoeft niet
 * binnen het bereik te vallen van het veld dat 'm erft. Vóór de fix erfde
 * "Maandelijks bedrag" (min: 50) letterlijk een negatief maandoverschot, wat
 * negatieve eindwaarden én NEGATIEVE VRIJHEIDSTIJD opleverde — regelrecht in
 * strijd met "geld is opgeslagen tijd" — plus een slider-desync (de HTML-range
 * klemt alleen de visuele thumb, niet de React-waarde).
 */
describe('resolveInitialInputs — prefill klemt naar het veldbereik', () => {
  it('klemt een prefill ONDER min naar min (het gemelde geval: negatief maandoverschot)', () => {
    const d = def({
      inputs: [
        { key: 'maandbedrag', label: 'Maandelijks bedrag', kind: 'euro', default: 300, min: 50, max: 2000, prefill: 'monthly_surplus' },
      ],
    })
    const init = resolveInitialInputs(d, { monthly_surplus: -3485 })
    expect(init.maandbedrag).toBe(50)
  })

  it('klemt een prefill BOVEN max naar max (de zuster-case, niet alleen de min-kant)', () => {
    const d = def({
      inputs: [
        { key: 'schuld', label: 'Schuld', kind: 'euro', default: 200000, min: 0, max: 1500000, prefill: 'mortgage_balance' },
      ],
    })
    const init = resolveInitialInputs(d, { mortgage_balance: 2400000 })
    expect(init.schuld).toBe(1500000)
  })

  it('laat een prefill BINNEN het bereik ongemoeid', () => {
    const d = def({
      inputs: [
        { key: 'maandbedrag', label: 'M', kind: 'euro', default: 300, min: 50, max: 2000, prefill: 'monthly_surplus' },
      ],
    })
    expect(resolveInitialInputs(d, { monthly_surplus: 900 }).maandbedrag).toBe(900)
  })

  it('klemt niet aan een kant die de definitie niet vastlegt (min/max zijn optioneel)', () => {
    // Alleen een max → een negatieve waarde blijft negatief. Een rekenhulp mag
    // bewust een negatief veld hebben; de klem is het veldbereik, geen 0-vloer.
    const d = def({
      inputs: [
        { key: 'saldo', label: 'Saldo', kind: 'euro', default: 0, max: 1000, prefill: 'monthly_surplus' },
      ],
    })
    expect(resolveInitialInputs(d, { monthly_surplus: -3485 }).saldo).toBe(-3485)
  })

  it('laat de prefill-WAARDE zelf ongemoeid — alleen het veld dat ’m consumeert klemt', () => {
    // monthly_surplus mag en moet negatief kunnen zijn: dat IS het feit over de
    // gebruiker (uitgaven > inkomen). Formules die de prefill-key rechtstreeks
    // lezen moeten die waarheid blijven zien.
    const d = def({
      inputs: [
        { key: 'maandbedrag', label: 'M', kind: 'euro', default: 300, min: 50, max: 2000, prefill: 'monthly_surplus' },
      ],
      outputs: [
        { key: 'ruw', label: 'Ruw overschot', formula: 'monthly_surplus', format: 'euro' },
        { key: 'veld', label: 'Veldwaarde', formula: 'maandbedrag', format: 'euro' },
      ],
    })
    const init = resolveInitialInputs(d, { monthly_surplus: -3485 })
    const r = evaluateCalculator(d, init, { monthly_surplus: -3485 })
    expect(r.values.a.ruw).toBe(-3485)
    expect(r.values.a.veld).toBe(50)
  })
})

describe('clampToInputRange', () => {
  const field = { key: 'x', label: 'X', kind: 'euro' as const, default: 100, min: 50, max: 2000 }

  it('klemt aan beide kanten en laat binnen-bereik ongemoeid', () => {
    expect(clampToInputRange(-3485, field)).toBe(50)
    expect(clampToInputRange(99999, field)).toBe(2000)
    expect(clampToInputRange(900, field)).toBe(900)
  })

  it('respecteert de grenzen zelf (inclusief)', () => {
    expect(clampToInputRange(50, field)).toBe(50)
    expect(clampToInputRange(2000, field)).toBe(2000)
  })

  it('laat NaN passeren i.p.v. ’m stil naar een grens te schuiven', () => {
    expect(Number.isNaN(clampToInputRange(NaN, field))).toBe(true)
  })
})

/**
 * Regressie op de ECHTE prefab uit het bugrapport: de rekenhulp mag met een
 * negatief maandoverschot geen negatieve eindwaarde meer produceren, want die
 * vertaalt in de UI naar negatieve vrijheidstijd.
 */
describe('prefab "Aflossen vs. beleggen" — geen negatieve uitkomsten bij een negatief overschot', () => {
  it('levert positieve eindwaarden voor elk scenario', async () => {
    const { PREFAB_CALCULATORS } = await import('./prefab-definitions')
    const prefab = PREFAB_CALCULATORS.find((p) => p.definition.name === 'Aflossen vs. beleggen')
    expect(prefab, 'prefab "Aflossen vs. beleggen" niet gevonden').toBeTruthy()
    const d = prefab!.definition

    const prefill = { monthly_surplus: -3485, mortgage_balance: 250000, monthly_expenses: 4200 }
    const init = resolveInitialInputs(d, prefill)
    expect(init.maandbedrag).toBe(50) // geklemd naar min, niet -3485

    const r = evaluateCalculator(d, init, prefill)
    expect(r.errors).toEqual([])
    for (const scenario of d.scenarios) {
      for (const output of d.outputs) {
        const v = r.values[scenario.key]?.[output.key]
        if (v == null) continue
        expect(v, `${scenario.key}.${output.key} moet niet-negatief zijn`).toBeGreaterThanOrEqual(0)
      }
    }
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

  it('output mag derived-tussenwaarde gebruiken (regressie: bijtelling-bug)', () => {
    // De gebruiker kreeg "undefined variable: belasting_bijtelling_jaar"
    // omdat een output naar een derived-key verwees terwijl derived
    // vroeger ná de outputs werd berekend. Derived is nu een pre-output
    // tussenwaarde-laag.
    const d = def({
      inputs: [
        { key: 'catalogus', label: 'Cat', kind: 'euro', default: 35000 },
        { key: 'jaren', label: 'Jaren', kind: 'years', default: 4 },
      ],
      derived: [
        { key: 'bijtelling_jaar', label: 'Bijtelling/jr', formula: 'catalogus * 0.04', format: 'euro' },
        { key: 'belasting_jaar', label: 'Belasting/jr', formula: 'bijtelling_jaar * 0.37', format: 'euro' },
      ],
      outputs: [
        { key: 'totale_belasting', label: 'Totaal', formula: 'belasting_jaar * jaren', format: 'euro' },
        { key: 'netto', label: 'Netto', formula: 'totale_belasting + 100', format: 'euro' },
      ],
    })
    const r = evaluateCalculator(d, { catalogus: 35000, jaren: 4 }, {})
    // bijtelling 1400/jr, belasting 518/jr, ×4 = 2072
    expect(r.derived[0].value).toBeCloseTo(1400)
    expect(r.derived[1].value).toBeCloseTo(518)
    expect(r.values.a.totale_belasting).toBeCloseTo(2072)
    expect(r.values.a.netto).toBeCloseTo(2172)
    expect(r.errors).toEqual([])
  })

  it('scenario-afhankelijke derived werkt door in outputs per scenario', () => {
    const d = def({
      inputs: [{ key: 'bedrag', label: 'B', kind: 'euro', default: 1000 }],
      scenarios: [
        { key: 'lease', label: 'Lease' },
        { key: 'koop', label: 'Koop' },
      ],
      derived: [
        { key: 'factor', label: 'F', formula: 'if(scenario == "lease", 2, 3)', format: 'number' },
      ],
      outputs: [
        { key: 'kosten', label: 'Kosten', formula: 'bedrag * factor', format: 'euro' },
      ],
    })
    const r = evaluateCalculator(d, { bedrag: 1000 }, {})
    expect(r.values.lease.kosten).toBe(2000)
    expect(r.values.koop.kosten).toBe(3000)
    expect(r.errors).toEqual([])
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

  it('derived mag NIET naar een output verwijzen (volgorde-restrictie)', () => {
    const d = def({
      inputs: [{ key: 'p', label: 'P', kind: 'euro', default: 1000 }],
      outputs: [{ key: 'belasting', label: 'B', formula: 'p * 0.36', format: 'euro' }],
      derived: [{ key: 'netto', label: 'N', formula: 'p - belasting', format: 'euro' }],
    })
    const errs = validateFormulas(d, PREFILL_KEY_SET)
    expect(errs.some((e) => e.includes("output 'belasting'"))).toBe(true)
  })

  it('appliesWhen-formule wordt gevalideerd op onbekende namen', () => {
    const d = def({
      scenarios: [{ key: 'a', label: 'A', appliesWhen: 'verzonnen_key > 0' }],
    })
    expect(validateFormulas(d, PREFILL_KEY_SET)).toContain('verzonnen_key')
  })
})

describe('validateNarrative — placeholder-referenties', () => {
  it('{output:key} die naar een input i.p.v. output wijst is onbekend', () => {
    // Reproduceert de gemelde bug (WF-REKEN-02-bug2): de AI declareerde
    // 'looptijd' als input (slider) maar verwees er in de narrative naar
    // als {output:looptijd}. Op runtime blijft die placeholder letterlijk
    // staan (zie regressietest hieronder) — hier vangen we 'm eerder af.
    const d = def({
      inputs: [{ key: 'looptijd', label: 'Looptijd', kind: 'number', default: 15 }],
      outputs: [{ key: 'voordeel', label: 'V', formula: 'looptijd * 100', format: 'euro' }],
      narrative: 'Na {output:looptijd} jaar levert Beleggen {output:voordeel} op.',
    })
    const errs = validateNarrative(d)
    expect(errs.some((e) => e.includes('looptijd'))).toBe(true)
    // De geldige {output:voordeel} mag NIET als onbekend worden gemeld.
    expect(errs.some((e) => e.includes('voordeel'))).toBe(false)
  })

  it('geldige {output:key}/{derived:key} geven geen fout', () => {
    const d = def({
      inputs: [{ key: 'p', label: 'P', kind: 'euro', default: 1000 }],
      derived: [{ key: 'extra', label: 'X', formula: 'p * 2', format: 'euro' }],
      outputs: [{ key: 'totaal', label: 'T', formula: 'p + 100', format: 'euro' }],
      narrative: 'T = {output:totaal}, X = {derived:extra} ({winner_label}).',
    })
    expect(validateNarrative(d)).toEqual([])
  })

  it('{derived:key} die naar een niet-bestaande derived wijst is onbekend', () => {
    const d = def({
      outputs: [{ key: 'uit', label: 'U', formula: 'inleg * 2', format: 'euro' }],
      narrative: 'Waarde: {derived:nietbestaand}.',
    })
    expect(validateNarrative(d)).toContain('{derived:nietbestaand}')
  })

  it('geen narrative → lege lijst', () => {
    expect(validateNarrative(def())).toEqual([])
  })
})
