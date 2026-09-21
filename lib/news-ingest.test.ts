import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/news-sources', () => ({
  loadNewsSources: vi.fn(async () => ({ rssFeeds: [], webSources: [] })),
  fetchRssContent: vi.fn(async () => []),
  fetchWebContent: vi.fn(async () => ''),
}))
vi.mock('@/lib/news-enrich', () => ({
  extractNewsFromWebPage: vi.fn(async () => []),
  categorizeArticles: vi.fn(async () => new Map()),
}))
const DUIDING_UITKOMST = { geduid: 2, afgewezen: 1, mislukt: 0, overgeslagen: 0, wacht: 5 }
vi.mock('@/lib/krant/duiding', () => ({
  duidWachtendeArtikelen: vi.fn(async () => ({ geduid: 2, afgewezen: 1, mislukt: 0, overgeslagen: 0, wacht: 5 })),
  LEGE_DUIDING_SUMMARY: { geduid: 0, afgewezen: 0, mislukt: 0, overgeslagen: 0, wacht: 0 },
}))

import { duidWachtendeArtikelen } from '@/lib/krant/duiding'
import { runNewsIngest, ARTICLE_RETENTION_DAYS, TITLE_DEDUPE_WINDOW_DAYS } from './news-ingest'

interface Stap { m: string; args: unknown[] }
interface Query { table: string; stappen: Stap[] }

function maakClient() {
  const queries: Query[] = []
  const methods = ['select', 'update', 'delete', 'upsert', 'eq', 'in', 'lt', 'gte', 'order', 'limit']
  return {
    queries,
    client: {
      from(table: string) {
        const q: Query = { table, stappen: [] }
        queries.push(q)
        const chain: Record<string, unknown> = {}
        for (const m of methods) {
          chain[m] = (...args: unknown[]) => {
            q.stappen.push({ m, args })
            return chain
          }
        }
        chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(res, rej)
        return chain
      },
    },
  }
}

function dagenTerug(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

beforeEach(() => vi.mocked(duidWachtendeArtikelen).mockClear())

describe('runNewsIngest — bewaren op tijd, geen grens op aantal (ADR 0171)', () => {
  it('ruimt op ouder dan ARTICLE_RETENTION_DAYS en verwijdert nooit op aantal', async () => {
    const { client, queries } = maakClient()
    await runNewsIngest(client as never, null)

    const deletes = queries.filter((q) => q.table === 'news_articles' && q.stappen.some((s) => s.m === 'delete'))
    expect(deletes).toHaveLength(1)
    const lt = deletes[0].stappen.find((s) => s.m === 'lt')!
    expect(lt.args[0]).toBe('fetched_at')
    expect(dagenTerug(lt.args[1] as string)).toBe(ARTICLE_RETENTION_DAYS)
    expect(deletes[0].stappen.some((s) => s.m === 'in')).toBe(false)

    // Geen "alle id's ophalen om de staart te knippen" meer.
    const idSelects = queries.filter((q) => q.stappen.some((s) => s.m === 'select' && s.args[0] === 'id'))
    expect(idSelects).toHaveLength(0)
  })

  it('dedupet titels over een venster van 30 dagen in plaats van de N nieuwste', async () => {
    const { client, queries } = maakClient()
    await runNewsIngest(client as never, null)
    const titels = queries.find((q) => q.stappen.some((s) => s.m === 'select' && s.args[0] === 'title'))!
    const gte = titels.stappen.find((s) => s.m === 'gte')!
    expect(gte.args[0]).toBe('fetched_at')
    expect(dagenTerug(gte.args[1] as string)).toBe(TITLE_DEDUPE_WINDOW_DAYS)
  })
})

describe('runNewsIngest — de duidingsstap', () => {
  it('draait alleen met een batch-cap, ná de brongezondheid, en geeft de uitkomst door in de summary', async () => {
    const { client, queries } = maakClient()
    const duidingModel = { modelId: 'x' }
    let healthGeschrevenBijStart = 0
    vi.mocked(duidWachtendeArtikelen).mockImplementationOnce(async () => {
      healthGeschrevenBijStart = queries.filter((q) => q.table === 'app_settings' && q.stappen.some((s) => s.m === 'upsert')).length
      return DUIDING_UITKOMST
    })
    const { summary } = await runNewsIngest(client as never, null, { duidingModel, duidingMaxPerRun: 60, duidingTijdBudgetMs: 1234 })

    expect(duidWachtendeArtikelen).toHaveBeenCalledTimes(1)
    const [, model, opties] = vi.mocked(duidWachtendeArtikelen).mock.calls[0]
    expect(model).toBe(duidingModel)
    expect(opties.maxPerRun).toBe(60)
    expect(opties.tijdBudgetMs).toBe(1234)
    expect(opties.runTekstByPaginaUrl).toBeInstanceOf(Map)
    expect(opties.webPaginaUrls).toEqual([])
    // Statusregistratie eerst: een maxDuration-kill in de duiding laat de brongezondheid staan.
    expect(healthGeschrevenBijStart).toBe(1)
    expect(summary.duiding).toEqual(DUIDING_UITKOMST)
  })

  it('zonder batch-cap wordt de stap overgeslagen en is de summary leeg', async () => {
    const { client } = maakClient()
    const { summary } = await runNewsIngest(client as never, null)
    expect(duidWachtendeArtikelen).not.toHaveBeenCalled()
    expect(summary.duiding).toEqual({ geduid: 0, afgewezen: 0, mislukt: 0, overgeslagen: 0, wacht: 0 })
  })
})
