import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock wordt gehoist: de vervanger voor NoObjectGeneratedError moet ín de factory leven.
vi.mock('ai', () => {
  class SchemaFout extends Error {
    static isInstance(err: unknown): err is SchemaFout {
      return err instanceof SchemaFout
    }
  }
  return { generateObject: vi.fn(), NoObjectGeneratedError: SchemaFout }
})
vi.mock('@/lib/news-sources', () => ({ fetchWebContent: vi.fn(async () => '') }))

import { generateObject, NoObjectGeneratedError } from 'ai'
const SchemaFout = NoObjectGeneratedError as unknown as new (message: string) => Error
import { fetchWebContent } from '@/lib/news-sources'
import {
  buildDuidingSystemPrompt,
  duidWachtendeArtikelen,
  DUIDING_MAX_POGINGEN,
} from './duiding'
import { GELDIGE_UITVOER } from './duiding.fixture'
import { DREMPEL_SLEUTELS } from './drempels'
import { MECHANISME_IDS } from './mechanismen'
import { DOELGROEP_SLEUTEL_LIJST } from './profiel-velden'

const generateObjectMock = vi.mocked(generateObject)
const fetchWebContentMock = vi.mocked(fetchWebContent)

// ── Mock-client: elke query wordt vastgelegd; het resultaat volgt uit de vorm ─

interface Stap { m: string; args: unknown[] }
interface Query { table: string; stappen: Stap[] }

function maakClient(
  rijen: Array<Record<string, unknown>>,
  opties: { wacht?: number; selectFout?: boolean; updateRaakt?: number; updateFout?: boolean } = {},
) {
  const queries: Query[] = []
  const chainMethods = ['select', 'update', 'delete', 'eq', 'in', 'lt', 'gte', 'order', 'limit']

  function maakQuery(table: string) {
    const q: Query = { table, stappen: [] }
    queries.push(q)
    const chain: Record<string, unknown> = {}
    for (const m of chainMethods) {
      chain[m] = (...args: unknown[]) => {
        q.stappen.push({ m, args })
        return chain
      }
    }
    chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
      const select = q.stappen.find((s) => s.m === 'select')
      const update = q.stappen.find((s) => s.m === 'update')
      let result: unknown
      if (update) {
        // `updateFout` raakt alleen de per-rij-writes (eq id), niet de versie-bump.
        const perRij = q.stappen.some((s) => s.m === 'eq' && s.args[0] === 'id')
        const geraakt = opties.updateRaakt ?? 1
        result = opties.updateFout && perRij
          ? { data: null, error: new Error('schrijffout') }
          : { data: Array.from({ length: geraakt }, () => ({ id: 'x' })), error: null }
      } else if (select && (select.args[1] as { count?: string } | undefined)?.count === 'exact') {
        result = { count: opties.wacht ?? 0, error: null }
      } else if (select) {
        result = opties.selectFout ? { data: null, error: new Error('kapot') } : { data: rijen, error: null }
      } else {
        result = { data: null, error: null }
      }
      return Promise.resolve(result).then(res, rej)
    }
    return chain
  }

  return { client: { from: (table: string) => maakQuery(table) }, queries }
}

const BRON = 'Het heffingsvrij vermogen in box 3 stijgt in 2027 naar € 60.000. Het tarief blijft 36 procent.'

function artikel(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'a1',
    title: 'Heffingsvrij vermogen omhoog',
    summary: BRON,
    raw_content: BRON,
    source_url: 'https://nos.nl/artikel/1',
    source_name: 'NOS',
    category: 'fiscaal',
    published_at: '2026-09-20T06:00:00Z',
    duiding_pogingen: 0,
    ...over,
  }
}

const MODEL = { modelId: 'test-model' }

function updates(queries: Query[]) {
  return queries
    .filter((q) => q.stappen.some((s) => s.m === 'update'))
    .map((q) => ({
      velden: q.stappen.find((s) => s.m === 'update')!.args[0] as Record<string, unknown>,
      filters: q.stappen.filter((s) => s.m !== 'update').map((s) => [s.m, ...s.args]),
    }))
}

beforeEach(() => {
  generateObjectMock.mockReset()
  fetchWebContentMock.mockClear()
})

describe('duidWachtendeArtikelen — de stap in de schaduw', () => {
  it('schrijft een geduide rij, geconditioneerd op id + wachtende status (idempotent)', async () => {
    generateObjectMock.mockResolvedValue({ object: GELDIGE_UITVOER } as never)
    const { client, queries } = maakClient([artikel()], { wacht: 3 })

    const summary = await duidWachtendeArtikelen(client as never, MODEL, { maxPerRun: 10 })

    expect(summary).toEqual({ geduid: 1, afgewezen: 0, mislukt: 0, overgeslagen: 0, wacht: 3 })
    const rij = updates(queries).find((u) => u.velden.duiding_status === 'geduid')!
    expect(rij.velden).toMatchObject({ duiding_versie: 1, duiding_pogingen: 1, duiding_fout: null })
    expect((rij.velden.duiding as { meta: { brontekst: string; model: string } }).meta).toMatchObject({ brontekst: 'teaser', model: 'test-model' })
    expect(rij.filters).toContainEqual(['eq', 'id', 'a1'])
    expect(rij.filters).toContainEqual(['in', 'duiding_status', ['wacht', 'mislukt']])
  })

  it('respecteert de batch-cap en leest alleen wachtende rijen onder de pogingengrens', async () => {
    generateObjectMock.mockResolvedValue({ object: GELDIGE_UITVOER } as never)
    const { client, queries } = maakClient([artikel()])

    await duidWachtendeArtikelen(client as never, MODEL, { maxPerRun: 15 })

    const selectie = queries.find((q) => q.stappen.some((s) => s.m === 'select' && !(s.args[1] as { count?: string } | undefined)?.count))!
    const stappen = selectie.stappen.map((s) => [s.m, ...s.args])
    expect(stappen).toContainEqual(['limit', 15])
    expect(stappen).toContainEqual(['in', 'duiding_status', ['wacht', 'mislukt']])
    expect(stappen).toContainEqual(['lt', 'duiding_pogingen', DUIDING_MAX_POGINGEN])
  })

  it('versie-bump: geduid én afgewezen met een lagere versie gaan schoon terug op wacht', async () => {
    const { client, queries } = maakClient([])
    await duidWachtendeArtikelen(client as never, MODEL, { maxPerRun: 5 })
    const bump = updates(queries).find((u) => u.velden.duiding_status === 'wacht')!
    expect(bump.velden).toEqual({ duiding_status: 'wacht', duiding_pogingen: 0, duiding_fout: null, duiding: null })
    expect(bump.filters).toContainEqual(['in', 'duiding_status', ['geduid', 'afgewezen']])
    expect(bump.filters).toContainEqual(['lt', 'duiding_versie', 1])
  })

  it('een schema-overtreding uit generateObject is direct afgewezen (code schema), geen retry', async () => {
    generateObjectMock.mockRejectedValue(new SchemaFout('past niet in het schema'))
    const { client, queries } = maakClient([artikel()])
    const summary = await duidWachtendeArtikelen(client as never, MODEL, { maxPerRun: 5 })
    expect(summary.afgewezen).toBe(1)
    expect(updates(queries).at(-1)!.velden).toMatchObject({ duiding_status: 'afgewezen', duiding_fout: 'schema', duiding_pogingen: 1 })
  })

  it('nul geraakte rijen (parallelle run was eerder) telt als overgeslagen, niet als geduid', async () => {
    generateObjectMock.mockResolvedValue({ object: GELDIGE_UITVOER } as never)
    const { client } = maakClient([artikel()], { updateRaakt: 0 })
    const summary = await duidWachtendeArtikelen(client as never, MODEL, { maxPerRun: 5 })
    expect(summary).toMatchObject({ geduid: 0, overgeslagen: 1 })
  })

  it('een schrijffout telt als mislukt en stopt de rest niet', async () => {
    generateObjectMock.mockResolvedValue({ object: GELDIGE_UITVOER } as never)
    const { client } = maakClient([artikel({ id: 'a' }), artikel({ id: 'b' })], { updateFout: true })
    const summary = await duidWachtendeArtikelen(client as never, MODEL, { maxPerRun: 5 })
    expect(summary.mislukt).toBe(2)
  })

  it('modelfout → mislukt met poging +1; na de laatste poging afgewezen met code mislukt', async () => {
    generateObjectMock.mockRejectedValue(new Error('rate limit'))
    const eerste = maakClient([artikel({ duiding_pogingen: 0 })])
    const s1 = await duidWachtendeArtikelen(eerste.client as never, MODEL, { maxPerRun: 5 })
    expect(s1.mislukt).toBe(1)
    expect(updates(eerste.queries).at(-1)!.velden).toMatchObject({ duiding_status: 'mislukt', duiding_pogingen: 1, duiding_fout: 'mislukt', duiding: null })

    const laatste = maakClient([artikel({ duiding_pogingen: DUIDING_MAX_POGINGEN - 1 })])
    const s2 = await duidWachtendeArtikelen(laatste.client as never, MODEL, { maxPerRun: 5 })
    expect(s2.afgewezen).toBe(1)
    expect(updates(laatste.queries).at(-1)!.velden).toMatchObject({ duiding_status: 'afgewezen', duiding_pogingen: DUIDING_MAX_POGINGEN })
  })

  it('afgekeurd door de controles → afgewezen met de foutcode, zonder duiding', async () => {
    generateObjectMock.mockResolvedValue({ object: { ...GELDIGE_UITVOER, samenvatting: 'Het bedrag wordt € 99.000 per jaar.' } } as never)
    const { client, queries } = maakClient([artikel()])
    const summary = await duidWachtendeArtikelen(client as never, MODEL, { maxPerRun: 5 })
    expect(summary.afgewezen).toBe(1)
    expect(updates(queries).at(-1)!.velden).toMatchObject({ duiding_status: 'afgewezen', duiding_fout: 'ongegrond:samenvatting', duiding: null })
  })

  it('haalt de volledige tekst alleen voor een regelbron, en bewaart hem niet', async () => {
    generateObjectMock.mockResolvedValue({ object: GELDIGE_UITVOER } as never)
    const haal = vi.fn(async () => `[Rijksoverheid]: ${BRON} Verdere toelichting.`)
    const { client, queries } = maakClient([
      artikel({ id: 'regel', source_url: 'https://www.rijksoverheid.nl/aow', source_name: 'Rijksoverheid' }),
      artikel({ id: 'markt' }),
    ])

    await duidWachtendeArtikelen(client as never, MODEL, { maxPerRun: 5, haalVolledigeTekst: haal })

    expect(haal).toHaveBeenCalledTimes(1)
    expect(haal).toHaveBeenCalledWith('https://www.rijksoverheid.nl/aow', 'Rijksoverheid')
    const geduid = updates(queries).filter((u) => u.velden.duiding_status === 'geduid')
    const metaPer = Object.fromEntries(
      geduid.map((u) => [u.filters.find((f) => f[0] === 'eq')![2], (u.velden.duiding as { meta: { brontekst: string } }).meta.brontekst]),
    )
    expect(metaPer).toEqual({ regel: 'volledig', markt: 'teaser' })
    // Alleen duidingskolommen worden geschreven; raw_content blijft ongemoeid.
    for (const u of geduid) expect(Object.keys(u.velden)).not.toContain('raw_content')
    // De prompt droeg de volledige tekst zonder het bronlabel-prefix.
    const promptRegel = generateObjectMock.mock.calls.map((c) => (c[0] as { prompt: string }).prompt).find((p) => p.includes('Verdere toelichting'))!
    expect(promptRegel).not.toContain('[Rijksoverheid]:')
  })

  const PAGINA = 'https://www.rijksoverheid.nl/onderwerpen/aow'
  const webItem = () =>
    artikel({ source_url: `${PAGINA}#tf-abc123`, source_name: 'Rijksoverheid — AOW', raw_content: 'Modeltekst met een verzonnen 999 euro.' })

  it('web-item: de paginatekst uit dezelfde run is de grondslag, niet de modeltekst in raw_content', async () => {
    generateObjectMock.mockResolvedValue({ object: GELDIGE_UITVOER } as never)
    const haal = vi.fn(async () => '')
    const { client, queries } = maakClient([webItem()])
    const summary = await duidWachtendeArtikelen(client as never, MODEL, {
      maxPerRun: 5,
      haalVolledigeTekst: haal,
      webPaginaUrls: [PAGINA],
      runTekstByPaginaUrl: new Map([[PAGINA, `[Rijksoverheid — AOW]: ${BRON}`]]),
    })
    expect(summary.geduid).toBe(1)
    expect(haal).not.toHaveBeenCalled()
    expect(fetchWebContentMock).not.toHaveBeenCalled()
    const prompt = (generateObjectMock.mock.calls[0][0] as { prompt: string }).prompt
    expect(prompt).toContain(BRON)
    expect(prompt).not.toContain('999')
    expect((updates(queries).at(-1)!.velden.duiding as { meta: { brontekst: string } }).meta.brontekst).toBe('volledig')
  })

  it('web-item zonder paginatekst in deze run wordt overgeslagen: geen modelcall, geen poging, blijft wacht', async () => {
    const { client, queries } = maakClient([webItem()])
    const summary = await duidWachtendeArtikelen(client as never, MODEL, { maxPerRun: 5, webPaginaUrls: [PAGINA] })
    expect(summary.overgeslagen).toBe(1)
    expect(generateObjectMock).not.toHaveBeenCalled()
    // Alleen de versie-bump schrijft; de rij zelf blijft onaangeraakt.
    expect(updates(queries).filter((u) => u.filters.some((f) => f[0] === 'eq' && f[1] === 'id'))).toHaveLength(0)
  })

  it('RSS-grondslag is titel + raw_content; summary (herschreven door het model) telt niet mee', async () => {
    generateObjectMock.mockResolvedValue({ object: GELDIGE_UITVOER } as never)
    const { client } = maakClient([artikel({ summary: 'Herschreven samenvatting met 777 euro.', raw_content: BRON })])
    await duidWachtendeArtikelen(client as never, MODEL, { maxPerRun: 5 })
    const prompt = (generateObjectMock.mock.calls[0][0] as { prompt: string }).prompt
    expect(prompt).toContain(BRON)
    expect(prompt).not.toContain('777')
  })

  it('haalt geen regelbron op over http (alleen https)', async () => {
    generateObjectMock.mockResolvedValue({ object: GELDIGE_UITVOER } as never)
    const haal = vi.fn(async () => BRON)
    const { client } = maakClient([artikel({ source_url: 'http://www.belastingdienst.nl/x' })])
    await duidWachtendeArtikelen(client as never, MODEL, { maxPerRun: 5, haalVolledigeTekst: haal })
    expect(haal).not.toHaveBeenCalled()
  })

  it('tijdbudget: na de deadline pakt geen werker een nieuwe rij', async () => {
    generateObjectMock.mockResolvedValue({ object: GELDIGE_UITVOER } as never)
    const { client } = maakClient([artikel({ id: 'a' }), artikel({ id: 'b' }), artikel({ id: 'c' })])
    const summary = await duidWachtendeArtikelen(client as never, MODEL, { maxPerRun: 5, tijdBudgetMs: 0 })
    expect(summary.overgeslagen).toBe(3)
    expect(generateObjectMock).not.toHaveBeenCalled()
  })

  it('zonder model: niets duiden, wel de wachtrij tellen', async () => {
    const { client, queries } = maakClient([artikel()], { wacht: 42 })
    const summary = await duidWachtendeArtikelen(client as never, null, { maxPerRun: 5 })
    expect(summary).toEqual({ geduid: 0, afgewezen: 0, mislukt: 0, overgeslagen: 0, wacht: 42 })
    expect(generateObjectMock).not.toHaveBeenCalled()
    expect(updates(queries)).toHaveLength(0)
  })

  it('werpt nooit: een kapotte selectie levert een lege summary', async () => {
    const { client } = maakClient([], { selectFout: true })
    await expect(duidWachtendeArtikelen(client as never, MODEL, { maxPerRun: 5 })).resolves.toEqual({
      geduid: 0, afgewezen: 0, mislukt: 0, overgeslagen: 0, wacht: 0,
    })
  })
})

describe('de duidingsprompt volgt de catalogi', () => {
  const prompt = buildDuidingSystemPrompt()

  it('noemt elk mechanisme, elke profielsleutel en elke drempel bij naam', () => {
    for (const id of MECHANISME_IDS) expect(prompt).toContain(`- ${id} [`)
    for (const sleutel of DOELGROEP_SLEUTEL_LIJST) expect(prompt).toContain(`- ${sleutel} (`)
    for (const sleutel of DREMPEL_SLEUTELS) expect(prompt).toContain(sleutel)
  })

  it('draagt de Wft-regels en B2 (alleen euro\'s)', () => {
    expect(prompt).toMatch(/geen aanbieders/i)
    expect(prompt).toMatch(/geen gebiedende wijs/i)
    expect(prompt).toMatch(/sparen of beleggen/i)
    expect(prompt).toMatch(/nooit dagen/i)
    expect(prompt).not.toMatch(/vrijgekocht|terugkopen|vrijkopen/i)
  })
})
