import { describe, expect, it } from 'vitest'
import {
  bouwDuidingMeting,
  duidingWeergave,
  isDuidingStatus,
  opnieuwBodySchema,
  REKENENDE_MECHANISMEN,
  terugtrekBodySchema,
  TOELICHTING_MAX_TEKENS,
  ZONDER_MECHANISME_MAX,
  artikelVerwijderBodySchema,
  NIET_TE_VERWIJDEREN,
  veiligeZoekterm,
  g7Gehaald,
  leesSteekproefRegister,
  steekproefBodySchema,
  steekproefWeekGehaald,
  STEEKPROEF_MAX_FOUTEN,
  STEEKPROEF_OMVANG,
  STEEKPROEF_WEKEN_OP_RIJ,
  STEEKPROEF_VELD_UITLEG,
  POORT_REDEN_LABEL,
  poortRedenLabel,
  doelgroepAfwijzingen,
  type MetingRij,
} from './duiding-beheer'
import { POORT_CODE } from './duiding-controles'
import { GELDIGE_UITVOER } from './duiding.fixture'
import { DUIDING_VERSIE, type DuidingV1 } from './duiding-schema'
import { MECHANISMEN, MECHANISME_IDS } from './mechanismen'

const ID = '3e2f9e8d-568a-4199-bf7e-f2f7e5b7091e'

/** De opgeslagen vorm (leescontract) bij de gedeelde modeluitvoer. */
function opgeslagen(over: Partial<DuidingV1> = {}): DuidingV1 {
  return {
    versie: DUIDING_VERSIE,
    soort: GELDIGE_UITVOER.soort,
    ingangsdatum: GELDIGE_UITVOER.ingangsdatum,
    deadline: GELDIGE_UITVOER.deadline,
    doelgroep: GELDIGE_UITVOER.doelgroep,
    mechanisme: GELDIGE_UITVOER.mechanisme,
    samenvatting: GELDIGE_UITVOER.samenvatting,
    grond: Object.fromEntries(GELDIGE_UITVOER.grond.map((g) => [g.param, g.citaat])),
    meta: {
      grondslag: 'fragment',
      grondslagSha256: 'c'.repeat(64),
      tekens: 1234,
      model: 'test-model',
      kopBron: 'bron',
      modeltekst: false,
      poort: { status: 'groen', reden: null },
    },
    ...over,
  }
}

describe('terugtrekBodySchema', () => {
  it('accepteert elke CHECK-reden met een uuid', () => {
    for (const reden of ['fout-getal', 'verkeerde-doelgroep', 'verkeerd-mechanisme'] as const) {
      expect(terugtrekBodySchema.safeParse({ id: ID, reden }).success, reden).toBe(true)
    }
  })

  it('eist bij "anders" een toelichting (anders is het waarom leeg)', () => {
    expect(terugtrekBodySchema.safeParse({ id: ID, reden: 'anders' }).success).toBe(false)
    expect(terugtrekBodySchema.safeParse({ id: ID, reden: 'anders', toelichting: '   ' }).success).toBe(false)
    expect(terugtrekBodySchema.safeParse({ id: ID, reden: 'anders', toelichting: 'bron is een opinie' }).success).toBe(true)
  })

  it('weigert een onbekende reden, een geen-uuid, extra velden en een te lange toelichting', () => {
    expect(terugtrekBodySchema.safeParse({ id: ID, reden: 'vrijgeven' }).success).toBe(false)
    expect(terugtrekBodySchema.safeParse({ id: 'abc', reden: 'fout-getal' }).success).toBe(false)
    expect(terugtrekBodySchema.safeParse({ id: ID, reden: 'fout-getal', status: 'geduid' }).success).toBe(false)
    const lang = 'x'.repeat(TOELICHTING_MAX_TEKENS + 1)
    expect(terugtrekBodySchema.safeParse({ id: ID, reden: 'fout-getal', toelichting: lang }).success).toBe(false)
  })
})

describe('opnieuwBodySchema', () => {
  it('neemt alleen een id', () => {
    expect(opnieuwBodySchema.safeParse({ id: ID }).success).toBe(true)
    expect(opnieuwBodySchema.safeParse({ id: ID, duiding_status: 'geduid' }).success).toBe(false)
  })
})

describe('artikel verwijderen', () => {
  it('alleen een id; geduid en teruggetrokken zijn niet te verwijderen', () => {
    expect(artikelVerwijderBodySchema.safeParse({ id: ID }).success).toBe(true)
    expect(artikelVerwijderBodySchema.safeParse({}).success).toBe(false)
    expect([...NIET_TE_VERWIJDEREN].sort()).toEqual(['geduid', 'teruggetrokken'])
  })
})

describe('veiligeZoekterm', () => {
  it('haalt PostgREST-syntax en wildcards weg', () => {
    expect(veiligeZoekterm('box3,id.eq.1)')).toBe('box3 id.eq.1')
    expect(veiligeZoekterm('50%_*')).toBe('50')
    expect(veiligeZoekterm(`a"b'c\\d:e(f`)).toBe('a b c d e f')
  })
  it('laat gewone tekst staan en kapt af', () => {
    expect(veiligeZoekterm('  heffingsvrij  vermogen ')).toBe('heffingsvrij vermogen')
    expect(veiligeZoekterm('x'.repeat(300))).toHaveLength(100)
    expect(veiligeZoekterm(null)).toBe('')
  })
})

describe('isDuidingStatus', () => {
  it('kent precies de vijf statussen', () => {
    expect(isDuidingStatus('geduid')).toBe(true)
    expect(isDuidingStatus('vrijgegeven')).toBe(false)
  })
})

describe('REKENENDE_MECHANISMEN', () => {
  it('volgt de catalogus: elk rekenend mechanisme en niets anders', () => {
    expect([...REKENENDE_MECHANISMEN].sort()).toEqual(MECHANISME_IDS.filter((id) => MECHANISMEN[id].rekent).sort())
    expect(REKENENDE_MECHANISMEN).not.toContain('beursbeweging')
    expect(REKENENDE_MECHANISMEN).toContain('box3-parameter')
  })
})

describe('duidingWeergave', () => {
  it('null blijft null', () => {
    expect(duidingWeergave(null)).toBeNull()
    expect(duidingWeergave(undefined)).toBeNull()
  })

  it('zet per param het grond-citaat naast de waarde, met de eenheid uit de catalogus', () => {
    const u = duidingWeergave(opgeslagen())
    expect(u?.ok).toBe(true)
    if (!u?.ok) return
    const m = u.duiding.mechanisme
    expect(m?.id).toBe('box3-parameter')
    expect(m?.label).toBe(MECHANISMEN['box3-parameter'].label)
    expect(m?.rekent).toBe(true)
    expect(m?.drempel).toBe('heffingsvrij-vermogen-single')
    const hv = m?.params.find((p) => p.naam === 'heffingsvrij_single')
    expect(hv).toEqual({ naam: 'heffingsvrij_single', waarde: 60000, eenheid: 'eur', citaat: 'stijgt in 2027 naar € 60.000' })
    const tarief = m?.params.find((p) => p.naam === 'tarief_pct')
    expect(tarief).toEqual({ naam: 'tarief_pct', waarde: null, eenheid: 'pct', citaat: null })
    expect(u.duiding.grondslag).toBe('fragment')
    expect(u.duiding.tekens).toBe(1234)
    expect(u.duiding.poort).toEqual({ status: 'groen', reden: null })
  })

  it('zonder mechanisme: mechanisme null', () => {
    const u = duidingWeergave(opgeslagen({ mechanisme: null, grond: {} }))
    expect(u?.ok && u.duiding.mechanisme).toBeNull()
  })

  it('fail-closed: een jsonb die het leescontract niet haalt wordt niet getoond', () => {
    expect(duidingWeergave({ ...opgeslagen(), extra: '<script>' })).toEqual({ ok: false })
    expect(duidingWeergave({ versie: 99 })).toEqual({ ok: false })
    expect(duidingWeergave('tekst')).toEqual({ ok: false })
  })
})

// ── Meting ───────────────────────────────────────────────────────────────────

let n = 0
function rij(over: Partial<MetingRij>): MetingRij {
  n++
  return {
    id: `a${n}`,
    title: `Artikel ${n}`,
    category: 'fiscaal',
    // Woensdag 16 sep 2026 → 2026-W38.
    fetched_at: '2026-09-16T10:00:00Z',
    duiding_status: 'geduid',
    duiding_fout: null,
    teruggetrokken_reden: null,
    mechanisme: null,
    grondslag: 'fragment',
    poort_status: 'groen',
    poort_reden: null,
    kop_bron: 'bron',
    modeltekst: 'false',
    ...over,
  }
}

describe('bouwDuidingMeting', () => {
  it('lege invoer → geen weken', () => {
    expect(bouwDuidingMeting([])).toEqual([])
  })

  it('telt elke tak per week, cohort op fetched_at', () => {
    const [w] = bouwDuidingMeting([
      rij({ mechanisme: 'box3-parameter', grondslag: 'kop' }),
      rij({ mechanisme: 'beursbeweging', category: 'macro' }),
      rij({ mechanisme: null }),
      rij({ mechanisme: null, duiding_fout: 'ongegrond:rente_pct' }),
      rij({ duiding_status: 'teruggetrokken', teruggetrokken_reden: 'fout-getal', mechanisme: 'studieschuld-rente' }),
      rij({ duiding_status: 'teruggetrokken', teruggetrokken_reden: 'fout-getal', mechanisme: 'beursbeweging', category: 'macro' }),
      rij({ duiding_status: 'teruggetrokken', teruggetrokken_reden: 'verkeerde-doelgroep', mechanisme: null }),
      rij({ duiding_status: 'afgewezen', duiding_fout: 'schema', mechanisme: null, grondslag: null, poort_status: null, kop_bron: null }),
      rij({ duiding_status: 'afgewezen', duiding_fout: 'schema', mechanisme: null, grondslag: null, poort_status: null, kop_bron: null }),
      rij({ duiding_status: 'afgewezen', duiding_fout: null, mechanisme: null, grondslag: null, poort_status: null, kop_bron: null }),
      rij({ duiding_status: 'wacht', mechanisme: null, grondslag: null, poort_status: null, kop_bron: null }),
      rij({ duiding_status: 'mislukt', mechanisme: null, grondslag: null, poort_status: null, kop_bron: null }),
    ])
    expect(w.week).toBe('2026-W38')
    expect(w.binnen).toBe(12)
    // geduid = 4 geduid + 3 teruggetrokken (die waren eerst geduid)
    expect(w.geduid).toBe(7)
    expect(w.metMechanisme).toBe(4)
    expect(w.dekking).toBeCloseTo(4 / 7)
    // rekenend: box3 + studieschuld (beursbeweging rekent niet)
    expect(w.rekenend).toBe(2)
    expect(w.mechanismeVervallen).toBe(1)
    expect(w.perGrondslag).toEqual({ fragment: 6, kop: 1 })
    expect(w.teruggetrokken).toEqual({ 'fout-getal': 2, 'verkeerde-doelgroep': 1, 'verkeerd-mechanisme': 0, anders: 0 })
    // De poortmaat: alleen fout-getal bij een REKENEND mechanisme.
    expect(w.foutGetalRekenend).toBe(1)
    expect(w.afgewezenPerCode).toEqual({ schema: 2, onbekend: 1 })
    expect(w.wacht).toBe(1)
    expect(w.mislukt).toBe(1)
    expect(w.zonderMechanisme).toHaveLength(3)
    expect(w.zonderMechanismeTotaal).toBe(3)
    expect(w.teruggetrokkenTotaal).toBe(3)
    expect(w.afgewezenTotaal).toBe(3)
    expect(w.perCategorie.fiscaal).toEqual({ geduid: 5, metMechanisme: 2, dekking: 2 / 5 })
    expect(w.perCategorie.macro).toEqual({ geduid: 2, metMechanisme: 2, dekking: 1 })
  })

  it('telt de tekstpoort per reden (G1/G2/G3/G6) en de herkomst-drift (G4/G5)', () => {
    const [w] = bouwDuidingMeting([
      rij({}),
      rij({ poort_status: 'gedegradeerd', poort_reden: 'g1:ongegrond-getal' }),
      rij({ poort_status: 'gedegradeerd', poort_reden: 'g1:ongegrond-getal' }),
      rij({ poort_status: 'gedegradeerd', poort_reden: 'g2:datum' }),
      rij({ poort_status: 'gedegradeerd', poort_reden: null }),
      // G4/G5: by construction 0 — maar we tellen ze, zodat drift zichtbaar
      // wordt in plaats van aangenomen.
      rij({ kop_bron: 'model' }),
      rij({ modeltekst: 'true' }),
      rij({ duiding_status: 'afgewezen', duiding_fout: 'doelgroep:ongegrond:wonen', poort_status: null, kop_bron: null }),
    ])
    expect(w.poort.groen).toBe(3)
    expect(w.poort.gedegradeerd).toBe(4)
    expect(w.poort.perReden).toEqual({ 'g1:ongegrond-getal': 2, 'g2:datum': 1, onbekend: 1 })
    expect(w.kopNietVanBron).toBe(1)
    expect(w.metModeltekst).toBe(1)
    // De andere helft van G6 wijst hard af en komt dus nooit langs de poort.
    expect(w.afgewezenPerCode).toEqual({ 'doelgroep:ongegrond:wonen': 1 })
  })

  it('ontdubbelt op id (een rij die bij het pagineren op twee pagina\'s landt telt één keer)', () => {
    const r = rij({ mechanisme: 'box3-parameter' })
    const [w] = bouwDuidingMeting([r, { ...r }])
    expect(w.binnen).toBe(1)
    expect(w.geduid).toBe(1)
  })

  it('kapt de titellijst zonder mechanisme af, maar telt het totaal volledig', () => {
    const veel = Array.from({ length: ZONDER_MECHANISME_MAX + 5 }, () => rij({ mechanisme: null }))
    const [w] = bouwDuidingMeting(veel)
    expect(w.zonderMechanisme).toHaveLength(ZONDER_MECHANISME_MAX)
    expect(w.zonderMechanismeTotaal).toBe(ZONDER_MECHANISME_MAX + 5)
  })

  it('dekking is null bij nul geduid (nooit 0% of NaN)', () => {
    const [w] = bouwDuidingMeting([rij({ duiding_status: 'wacht' })])
    expect(w.geduid).toBe(0)
    expect(w.dekking).toBeNull()
  })

  it('een onbekende mechanisme-soort telt niet als mechanisme', () => {
    const [w] = bouwDuidingMeting([rij({ mechanisme: 'verzonnen-soort' })])
    expect(w.metMechanisme).toBe(0)
    expect(w.rekenend).toBe(0)
    expect(w.zonderMechanisme).toHaveLength(1)
  })

  it('zonder categorie krijgt een eigen emmer; een ongeldige datum wordt overgeslagen', () => {
    const weken = bouwDuidingMeting([rij({ category: null }), rij({ fetched_at: 'geen-datum' })])
    expect(weken).toHaveLength(1)
    expect(weken[0].binnen).toBe(1)
    expect(Object.keys(weken[0].perCategorie)).toEqual(['zonder categorie'])
  })

  it('sorteert nieuwste week eerst en splitst op de Amsterdamse maandag', () => {
    const weken = bouwDuidingMeting([
      rij({ fetched_at: '2026-09-06T21:59:00Z' }), // zondag 6 sep 23:59 Amsterdam → W36
      rij({ fetched_at: '2026-09-06T22:00:00Z' }), // maandag 7 sep 00:00 Amsterdam → W37
      rij({ fetched_at: '2026-09-16T10:00:00Z' }), // W38
    ])
    expect(weken.map((w) => w.week)).toEqual(['2026-W38', '2026-W37', '2026-W36'])
  })

  it('onbekende status telt als binnen, verder nergens', () => {
    const [w] = bouwDuidingMeting([rij({ duiding_status: 'vrijgegeven' })])
    expect(w.binnen).toBe(1)
    expect(w.geduid + w.wacht + w.mislukt).toBe(0)
  })
})

// ── G7: de handmatige steekproef ─────────────────────────────────────────────

describe('steekproefBodySchema', () => {
  it('accepteert een ISO-week met tellingen en weigert de rest', () => {
    expect(steekproefBodySchema.safeParse({ week: '2026-W38', gecontroleerd: 20, fouten: 1 }).success).toBe(true)
    expect(steekproefBodySchema.safeParse({ week: '2026-38', gecontroleerd: 20, fouten: 1 }).success).toBe(false)
    expect(steekproefBodySchema.safeParse({ week: '2026-W38', gecontroleerd: 20, fouten: 1.5 }).success).toBe(false)
    // strictObject: `op` zet de server zelf, dus de client mag hem niet meesturen.
    expect(steekproefBodySchema.safeParse({ week: '2026-W38', gecontroleerd: 20, fouten: 1, op: 'nu' }).success).toBe(false)
  })

  it('weigert meer fouten dan gecontroleerde samenvattingen', () => {
    expect(steekproefBodySchema.safeParse({ week: '2026-W38', gecontroleerd: 20, fouten: 21 }).success).toBe(false)
  })
})

describe('leesSteekproefRegister — fail-closed', () => {
  const regel = { gecontroleerd: 20, fouten: 0, op: '2026-09-21T10:00:00Z' }

  it('leest een JSON-string én een al geparst object', () => {
    expect(leesSteekproefRegister(JSON.stringify({ '2026-W38': regel }))).toEqual({ '2026-W38': regel })
    expect(leesSteekproefRegister({ '2026-W38': regel })).toEqual({ '2026-W38': regel })
  })

  it('wat niet parst is leeg — nooit "gehaald" op een kapotte waarde', () => {
    expect(leesSteekproefRegister(null)).toEqual({})
    expect(leesSteekproefRegister('{kapot')).toEqual({})
    expect(leesSteekproefRegister({ '2026-W38': { gecontroleerd: 'veel' } })).toEqual({})
    expect(leesSteekproefRegister({ 'week 38': regel })).toEqual({})
  })
})

describe('g7Gehaald — afgeleid, geen teller', () => {
  const week = (gecontroleerd: number, fouten: number) => ({ gecontroleerd, fouten, op: '2026-09-21T10:00:00Z' })
  const WEKEN = ['2026-W39', '2026-W38', '2026-W37']

  it('twee aaneengesloten weken met hoogstens één fout per twintig', () => {
    expect(g7Gehaald({ '2026-W39': week(20, 1), '2026-W38': week(20, 0) }, WEKEN)).toBe(true)
    expect(g7Gehaald({ '2026-W38': week(20, 0), '2026-W37': week(25, 1) }, WEKEN)).toBe(true)
  })

  it('één week, een te kleine steekproef of een gat telt niet', () => {
    expect(g7Gehaald({ '2026-W39': week(20, 0) }, WEKEN)).toBe(false)
    expect(g7Gehaald({ '2026-W39': week(19, 0), '2026-W38': week(20, 0) }, WEKEN)).toBe(false)
    expect(g7Gehaald({ '2026-W39': week(20, 2), '2026-W38': week(20, 0) }, WEKEN)).toBe(false)
    // W39 en W37 zijn niet aaneengesloten in de getoonde reeks.
    expect(g7Gehaald({ '2026-W39': week(20, 0), '2026-W37': week(20, 0) }, WEKEN)).toBe(false)
    expect(g7Gehaald({}, WEKEN)).toBe(false)
  })

  it('de norm staat in constanten, niet in losse getallen', () => {
    expect(STEEKPROEF_OMVANG).toBe(20)
    expect(STEEKPROEF_MAX_FOUTEN).toBe(1)
    expect(STEEKPROEF_WEKEN_OP_RIJ).toBe(2)
    expect(steekproefWeekGehaald(undefined)).toBe(false)
    expect(steekproefWeekGehaald(week(STEEKPROEF_OMVANG, STEEKPROEF_MAX_FOUTEN))).toBe(true)
    expect(steekproefWeekGehaald(week(STEEKPROEF_OMVANG, STEEKPROEF_MAX_FOUTEN + 1))).toBe(false)
  })
})

describe('poortweergave — labels en de G6-splitsing', () => {
  it('vertaalt elke poortcode, en laat een onbekende code staan zoals hij is', () => {
    expect(poortRedenLabel('g1:ongegrond-getal')).toMatch(/^G1 ·/)
    expect(poortRedenLabel('g2:datum')).toMatch(/^G2 ·/)
    expect(poortRedenLabel('g3:meta')).toMatch(/^G3 ·/)
    expect(poortRedenLabel('g6:lexicon')).toMatch(/^G6 ·/)
    // Fail-open op de WEERGAVE: een nieuwe controle mag nooit stil verdwijnen.
    expect(poortRedenLabel('g9:nieuw')).toBe('g9:nieuw')
  })

  it('elke code die de poort kan schrijven heeft een label', () => {
    for (const code of Object.values(POORT_CODE)) {
      expect(POORT_REDEN_LABEL[code], code).toBeTruthy()
    }
  })

  it('haalt de hard afgewezen G6-helft uit de foutcodes', () => {
    expect(
      doelgroepAfwijzingen({ schema: 3, 'doelgroep:ongegrond:wonen': 2, 'doelgroep:ongegrond:werk': 5, 'datum:deadline': 1 }),
    ).toEqual([
      ['doelgroep:ongegrond:werk', 5],
      ['doelgroep:ongegrond:wonen', 2],
    ])
    expect(doelgroepAfwijzingen({ schema: 3 })).toEqual([])
  })
})

describe('STEEKPROEF_VELD_UITLEG — de formulier-uitlegnorm', () => {
  it('draagt voor elk veld een label, een effect en een waarom', () => {
    for (const sleutel of ['week', 'gecontroleerd', 'fouten'] as const) {
      const u = STEEKPROEF_VELD_UITLEG[sleutel]
      expect(u.label.length, sleutel).toBeGreaterThan(0)
      expect(u.effect.length, sleutel).toBeGreaterThan(20)
      expect(u.waarom.length, sleutel).toBeGreaterThan(20)
    }
  })

  it('noemt de grenzen uit de constanten, niet een los getal', () => {
    expect(STEEKPROEF_VELD_UITLEG.gecontroleerd.effect).toContain(String(STEEKPROEF_OMVANG))
    expect(STEEKPROEF_VELD_UITLEG.fouten.effect).toContain(String(STEEKPROEF_MAX_FOUTEN))
  })
})
