import { describe, expect, it } from 'vitest'
import { CATEGORISATIE_SYSTEM_PROMPT, bouwCategorisatiePrompt } from '@/lib/news-enrich'
import { knipTekens } from '@/lib/news-html'
import { CATEGORISATIE_FRAGMENT_MAX_TEKENS } from '@/lib/news-ingest'
import {
  beoordeelCategorisatie,
  bouwCategorisatieBatch,
  categorisatieVelden,
  telCategorisatieOordelen,
  type CategorisatieRij,
} from './categorisatie-inhaalslag'

const LANG = 'Inflatie stijgt. '.repeat(80)
const RIJ: CategorisatieRij = { id: 'a1', bron_kop: 'Inflatie 3,3 procent', bron_fragment: LANG, source_name: 'CBS', category: null }
const NU = new Date('2026-09-29T09:00:00.000Z')
const GOED = { category: 'macro', summary: 'De inflatie steeg naar 3,3 procent.', potentialImpact: 'Budget & cashflow: maanduitgaven stijgen.' }

describe('bouwCategorisatieBatch — exact de cron-invoer', () => {
  it('systeemprompt en gebruikersprompt zijn die van categorizeArticles, met het fragment op de cron-knip', () => {
    const batch = bouwCategorisatieBatch([RIJ], NU)
    expect(batch.soort).toBe('categorisatie')
    expect(batch.systemPrompt).toBe(CATEGORISATIE_SYSTEM_PROMPT)
    expect(batch.artikelen[0].prompt).toBe(
      bouwCategorisatiePrompt([{ title: RIJ.bron_kop!, summary: knipTekens(LANG, CATEGORISATIE_FRAGMENT_MAX_TEKENS), sourceName: 'CBS' }]),
    )
    expect(batch.artikelen[0].prompt.length).toBeLessThan(LANG.length)
  })
})

describe('beoordeelCategorisatie', () => {
  const art = bouwCategorisatieBatch([RIJ], NU).artikelen[0]

  it('geldige uitvoer op een nog ongecategoriseerde rij → gecategoriseerd, met de cron-kolommen', () => {
    const o = beoordeelCategorisatie(art, RIJ, GOED)
    expect(o.uitkomst).toBe('gecategoriseerd')
    if (o.uitkomst !== 'gecategoriseerd') return
    expect(categorisatieVelden(o.item)).toEqual({ category: 'macro', summary: GOED.summary, potential_impact: GOED.potentialImpact })
  })

  it('onbekende categorie, lege tekst of extra velden → afgewezen:schema', () => {
    expect(beoordeelCategorisatie(art, RIJ, { ...GOED, category: 'sport' }).uitkomst).toBe('afgewezen')
    expect(beoordeelCategorisatie(art, RIJ, { ...GOED, summary: '  ' }).uitkomst).toBe('afgewezen')
    expect(beoordeelCategorisatie(art, RIJ, { ...GOED, index: 0 }).uitkomst).toBe('afgewezen')
  })

  it('te lang, een link of een geheim → afgewezen (agent met bestandstoegang)', () => {
    expect(beoordeelCategorisatie(art, RIJ, { ...GOED, summary: 'x'.repeat(601) })).toMatchObject({ code: 'schema' })
    expect(beoordeelCategorisatie(art, RIJ, { ...GOED, potentialImpact: 'y'.repeat(301) })).toMatchObject({ code: 'schema' })
    expect(beoordeelCategorisatie(art, RIJ, { ...GOED, summary: 'Lees meer op https://example.com.' })).toMatchObject({ code: 'link' })
    const geheim = 'een-lange-waarde-uit-env-local-1234'
    expect(beoordeelCategorisatie(art, RIJ, { ...GOED, potentialImpact: geheim }, [geheim])).toMatchObject({ code: 'geheim' })
  })

  it('overslaan: geen uitvoer, rij weg, al gecategoriseerd, invoer gewijzigd', () => {
    expect(beoordeelCategorisatie(art, RIJ, null)).toMatchObject({ reden: 'geen-uitvoer' })
    expect(beoordeelCategorisatie(art, null, GOED)).toMatchObject({ reden: 'verdwenen' })
    expect(beoordeelCategorisatie(art, { ...RIJ, category: 'rente' }, GOED)).toMatchObject({ reden: 'al-gecategoriseerd' })
    expect(beoordeelCategorisatie(art, { ...RIJ, bron_fragment: 'Ander fragment' }, GOED)).toMatchObject({ reden: 'invoer-gewijzigd' })
  })

  it('telt per uitkomst', () => {
    const oordelen = [beoordeelCategorisatie(art, RIJ, GOED), beoordeelCategorisatie(art, RIJ, null), beoordeelCategorisatie(art, RIJ, {})]
    expect(telCategorisatieOordelen(oordelen)).toEqual({ gecategoriseerd: 1, 'overgeslagen:geen-uitvoer': 1, 'afgewezen:schema': 1 })
  })
})
