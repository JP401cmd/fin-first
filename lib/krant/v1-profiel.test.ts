import { describe, expect, it } from 'vitest'
import { profielResponseSchema, type ProfielPutBody } from './contract'
import { LEEG_PROFIEL } from './profiel'
import { putNaarKolommen, rijNaarV1Profiel, schoneHerkomst, NIEUWSPROFIEL_V1_KOLOMMEN } from './v1-profiel'

/**
 * De vertaling rij ↔ v1-contract (Krant 3A, ADR 0187). De kern: wat de PUT
 * schrijft bevat NOOIT krant_variant, afgeleid_at of tijdlijn_* — ook niet bij
 * een body met alle dertien velden — en de GET leest ze niet.
 */

const VOL: ProfielPutBody = {
  geboortejaar: 1990,
  huishouden: 'alleen',
  kinderen: 'geen',
  werk: ['zelfstandig'],
  inkomen: '2500-3250',
  wonen: 'huur-vrije-sector',
  hypotheek: { restschuld: null, rentevast: null },
  woonplan: 'kopen-binnen-2-jaar',
  spaargeld: '5k-25k',
  beleggingen: { band: 'geen', vorm: null },
  schulden: ['studieschuld-tot-15k'],
  pensioenopbouw: { werkgever: 'nee', lijfrente: 'nee' },
  rubrieken: ['woningmarkt', 'fiscaal'],
}

describe('putNaarKolommen', () => {
  it('een volle body schrijft alleen profielkolommen, herkomst, updated_at en user_id', () => {
    const rij = putNaarKolommen(VOL, {}, 'user-a', '2026-09-29T10:00:00.000Z')
    expect(Object.keys(rij).sort()).toEqual(
      [
        'user_id', 'geboortejaar', 'huishouden', 'kinderen', 'werk', 'inkomen', 'wonen',
        'hypotheek_restschuld', 'hypotheek_rentevast', 'woonplan', 'spaargeld', 'beleggingen',
        'beleggingen_vorm', 'schulden', 'pensioen_werkgever', 'pensioen_lijfrente', 'rubrieken',
        'herkomst', 'updated_at',
      ].sort(),
    )
    expect(Object.values(rij.herkomst as object).every((h) => h === 'zelf')).toBe(true)
  })

  it('houdt de bestaande herkomst en overschrijft alleen de meegegeven velden', () => {
    const rij = putNaarKolommen({ woonplan: null }, { inkomen: 'afgeleid', woonplan: 'afgeleid' }, 'user-a', 'nu')
    expect(rij.herkomst).toEqual({ inkomen: 'afgeleid', woonplan: 'zelf' })
    expect(rij).not.toHaveProperty('inkomen')
  })
})

describe('rijNaarV1Profiel / schoneHerkomst', () => {
  it('geen rij → het lege profiel, geldig volgens het contract', () => {
    const uit = profielResponseSchema.parse(rijNaarV1Profiel(null))
    expect(uit.profiel).toEqual(LEEG_PROFIEL)
    expect(uit.herkomst).toEqual({})
  })

  it('herkomst: alleen bekende velden met een bekende waarde', () => {
    expect(schoneHerkomst({ inkomen: 'zelf', krant_variant: 'zelf', wonen: 'geraden' })).toEqual({ inkomen: 'zelf' })
    expect(schoneHerkomst(null)).toEqual({})
    expect(schoneHerkomst(['zelf'])).toEqual({})
  })

  it('de GET leest nooit de variant- of tijdlijnkolommen', () => {
    expect(NIEUWSPROFIEL_V1_KOLOMMEN).not.toMatch(/krant_variant|tijdlijn_|\*/)
  })
})
