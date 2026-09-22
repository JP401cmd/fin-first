import { describe, it, expect } from 'vitest'
import { bouwKrantMeting, metingCelTekst, KRANT_METING_KOLOMMEN, type RuweJobRun } from './meting-beheer'
import { onderdrukPerProfieltype } from './meting'
import { GEBRUIK_K } from '@/lib/beheer/gebruik-analyse/onderdrukking'

/**
 * De meting van de schaduweditie leest de cron-summary terug. Wat hier telt:
 * niets herberekenen, niets opnieuw onderdrukken, en nooit een onderdrukte cel
 * optellen.
 */

function run(summary: unknown, extra: Partial<RuweJobRun> = {}): RuweJobRun {
  return { status: 'success', started_at: '2026-09-21T06:00:00.000Z', summary, error: null, ...extra }
}

const VOLLE_SUMMARY = {
  week: '2026-W39',
  gebruikers: 21,
  edities: 18,
  leeg: 4,
  overgeslagen: 3,
  fouten: 0,
  opgeruimd: 2,
  kandidaten: 40,
  kandidatenOngeldig: 1,
  tijdBudgetOp: false,
  perProfieltype: { 'oud-koop-partner': { edities: 7, leeg: 'klein' }, 'jong-huur-alleen': { edities: 'klein', leeg: 'klein' } },
  testaccounts: {
    gemeten: 5,
    overlapBeide: 6,
    alleenMatcher: 9,
    alleenModel: 11,
    perProfieltype: { 'jong-huur-alleen': { edities: 1, leeg: 0 }, 'oud-koop-partner': { edities: 1, leeg: 1 } },
  },
}

describe('bouwKrantMeting', () => {
  it('leest de summary één-op-één terug, zonder de onderdrukte cellen aan te raken', () => {
    const { runs } = bouwKrantMeting([run(VOLLE_SUMMARY)])
    expect(runs).toHaveLength(1)
    const r = runs[0]
    expect(r.week).toBe('2026-W39')
    expect(r.edities).toBe(18)
    expect(r.leeg).toBe(4)
    expect(r.overgeslagen).toBe(3)
    expect(r.kandidatenOngeldig).toBe(1)
    expect(r.perProfieltype['oud-koop-partner']).toEqual({ edities: 7, leeg: 'klein' })
    expect(r.perProfieltype['jong-huur-alleen']).toEqual({ edities: 'klein', leeg: 'klein' })
  })

  it('telt alleen op wat veilig optelbaar is: totalen en testaccounts, nooit de echte verdeling', () => {
    const tweede = { ...VOLLE_SUMMARY, week: '2026-W40', edities: 20, leeg: 5 }
    const { totalen } = bouwKrantMeting([run(VOLLE_SUMMARY), run(tweede)])
    expect(totalen.runs).toBe(2)
    expect(totalen.edities).toBe(38)
    expect(totalen.leeg).toBe(9)
    expect(totalen.leegAandeel).toBeCloseTo(9 / 38)
    expect(totalen.testaccounts.overlapBeide).toBe(12)
    expect(totalen.testaccounts.perProfieltype['oud-koop-partner']).toEqual({ edities: 2, leeg: 2 })
    // De echte verdeling komt nergens in de totalen voor — er is geen veld om
    // 'klein' bij op te tellen, en dat is precies de bedoeling.
    expect(Object.keys(totalen)).not.toContain('perProfieltype')
  })

  it('een run zonder leesbare week valt weg en telt als zonderSummary', () => {
    const { runs, totalen } = bouwKrantMeting([run(null), run({ gebruikers: 3 }), run(VOLLE_SUMMARY)])
    expect(runs.map((r) => r.week)).toEqual(['2026-W39'])
    expect(totalen.runs).toBe(3)
    expect(totalen.zonderSummary).toBe(2)
    expect(totalen.edities).toBe(18)
  })

  it('een onvolledige of vreemd getypeerde summary levert nullen, geen NaN en geen crash', () => {
    const { runs } = bouwKrantMeting([
      run({ week: '2026-W41', edities: 'twee', leeg: null, perProfieltype: 'kapot', testaccounts: 7 }),
    ])
    const r = runs[0]
    expect(r.edities).toBe(0)
    expect(r.leeg).toBe(0)
    expect(r.gebruikers).toBe(0)
    expect(r.perProfieltype).toEqual({})
    expect(r.testaccounts.perProfieltype).toEqual({})
    expect(r.testaccounts.gemeten).toBe(0)
  })

  it('een onleesbare cel wordt verborgen, niet stil een getal of "klein"', () => {
    const { runs } = bouwKrantMeting([
      run({ week: '2026-W41', perProfieltype: { x: { edities: undefined, leeg: 'iets-anders' } } }),
    ])
    expect(runs[0].perProfieltype.x).toEqual({ edities: 'verborgen', leeg: 'verborgen' })
  })

  it('status error en fouttekst komen mee', () => {
    const { runs } = bouwKrantMeting([run({ ...VOLLE_SUMMARY, fouten: 2 }, { status: 'error', error: '2 gebruikers faalden' })])
    expect(runs[0].status).toBe('error')
    expect(runs[0].fouten).toBe(2)
    expect(runs[0].fout).toBe('2 gebruikers faalden')
  })

  it('leegAandeel is null zonder editie (geen deling door nul)', () => {
    const { totalen } = bouwKrantMeting([run({ week: '2026-W41' })])
    expect(totalen.leegAandeel).toBeNull()
  })

  it('de kolomlijst is een telling-lijst: geen inhoud van een editie of profiel', () => {
    expect(KRANT_METING_KOLOMMEN).not.toMatch(/tekst|slots|snapshot|profiel|titel|samenvatting|user_id/)
    expect(KRANT_METING_KOLOMMEN).toContain('summary')
  })
})

describe('metingCelTekst', () => {
  it('gebruikt de canonieke celtekst van de onderdrukking', () => {
    expect(metingCelTekst(12)).toBe('12')
    expect(metingCelTekst('klein')).toBe(`< ${GEBRUIK_K}`)
    expect(metingCelTekst('verborgen')).toBe('verborgen')
  })
})

describe('de keten cron → job_runs → paneel', () => {
  it('wat onderdrukPerProfieltype schrijft, leest bouwKrantMeting ongewijzigd terug', () => {
    const ruw = { a: { edities: 7, leeg: 6 }, b: { edities: 2, leeg: 1 } }
    const onderdrukt = onderdrukPerProfieltype(ruw, { edities: 9, leeg: 7 })
    const summary = { week: '2026-W42', edities: 9, leeg: 7, perProfieltype: onderdrukt }
    const { runs } = bouwKrantMeting([run(JSON.parse(JSON.stringify(summary)))])
    expect(runs[0].perProfieltype).toEqual(onderdrukt)
    // En de kleine cel blijft klein: het paneel kan hem niet terugrekenen.
    expect(runs[0].perProfieltype.b.edities).not.toBe(2)
  })
})
