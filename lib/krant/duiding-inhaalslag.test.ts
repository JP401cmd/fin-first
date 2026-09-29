import { describe, it, expect } from 'vitest'
import { GELDIGE_UITVOER } from './duiding.fixture'
import { buildDuidingPrompt, buildDuidingSystemPrompt, bepaalGrondslag, type WachtendArtikel } from './duiding'
import { DUIDING_VERSIE } from './duiding-schema'
import {
  beoordeelHandmatig,
  bouwInhaalslagBatch,
  geduidVelden,
  HANDMATIG_MODEL_ID,
  telOordelen,
} from './duiding-inhaalslag'

const KOP = 'Heffingsvrij vermogen omhoog'
const BRON = 'Het heffingsvrij vermogen in box 3 stijgt in 2027 naar € 60.000. Het tarief blijft 36 procent.'

function artikel(over: Partial<WachtendArtikel> = {}): WachtendArtikel {
  return {
    id: 'a1',
    bron_soort: 'rss',
    bron_kop: KOP,
    bron_fragment: BRON,
    source_name: 'NOS',
    category: 'fiscaal',
    published_at: '2026-09-20T06:00:00Z',
    published_bron: 'feed',
    duiding_pogingen: 0,
    fetched_at: '2026-09-22T05:00:00Z',
    ...over,
  }
}

describe('bouwInhaalslagBatch — exact de prompt van de cron', () => {
  it('draagt dezelfde systeemprompt en per artikel dezelfde user-prompt als duidEen', () => {
    const a = artikel()
    const batch = bouwInhaalslagBatch([a], new Date('2026-09-29T08:00:00Z'))
    expect(batch.systemPrompt).toBe(buildDuidingSystemPrompt())
    expect(batch.artikelen[0].prompt).toBe(buildDuidingPrompt(a, bepaalGrondslag(a)!.tekst))
    expect(batch.duidingVersie).toBe(DUIDING_VERSIE)
    expect(batch.artikelen[0].grondslagSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(batch.schema).toBeTypeOf('object')
  })

  it('een artikel zonder eigen grondslag komt niet in de batch', () => {
    const batch = bouwInhaalslagBatch([artikel({ id: 'leeg', bron_kop: '', bron_fragment: null })], new Date())
    expect(batch.artikelen).toHaveLength(0)
    expect(batch.zonderGrondslag).toEqual(['leeg'])
  })
})

describe('beoordeelHandmatig — dezelfde poort als de cron', () => {
  const a = artikel()
  const batchArtikel = bouwInhaalslagBatch([a], new Date()).artikelen[0]

  it('een geldige duiding gaat door controleerDuiding en draagt de handmatige herkomst', () => {
    const o = beoordeelHandmatig(batchArtikel, a, GELDIGE_UITVOER)
    expect(o.uitkomst).toBe('geduid')
    if (o.uitkomst !== 'geduid') return
    expect((o.duiding as { meta: { model: string } }).meta.model).toBe(HANDMATIG_MODEL_ID)
    expect(geduidVelden(o)).toMatchObject({ duiding_status: 'geduid', duiding_versie: DUIDING_VERSIE })
  })

  it('een verzonnen getal in de samenvatting valt op de tekstpoort (B26), precies als bij de cron', () => {
    const o = beoordeelHandmatig(batchArtikel, a, { ...GELDIGE_UITVOER, samenvatting: 'Het bedrag wordt € 99.000 per jaar.' })
    expect(o.uitkomst).toBe('geduid')
    if (o.uitkomst !== 'geduid') return
    const d = o.duiding as { samenvatting: string | null; meta: { poort: unknown } }
    expect(d.samenvatting).toBeNull()
    expect(d.meta.poort).toEqual({ status: 'gedegradeerd', reden: 'g1:ongegrond-getal' })
  })

  it('een schema-overtreding is afgewezen met code schema', () => {
    const o = beoordeelHandmatig(batchArtikel, a, { soort: 'geen-soort' })
    expect(o).toEqual({ id: 'a1', uitkomst: 'afgewezen', code: 'schema' })
  })

  it('een geheim uit de env in een vrij veld = afgewezen met code geheim (security-run 29 sep)', () => {
    const geheim = 'een-lange-waarde-uit-env-local-1234'
    const o = beoordeelHandmatig(batchArtikel, a, { ...GELDIGE_UITVOER, samenvatting: `Sleutel ${geheim}.` }, [geheim])
    expect(o).toMatchObject({ uitkomst: 'afgewezen', code: 'geheim' })
  })

  it('null = overslaan; rij die niet meer wacht = overslaan', () => {
    expect(beoordeelHandmatig(batchArtikel, a, null)).toMatchObject({ uitkomst: 'overgeslagen', reden: 'geen-uitvoer' })
    expect(beoordeelHandmatig(batchArtikel, null, GELDIGE_UITVOER)).toMatchObject({ uitkomst: 'overgeslagen', reden: 'niet-meer-wachtend' })
  })

  it('is de grondslag sinds de export veranderd (backfill), dan wordt de duiding niet gebruikt', () => {
    const gewijzigd = artikel({ bron_fragment: `${BRON} Nieuwe zin uit de artikelpagina.` })
    expect(beoordeelHandmatig(batchArtikel, gewijzigd, GELDIGE_UITVOER)).toMatchObject({
      uitkomst: 'overgeslagen',
      reden: 'grondslag-gewijzigd',
    })
  })

  it('een ongegronde doelgroep wordt afgewezen met de controlecode (niet alleen schema-fouten)', () => {
    const o = beoordeelHandmatig(batchArtikel, a, {
      ...GELDIGE_UITVOER,
      doelgroep: [{ veld: 'wonen', op: 'is', waarden: ['huur-sociaal'] }],
    })
    expect(o.uitkomst).toBe('afgewezen')
    if (o.uitkomst === 'afgewezen') expect(o.code).toMatch(/^doelgroep:/)
  })

  it('een sessie kan de meta niet zelf zetten: een extra meta-veld is een schema-overtreding', () => {
    const o = beoordeelHandmatig(batchArtikel, a, { ...GELDIGE_UITVOER, meta: { model: 'iets-anders', modeltekst: true } })
    expect(o).toEqual({ id: 'a1', uitkomst: 'afgewezen', code: 'schema' })
  })

  it('een rij zonder eigen grondslag wordt overgeslagen', () => {
    const leeg = artikel({ bron_kop: '', bron_fragment: '' })
    expect(beoordeelHandmatig(batchArtikel, leeg, GELDIGE_UITVOER)).toMatchObject({ uitkomst: 'overgeslagen', reden: 'geen-grondslag' })
  })

  it('telOordelen telt per uitkomst en code', () => {
    const t = telOordelen([
      { id: '1', uitkomst: 'geduid', duiding: {}, fout: null },
      { id: '2', uitkomst: 'afgewezen', code: 'schema' },
      { id: '3', uitkomst: 'overgeslagen', reden: 'geen-uitvoer' },
    ])
    expect(t).toEqual({ geduid: 1, 'afgewezen:schema': 1, 'overgeslagen:geen-uitvoer': 1 })
  })
})
