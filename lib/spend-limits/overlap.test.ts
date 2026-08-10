import { describe, it, expect } from 'vitest'
import {
  SPEND_LIMIT_MIN_MATCH_KEY_LENGTH,
  findOverlappingLimits,
  type SpendLimitOverlapCandidate,
  type SpendLimitOverlapSubject,
} from './overlap'

/**
 * Regel-overlap tussen potten (B3 / FR-B3-04, AC-B3-02, AC-B3-04).
 *
 * Vier dingen worden hier bewaakt:
 *  1. de DETECTIE klopt in beide richtingen (deeltekst heen én terug, voorouder
 *     én afstammeling);
 *  2. de detectie is PRECIES — een boomrelatie zonder `includeChildBudgets`
 *     levert geen valse waarschuwing;
 *  3. de UITKOMST draagt geen bedrag en geen rangorde (D38);
 *  4. sinds 10-08-2026: meerdere waarden per dimensie en meerdere REGELS per pot
 *     leveren hoogstens ÉÉN treffer per pot op — vier keer dezelfde naam in de
 *     waarschuwingszin zou als een fout lezen.
 */

/** Kandidaat met alleen tegenpartijen. */
function cpCandidate(
  keys: (string | null | undefined)[],
  id: string | null = null,
): SpendLimitOverlapCandidate {
  return { budgetIds: [], includeChildBudgets: true, counterpartyKeys: keys, id }
}

/** Kandidaat met alleen budgetten. */
function budgetCandidate(
  budgetIds: string[],
  includeChildBudgets: boolean,
  id: string | null = null,
): SpendLimitOverlapCandidate {
  return { budgetIds, includeChildBudgets, counterpartyKeys: [], id }
}

function counterpartySubject(
  id: string,
  name: string,
  counterpartyKey: string,
  isActive = true,
): SpendLimitOverlapSubject {
  return {
    id,
    name,
    ruleType: 'counterparty',
    isActive,
    rules: [{ budgetIds: [], counterpartyKeys: [counterpartyKey] }],
  }
}

function budgetSubject(
  id: string,
  name: string,
  budgetId: string,
  includeChildBudgets: boolean,
  isActive = true,
): SpendLimitOverlapSubject {
  return {
    id,
    name,
    ruleType: 'budget',
    isActive,
    rules: [{ budgetIds: [budgetId], includeChildBudgets, counterpartyKeys: [] }],
  }
}

/** hoofd → sub → subsub, plus een losse tak ernaast. */
const BUDGET_TREE = new Map<string, string[]>([
  ['b-hoofd', ['b-sub']],
  ['b-sub', ['b-subsub']],
  ['b-anders', ['b-anders-kind']],
])

describe('findOverlappingLimits — tegenpartij-dimensie', () => {
  it('ziet de bestaande pot met de RUIMERE sleutel (kandidaat bevat de ander)', () => {
    const hits = findOverlappingLimits(cpCandidate(['SHELLNL']), [
      counterpartySubject('p-1', 'Tanken', 'SHELL'),
    ])

    expect(hits.map((h) => h.id)).toEqual(['p-1'])
    expect(hits[0].reason).toBe('counterparty_key_substring')
  })

  it('ziet de bestaande pot met de SMALLERE sleutel (de ander bevat de kandidaat)', () => {
    const hits = findOverlappingLimits(cpCandidate(['shell']), [
      counterpartySubject('p-2', 'Tanken bij de snelweg', 'SHELLNLSNELWEG'),
    ])

    expect(hits.map((h) => h.id)).toEqual(['p-2'])
  })

  it('normaliseert het rauwe label van de kandidaat net als de sleutel van de pot', () => {
    // "Shell (NL)" → "SHELLNL"; het leestekenverschil mag de match niet breken.
    const hits = findOverlappingLimits(cpCandidate(['Shell (NL)']), [
      counterpartySubject('p-3', 'Tanken', 'shell'),
    ])

    expect(hits).toHaveLength(1)
  })

  it('laat een niet-overlappende sleutel met rust', () => {
    const hits = findOverlappingLimits(cpCandidate(['ALBERTHEIJN']), [
      counterpartySubject('p-4', 'Tanken', 'SHELL'),
    ])

    expect(hits).toEqual([])
  })

  it('vergelijkt nooit met een budget-dimensie (kruiselings is niet af te leiden)', () => {
    const hits = findOverlappingLimits(cpCandidate(['SHELL']), [
      budgetSubject('p-5', 'Vervoer', 'b-hoofd', true),
    ])

    expect(hits).toEqual([])
  })

  it('sluit de pot die bewerkt wordt uit — die overlapt niet met zichzelf', () => {
    const hits = findOverlappingLimits(cpCandidate(['SHELL'], 'p-6'), [
      counterpartySubject('p-6', 'Tanken', 'SHELL'),
    ])

    expect(hits).toEqual([])
  })

  it('doet niets bij een sleutel onder de minimale matchlengte', () => {
    expect(SPEND_LIMIT_MIN_MATCH_KEY_LENGTH).toBe(2)

    const potten = [counterpartySubject('p-7', 'Tanken', 'SHELL')]
    expect(findOverlappingLimits(cpCandidate(['S']), potten)).toEqual([])
    // "!!!" normaliseert naar een lege sleutel — die zou anders álles matchen.
    expect(findOverlappingLimits(cpCandidate(['!!!']), potten)).toEqual([])
    expect(findOverlappingLimits(cpCandidate([null]), potten)).toEqual([])
  })

  it('slaat een bestaande pot met een lege sleutel over in plaats van alles te matchen', () => {
    const hits = findOverlappingLimits(cpCandidate(['SHELL']), [
      counterpartySubject('p-8', 'Kapotte regel', ''),
    ])

    expect(hits).toEqual([])
  })

  it('meldt ook een gepauzeerde pot, met zijn status erbij', () => {
    const hits = findOverlappingLimits(cpCandidate(['SHELL']), [
      counterpartySubject('p-9', 'Tanken', 'SHELL', false),
    ])

    expect(hits).toHaveLength(1)
    expect(hits[0].isActive).toBe(false)
  })

  it('matcht zodra ÉÉN van de kandidaat-sleutels raakt (OF binnen de dimensie)', () => {
    const hits = findOverlappingLimits(cpCandidate(['ALBERTHEIJN', 'SHELL']), [
      counterpartySubject('p-20', 'Tanken', 'SHELL'),
    ])

    expect(hits.map((h) => h.id)).toEqual(['p-20'])
  })

  it('kijkt naar ALLE sleutels van de bestaande pot, niet alleen de eerste', () => {
    const pot: SpendLimitOverlapSubject = {
      id: 'p-21',
      name: 'Onderweg',
      ruleType: 'counterparty',
      isActive: true,
      rules: [{ budgetIds: [], counterpartyKeys: ['ALBERTHEIJN', 'SHELL'] }],
    }

    expect(findOverlappingLimits(cpCandidate(['SHELL']), [pot]).map((h) => h.id)).toEqual(['p-21'])
  })
})

describe('findOverlappingLimits — budget-dimensie', () => {
  it('meldt exact hetzelfde budget', () => {
    const hits = findOverlappingLimits(
      budgetCandidate(['b-sub'], false),
      [budgetSubject('p-10', 'Vervoer', 'b-sub', false)],
      BUDGET_TREE,
    )

    expect(hits.map((h) => h.reason)).toEqual(['same_budget'])
  })

  it('meldt een VOOROUDER: de bestaande pot trekt het gekozen budget mee', () => {
    const hits = findOverlappingLimits(
      budgetCandidate(['b-subsub'], false),
      [budgetSubject('p-11', 'Alles eromheen', 'b-hoofd', true)],
      BUDGET_TREE,
    )

    expect(hits.map((h) => h.reason)).toEqual(['budget_ancestor'])
  })

  it('meldt een AFSTAMMELING: de kandidaat trekt het budget van de bestaande pot mee', () => {
    const hits = findOverlappingLimits(
      budgetCandidate(['b-hoofd'], true),
      [budgetSubject('p-12', 'Alleen het kleinkind', 'b-subsub', false)],
      BUDGET_TREE,
    )

    expect(hits.map((h) => h.reason)).toEqual(['budget_descendant'])
  })

  it('meldt NIETS bij een boomrelatie waar geen van beide kinderen meetelt', () => {
    // Precisie boven volledigheid: een pot op het hoofdbudget zonder kinderen
    // ziet de boekingen van het subbudget niet, dus er is geen overlap.
    const hits = findOverlappingLimits(
      budgetCandidate(['b-sub'], false),
      [budgetSubject('p-13', 'Hoofd zonder kinderen', 'b-hoofd', false)],
      BUDGET_TREE,
    )

    expect(hits).toEqual([])
  })

  it('meldt niets voor een budget in een andere tak', () => {
    const hits = findOverlappingLimits(
      budgetCandidate(['b-hoofd'], true),
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
      findOverlappingLimits(budgetCandidate(['b-hoofd'], true), potten).map((h) => h.id),
    ).toEqual(['p-15'])
  })

  it('loopt niet vast op een cyclische ouder-kindketen', () => {
    const cyclisch = new Map<string, string[]>([
      ['b-a', ['b-b']],
      ['b-b', ['b-a']],
    ])

    const hits = findOverlappingLimits(
      budgetCandidate(['b-a'], true),
      [budgetSubject('p-17', 'Ronddraaiend', 'b-b', false)],
      cyclisch,
    )

    expect(hits.map((h) => h.id)).toEqual(['p-17'])
  })

  it('matcht zodra ÉÉN van de gekozen budgetten raakt (OF binnen de dimensie)', () => {
    const hits = findOverlappingLimits(
      budgetCandidate(['b-anders', 'b-sub'], false),
      [budgetSubject('p-22', 'Vervoer', 'b-sub', false)],
      BUDGET_TREE,
    )

    expect(hits.map((h) => h.reason)).toEqual(['same_budget'])
  })
})

describe('findOverlappingLimits — meerdere regels per pot', () => {
  const gemengd: SpendLimitOverlapSubject = {
    id: 'p-30',
    name: 'Uit eten',
    ruleType: 'mixed',
    isActive: true,
    rules: [
      { budgetIds: ['b-hoofd'], includeChildBudgets: true, counterpartyKeys: [] },
      { budgetIds: [], counterpartyKeys: ['SHELL'] },
    ],
  }

  it('kijkt naar ELKE regel van de pot, niet alleen de eerste', () => {
    // De tweede regel draagt de tegenpartij; een detectie die op regel 1 stopt,
    // zou hier niets melden.
    expect(findOverlappingLimits(cpCandidate(['SHELL']), [gemengd]).map((h) => h.id)).toEqual([
      'p-30',
    ])
  })

  it('meldt een pot hoogstens ÉÉN keer, ook als meerdere regels raken', () => {
    const kandidaat: SpendLimitOverlapCandidate = {
      budgetIds: ['b-sub'],
      includeChildBudgets: true,
      counterpartyKeys: ['SHELL'],
      id: null,
    }

    const hits = findOverlappingLimits(kandidaat, [gemengd], BUDGET_TREE)
    expect(hits).toHaveLength(1)
    expect(hits[0].id).toBe('p-30')
  })
})

describe('findOverlappingLimits — vorm van de uitkomst', () => {
  it('draagt geen bedrag en geen rangorde', () => {
    const hits = findOverlappingLimits(cpCandidate(['SHELL']), [
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
