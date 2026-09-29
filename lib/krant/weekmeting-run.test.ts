import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * De runner van de weekmeting (B41): welke tabellen hij leest, met welke
 * kolommen en grenzen, en dat hij nooit werpt en de run als `partial` schrijft
 * bij een waarschuwing of een leesfout.
 */

const mockRecordJobRun = vi.fn()
vi.mock('@/lib/job-runs', () => ({ recordJobRun: (...a: unknown[]) => mockRecordJobRun(...a) }))

import { legWeekmetingVast, meetWeek } from './weekmeting-run'
import { backfillUrlFilter } from '@/lib/news-ingest'

interface Lezing {
  tabel: string
  select: string
  opts?: { count?: string; head?: boolean }
  filters: Array<[string, ...unknown[]]>
  range?: [number, number]
}

let lezingen: Lezing[] = []
let data: Record<string, unknown[]> = {}
let foutOp: string | null = null
let counts: Record<string, number> = {}
/** Een exacte telling die afwijkt van het aantal rijen (bv. groter dan het plafond). */
let telOverride: Record<string, number> = {}

function nepService(): SupabaseClient {
  return {
    from(tabel: string) {
      const l: Lezing = { tabel, select: '', filters: [] }
      lezingen.push(l)
      const antwoord = () => {
        if (foutOp === tabel) return { data: null, error: { message: 'kapot' }, count: null }
        const rijen = data[tabel] ?? []
        if (l.opts?.head) {
          const soort = l.filters.find((f) => f[0] === 'eq' && f[1] === 'bron_soort')?.[2] as string | undefined
          const sleutel = `${tabel}:${l.filters.some((f) => f[0] === 'not') ? 'samenvatting' : l.filters.some((f) => f[0] === 'is') ? 'backfill' : 'geduid'}${soort ? `:${soort}` : ''}`
          return { data: null, error: null, count: counts[sleutel] ?? 0 }
        }
        const deel = l.range ? rijen.slice(l.range[0], l.range[1] + 1) : rijen
        return { data: deel, error: null, count: l.opts?.count ? (telOverride[tabel] ?? rijen.length) : null }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select(k: string, opts?: Lezing['opts']) {
          l.select = k
          l.opts = opts
          return b
        },
        then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
          return Promise.resolve(antwoord()).then(res, rej)
        },
        range(van: number, tot: number) {
          l.range = [van, tot]
          return Promise.resolve(antwoord())
        },
      }
      for (const m of ['eq', 'gte', 'lt', 'in', 'is', 'not', 'neq', 'or', 'order']) {
        b[m] = (...args: unknown[]) => {
          l.filters.push([m, ...args])
          return b
        }
      }
      return b
    },
  } as unknown as SupabaseClient
}

// Maandag 5 okt 2026 06:04 UTC: editieweek W41, gemeten week W40.
const NU = new Date('2026-10-05T06:04:00Z')

beforeEach(() => {
  mockRecordJobRun.mockReset()
  lezingen = []
  foutOp = null
  telOverride = {}
  counts = {
    'news_articles:samenvatting:rss': 2,
    'news_articles:samenvatting:web_lijst': 1,
    'news_articles:samenvatting': 2,
    'news_articles:geduid': 4,
    'news_articles:backfill': 7,
  }
  data = {
    news_articles: [
      {
        id: 'a1', title: 'T', category: null, fetched_at: '2026-09-29T05:00:00Z', duiding_status: 'geduid', duiding_fout: null,
        teruggetrokken_reden: null, mechanisme: 'box3-parameter', grondslag: 'fragment', poort_status: 'groen', poort_reden: null,
        kop_bron: 'bron', modeltekst: 'false', eerste_thema: 'box3', bron_soort: 'rss', bron_detail: 'gelezen',
      },
      {
        id: 'a2', title: 'T2', category: null, fetched_at: '2026-09-30T05:00:00Z', duiding_status: 'geduid', duiding_fout: null,
        teruggetrokken_reden: null, mechanisme: null, grondslag: 'kop', poort_status: 'groen', poort_reden: null,
        kop_bron: 'bron', modeltekst: 'false', eerste_thema: null, bron_soort: 'web_lijst', bron_detail: null,
      },
    ],
    krant_edities: [{ user_id: 'demo-1', profiel_type: 'p1', leeg: true }],
    profiles: [{ id: 'demo-1' }],
    ai_token_usage: [{ feature: 'news-duiding', input_tokens: 10, output_tokens: 2 }],
  }
})

describe('meetWeek — leest de afgesloten week, smal en begrensd', () => {
  it('meet W40 met de Amsterdamse weekgrenzen; edities van W41', async () => {
    const r = await meetWeek(nepService(), NU)
    expect(r.week).toBe('2026-W40')
    expect(r.editieWeek).toBe('2026-W41')
    const artikelLezing = lezingen.find((l) => l.tabel === 'news_articles' && !l.opts?.head)!
    expect(artikelLezing.filters).toContainEqual(['gte', 'fetched_at', '2026-09-27T22:00:00.000Z'])
    expect(artikelLezing.filters).toContainEqual(['lt', 'fetched_at', '2026-10-04T22:00:00.000Z'])
    const editieLezing = lezingen.find((l) => l.tabel === 'krant_edities')!
    expect(editieLezing.select).toBe('user_id, profiel_type, leeg')
    expect(editieLezing.filters).toContainEqual(['eq', 'week_key', '2026-W41'])
    expect(editieLezing.filters).toContainEqual(['is', 'vervangen_door', null])
  })

  it('leest nooit user_id uit ai_token_usage en geen tekstkolom uit news_articles', async () => {
    await meetWeek(nepService(), NU)
    const tokens = lezingen.find((l) => l.tabel === 'ai_token_usage')!
    expect(tokens.select).toBe('feature, input_tokens, output_tokens')
    for (const l of lezingen.filter((x) => x.tabel === 'news_articles')) {
      expect(l.select).not.toMatch(/samenvatting|raw_content|bron_fragment|duiding\b(?!->)/)
    }
  })

  it('de count-queries dragen exact de filters van de ingest en de samenvatting', async () => {
    await meetWeek(nepService(), NU)
    const heads = lezingen.filter((l) => l.tabel === 'news_articles' && l.opts?.head)
    const samenvatting = heads.filter((l) => l.filters.some((f) => f[0] === 'not'))
    expect(samenvatting.length).toBe(5) // 3 bronsoorten + totaal + vorige week
    for (const l of samenvatting) {
      expect(l.filters).toContainEqual(['not', 'duiding->>samenvatting', 'is', null])
      expect(l.filters).toContainEqual(['in', 'duiding_status', ['geduid', 'teruggetrokken']])
    }
    const backfill = heads.find((l) => l.filters.some((f) => f[0] === 'or'))!
    expect(backfill.filters).toContainEqual(['is', 'bron_detail', null])
    expect(backfill.filters).toContainEqual(['in', 'bron_soort', ['rss', 'web_lijst']])
    expect(backfill.filters).toContainEqual(['neq', 'duiding_status', 'teruggetrokken'])
    expect(backfill.filters).toContainEqual(['or', backfillUrlFilter()])
  })

  it('pagineert: count alleen op pagina 0, vervolgt tot de telling, en is eerlijk afgekapt op het plafond', async () => {
    data.ai_token_usage = Array.from({ length: 2500 }, () => ({ feature: 'f', input_tokens: 1, output_tokens: 0 }))
    const r = await meetWeek(nepService(), NU)
    const pagina = lezingen.filter((l) => l.tabel === 'ai_token_usage')
    expect(pagina.map((l) => l.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
    expect(pagina.map((l) => !!l.opts?.count)).toEqual([true, false, false])
    expect(r.tokens.totaal.aanroepen).toBe(2500)
    expect(r.afgekapt).toBe(false)

    // Een telling boven het plafond (20 pagina's): afgekapt + waarschuwing.
    lezingen = []
    data.ai_token_usage = Array.from({ length: 20_000 }, () => ({ feature: 'f', input_tokens: 1, output_tokens: 0 }))
    telOverride.ai_token_usage = 25_000
    const r2 = await meetWeek(nepService(), NU)
    expect(lezingen.filter((l) => l.tabel === 'ai_token_usage')).toHaveLength(20)
    expect(r2.afgekapt).toBe(true)
    expect(r2.waarschuwingen.map((w) => w.code)).toContain('afgekapt')
  })

  it('telt het resultaat: dekking, samenvatting, backfill, testaccounts, tokens', async () => {
    const r = await meetWeek(nepService(), NU)
    expect(r.artikelen.geduid).toBe(2)
    // De teller van het aandeel is de count zonder bronsoortfilter.
    expect(r.artikelen.metSamenvatting).toBe(2)
    expect(r.perBronsoort.rss.metSamenvatting).toBe(2)
    expect(r.perBronsoort.web_lijst.metSamenvatting).toBe(1)
    expect(r.perBronsoort.rss).toMatchObject({ artikelen: 1, rekenend: 1, metThema: 1 })
    expect(r.artikelpaginas.backfillResterend).toBe(7)
    expect(r.verversingen.testaccounts).toEqual({ p1: { edities: 1, leeg: 1 } })
    expect(r.tokens.totaal).toEqual({ aanroepen: 1, input: 10, output: 2 })
    expect(r.vorigeWeek).toEqual({ week: '2026-W39', aandeelSamenvatting: 0.5 })
    expect(r.leesfouten).toEqual([])
  })

  it('een mislukte lezing wordt een leesfout, geen uitzondering', async () => {
    foutOp = 'ai_token_usage'
    const r = await meetWeek(nepService(), NU)
    expect(r.leesfouten).toContain('ai_token_usage')
    expect(r.waarschuwingen.map((w) => w.code)).toContain('lees:ai_token_usage')
  })

  it('een mislukte demo-lezing: niemand is testaccount (fail-closed richting privacy)', async () => {
    foutOp = 'profiles'
    const r = await meetWeek(nepService(), NU)
    expect(r.verversingen.testaccounts).toEqual({})
    expect(r.leesfouten).toContain('profiles')
  })
})

describe('legWeekmetingVast — schrijft één job_run', () => {
  it('schone week → success zonder error', async () => {
    counts['news_articles:samenvatting'] = 1
    counts['news_articles:geduid'] = 4
    const r = await legWeekmetingVast(nepService(), NU)
    expect(r).not.toBeNull()
    expect(mockRecordJobRun).toHaveBeenCalledTimes(1)
    const call = mockRecordJobRun.mock.calls[0][1]
    expect(call.job).toBe('krant-weekmeting')
    expect(call.status).toBe('success')
    expect(call.error).toBeNull()
    expect(call.summary.week).toBe('2026-W40')
  })

  it('waarschuwing → partial met de codes als error', async () => {
    foutOp = 'krant_edities'
    await legWeekmetingVast(nepService(), NU)
    const call = mockRecordJobRun.mock.calls[0][1]
    expect(call.status).toBe('partial')
    expect(call.error).toContain('lees:krant_edities')
  })

  it('werpt nooit: een kapotte client is een codefout → error (meldt), null, zonder de fouttekst', async () => {
    const kapot = { from: () => { throw new Error('boem') } } as unknown as SupabaseClient
    await expect(legWeekmetingVast(kapot, NU)).resolves.toBeNull()
    const call = mockRecordJobRun.mock.calls[0][1]
    expect(call.status).toBe('error')
    expect(call.error).not.toContain('boem')
  })

  it('een onvolledige editierun komt als waarschuwing in het record', async () => {
    counts['news_articles:samenvatting'] = 1
    await legWeekmetingVast(nepService(), NU, { editieOnvolledig: true })
    const call = mockRecordJobRun.mock.calls[0][1]
    expect(call.status).toBe('partial')
    expect(call.error).toContain('editierun-onvolledig')
  })
})
