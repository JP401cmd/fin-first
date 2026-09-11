import { describe, it, expect } from 'vitest'
import {
  computeBudgetBasis,
  BASIS_BUDGET_TYPE,
  BASIS_SOURCES,
  type BudgetBasisRow,
} from './budget-basis'
import { annualAmount } from './budget-utils'

function row(p: Partial<BudgetBasisRow> & { id: string }): BudgetBasisRow {
  return {
    parent_id: null,
    budget_type: 'expense',
    name: p.id,
    default_limit: 0,
    interval: 'monthly',
    is_archived: false,
    merged_into: null,
    ...p,
  }
}

describe('computeBudgetBasis — jaarconversie', () => {
  it('gebruikt UITSLUITEND annualAmount (monthly ×12, quarterly ×4, yearly ×1)', () => {
    const r = computeBudgetBasis(
      [
        row({ id: 'm', default_limit: 100, interval: 'monthly' }),
        row({ id: 'q', default_limit: 100, interval: 'quarterly' }),
        row({ id: 'y', default_limit: 100, interval: 'yearly' }),
      ],
      'expense',
      [],
    )
    expect(r.annualTotal).toBe(1200 + 400 + 100)
    expect(r.monthlyTotal).toBeCloseTo(1700 / 12, 10)
    // Geen tweede conversie: elke post is letterlijk annualAmount(limit, interval).
    for (const e of r.entries) {
      expect(e.annualAmount).toBe(annualAmount(100, e.interval))
    }
  })

  it('onbekend/ontbrekend interval telt als jaarbedrag (×1, conservatief)', () => {
    const r = computeBudgetBasis([row({ id: 'x', default_limit: 500, interval: null })], 'expense', [])
    // interval null op een parent ZONDER kinderen → fallback 'monthly' (de DB-default),
    // want er is geen parent-interval om van te erven.
    expect(r.entries[0].interval).toBe('monthly')
    expect(r.annualTotal).toBe(6000)
  })
})

describe('computeBudgetBasis — kind-oprol', () => {
  it('een MAANDkind onder een JAARouder telt op zijn EIGEN interval (niet 12× te laag)', () => {
    // Dit is precies de fout in deriveBudgetTotals (lib/cashflow-kpis.ts): daar
    // worden kinderlimieten rauw opgeteld en met het PARENT-interval
    // genormaliseerd — 200 + 100 = 300, gedeeld door 12 → €25/mnd i.p.v. €300/mnd.
    const r = computeBudgetBasis(
      [
        row({ id: 'p', interval: 'yearly', default_limit: 99999 }),
        row({ id: 'c1', parent_id: 'p', interval: 'monthly', default_limit: 200 }),
        row({ id: 'c2', parent_id: 'p', interval: 'monthly', default_limit: 100 }),
      ],
      'expense',
      [],
    )
    expect(r.annualTotal).toBe(300 * 12)
    expect(r.monthlyTotal).toBe(300)
  })

  it('kind zonder eigen interval erft het interval van de parent', () => {
    const r = computeBudgetBasis(
      [
        row({ id: 'p', interval: 'quarterly', default_limit: 0 }),
        row({ id: 'c', parent_id: 'p', interval: null, default_limit: 150 }),
      ],
      'expense',
      [],
    )
    expect(r.entries[0].interval).toBe('quarterly')
    expect(r.annualTotal).toBe(600)
  })

  it('de PARENT-limiet telt niet mee zodra er kinderen zijn (geen dubbeltelling)', () => {
    const r = computeBudgetBasis(
      [
        row({ id: 'p', interval: 'monthly', default_limit: 1000 }),
        row({ id: 'c', parent_id: 'p', interval: 'monthly', default_limit: 400 }),
      ],
      'expense',
      [],
    )
    expect(r.entries.map(e => e.id)).toEqual(['c'])
    expect(r.annualTotal).toBe(400 * 12)
  })

  it('een parent ZONDER kinderen is zelf de post', () => {
    const r = computeBudgetBasis([row({ id: 'p', default_limit: 250 })], 'expense', [])
    expect(r.entries.map(e => e.id)).toEqual(['p'])
    expect(r.annualTotal).toBe(3000)
  })
})

describe('computeBudgetBasis — type volgt de PARENT (buildBudgetTypeMap-semantiek)', () => {
  it('een kind erft het type van zijn parent, ook als zijn eigen kolom afwijkt', () => {
    const rows = [
      row({ id: 'p', budget_type: 'income', interval: 'monthly', default_limit: 0 }),
      // Afwijkend eigen type: moet worden GENEGEERD ten gunste van de parent.
      row({ id: 'c', parent_id: 'p', budget_type: 'expense', interval: 'monthly', default_limit: 3000 }),
    ]
    expect(computeBudgetBasis(rows, 'income', []).annualTotal).toBe(36000)
    expect(computeBudgetBasis(rows, 'expense', []).annualTotal).toBe(0)
  })

  it('een wees (parent ontbreekt in de lijst) telt nergens mee', () => {
    const r = computeBudgetBasis(
      [row({ id: 'c', parent_id: 'weg', default_limit: 500 })],
      'expense',
      [],
    )
    expect(r.hasBudgets).toBe(false)
    expect(r.annualTotal).toBe(0)
  })
})

describe('DRAGENDE INVARIANT: savings- en debt-budgetten vallen buiten de uitgavengrondslag', () => {
  // Dit is GEEN filterkeuze (ADR 0103). lib/savings-source.ts steunt erop: de
  // spaarbudget-/aflossingscorrectie mag op de budgetgrondslag NIET worden
  // toegepast omdat dat geld er nooit is afgehaald. Zou deze test ooit
  // versoepeld worden, dan moet die correctie terugkomen.
  const rows = [
    row({ id: 'e', budget_type: 'expense', default_limit: 1000 }),
    row({ id: 's', budget_type: 'savings', default_limit: 500 }),
    row({ id: 'd', budget_type: 'debt', default_limit: 300 }),
    row({ id: 'i', budget_type: 'income', default_limit: 4000 }),
  ]

  it('de uitgavengrondslag bevat uitsluitend budget_type=expense', () => {
    const r = computeBudgetBasis(rows, 'expense', [])
    expect(r.entries.map(e => e.id)).toEqual(['e'])
    expect(r.annualTotal).toBe(12000)
  })

  it('de inkomensgrondslag bevat uitsluitend budget_type=income', () => {
    const r = computeBudgetBasis(rows, 'income', [])
    expect(r.entries.map(e => e.id)).toEqual(['i'])
    expect(r.annualTotal).toBe(48000)
  })

  it('BASIS_BUDGET_TYPE legt de mapping vast', () => {
    expect(BASIS_BUDGET_TYPE.income).toBe('income')
    expect(BASIS_BUDGET_TYPE.expense).toBe('expense')
    expect(Object.values(BASIS_BUDGET_TYPE)).not.toContain('savings')
    expect(Object.values(BASIS_BUDGET_TYPE)).not.toContain('debt')
  })
})

describe('computeBudgetBasis — uitsluiten', () => {
  it('gearchiveerd en weggemerged tellen nergens mee, ook niet als post', () => {
    const r = computeBudgetBasis(
      [
        row({ id: 'a', default_limit: 100 }),
        row({ id: 'arch', default_limit: 100, is_archived: true }),
        row({ id: 'merged', default_limit: 100, merged_into: 'a' }),
      ],
      'expense',
      [],
    )
    expect(r.entries.map(e => e.id)).toEqual(['a'])
    expect(r.annualTotal).toBe(1200)
  })

  it('een gearchiveerde PARENT neemt zijn kinderen mee (die worden wees)', () => {
    const r = computeBudgetBasis(
      [
        row({ id: 'p', is_archived: true, default_limit: 0 }),
        row({ id: 'c', parent_id: 'p', default_limit: 400 }),
      ],
      'expense',
      [],
    )
    expect(r.hasBudgets).toBe(false)
  })

  it('een uitgesloten id BLIJFT als post staan maar telt niet mee', () => {
    const r = computeBudgetBasis(
      [row({ id: 'a', default_limit: 100 }), row({ id: 'b', default_limit: 200 })],
      'expense',
      ['b'],
    )
    expect(r.entries.map(e => [e.id, e.excluded])).toEqual([
      ['a', false],
      ['b', true],
    ])
    expect(r.annualTotal).toBe(1200)
    expect(r.allExcluded).toBe(false)
  })

  it('alles uitgesloten → annualTotal 0 en allExcluded (de resolver valt dan terug)', () => {
    const r = computeBudgetBasis([row({ id: 'a', default_limit: 100 })], 'expense', ['a'])
    expect(r.annualTotal).toBe(0)
    expect(r.hasBudgets).toBe(true)
    expect(r.allExcluded).toBe(true)
  })

  it('een id van een verwijderd budget in de lijst is betekenisloos, nooit een fout', () => {
    const r = computeBudgetBasis(
      [row({ id: 'a', default_limit: 100 })],
      'expense',
      ['bestaat-niet', 'ook-niet'],
    )
    expect(r.annualTotal).toBe(1200)
    expect(r.allExcluded).toBe(false)
  })
})

describe('computeBudgetBasis — deelfractie en defensieve invoer', () => {
  it('shareFractionById weegt een gedeeld budget op het eigen aandeel; ontbreekt een id → 1', () => {
    const r = computeBudgetBasis(
      [row({ id: 'shared', default_limit: 1000 }), row({ id: 'eigen', default_limit: 500 })],
      'expense',
      [],
      { shareFractionById: { shared: 0.5 } },
    )
    expect(r.annualTotal).toBe(1000 * 12 * 0.5 + 500 * 12)
  })

  it('default_limit als string (PostgREST NUMERIC) of null wordt defensief verwerkt', () => {
    const r = computeBudgetBasis(
      [
        row({ id: 's', default_limit: '250.50' }),
        row({ id: 'n', default_limit: null }),
        row({ id: 'rommel', default_limit: 'n/a' }),
      ],
      'expense',
      [],
    )
    expect(r.annualTotal).toBeCloseTo(250.5 * 12, 6)
    expect(r.entries.find(e => e.id === 'n')?.annualAmount).toBe(0)
    expect(r.entries.find(e => e.id === 'rommel')?.annualAmount).toBe(0)
  })

  it('lege lijst → geen budgetten, geen totalen', () => {
    const r = computeBudgetBasis([], 'income', [])
    expect(r).toEqual({
      annualTotal: 0,
      monthlyTotal: 0,
      entries: [],
      hasBudgets: false,
      allExcluded: false,
      realizedWindowMonths: 12,
      truncationSuspected: false,
    })
  })
})

describe('realisatie i.p.v. geplande limiet (ADR 0103, correctie 11 aug 2026; historiebasis ADR 0138)', () => {
  /**
   * Een realisatievenster zoals `fetchRealizedBudgetAmounts` 'm levert: twaalf
   * AFGESLOTEN maanden, één `historyMonths`-deler voor de hele gebruiker.
   */
  function win(
    byBudgetId: Record<string, { incoming?: number; outgoing?: number }>,
    opts: { historyMonths?: number; truncationSuspected?: boolean } = {},
  ) {
    return {
      windowMonths: 12,
      windowEndMonth: '2026-08',
      historyMonths: opts.historyMonths ?? 12,
      windowIncome: { real: 0, all: 0 },
      byMonth: {},
      truncationSuspected: opts.truncationSuspected ?? false,
      byBudgetId: Object.fromEntries(
        Object.entries(byBudgetId).map(([k, v]) => [k, { incoming: v.incoming ?? 0, outgoing: v.outgoing ?? 0 }]),
      ),
    }
  }

  it('een post MET realisatie gebruikt de gemeten som, niet de limiet', () => {
    const r = computeBudgetBasis([row({ id: 'e', default_limit: 1000 })], 'expense', [], {
      realized: win({ e: { outgoing: 9_600 } }),
    })
    expect(r.entries[0].source).toBe('realized')
    expect(r.entries[0].annualAmount).toBe(9_600) // niet 12.000 (de limiet)
    expect(r.entries[0].plannedAnnualAmount).toBe(12_000) // plan blijft zichtbaar
    expect(r.entries[0].realizedMonths).toBe(12)
    expect(r.annualTotal).toBe(9_600)
  })

  it('een post ZONDER realisatie valt terug op de geplande limiet', () => {
    const r = computeBudgetBasis([row({ id: 'e', default_limit: 1000 })], 'expense', [], {
      realized: win({}),
    })
    expect(r.entries[0].source).toBe('planned')
    expect(r.entries[0].annualAmount).toBe(12_000)
    expect(r.entries[0].realizedMonths).toBe(0)
  })

  it('RICHTING: inkomsten lezen de positieve som, uitgaven de absolute negatieve', () => {
    const rows = [
      row({ id: 'i', budget_type: 'income', default_limit: 0 }),
      row({ id: 'e', budget_type: 'expense', default_limit: 0 }),
    ]
    const realized = win({
      // Een terugboeking op het inkomstenbudget mag het inkomen niet verlagen,
      // en een creditering op een uitgavenbudget niet als uitgave tellen.
      i: { incoming: 60_000, outgoing: 500 },
      e: { incoming: 200, outgoing: 24_000 },
    })
    expect(computeBudgetBasis(rows, 'income', [], { realized }).annualTotal).toBe(60_000)
    expect(computeBudgetBasis(rows, 'expense', [], { realized }).annualTotal).toBe(24_000)
  })

  it('volle historie: een OUD budget dat pas sinds kort gebruikt wordt, schaalt NIET op', () => {
    // De gebruiker heeft twaalf afgesloten maanden historie, dus de deler is 12:
    // €900 in de laatste 3 maanden telt als €900 per jaar, niet €3.600. Dat is
    // het antwoord op "wat is er het afgelopen jaar gebeurd" en het groeit
    // vanzelf mee terwijl het venster opschuift.
    const r = computeBudgetBasis(
      [row({ id: 'e', default_limit: 0, created_at: '2020-01-01T00:00:00Z' })],
      'expense',
      [],
      { realized: win({ e: { outgoing: 900 } }, { historyMonths: 12 }) },
    )
    expect(r.entries[0].annualAmount).toBe(900)
    expect(r.entries[0].realizedMonths).toBe(12)
  })

  it('een KWARTAALpost wordt NIET verviervoudigd: het aantal boekingsmaanden is geen deler', () => {
    // Vier kwartaalpremies van €300 = €1.200/jaar, geboekt in 4 van de 12
    // maanden. De deler is de historie van de gebruiker (12), dus 1.200 / 12 × 12.
    const r = computeBudgetBasis([row({ id: 'e', default_limit: 0 })], 'expense', [], {
      realized: win({ e: { outgoing: 1_200 } }),
    })
    expect(r.entries[0].annualAmount).toBe(1_200)
  })

  it('de deelfractie werkt onverkort door op het GEREALISEERDE bedrag', () => {
    const r = computeBudgetBasis([row({ id: 'e', default_limit: 1000 })], 'expense', [], {
      realized: win({ e: { outgoing: 9_600 } }),
      shareFractionById: { e: 0.5 },
    })
    expect(r.entries[0].annualAmount).toBe(4_800)
    expect(r.entries[0].plannedAnnualAmount).toBe(6_000)
  })

  it('KIND-OPROL: kinderen dekken hun eigen boekingen; de parent telt niet mee', () => {
    const rows = [
      row({ id: 'p', default_limit: 9999 }),
      row({ id: 'c1', parent_id: 'p', default_limit: 100 }),
      row({ id: 'c2', parent_id: 'p', default_limit: 100 }),
    ]
    const r = computeBudgetBasis(rows, 'expense', [], {
      realized: win({ c1: { outgoing: 1_200 }, c2: { outgoing: 2_400 } }),
    })
    expect(r.entries.map(e => e.id)).toEqual(['c1', 'c2'])
    expect(r.annualTotal).toBe(3_600)
  })

  it('KIND-OPROL: een boeking RECHTSTREEKS op een parent-mét-kinderen verdampt niet', () => {
    // De parent wordt een extra post, maar alleen omdat er écht op hem geboekt
    // is; zijn geplande limiet telt als 0 (die is een kop boven zijn kinderen).
    const rows = [
      row({ id: 'p', default_limit: 9999 }),
      row({ id: 'c1', parent_id: 'p', default_limit: 100 }),
    ]
    const r = computeBudgetBasis(rows, 'expense', [], {
      realized: win({
        c1: { outgoing: 1_200 },
        p: { outgoing: 600 },
      }),
    })
    expect(r.entries.map(e => e.id)).toEqual(['c1', 'p'])
    expect(r.entries.find(e => e.id === 'p')!.plannedAnnualAmount).toBe(0)
    expect(r.annualTotal).toBe(1_800) // 1.200 + 600, elk budget_id precies één keer
  })

  it('zonder eigen boeking krijgt een parent-mét-kinderen GEEN extra vinkregel', () => {
    const rows = [row({ id: 'p', default_limit: 9999 }), row({ id: 'c1', parent_id: 'p', default_limit: 100 })]
    const r = computeBudgetBasis(rows, 'expense', [], {
      realized: win({ c1: { outgoing: 1_200 } }),
    })
    expect(r.entries.map(e => e.id)).toEqual(['c1'])
  })

  it('de uitsluitlijst werkt ongewijzigd op gerealiseerde posten', () => {
    const rows = [row({ id: 'a', default_limit: 0 }), row({ id: 'b', default_limit: 0 })]
    const r = computeBudgetBasis(rows, 'expense', ['b'], {
      realized: win({ a: { outgoing: 1_200 }, b: { outgoing: 6_000 } }),
    })
    expect(r.annualTotal).toBe(1_200)
    expect(r.entries.find(e => e.id === 'b')!.excluded).toBe(true)
  })

  it('REGRESSIE: zonder realisatie-invoer is elke post planned — identiek aan vóór de correctie', () => {
    const rows = [
      row({ id: 'm', default_limit: 100, interval: 'monthly' }),
      row({ id: 'q', default_limit: 100, interval: 'quarterly' }),
    ]
    const zonder = computeBudgetBasis(rows, 'expense', [])
    const leeg = computeBudgetBasis(rows, 'expense', [], { realized: win({}) })
    expect(zonder.annualTotal).toBe(1600)
    expect(leeg.annualTotal).toBe(zonder.annualTotal)
    expect(zonder.entries.every(e => e.source === 'planned')).toBe(true)
  })

  it('JAARPOST in de laatste afgesloten maand wordt NIET ×12 bij volle historie', () => {
    // Venster 2025-09…2026-08, een jaarlijkse gemeentebelasting van €800
    // afgeschreven in aug 2026 (de laatste afgesloten maand). De vorige betaling
    // (aug 2025) valt net buiten het venster. De deler is de historie van de
    // GEBRUIKER (12), niet de spanwijdte van deze ene boeking — €800/jr.
    const realized = win({ e: { outgoing: 800 } }, { historyMonths: 12 })
    const rows = [
      row({ id: 'e', default_limit: 800, interval: 'yearly', created_at: '2019-03-04T10:00:00Z' }),
    ]
    const r = computeBudgetBasis(rows, 'expense', [], { realized })
    expect(r.entries[0].annualAmount).toBe(800)
    expect(r.entries[0].realizedMonths).toBe(12)
    expect(r.annualTotal).not.toBe(9_600)
  })

  it('korte historie van de GEBRUIKER schaalt élke post op — ook een oud budget (ADR 0138)', () => {
    // Drie afgesloten maanden historie ⇒ deler 3 voor iedereen: €900 → €3.600.
    const realized = win({ oud: { outgoing: 900 }, jong: { outgoing: 900 } }, { historyMonths: 3 })
    const rows = [
      row({ id: 'oud', default_limit: 0, created_at: '2020-01-01T00:00:00Z' }),
      row({ id: 'jong', default_limit: 0, created_at: '2026-06-15T10:00:00Z' }),
    ]
    const r = computeBudgetBasis(rows, 'expense', [], { realized })
    for (const e of r.entries) {
      expect(e.realizedMonths).toBe(3)
      expect(e.annualAmount).toBe(3_600)
    }
  })

  it('created_at is irrelevant: een budget van gisteren met een boeking in het venster deelt door dezelfde N', () => {
    const realized = win({ e: { outgoing: 1_200 } }, { historyMonths: 12 })
    const rows = [row({ id: 'e', default_limit: 0, created_at: '2026-08-31T10:00:00Z' })]
    const r = computeBudgetBasis(rows, 'expense', [], { realized })
    expect(r.entries[0].realizedMonths).toBe(12)
    expect(r.entries[0].annualAmount).toBe(1_200)
  })

  it('ontbrekende created_at maakt geen verschil — de deler komt uit het venster', () => {
    const realized = win({ e: { outgoing: 800 } }, { historyMonths: 1 })
    const rows = [row({ id: 'e', default_limit: 0, created_at: null })]
    const r = computeBudgetBasis(rows, 'expense', [], { realized })
    // Eén afgesloten maand historie ⇒ €800 in die maand is €9.600 per jaar.
    expect(r.entries[0].annualAmount).toBe(9_600)
    expect(r.entries[0].realizedMonths).toBe(1)
  })

  it('een handgebouwd venster met een onzinnige deler wordt geklemd (defensief)', () => {
    const r = computeBudgetBasis([row({ id: 'e', default_limit: 0 })], 'expense', [], {
      realized: win({ e: { outgoing: 1_200 } }, { historyMonths: 0 }),
    })
    expect(r.entries[0].realizedMonths).toBe(1)
    expect(Number.isFinite(r.entries[0].annualAmount)).toBe(true)
  })

  it('de truncatie-kanarie reist mee naar het resultaat', () => {
    const r = computeBudgetBasis([row({ id: 'e', default_limit: 100 })], 'expense', [], {
      realized: win({ e: { outgoing: 1_200 } }, { truncationSuspected: true }),
    })
    expect(r.truncationSuspected).toBe(true)
    expect(r.realizedWindowMonths).toBe(12)
  })
})

describe('BASIS_SOURCES', () => {
  it('draagt precies de vier bronwaarden uit ADR 0103', () => {
    expect([...BASIS_SOURCES]).toEqual(['auto', 'budget', 'transaction', 'manual'])
  })
})
