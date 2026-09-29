import { describe, it, expect } from 'vitest'
import { amsterdamWeekKey } from '@/lib/briefing/snapshot'
import type { WeekMeting } from './duiding-beheer'
import {
  amsterdamWeekGrenzen,
  bouwWeekmeting,
  bouwWeekreeks,
  poortCodes,
  vorigeWeekKey,
  SAMENVATTING_DALING_PP,
  WEEKMETING_VERSIE,
  type WeekmetingInvoer,
} from './weekmeting'

function week(overrides: Partial<WeekMeting> = {}): WeekMeting {
  return {
    week: '2026-W40',
    binnen: 10,
    geduid: 8,
    metMechanisme: 3,
    dekking: 3 / 8,
    rekenend: 1,
    mechanismeVervallen: 0,
    perCategorie: {},
    perGrondslag: { fragment: 6, kop: 2 },
    poort: { groen: 6, gedegradeerd: 2, perReden: { 'g1:ongegrond-getal': 1, 'g1:verwijzing': 1 } },
    kopNietVanBron: 0,
    metModeltekst: 0,
    metThema: 4,
    teruggetrokken: { 'fout-getal': 0, 'verkeerde-doelgroep': 0, 'verkeerd-mechanisme': 0, anders: 0 },
    teruggetrokkenTotaal: 0,
    foutGetalRekenend: 0,
    afgewezenPerCode: { 'doelgroep:ongegrond:kinderen': 2, 'schema:ongeldig': 1 },
    afgewezenTotaal: 3,
    wacht: 0,
    mislukt: 0,
    zonderMechanismeTotaal: 5,
    zonderMechanisme: [{ id: 'x', title: 'Een titel die nooit in het record mag komen', category: null }],
    ...overrides,
  }
}

function invoer(overrides: Partial<WeekmetingInvoer> = {}): WeekmetingInvoer {
  return {
    week: '2026-W40',
    editieWeek: '2026-W41',
    gemetenOp: '2026-10-05T06:04:00.000Z',
    duiding: week(),
    artikelen: [
      { id: 'a1', bron_soort: 'rss', bron_detail: 'gelezen', duiding_status: 'geduid', mechanisme: 'box3-parameter', eerste_thema: 'box3' },
      { id: 'a2', bron_soort: 'rss', bron_detail: 'terugval', duiding_status: 'wacht', mechanisme: null, eerste_thema: null },
      { id: 'a3', bron_soort: 'web_lijst', bron_detail: 'geen_html', duiding_status: 'teruggetrokken', mechanisme: 'x', eerste_thema: null },
      { id: 'a3', bron_soort: 'web_lijst', bron_detail: 'geen_html', duiding_status: 'teruggetrokken', mechanisme: 'x', eerste_thema: null },
      { id: 'a4', bron_soort: null, bron_detail: null, duiding_status: 'geduid', mechanisme: null, eerste_thema: 't' },
    ],
    metSamenvattingPerBronsoort: { rss: 3, web_lijst: 1, web_pagina: 0 },
    metSamenvattingTotaal: 4,
    editieOnvolledig: false,
    vorigeWeek: { week: '2026-W39', geduid: 10, metSamenvatting: 5 },
    backfillResterend: 12,
    edities: [
      { user_id: 'demo-1', profiel_type: 'p1', leeg: true },
      { user_id: 'demo-1', profiel_type: 'p1', leeg: true },
      { user_id: 'u-1', profiel_type: 'p2', leeg: false },
    ],
    testaccountIds: new Set(['demo-1']),
    tokens: [
      { feature: 'news-duiding', input_tokens: 100, output_tokens: 10 },
      { feature: 'news-duiding', input_tokens: 50, output_tokens: 5 },
      { feature: 'chat', input_tokens: null, output_tokens: 7 },
    ],
    afgekapt: false,
    leesfouten: [],
    rekent: (m) => m === 'box3-parameter',
    ...overrides,
  }
}

describe('amsterdamWeekGrenzen — dezelfde weekindeling als amsterdamWeekKey', () => {
  it('begint maandag 00:00 Amsterdam (zomertijd: 22:00 UTC de dag ervoor)', () => {
    const { van, tot } = amsterdamWeekGrenzen('2026-W40')
    expect(van).toBe('2026-09-27T22:00:00.000Z')
    expect(tot).toBe('2026-10-04T22:00:00.000Z')
  })

  it('verschuift correct over de overgang naar wintertijd (25 okt 2026)', () => {
    const { van, tot } = amsterdamWeekGrenzen('2026-W43')
    expect(van).toBe('2026-10-18T22:00:00.000Z')
    expect(tot).toBe('2026-10-25T23:00:00.000Z')
  })

  it('de grenzen vallen precies op de sleutel: van is in de week, van − 1 ms niet', () => {
    for (const w of ['2026-W01', '2026-W13', '2026-W40', '2026-W53', '2027-W01']) {
      const { van, tot } = amsterdamWeekGrenzen(w)
      expect(amsterdamWeekKey(new Date(van))).toBe(w)
      expect(amsterdamWeekKey(new Date(new Date(van).getTime() - 1))).not.toBe(w)
      expect(amsterdamWeekKey(new Date(new Date(tot).getTime() - 1))).toBe(w)
      expect(amsterdamWeekKey(new Date(tot))).not.toBe(w)
    }
  })

  it('weigert een ongeldige sleutel', () => {
    expect(() => amsterdamWeekGrenzen('2026-40')).toThrow()
  })

  it('vorigeWeekKey over de jaargrens', () => {
    expect(vorigeWeekKey('2026-W41')).toBe('2026-W40')
    expect(vorigeWeekKey('2027-W01')).toBe('2026-W53')
  })
})

describe('poortCodes — hergebruikt de duidingsmeting, geen tweede telling', () => {
  it('G1 telt alle g1:-codes, G6 poort plus harde doelgroep-afwijzing', () => {
    const p = poortCodes(week({ poort: { groen: 1, gedegradeerd: 3, perReden: { 'g1:a': 1, 'g1:b': 2, 'g6:lexicon': 1 } } }))
    expect(p.g1).toBe(3)
    expect(p.g6).toBe(3) // 1 lexicon + 2 doelgroep:ongegrond
    expect(p.g2).toBe(0)
  })

  it('null (geen artikelen) geeft nullen', () => {
    expect(poortCodes(null)).toEqual({ g1: 0, g2: 0, g3: 0, g4: 0, g5: 0, g6: 0, groen: 0, gedegradeerd: 0 })
  })
})

describe('bouwWeekmeting', () => {
  it('telt dekking per bronsoort, ontdubbeld op id, onbekende soort apart', () => {
    const r = bouwWeekmeting(invoer())
    expect(r.versie).toBe(WEEKMETING_VERSIE)
    expect(r.perBronsoort.rss).toEqual({ artikelen: 2, geduid: 1, metSamenvatting: 3, metMechanisme: 1, rekenend: 1, metThema: 1 })
    // Mechanisme 'x' staat niet in de catalogus: telt niet mee (zelfde regel als bouwDuidingMeting).
    expect(r.perBronsoort.web_lijst).toMatchObject({ artikelen: 1, geduid: 1, metMechanisme: 0, rekenend: 0 })
    expect(r.perBronsoort.onbekend).toMatchObject({ artikelen: 1, geduid: 1, metThema: 1 })
    expect(r.artikelpaginas).toEqual({ gelezen: 1, terugval: 1, geenHtml: 1, backfillResterend: 12 })
  })

  it('aandeel samenvatting = totaal-count (zonder bronsoortfilter) / geduid van de duidingsmeting', () => {
    const r = bouwWeekmeting(invoer())
    expect(r.artikelen.metSamenvatting).toBe(4)
    expect(r.artikelen.aandeelSamenvatting).toBe(0.5)
    expect(r.artikelen.aandeelThema).toBe(0.5)
    expect(r.vorigeWeek).toEqual({ week: '2026-W39', aandeelSamenvatting: 0.5 })
  })

  it('lege edities: één per lezer, testaccounts per type, echte lezers ALLEEN in het totaal (security 🟡-1)', () => {
    const r = bouwWeekmeting(invoer())
    expect(r.verversingen).toEqual({ edities: 2, leeg: 1, onvolledig: false, testaccounts: { p1: { edities: 1, leeg: 1 } } })
    // Het profieltype van de echte lezer (p2) komt nergens in het record.
    expect(JSON.stringify(r)).not.toContain('p2')
  })

  it('een onvolledige editierun is een waarschuwing, geen stil getal', () => {
    const r = bouwWeekmeting(invoer({ editieOnvolledig: true }))
    expect(r.verversingen.onvolledig).toBe(true)
    expect(r.waarschuwingen.map((w) => w.code)).toContain('editierun-onvolledig')
  })

  it('tokens per feature, zonder user_id, null telt als 0', () => {
    const r = bouwWeekmeting(invoer())
    expect(r.tokens.perFeature['news-duiding']).toEqual({ aanroepen: 2, input: 150, output: 15 })
    expect(r.tokens.perFeature.chat).toEqual({ aanroepen: 1, input: 0, output: 7 })
    expect(r.tokens.totaal).toEqual({ aanroepen: 3, input: 150, output: 22 })
  })

  it('draagt nooit een titel, URL of user_id in het record (ADR 0146)', () => {
    const json = JSON.stringify(bouwWeekmeting(invoer()))
    expect(json).not.toContain('Een titel die nooit')
    expect(json).not.toContain('u-1')
    expect(json).not.toContain('demo-1')
    expect(json).not.toMatch(/https?:\/\//)
  })

  it('herleiden, niet ophogen: dezelfde invoer twee keer geeft hetzelfde record', () => {
    expect(bouwWeekmeting(invoer())).toEqual(bouwWeekmeting(invoer()))
  })
})

describe('waarschuwingen (drempels)', () => {
  const codes = (inv: WeekmetingInvoer) => bouwWeekmeting(inv).waarschuwingen.map((w) => w.code)

  it('G1 > 0 waarschuwt; een schone week niet', () => {
    expect(codes(invoer())).toEqual(['g1'])
    const schoon = invoer({ duiding: week({ poort: { groen: 8, gedegradeerd: 0, perReden: {} } }) })
    expect(codes(schoon)).toEqual([])
  })

  it('G4/G5 en fout-getal komen eerst (gebroken beloftes)', () => {
    const c = codes(invoer({ duiding: week({ kopNietVanBron: 1, metModeltekst: 2, foutGetalRekenend: 1 }) }))
    expect(c.slice(0, 3)).toEqual(['g4', 'g5', 'fout-getal'])
  })

  it('0 rekenend bij geduide artikelen waarschuwt', () => {
    expect(codes(invoer({ duiding: week({ rekenend: 0, poort: { groen: 8, gedegradeerd: 0, perReden: {} } }) }))).toEqual([
      'nul-rekenend',
    ])
  })

  it(`samenvatting daalt ≥ ${SAMENVATTING_DALING_PP} pp t.o.v. de week ervoor`, () => {
    const schoon = { duiding: week({ poort: { groen: 8, gedegradeerd: 0, perReden: {} } }) }
    // Nu 4/8 = 50 %; vorige week 11/20 = 55 % → daling 5 pp.
    expect(codes(invoer({ ...schoon, vorigeWeek: { week: '2026-W39', geduid: 20, metSamenvatting: 11 } }))).toEqual([
      'samenvatting-daalt',
    ])
    // 2 pp (13/25 = 52 %): ruis, geen waarschuwing.
    expect(codes(invoer({ ...schoon, vorigeWeek: { week: '2026-W39', geduid: 25, metSamenvatting: 13 } }))).toEqual([])
  })

  it('afgekapt en leesfouten zijn waarschuwingen, geen stilte', () => {
    const schoon = { duiding: week({ poort: { groen: 8, gedegradeerd: 0, perReden: {} } }) }
    expect(codes(invoer({ ...schoon, afgekapt: true, leesfouten: ['ai_token_usage'] }))).toEqual([
      'afgekapt',
      'lees:ai_token_usage',
    ])
  })

  it('geen enkel artikel in de week', () => {
    expect(codes(invoer({ duiding: null, artikelen: [] }))).toContain('geen-artikelen')
  })
})

describe('bouwWeekreeks', () => {
  const rec = (w: string, extra = {}) => ({ ...bouwWeekmeting(invoer({ week: w })), ...extra })

  it('laatste run per week wint, nieuwste week eerst, kapotte summary valt weg', () => {
    const reeks = bouwWeekreeks([
      { status: 'partial', started_at: '2026-10-05T06:04:00Z', summary: rec('2026-W40'), error: 'g1' },
      { status: 'success', started_at: '2026-10-05T09:00:00Z', summary: rec('2026-W40', { gemetenOp: 'later' }), error: null },
      { status: 'success', started_at: '2026-09-28T06:04:00Z', summary: rec('2026-W39'), error: null },
      { status: 'success', started_at: '2026-09-21T06:04:00Z', summary: { week: '2026-W38' }, error: null },
      { status: 'partial', started_at: '2026-09-14T06:04:00Z', summary: null, error: 'mislukt' },
    ])
    expect(reeks.map((r) => r.record.week)).toEqual(['2026-W40', '2026-W39'])
    expect(reeks[0].record.gemetenOp).toBe('later')
    expect(reeks[0].status).toBe('success')
  })
})
