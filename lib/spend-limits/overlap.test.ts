import { describe, it, expect } from 'vitest'
import {
  SPEND_LIMIT_MIN_MATCH_KEY_LENGTH,
  findOverlappingLimits,
  type SpendLimitOverlapSubject,
} from './overlap'

/**
 * Regel-overlap tussen potten (B3 / FR-B3-04, AC-B3-02, AC-B3-04).
 *
 * Drie dingen worden hier bewaakt:
 *  1. de DETECTIE klopt in beide richtingen (deeltekst heen én terug, voorouder
 *     én afstammeling);
 *  2. de detectie is PRECIES — een boomrelatie zonder `includeChildBudgets`
 *     levert geen valse waarschuwing;
 *  3. de UITKOMST draagt geen bedrag en geen rangorde (D38).
 */

function counterpartySubject(
  id: string,
  name: string,
  counterpartyKey: string,
  isActive = true,
): SpendLimitOverlapSubject {
  return { id, name, ruleType: 'counterparty', isActive, counterpartyKey }
}

function budgetSubject(
  id: string,
  name: string,
  budgetId: string,
  includeChildBudgets: boolean,
  isActive = true,
): SpendLimitOverlapSubject {
  return { id, name, ruleType: 'budget', isActive, budgetId, includeChildBudgets }
}

/** hoofd → sub → subsub, plus een losse tak ernaast. */
const BUDGET_TREE = new Map<string, string[]>([
  ['b-hoofd', ['b-sub']],
  ['b-sub', ['b-subsub']],
  ['b-anders', ['b-anders-kind']],
])

describe('findOverlappingLimits — tegenpartij-regels', () => {
  it('ziet de bestaande pot met de RUIMERE sleutel (kandidaat bevat de ander)', () => {
    const hits = findOverlappingLimits(
      { ruleType: 'counterparty', counterpartyKey: 'SHELLNL' },
      [counterpartySubject('p-1', 'Tanken', 'SHELL')],
    )

    expect(hits.map((h) => h.id)).toEqual(['p-1'])
    expect(hits[0].reason).toBe('counterparty_key_substring')
  })

  it('ziet de bestaande pot met de SMALLERE sleutel (de ander bevat de kandidaat)', () => {
    const hits = findOverlappingLimits(
      { ruleType: 'counterparty', counterpartyKey: 'shell' },
      [counterpartySubject('p-2', 'Tanken bij de snelweg', 'SHELLNLSNELWEG')],
    )

    expect(hits.map((h) => h.id)).toEqual(['p-2'])
  })

  it('normaliseert het rauwe label van de kandidaat net als de sleutel van de pot', () => {
    // "Shell (NL)" → "SHELLNL"; het leestekenverschil mag de match niet breken.
    const hits = findOverlappingLimits({ ruleType: 'counterparty', counterpartyKey: 'Shell (NL)' }, [
      counterpartySubject('p-3', 'Tanken', 'shell'),
    ])

    expect(hits).toHaveLength(1)
  })

  it('laat een niet-overlappende sleutel met rust', () => {
    const hits = findOverlappingLimits({ ruleType: 'counterparty', counterpartyKey: 'ALBERTHEIJN' }, [
      counterpartySubject('p-4', 'Tanken', 'SHELL'),
    ])

    expect(hits).toEqual([])
  })

  it('vergelijkt nooit met een budget-regel (kruiselings is niet af te leiden)', () => {
    const hits = findOverlappingLimits({ ruleType: 'counterparty', counterpartyKey: 'SHELL' }, [
      budgetSubject('p-5', 'Vervoer', 'b-hoofd', true),
    ])

    expect(hits).toEqual([])
  })

  it('sluit de pot die bewerkt wordt uit — die overlapt niet met zichzelf', () => {
    const hits = findOverlappingLimits(
      { ruleType: 'counterparty', counterpartyKey: 'SHELL', id: 'p-6' },
      [counterpartySubject('p-6', 'Tanken', 'SHELL')],
    )

    expect(hits).toEqual([])
  })

  it('doet niets bij een sleutel onder de minimale matchlengte', () => {
    expect(SPEND_LIMIT_MIN_MATCH_KEY_LENGTH).toBe(2)

    const potten = [counterpartySubject('p-7', 'Tanken', 'SHELL')]
    expect(findOverlappingLimits({ ruleType: 'counterparty', counterpartyKey: 'S' }, potten)).toEqual(
      [],
    )
    // "!!!" normaliseert naar een lege sleutel — die zou anders álles matchen.
    expect(
      findOverlappingLimits({ ruleType: 'counterparty', counterpartyKey: '!!!' }, potten),
    ).toEqual([])
    expect(findOverlappingLimits({ ruleType: 'counterparty', counterpartyKey: null }, potten)).toEqual(
      [],
    )
  })

  it('slaat een bestaande pot met een lege sleutel over in plaats van alles te matchen', () => {
    const hits = findOverlappingLimits({ ruleType: 'counterparty', counterpartyKey: 'SHELL' }, [
      counterpartySubject('p-8', 'Kapotte regel', ''),
    ])

    expect(hits).toEqual([])
  })

  it('meldt ook een gepauzeerde pot, met zijn status erbij', () => {
    const hits = findOverlappingLimits({ ruleType: 'counterparty', counterpartyKey: 'SHELL' }, [
      counterpartySubject('p-9', 'Tanken', 'SHELL', false),
    ])

    expect(hits).toHaveLength(1)
    expect(hits[0].isActive).toBe(false)
  })
})

describe('findOverlappingLimits — budget-regels', () => {
  it('meldt exact hetzelfde budget', () => {
    const hits = findOverlappingLimits(
      { ruleType: 'budget', budgetId: 'b-sub', includeChildBudgets: false },
      [budgetSubject('p-10', 'Vervoer', 'b-sub', false)],
      BUDGET_TREE,
    )

    expect(hits.map((h) => h.reason)).toEqual(['same_budget'])
  })

  it('meldt een VOOROUDER: de bestaande pot trekt het gekozen budget mee', () => {
    const hits = findOverlappingLimits(
      { ruleType: 'budget', budgetId: 'b-subsub', includeChildBudgets: false },
      [budgetSubject('p-11', 'Alles eromheen', 'b-hoofd', true)],
      BUDGET_TREE,
    )

    expect(hits.map((h) => h.reason)).toEqual(['budget_ancestor'])
  })

  it('meldt een AFSTAMMELING: de kandidaat trekt het budget van de bestaande pot mee', () => {
    const hits = findOverlappingLimits(
      { ruleType: 'budget', budgetId: 'b-hoofd', includeChildBudgets: true },
      [budgetSubject('p-12', 'Alleen het kleinkind', 'b-subsub', false)],
      BUDGET_TREE,
    )

    expect(hits.map((h) => h.reason)).toEqual(['budget_descendant'])
  })

  it('meldt NIETS bij een boomrelatie waar geen van beide kinderen meetelt', () => {
    // Precisie boven volledigheid: een pot op het hoofdbudget zonder kinderen
    // ziet de boekingen van het subbudget niet, dus er is geen overlap.
    const hits = findOverlappingLimits(
      { ruleType: 'budget', budgetId: 'b-sub', includeChildBudgets: false },
      [budgetSubject('p-13', 'Hoofd zonder kinderen', 'b-hoofd', false)],
      BUDGET_TREE,
    )

    expect(hits).toEqual([])
  })

  it('meldt niets voor een budget in een andere tak', () => {
    const hits = findOverlappingLimits(
      { ruleType: 'budget', budgetId: 'b-hoofd', includeChildBudgets: true },
      [budgetSubject('p-14', 'Andere tak', 'b-anders-kind', false)],
      BUDGET_TREE,
    )

    expect(hits).toEqual([])
  })

  it('valt zonder boom terug op exact-hetzelfde-budget', () => {
    const potten = [
      budgetSubject('p-15', 'Zelfde budget', 'b-hoofd', false),
      budgetSubject('p-16', 'Kind', 'b-sub', false),
    ]

    expect(
      findOverlappingLimits(
        { ruleType: 'budget', budgetId: 'b-hoofd', includeChildBudgets: true },
        potten,
      ).map((h) => h.id),
    ).toEqual(['p-15'])
  })

  it('loopt niet vast op een cyclische ouder-kindketen', () => {
    const cyclisch = new Map<string, string[]>([
      ['b-a', ['b-b']],
      ['b-b', ['b-a']],
    ])

    const hits = findOverlappingLimits(
      { ruleType: 'budget', budgetId: 'b-a', includeChildBudgets: true },
      [budgetSubject('p-17', 'Ronddraaiend', 'b-b', false)],
      cyclisch,
    )

    expect(hits.map((h) => h.id)).toEqual(['p-17'])
  })
})

describe('findOverlappingLimits — vorm van de uitkomst', () => {
  it('draagt geen bedrag en geen rangorde', () => {
    const hits = findOverlappingLimits({ ruleType: 'counterparty', counterpartyKey: 'SHELL' }, [
      counterpartySubject('p-18', 'Tweede', 'SHELLNL'),
      counterpartySubject('p-19', 'Eerste', 'SHELL'),
    ])

    // Volgorde = de meegegeven lijst, niet gesorteerd op "erg" of op bedrag.
    expect(hits.map((h) => h.id)).toEqual(['p-18', 'p-19'])
    for (const hit of hits) {
      expect(Object.keys(hit).sort()).toEqual(['id', 'isActive', 'name', 'reason', 'ruleType'])
      for (const value of Object.values(hit)) {
        expect(typeof value).not.toBe('number')
      }
    }
  })
})
