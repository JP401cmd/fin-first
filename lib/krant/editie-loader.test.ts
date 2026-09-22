import { beforeEach, describe, expect, it } from 'vitest'
import { AOW_RIJEN, ARTIKELEN, NU, PROFIEL_TESSA } from './editie.fixture'
import { maakNepClient, type NepRij } from './nep-client.fixture'
import { KANDIDAAT_KOLOMMEN, kandidatenVensterFilter, laadKandidaten, laadLezerContext, newsReadKey } from './editie-loader'
import { WEEK_VENSTER_DAGEN, matchEditie, voldoetAanLeescontract } from './matcher'
import { standaardImpactContext } from './impact'

const UID = 'user-a'

/**
 * Het predicaat dat de nep-client voor `.or(expr)` krijgt: dezelfde twee
 * voorwaarden als de PostgREST-expressie, in JS. De expressie zelf wordt
 * apart op vorm getoetst — dit predicaat bewijst niet dat PostgREST 'm
 * parseert (dat is een live-check bij de release-smoke), wel dat de loader
 * de juiste kandidaten doorlaat en het schema toepast.
 */
function orPredicaat(expr: string, rij: NepRij): boolean {
  const grens = /fetched_at\.gte\."([^"]+)"/.exec(expr)![1]
  const vandaag = /datum\.gte\."([^"]+)"/.exec(expr)![1]
  const deadline = (rij.duiding as { deadline?: { datum?: string } | null } | null)?.deadline?.datum
  return String(rij.fetched_at) >= grens || (!!deadline && deadline >= vandaag)
}

let artikelRijen: NepRij[]

beforeEach(() => {
  artikelRijen = ARTIKELEN.map((a) => ({ ...a }))
})

describe('editie-loader — kandidaten', () => {
  it('het or-filter quoot beide waarden en noemt beide voorwaarden (venster óf toekomstige deadline)', () => {
    const f = kandidatenVensterFilter('2026-09-14T06:00:00.000Z', '2026-09-21')
    expect(f).toBe('fetched_at.gte."2026-09-14T06:00:00.000Z",duiding->deadline->>datum.gte."2026-09-21"')
  })

  it('vraagt expliciete kolommen zonder summary/is_used/potential_impact en filtert op geduid + het venster', async () => {
    const nep = maakNepClient({ news_articles: artikelRijen }, { or: orPredicaat })
    const { artikelen, ongeldig } = await laadKandidaten(nep.client as never, NU)
    const q = nep.queriesOp('news_articles')[0]
    expect(q.stappen.find((s) => s.m === 'select')!.args[0]).toBe(KANDIDAAT_KOLOMMEN)
    expect(KANDIDAAT_KOLOMMEN).not.toMatch(/summary|is_used|potential_impact|\*/)
    expect(q.stappen.some((s) => s.m === 'eq' && s.args[0] === 'duiding_status' && s.args[1] === 'geduid')).toBe(true)
    const orStap = q.stappen.find((s) => s.m === 'or')!
    const grens = new Date(NU.getTime() - WEEK_VENSTER_DAGEN * 24 * 3600 * 1000).toISOString()
    expect(orStap.args[0]).toBe(kandidatenVensterFilter(grens, '2026-09-21'))
    expect(ongeldig).toBe(0)
    // De voorselectie is een superset van het pure leescontract: alles wat de
    // matcher leesbaar vindt, zit erin.
    const ctx = { now: NU, gezienArtikelIds: new Set<string>(), gedemptRubrieken: new Set<string>(), impact: standaardImpactContext(AOW_RIJEN, NU.getUTCFullYear()) }
    const leesbaar = ARTIKELEN.filter((a) => voldoetAanLeescontract(a, ctx)).map((a) => a.id)
    expect(leesbaar.length).toBeGreaterThan(0)
    for (const id of leesbaar) expect(artikelen.map((a) => a.id)).toContain(id)
    // …en de matcher geeft op de geladen set dezelfde editie als op de fixture.
    expect(matchEditie(PROFIEL_TESSA, artikelen, ctx)).toEqual(matchEditie(PROFIEL_TESSA, ARTIKELEN, ctx))
  })

  it('een rij met status geduid maar een duiding die het schema niet haalt telt niet mee en wordt geteld', async () => {
    artikelRijen.push({ ...ARTIKELEN[0], id: 'kapot', duiding: { versie: 1, onzin: true } })
    artikelRijen.push({ ...ARTIKELEN[0], id: 'zonder', duiding: null })
    const nep = maakNepClient({ news_articles: artikelRijen }, { or: orPredicaat })
    const { artikelen, ongeldig } = await laadKandidaten(nep.client as never, NU)
    expect(ongeldig).toBe(2)
    expect(artikelen.map((a) => a.id)).not.toContain('kapot')
    expect(artikelen.map((a) => a.id)).not.toContain('zonder')
  })

  it('een leesfout gooit (geen lege editie op een kapotte lezing)', async () => {
    const nep = maakNepClient({ news_articles: artikelRijen }, { or: orPredicaat, fouten: { 'news_articles:select': 'kapot' } })
    await expect(laadKandidaten(nep.client as never, NU)).rejects.toThrow(/kandidaten lezen mislukt/)
  })
})

describe('editie-loader — lezerscontext (eigen scope)', () => {
  it('leest de leesstatus onder de eigen sleutel en vertaalt lokale item-id\'s naar artikel-id\'s', async () => {
    const nep = maakNepClient({
      app_settings: [
        { key: newsReadKey(UID), value: { ids: ['news-local-a01', 'news-2026-x', 7] } },
        { key: newsReadKey('user-b'), value: { ids: ['news-local-b99'] } },
      ],
    })
    const ctx = await laadLezerContext(nep.client as never, UID, NU)
    expect([...ctx.gezienArtikelIds].sort()).toEqual(['a01', 'news-2026-x'])
    expect(ctx.gedemptRubrieken.size).toBe(0)
    const q = nep.queriesOp('app_settings')[0]
    expect(q.stappen.some((s) => s.m === 'eq' && s.args[0] === 'key' && s.args[1] === newsReadKey(UID))).toBe(true)
  })

  it('dempt alleen rubrieken met minstens twee eigen "minder"-stemmen binnen het venster', async () => {
    const nep = maakNepClient({
      news_feedback: [
        { user_id: UID, verdict: 'less', category: 'pensioen', created_at: '2026-09-01T00:00:00Z' },
        { user_id: UID, verdict: 'less', category: 'pensioen', created_at: '2026-09-02T00:00:00Z' },
        { user_id: UID, verdict: 'less', category: 'fiscaal', created_at: '2026-09-02T00:00:00Z' },
        { user_id: UID, verdict: 'less', category: 'rente', created_at: '2025-01-01T00:00:00Z' }, // buiten het venster
        { user_id: UID, verdict: 'less', category: 'rente', created_at: '2025-01-02T00:00:00Z' },
        { user_id: 'user-b', verdict: 'less', category: 'wonen', created_at: '2026-09-02T00:00:00Z' },
        { user_id: 'user-b', verdict: 'less', category: 'wonen', created_at: '2026-09-03T00:00:00Z' },
      ],
    })
    const ctx = await laadLezerContext(nep.client as never, UID, NU)
    expect([...ctx.gedemptRubrieken]).toEqual(['pensioen'])
    const q = nep.queriesOp('news_feedback')[0]
    expect(q.stappen.some((s) => s.m === 'eq' && s.args[0] === 'user_id' && s.args[1] === UID)).toBe(true)
  })
})
