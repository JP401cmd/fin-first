import { describe, expect, it } from 'vitest'
import { REDEN_PER_REGEL } from './matcher'
import { maakNepClient } from './nep-client.fixture'
import { renderSjabloon } from './sjablonen'
import {
  KATERN_ONDER,
  TIJDLIJN_ITEM_KOLOMMEN,
  TIJDLIJN_PAGINA,
  codeerCursor,
  decodeerCursor,
  geduideArtikelen,
  heeftNieuw,
  laadTijdlijn,
  laadTijdlijnPagina,
  leesbaarWaarom,
  leesbaarWatMist,
  rijNaarBericht,
  zonderAiVan,
  type TijdlijnCursor,
} from './tijdlijn-lezen'

const UID = 'user-a'

// ── Cursor ───────────────────────────────────────────────────────────────────

describe('codeerCursor / decodeerCursor', () => {
  const c: TijdlijnCursor = { createdAt: '2026-09-29T08:00:00.123Z', positie: 3, id: '12345678-1234-1234-1234-123456789abc' }

  it('round-trip: decodeer(codeer(c)) === c', () => {
    expect(decodeerCursor(codeerCursor(c))).toEqual(c)
  })

  it('null/undefined → null', () => {
    expect(decodeerCursor(null)).toBeNull()
    expect(decodeerCursor(undefined)).toBeNull()
    expect(decodeerCursor('')).toBeNull()
  })

  it('rommel (geen geldige base64url/JSON) → null', () => {
    expect(decodeerCursor('niet-base64!!!')).toBeNull()
    expect(decodeerCursor(Buffer.from('geen-json', 'utf8').toString('base64url'))).toBeNull()
  })

  it('te lang (>200 tekens) → null, zonder zelfs te proberen te decoderen', () => {
    expect(decodeerCursor('a'.repeat(201))).toBeNull()
  })

  it('geen array → null', () => {
    const tekst = Buffer.from(JSON.stringify({ createdAt: c.createdAt, positie: c.positie, id: c.id }), 'utf8').toString('base64url')
    expect(decodeerCursor(tekst)).toBeNull()
  })

  it('verkeerde array-lengte → null', () => {
    const kort = Buffer.from(JSON.stringify([c.createdAt, c.positie]), 'utf8').toString('base64url')
    const lang = Buffer.from(JSON.stringify([c.createdAt, c.positie, c.id, 'extra']), 'utf8').toString('base64url')
    expect(decodeerCursor(kort)).toBeNull()
    expect(decodeerCursor(lang)).toBeNull()
  })

  it('createdAt niet-ISO → null', () => {
    const tekst = Buffer.from(JSON.stringify(['29 september 2026', c.positie, c.id]), 'utf8').toString('base64url')
    expect(decodeerCursor(tekst)).toBeNull()
  })

  it('positie negatief → null', () => {
    const tekst = Buffer.from(JSON.stringify([c.createdAt, -1, c.id]), 'utf8').toString('base64url')
    expect(decodeerCursor(tekst)).toBeNull()
  })

  it('positie niet-integer → null', () => {
    const tekst = Buffer.from(JSON.stringify([c.createdAt, 1.5, c.id]), 'utf8').toString('base64url')
    expect(decodeerCursor(tekst)).toBeNull()
  })

  it('positie > 1000 → null', () => {
    const tekst = Buffer.from(JSON.stringify([c.createdAt, 1001, c.id]), 'utf8').toString('base64url')
    expect(decodeerCursor(tekst)).toBeNull()
  })

  it('positie === 1000 (rand) mag wel', () => {
    const tekst = Buffer.from(JSON.stringify([c.createdAt, 1000, c.id]), 'utf8').toString('base64url')
    expect(decodeerCursor(tekst)).toEqual({ createdAt: c.createdAt, positie: 1000, id: c.id })
  })

  it('id niet-uuid → null', () => {
    const tekst = Buffer.from(JSON.stringify([c.createdAt, c.positie, 'niet-een-uuid']), 'utf8').toString('base64url')
    expect(decodeerCursor(tekst)).toBeNull()
  })

  it('id met komma of haakje (filter-injectie) → null — hij mag het or-filter niet kunnen openbreken', () => {
    const metKomma = Buffer.from(JSON.stringify([c.createdAt, c.positie, `${c.id},created_at.lt."2000-01-01"`]), 'utf8').toString('base64url')
    const metHaakje = Buffer.from(JSON.stringify([c.createdAt, c.positie, `${c.id})`]), 'utf8').toString('base64url')
    expect(decodeerCursor(metKomma)).toBeNull()
    expect(decodeerCursor(metHaakje)).toBeNull()
  })
})

// ── rijNaarBericht ───────────────────────────────────────────────────────────

// De rij draagt de CODES van de matcher, zoals ze in productie staan.
const basisRij = {
  id: 'i1',
  editie_id: 'e1',
  created_at: '2026-09-29T08:00:00Z',
  positie: 0,
  vorm: 'raakt' as const,
  tekst: 'De regel voor jou',
  waarom: ['thema:sparen-rente', 'reden:reden-spaargeld-5k', 'impact:ontbreekt'],
  wat_mist: ['spaargeld'],
  deadline: null,
  snapshot: { titel: 'T', rubriek: 'R', bron: 'B', url: 'https://x.test', gepubliceerd: '2026-09-28', samenvatting: 'S' },
  krant_edities: { week_key: '2026-W39' },
}

describe('rijNaarBericht', () => {
  it('snapshot volledig, krant_edities als object', () => {
    expect(rijNaarBericht(basisRij)).toEqual({
      id: 'i1',
      verversingId: 'e1',
      createdAt: '2026-09-29T08:00:00Z',
      weekKey: '2026-W39',
      positie: 0,
      vorm: 'raakt',
      kop: renderSjabloon('raakt-kop', 0),
      tekst: 'De regel voor jou',
      aiTekst: null,
      aiToegevoegd: false,
      waarom: ['Volgens je profiel heb je € 5.000 of meer spaargeld.'],
      watMist: ['je spaargeld'],
      deadline: null,
      titel: 'T',
      rubriek: 'R',
      bron: 'B',
      url: 'https://x.test',
      gepubliceerd: '2026-09-28',
      gezienOp: null,
      samenvatting: 'S',
    })
  })

  it('ADR 0191: zonder echte datum draagt het snapshot gezienOp en geen publicatiedatum', () => {
    const b = rijNaarBericht({ ...basisRij, snapshot: { ...basisRij.snapshot, gepubliceerd: null, gezienOp: '2026-09-22T05:25:00.000Z' } })
    expect(b.gepubliceerd).toBeNull()
    expect(b.gezienOp).toBe('2026-09-22T05:25:00.000Z')
  })

  it('vorm "raakt" → kop is het raakt-kop-sjabloon ("Over jouw situatie")', () => {
    expect(rijNaarBericht({ ...basisRij, vorm: 'raakt' }).kop).toBe('Over jouw situatie')
  })

  it('vorm anders dan "raakt" (bv. "direct") → kop is null', () => {
    expect(rijNaarBericht({ ...basisRij, vorm: 'direct' }).kop).toBeNull()
  })

  it('krant_edities als array (!inner geeft soms een array terug)', () => {
    const rij = { ...basisRij, krant_edities: [{ week_key: '2026-W40' }] }
    expect(rijNaarBericht(rij).weekKey).toBe('2026-W40')
  })

  it('krant_edities null → weekKey lege string', () => {
    const rij = { ...basisRij, krant_edities: null }
    expect(rijNaarBericht(rij).weekKey).toBe('')
  })

  it('snapshot leeg object → alle snapshot-velden null', () => {
    const rij = { ...basisRij, snapshot: {} }
    const b = rijNaarBericht(rij)
    expect(b.titel).toBeNull()
    expect(b.rubriek).toBeNull()
    expect(b.bron).toBeNull()
    expect(b.url).toBeNull()
    expect(b.gepubliceerd).toBeNull()
    expect(b.gezienOp).toBeNull()
    expect(b.samenvatting).toBeNull()
  })

  it('snapshot null → hetzelfde als leeg object', () => {
    const rij = { ...basisRij, snapshot: null }
    const b = rijNaarBericht(rij)
    expect(b.titel).toBeNull()
    expect(b.samenvatting).toBeNull()
  })

  it('waarom/wat_mist null → lege array, niet null', () => {
    const rij = { ...basisRij, waarom: null, wat_mist: null }
    const b = rijNaarBericht(rij)
    expect(b.waarom).toEqual([])
    expect(b.watMist).toEqual([])
  })

  // Security G2 (30-09-2026): de lezer zag de codes van de matcher letterlijk.
  describe('"Waarom zie ik dit?" toont zinnen uit de catalogus, nooit een code', () => {
    const ALLE_CODES = [
      'thema:sparen-rente',
      'redactie:spaarbuffer',
      'impact:bereik',
      'impact:ontbreekt',
      'impact:nul',
      'doelgroep-onbevestigd',
      'deadline',
      'rubriek-voorkeur',
      'rubriek-gedempt',
      'samenvatting-leeg:model',
      'samenvatting-geweerd:wft',
      'ai:toegevoegd',
    ]

    it('geen enkele technische code bereikt de lezer', () => {
      expect(leesbaarWaarom(ALLE_CODES)).toEqual([])
      const b = rijNaarBericht({ ...basisRij, waarom: [...ALLE_CODES, 'reden:reden-koopwoning'] })
      expect(b.waarom).toHaveLength(1)
      for (const zin of b.waarom) expect(zin).not.toMatch(/[a-z]:[a-z]|^[a-z-]+$/)
    })

    it('een reden wordt de zin uit de catalogus; een gevoelige reden staat hier wél (achter de klik)', () => {
      expect(leesbaarWaarom(['reden:reden-spaargeld-50k'])).toEqual([renderSjabloon('raakt-reden', 0, { reden: renderSjabloon('reden-spaargeld-50k', 0) })])
      expect(leesbaarWaarom(['reden:reden-krediet'])).toEqual(['Volgens je profiel heb je een lening of krediet.'])
    })

    it('regel 2b: het bufferbericht heeft geen zichtbare reden', () => {
      expect(leesbaarWaarom(['thema:sparen-rente', 'redactie:spaarbuffer'])).toEqual([])
    })

    it('toegestaan is precies wat de matcher als reden kan schrijven — elke reden geeft een zin', () => {
      const ids = [...new Set(Object.values(REDEN_PER_REGEL))]
      expect(ids.length).toBeGreaterThan(15)
      for (const id of ids) {
        const zinnen = leesbaarWaarom([`reden:${id}`])
        expect(zinnen, id).toHaveLength(1)
        expect(zinnen[0], id).toMatch(/^Volgens je profiel .+\.$/)
      }
      // Een catalogustekst buiten die lijst verschijnt niet, ook niet met het voorvoegsel reden-.
      expect(leesbaarWaarom(['reden:raakt-reden', 'reden:raakt-kop', 'reden:veld-spaargeld'])).toEqual([])
    })

    it('een onbekende of vervallen reden valt weg, en dubbelen tellen één keer', () => {
      expect(leesbaarWaarom(['reden:reden-bestaat-niet', 'reden:raakt-kop', 'reden:', 'reden:reden-huur', 'reden:reden-huur'])).toEqual([
        renderSjabloon('raakt-reden', 0, { reden: renderSjabloon('reden-huur', 0) }),
      ])
      expect(leesbaarWaarom([42 as unknown as string])).toEqual([])
    })

    it('"wat we nog niet weten": de naam van het veld, nooit de sleutel; een onbekende sleutel valt weg', () => {
      expect(leesbaarWatMist(['spaargeld', 'hypotheek_rentevast', 'spaargeld', 'bestaat-niet', 'constructor'])).toEqual([
        renderSjabloon('veld-spaargeld', 0),
        renderSjabloon('veld-hypotheek_rentevast', 0),
      ])
    })
  })

  it('lege-string snapshot-velden tellen als afwezig (str-helper)', () => {
    const rij = { ...basisRij, snapshot: { titel: '', bron: 'B' } }
    const b = rijNaarBericht(rij)
    expect(b.titel).toBeNull()
    expect(b.bron).toBe('B')
  })
})

// ── laadTijdlijnPagina ───────────────────────────────────────────────────────

/** Bouwt TIJDLIJN_PAGINA_of_meer rijen met eigen user_id/tijdlijn/created_at/positie/id. */
function itemRij(overrides: Partial<Record<string, unknown>>) {
  return {
    id: 'i-0',
    editie_id: 'e-0',
    created_at: '2026-09-29T08:00:00Z',
    positie: 0,
    vorm: 'raakt',
    tekst: 't',
    waarom: [],
    wat_mist: [],
    deadline: null,
    snapshot: {},
    'krant_edities.week_key': '2026-W39',
    krant_edities: { week_key: '2026-W39' },
    user_id: UID,
    tijdlijn: true,
    ...overrides,
  }
}

describe('laadTijdlijnPagina — filters, sortering, limiet', () => {
  it('draagt .eq(user_id) en .eq(tijdlijn, true), en sluit andermans/gearchiveerde rijen uit', async () => {
    const nep = maakNepClient({
      krant_editie_items: [
        itemRij({ id: 'mij', user_id: UID, tijdlijn: true }),
        itemRij({ id: 'partner', user_id: 'partner', tijdlijn: true }),
        itemRij({ id: 'niet-tijdlijn', user_id: UID, tijdlijn: false }),
      ],
    })
    const pagina = await laadTijdlijnPagina(nep.client as never, UID)
    expect(pagina.berichten.map((b) => b.id)).toEqual(['mij'])

    const [q] = nep.queriesOp('krant_editie_items')
    const eqCalls = q.stappen.filter((s) => s.m === 'eq').map((s) => s.args)
    expect(eqCalls).toContainEqual(['user_id', UID])
    expect(eqCalls).toContainEqual(['tijdlijn', true])
  })

  it('sorteert desc created_at, dan asc positie, dan asc id (in die volgorde)', async () => {
    const nep = maakNepClient({ krant_editie_items: [] })
    await laadTijdlijnPagina(nep.client as never, UID)
    const [q] = nep.queriesOp('krant_editie_items')
    const orderCalls = q.stappen.filter((s) => s.m === 'order').map((s) => [s.args[0], (s.args[1] as { ascending?: boolean }).ascending])
    expect(orderCalls).toEqual([
      ['created_at', false],
      ['positie', true],
      ['id', true],
    ])
  })

  it('vraagt TIJDLIJN_PAGINA + 1 op (limit 21)', async () => {
    const nep = maakNepClient({ krant_editie_items: [] })
    await laadTijdlijnPagina(nep.client as never, UID)
    const [q] = nep.queriesOp('krant_editie_items')
    const limitStap = q.stappen.find((s) => s.m === 'limit')
    expect(limitStap!.args[0]).toBe(TIJDLIJN_PAGINA + 1)
  })

  it('precies TIJDLIJN_PAGINA (20) rijen → geen "volgende"', async () => {
    const rijen = Array.from({ length: TIJDLIJN_PAGINA }, (_, i) =>
      itemRij({ id: `i${i}`, created_at: '2026-09-29T08:00:00Z', positie: i }),
    )
    const nep = maakNepClient({ krant_editie_items: rijen })
    const pagina = await laadTijdlijnPagina(nep.client as never, UID)
    expect(pagina.berichten).toHaveLength(TIJDLIJN_PAGINA)
    expect(pagina.volgende).toBeNull()
  })

  it('TIJDLIJN_PAGINA + 1 (21) rijen → wél een "volgende", cursor op het laatste getoonde bericht (#20)', async () => {
    // Echte UUID's: het laatste bericht wordt door de functie zelf weer
    // gecodeerd en gedecodeerd, en decodeerCursor eist een geldige uuid.
    const rijen = Array.from({ length: TIJDLIJN_PAGINA + 1 }, (_, i) =>
      itemRij({ id: `00000000-0000-4000-8000-${i.toString().padStart(12, '0')}`, created_at: '2026-09-29T08:00:00Z', positie: i }),
    )
    const nep = maakNepClient({ krant_editie_items: rijen })
    const pagina = await laadTijdlijnPagina(nep.client as never, UID)
    expect(pagina.berichten).toHaveLength(TIJDLIJN_PAGINA)
    expect(pagina.volgende).not.toBeNull()
    const laatste = pagina.berichten[TIJDLIJN_PAGINA - 1]
    expect(decodeerCursor(pagina.volgende)).toEqual({ createdAt: laatste.createdAt, positie: laatste.positie, id: laatste.id })
  })

  it('week filtert op krant_edities.week_key', async () => {
    const nep = maakNepClient({
      krant_editie_items: [
        itemRij({ id: 'w39', 'krant_edities.week_key': '2026-W39' }),
        itemRij({ id: 'w40', 'krant_edities.week_key': '2026-W40' }),
      ],
    })
    const pagina = await laadTijdlijnPagina(nep.client as never, UID, { week: '2026-W39' })
    expect(pagina.berichten.map((b) => b.id)).toEqual(['w39'])
    const [q] = nep.queriesOp('krant_editie_items')
    expect(q.stappen.filter((s) => s.m === 'eq').map((s) => s.args)).toContainEqual(['krant_edities.week_key', '2026-W39'])
  })

  it('cursor bouwt het or-filter met exact (createdAt, positie, id) uit de cursor', async () => {
    const cursor: TijdlijnCursor = { createdAt: '2026-09-28T08:00:00Z', positie: 4, id: '12345678-1234-1234-1234-123456789abc' }
    const nep = maakNepClient({ krant_editie_items: [] }, { or: () => true })
    await laadTijdlijnPagina(nep.client as never, UID, { cursor })
    const [q] = nep.queriesOp('krant_editie_items')
    const orStap = q.stappen.find((s) => s.m === 'or')
    expect(orStap!.args[0]).toBe(
      `created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",positie.gt.${cursor.positie}),and(created_at.eq."${cursor.createdAt}",positie.eq.${cursor.positie},id.gt.${cursor.id})`,
    )
  })

  it('de cursor sluit strikt-vóór-of-op de cursor uit, ongeacht de daadwerkelijke PostgREST-semantiek — getoetst met een echte predicaat-evaluatie', async () => {
    // Minimalistische parser van de vaste drieledige or-expressie (geen algemene
    // PostgREST-grammatica) — zie het kopcommentaar van nep-client.fixture.ts.
    function splitTop(s: string): string[] {
      const out: string[] = []
      let depth = 0
      let start = 0
      for (let i = 0; i < s.length; i++) {
        if (s[i] === '(') depth++
        else if (s[i] === ')') depth--
        else if (s[i] === ',' && depth === 0) {
          out.push(s.slice(start, i))
          start = i + 1
        }
      }
      out.push(s.slice(start))
      return out
    }
    function evalTerm(t: string, rij: Record<string, unknown>): boolean {
      const m = t.match(/^(\w+)\.(lt|gt|eq)\.(.*)$/)
      if (!m) throw new Error(`onverwachte term: ${t}`)
      const [, col, op, ruw] = m
      const gequote = ruw.startsWith('"') && ruw.endsWith('"')
      const waarde: string | number = gequote ? ruw.slice(1, -1) : Number.isNaN(Number(ruw)) ? ruw : Number(ruw)
      const rijWaarde = rij[col] as string | number
      if (op === 'lt') return rijWaarde < waarde
      if (op === 'gt') return rijWaarde > waarde
      return rijWaarde === waarde
    }
    function evalClause(c: string, rij: Record<string, unknown>): boolean {
      if (c.startsWith('and(')) return splitTop(c.slice(4, -1)).every((t) => evalTerm(t, rij))
      return evalTerm(c, rij)
    }
    const predicaat = (expr: string, rij: Record<string, unknown>) => splitTop(expr).some((c) => evalClause(c, rij))

    // Sortering is (created_at DESC, positie ASC, id ASC): "strikt ná de cursor
    // in die volgorde" betekent dus een KLEINERE created_at (ouder — verderop in
    // een desc-lijst), of bij gelijke created_at een GROTERE positie/id.
    const cursor: TijdlijnCursor = { createdAt: '2026-09-29T08:00:00Z', positie: 5, id: '50000000-0000-0000-0000-000000000000' }
    const rijen = [
      // nieuwer dan de cursor: stond er al vóór in de lijst (desc) — moet weg.
      itemRij({ id: 'nieuwer', created_at: '2026-09-30T08:00:00Z', positie: 0 }),
      // ouder dan de cursor: staat verderop in de lijst — moet blijven.
      itemRij({ id: 'ouder', created_at: '2026-09-28T08:00:00Z', positie: 0 }),
      // exact dezelfde verversing, latere positie: moet blijven.
      itemRij({ id: 'zelfde-tijd-latere-positie', created_at: cursor.createdAt, positie: 9 }),
      // exact dezelfde verversing/positie, hogere id (string-vergelijking: 'z' > '5'): moet blijven.
      itemRij({ id: 'zelfde-tijd-zelfde-positie-hogere-id', created_at: cursor.createdAt, positie: cursor.positie }),
      // exact de cursor zelf: mag niet nog eens terugkomen.
      itemRij({ id: cursor.id, created_at: cursor.createdAt, positie: cursor.positie }),
      // zelfde tijd, eerdere positie: staat al eerder in de lijst — moet weg.
      itemRij({ id: 'zelfde-tijd-eerdere-positie', created_at: cursor.createdAt, positie: 1 }),
    ]
    const nep = maakNepClient({ krant_editie_items: rijen }, { or: predicaat })
    const pagina = await laadTijdlijnPagina(nep.client as never, UID, { cursor })
    expect(pagina.berichten.map((b) => b.id).sort()).toEqual(
      ['ouder', 'zelfde-tijd-latere-positie', 'zelfde-tijd-zelfde-positie-hogere-id'].sort(),
    )
  })
})

// ── laadTijdlijn ─────────────────────────────────────────────────────────────

function verversingRij(overrides: Partial<Record<string, unknown>>) {
  return {
    id: 'v-0',
    user_id: UID,
    bron: 'tijdlijn',
    week_key: '2026-W39',
    item_count: 0,
    leeg: false,
    lege_tekst: null,
    algemeen: null,
    created_at: '2026-09-29T08:00:00Z',
    ...overrides,
  }
}

/** Client met een werkende .rpc() bovenop de nep-client (die zelf geen RPC kent). */
function metRpc(nep: ReturnType<typeof maakNepClient>, geduid: string[]) {
  return {
    ...nep.client,
    rpc: async (naam: string, args: { ids: string[] }) => {
      expect(naam).toBe('krant_geduide_artikelen')
      return { data: args.ids.filter((id) => geduid.includes(id)), error: null }
    },
  }
}

describe('laadTijdlijn — overzicht', () => {
  it('totaal = som van item_count over de verversingen; lege verversingen (item_count 0) tellen niet mee', async () => {
    const nep = maakNepClient({
      krant_edities: [
        verversingRij({ id: 'v1', item_count: 3 }),
        verversingRij({ id: 'v2', item_count: 0, leeg: true }),
        verversingRij({ id: 'v3', item_count: 2 }),
      ],
      krant_editie_items: [],
      nieuwsprofiel: [],
    })
    const uit = await laadTijdlijn(metRpc(nep, []) as never, UID)
    expect(uit.totaal).toBe(5)
  })

  it('archief per week, nieuwste week eerst', async () => {
    const nep = maakNepClient({
      krant_edities: [
        verversingRij({ id: 'v1', week_key: '2026-W38', item_count: 1 }),
        verversingRij({ id: 'v2', week_key: '2026-W40', item_count: 2 }),
        verversingRij({ id: 'v3', week_key: '2026-W39', item_count: 1 }),
      ],
      nieuwsprofiel: [],
    })
    const uit = await laadTijdlijn(metRpc(nep, []) as never, UID)
    expect(uit.archief.map((w) => w.weekKey)).toEqual(['2026-W40', '2026-W39', '2026-W38'])
  })

  it('laatstVernieuwd = created_at van de nieuwste verversing, óók als die leeg is', async () => {
    const nep = maakNepClient({
      krant_edities: [
        verversingRij({ id: 'oud', created_at: '2026-09-01T08:00:00Z', item_count: 3 }),
        verversingRij({ id: 'nieuw-leeg', created_at: '2026-09-29T08:00:00Z', item_count: 0, leeg: true }),
      ],
      nieuwsprofiel: [],
    })
    const uit = await laadTijdlijn(metRpc(nep, []) as never, UID)
    expect(uit.laatstVernieuwd).toBe('2026-09-29T08:00:00Z')
  })

  it('geen verversingen → laatstVernieuwd null, totaal 0', async () => {
    const nep = maakNepClient({ krant_edities: [], nieuwsprofiel: [] })
    const uit = await laadTijdlijn(metRpc(nep, []) as never, UID)
    expect(uit.laatstVernieuwd).toBeNull()
    expect(uit.totaal).toBe(0)
  })

  // geduideArtikelen filtert niet-uuid id's vóór de RPC (zie de eigen tests
  // daarvoor) — de artikelId's in deze fixtures moeten dus echte uuid's zijn,
  // anders valt elk item er al vóór de RPC uit en test je per ongeluk "geen
  // kandidaten" in plaats van "wél/niet geduid".
  const UUID_A = '11111111-1111-4111-8111-111111111111'
  const UUID_TERUGGETROKKEN = '22222222-2222-4222-8222-222222222222'
  const algemeenItem = (artikelId: string, titel: string) => ({ artikelId, titel, rubriek: null, bron: 'B', url: 'u', gepubliceerd: null, samenvatting: null })

  it('katern alleen onder KATERN_ONDER (5) berichten; erboven blijft het null', async () => {
    const algemeen = { kop: 'Kop', label: 'Label', items: [algemeenItem(UUID_A, 'T')] }
    const nepOnder = maakNepClient({
      krant_edities: [verversingRij({ id: 'v1', item_count: KATERN_ONDER - 1, algemeen })],
      nieuwsprofiel: [],
    })
    const uitOnder = await laadTijdlijn(metRpc(nepOnder, [UUID_A]) as never, UID)
    expect(uitOnder.katern).not.toBeNull()

    const nepErboven = maakNepClient({
      krant_edities: [verversingRij({ id: 'v1', item_count: KATERN_ONDER, algemeen })],
      nieuwsprofiel: [],
    })
    const uitErboven = await laadTijdlijn(metRpc(nepErboven, [UUID_A]) as never, UID)
    expect(uitErboven.katern).toBeNull()
  })

  it('Achtergrond en katern zijn gefilterd op de RPC: een teruggetrokken id valt weg', async () => {
    const algemeen = {
      kop: 'Kop',
      label: 'Label',
      items: [algemeenItem(UUID_A, 'T1'), algemeenItem(UUID_TERUGGETROKKEN, 'T2')],
      achtergrond: { kop: 'Achtergrond-kop', label: 'Achtergrond-label', items: [algemeenItem(UUID_TERUGGETROKKEN, 'T2')] },
    }
    const nep = maakNepClient({
      krant_edities: [verversingRij({ id: 'v1', item_count: 1, algemeen })],
      nieuwsprofiel: [],
    })
    const uit = await laadTijdlijn(metRpc(nep, [UUID_A]) as never, UID)
    expect(uit.katern?.items.map((i) => i.artikelId)).toEqual([UUID_A])
    // Achtergrond had alleen het teruggetrokken id → het hele blok valt weg (leeg na filter).
    expect(uit.achtergrond).toBeNull()
  })

  it('alles teruggetrokken → het blok is null (nooit een leeg blok met een kop)', async () => {
    const algemeen = { kop: 'Kop', label: 'Label', items: [algemeenItem(UUID_TERUGGETROKKEN, 'T')] }
    const nep = maakNepClient({
      krant_edities: [verversingRij({ id: 'v1', item_count: 1, algemeen })],
      nieuwsprofiel: [],
    })
    const uit = await laadTijdlijn(metRpc(nep, []) as never, UID)
    expect(uit.katern).toBeNull()
  })

  it('legeTekst alleen bij totaal 0, en dan van de laatste (nieuwste) verversing', async () => {
    const nep = maakNepClient({
      krant_edities: [
        verversingRij({ id: 'v1', item_count: 0, leeg: true, lege_tekst: 'oude lege tekst', created_at: '2026-09-01T08:00:00Z' }),
        verversingRij({ id: 'v2', item_count: 0, leeg: true, lege_tekst: 'nieuwste lege tekst', created_at: '2026-09-29T08:00:00Z' }),
      ],
      nieuwsprofiel: [],
    })
    const uit = await laadTijdlijn(metRpc(nep, []) as never, UID)
    expect(uit.legeTekst).toBe('nieuwste lege tekst')
  })

  it('legeTekst blijft null zodra er ook maar één bericht is', async () => {
    const nep = maakNepClient({
      krant_edities: [verversingRij({ id: 'v1', item_count: 1, lege_tekst: 'zou nooit getoond mogen worden' })],
      nieuwsprofiel: [],
    })
    const uit = await laadTijdlijn(metRpc(nep, []) as never, UID)
    expect(uit.legeTekst).toBeNull()
  })

  it('geen kandidaat-id (geen algemeen-blok) → de RPC wordt niet aangeroepen', async () => {
    const nep = maakNepClient({
      krant_edities: [verversingRij({ id: 'v1', item_count: 2, algemeen: null })],
      nieuwsprofiel: [],
    })
    let aangeroepen = false
    const client = {
      ...nep.client,
      rpc: async () => {
        aangeroepen = true
        return { data: [], error: null }
      },
    }
    await laadTijdlijn(client as never, UID)
    expect(aangeroepen).toBe(false)
  })

  it('gelezenTot komt uit nieuwsprofiel.tijdlijn_gelezen_tot van de eigen rij', async () => {
    const nep = maakNepClient({
      krant_edities: [],
      nieuwsprofiel: [{ user_id: UID, tijdlijn_gelezen_tot: '2026-09-20T08:00:00Z' }],
    })
    const uit = await laadTijdlijn(metRpc(nep, []) as never, UID)
    expect(uit.gelezenTot).toBe('2026-09-20T08:00:00Z')
  })
})

// ── geduideArtikelen (RPC-wrapper) ──────────────────────────────────────────

describe('geduideArtikelen', () => {
  it('leeg in → leeg uit, geen RPC-aanroep', async () => {
    let aangeroepen = false
    const client = { rpc: async () => { aangeroepen = true; return { data: [], error: null } } }
    const uit = await geduideArtikelen(client as never, [])
    expect(uit.size).toBe(0)
    expect(aangeroepen).toBe(false)
  })

  it('dedupliceert en filtert niet-uuid id\'s vóór de RPC', async () => {
    const gezien: string[] = []
    const client = {
      rpc: async (_n: string, args: { ids: string[] }) => {
        gezien.push(...args.ids)
        return { data: args.ids, error: null }
      },
    }
    const geldigUuid = '12345678-1234-1234-1234-123456789abc'
    await geduideArtikelen(client as never, [geldigUuid, geldigUuid, 'niet-een-uuid'])
    expect(gezien).toEqual([geldigUuid])
  })
})

// ── heeftNieuw ───────────────────────────────────────────────────────────────

describe('heeftNieuw', () => {
  it('met gelezenTot: alleen berichten na dat tijdstip tellen als nieuw', async () => {
    const nep = maakNepClient({
      nieuwsprofiel: [{ user_id: UID, tijdlijn_gelezen_tot: '2026-09-28T08:00:00Z' }],
      krant_editie_items: [itemRij({ id: 'oud', created_at: '2026-09-27T08:00:00Z' })],
    })
    expect(await heeftNieuw(nep.client as never, UID)).toBe(false)
  })

  it('met gelezenTot en een bericht erna → true', async () => {
    const nep = maakNepClient({
      nieuwsprofiel: [{ user_id: UID, tijdlijn_gelezen_tot: '2026-09-28T08:00:00Z' }],
      krant_editie_items: [itemRij({ id: 'nieuw', created_at: '2026-09-29T08:00:00Z' })],
    })
    expect(await heeftNieuw(nep.client as never, UID)).toBe(true)
  })

  it('zonder gelezenTot (nog nooit bezocht) → elk bestaand bericht telt als nieuw', async () => {
    const nep = maakNepClient({
      nieuwsprofiel: [],
      krant_editie_items: [itemRij({ id: 'i1' })],
    })
    expect(await heeftNieuw(nep.client as never, UID)).toBe(true)
  })

  it('zonder gelezenTot en zonder berichten → false', async () => {
    const nep = maakNepClient({ nieuwsprofiel: [], krant_editie_items: [] })
    expect(await heeftNieuw(nep.client as never, UID)).toBe(false)
  })
})

// ── Krant 1E: de AI-laag in de leesvorm ──────────────────────────────────────

describe('de AI-laag lezen (Krant 1E, ADR 0190)', () => {
  it('de kolomlijst vraagt ai_tekst en ai_toegevoegd op — de eigen rij, geen andere', () => {
    expect(TIJDLIJN_ITEM_KOLOMMEN).toMatch(/\bai_tekst\b/)
    expect(TIJDLIJN_ITEM_KOLOMMEN).toMatch(/\bai_toegevoegd\b/)
    expect(TIJDLIJN_ITEM_KOLOMMEN).toMatch(/krant_edities!inner\(week_key\)/)
  })

  it('rijNaarBericht: AI-tekst en "door AI toegevoegd" uit de rij; lege AI-tekst telt als geen; vorm ai-oud zonder AI-tekst', () => {
    const b = rijNaarBericht({ ...basisRij, vorm: 'ai', tekst: '', ai_tekst: 'Toelichting.', ai_toegevoegd: true })
    expect(b).toMatchObject({ vorm: 'ai', tekst: '', aiTekst: 'Toelichting.', aiToegevoegd: true, kop: null })
    expect(rijNaarBericht({ ...basisRij, vorm: 'ai-oud', tekst: '', ai_tekst: null })).toMatchObject({ vorm: 'ai-oud', aiTekst: null, kop: null })
    expect(rijNaarBericht({ ...basisRij, ai_tekst: '' }).aiTekst).toBeNull()
    expect(rijNaarBericht({ ...basisRij, ai_tekst: null, ai_toegevoegd: null }).aiToegevoegd).toBe(false)
  })

  it('zonderAiVan: quotum → "quotum"; teruggevallen/geweigerd → "anders"; met-ai/leeg/null → null', () => {
    expect(zonderAiVan('quotum')).toBe('quotum')
    expect(zonderAiVan('teruggevallen')).toBe('anders')
    expect(zonderAiVan('geweigerd')).toBe('anders')
    expect(zonderAiVan('met-ai')).toBeNull()
    expect(zonderAiVan('leeg')).toBeNull()
    expect(zonderAiVan(null)).toBeNull()
  })
})
