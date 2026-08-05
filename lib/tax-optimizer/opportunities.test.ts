import { describe, it, expect } from 'vitest'
import { toTaxOpportunities, type Opportunity } from './opportunities'
import { JAARRUIMTE_AANDACHTSPUNT_ID } from '@/lib/aandachtspunten'

/**
 * Dekking voor de PROJECTIE naar de compacte hub-/aandachtspunten-vorm.
 * `buildOpportunities` (de samenstelling uit `GoalSection`s) wordt gedekt door
 * components/overview/belasting/optimizer-model.test.ts; hier gaat het om de
 * drie beloftes van `toTaxOpportunities`: de toelatingsregel, de sortering en
 * de STABIELE externe id + routing.
 */

function opp(partial: Partial<Opportunity> & { id: string; netEffect: number }): Opportunity {
  return {
    kind: 'box3',
    boxLabel: 'Box 3',
    title: partial.id,
    description: '',
    savings: partial.netEffect,
    returnCostEur: 0,
    netFreedomDays: 0,
    hasReturnCost: false,
    optimizedTax: null,
    detail: [],
    caveat: null,
    freedomDots: 3,
    freedomNote: null,
    effortDots: 1,
    effortNote: null,
    trajectory: null,
    shiftCurve: null,
    strategy: null,
    ...partial,
  }
}

describe('toTaxOpportunities — toelatingsregel netEffect > 0', () => {
  it('laat alleen kansen door die per saldo iets opleveren', () => {
    const result = toTaxOpportunities([
      opp({ id: 'winst', netEffect: 250 }),
      opp({ id: 'neutraal', netEffect: 0 }),
      // Bruto bespaart dit €47 belasting, maar het kost €359 verwacht
      // rendement — precies het geval waarvoor de regel bestaat.
      opp({ id: 'kost-geld', savings: 47, netEffect: -312, hasReturnCost: true }),
    ])
    expect(result.map((o) => o.id)).toEqual(['winst'])
  })

  it('levert een lege lijst wanneer geen enkele kans netto positief is', () => {
    expect(toTaxOpportunities([opp({ id: 'a', netEffect: -1 })])).toEqual([])
    expect(toTaxOpportunities([])).toEqual([])
  })
})

describe('toTaxOpportunities — sortering', () => {
  it('sorteert op netto effect (aflopend), niet op bruto besparing', () => {
    const result = toTaxOpportunities([
      opp({ id: 'bruto-groot', savings: 900, netEffect: 100, hasReturnCost: true }),
      opp({ id: 'netto-groot', savings: 400, netEffect: 400 }),
    ])
    expect(result.map((o) => o.id)).toEqual(['netto-groot', 'bruto-groot'])
  })

  it('gebruikt bruto besparing als tiebreak bij gelijk netto effect', () => {
    const result = toTaxOpportunities([
      opp({ id: 'lage-bruto', savings: 200, netEffect: 200 }),
      opp({ id: 'hoge-bruto', savings: 700, netEffect: 200, hasReturnCost: true }),
    ])
    expect(result.map((o) => o.id)).toEqual(['hoge-bruto', 'lage-bruto'])
  })
})

describe('toTaxOpportunities — routing en stabiele id', () => {
  it('Box 3-scenario’s houden hun eigen id en linken naar de optimizer', () => {
    const [row] = toTaxOpportunities([
      opp({ id: 'samenstelling-shift', savings: 500, netEffect: 120, netFreedomDays: 1 }),
    ])
    expect(row).toEqual({
      id: 'samenstelling-shift',
      title: 'samenstelling-shift',
      box: 3,
      savings: 500,
      netEffect: 120,
      netFreedomDays: 1,
      href: '/overzicht/belasting/optimizer',
    })
    expect(row.deadline).toBeUndefined()
  })

  it('de partnerverdeling houdt de HISTORISCHE externe id (opgeslagen acties blijven onderdrukt)', () => {
    // `tax:partner-allocatie` staat persistent in actions.metadata bij iedereen
    // die deze kans vóór ADR 0086 als actie toevoegde. Intern heet de strategie
    // nu 'partnerverdeling'; ging die naam ongefilterd naar buiten, dan zou
    // filterActionedAandachtspunten de bestaande actie niet meer matchen en
    // dook de kans opnieuw als suggestie op.
    const [row] = toTaxOpportunities([
      opp({ id: 'partnerverdeling', savings: 800, netEffect: 800, netFreedomDays: 8 }),
    ])
    expect(row.id).toBe('partner-allocatie')
    expect(row.box).toBe(3)
  })

  it('de jaarruimte-kans draagt naar buiten de STABIELE id, niet het doel-id', () => {
    // Intern is de id het DOEL-id (zodat findWinner 'm aan pickTopChoice kan
    // koppelen); naar buiten moet 'jaarruimte' blijven staan, want die string
    // ligt vast in opgeslagen acties (metadata.aandachtspunt_id) en in de
    // AI-contexten. Zonder de mapping verliest elke bestaande actie zijn
    // suppressie en duikt de kans opnieuw als suggestie op.
    const [row] = toTaxOpportunities([
      opp({
        id: 'jaarruimte-maximaal',
        kind: 'jaarruimte',
        boxLabel: 'Box 1',
        netEffect: 1_200,
        netFreedomDays: 12,
      }),
    ])
    expect(row.id).toBe('jaarruimte')
    expect(`tax:${row.id}`).toBe(JAARRUIMTE_AANDACHTSPUNT_ID)
    expect(row.box).toBe(1)
    expect(row.deadline).toBe('31 dec')
    expect(row.href).toBe('/overzicht/belasting/box1#jaarruimte-uitleg')
  })
})
