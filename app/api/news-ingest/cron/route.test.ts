/**
 * De cron meldt WAT ER VERLOREN GING (25 sep 2026).
 *
 * Repro: op 24 sep ~18:00 liep het Anthropic-tegoed leeg. De run van 25 sep
 * 07:23 landde als `status: 'success'` met `error: null`, terwijl de duiding 0
 * van 2 rijen duidde en de bronklasse `web_lijst` van 33 naar 0 kandidaten
 * viel. De AI-stappen zijn bewust niet-fataal (zonder model draait de ingest
 * door) — dat blijft zo; wat ontbrak was de melding.
 *
 * Deze suite pint het gedrag van de ROUTE vast: welke status er in `job_runs`
 * landt en dat de reden meegaat in de summary. De afleiding zelf
 * (`bepaalIngestUitkomst`) heeft zijn eigen tests in lib/news-ingest.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IngestSummary, SourceHealth } from '@/lib/news-ingest'

const mockRecordJobRun = vi.fn()
const mockRunNewsIngest = vi.fn()

vi.mock('@/lib/job-runs', () => ({ recordJobRun: (...a: unknown[]) => mockRecordJobRun(...a) }))
vi.mock('@/lib/news-ingest', async (importOriginal) => {
  const echt = await importOriginal<typeof import('@/lib/news-ingest')>()
  return { ...echt, runNewsIngest: (...a: unknown[]) => mockRunNewsIngest(...a) }
})
vi.mock('@/lib/ai/config', () => ({ getModel: vi.fn(async () => ({ id: 'model' })) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => ({}) }) }))
const mockHartslag = vi.fn()
vi.mock('@/lib/krant/ochtend-hartslag', () => ({ leesOchtendHartslag: (...a: unknown[]) => mockHartslag(...a) }))

import { GET } from './route'
import { getModel } from '@/lib/ai/config'

const SUMMARY_BASIS: IngestSummary = {
  sourcesChecked: 3,
  rssArticlesFound: 15,
  webArticlesExtracted: 78,
  perSoort: { rss: 15, web_lijst: 33, web_pagina: 45 },
  duplicatesSkipped: 0,
  alBekend: 0,
  inserted: 3,
  skipped: 0,
  uitgesteld: 0,
  linksGeweigerd: 0,
  details: { gelezen: 0, terugval: 0, geenHtml: 0, uitgesteld: 0 },
  backfill: { gelezen: 0, terugval: 0, geenHtml: 0, herduid: 0, uitgesteld: 0, fout: 0 },
  duiding: { geduid: 3, afgewezen: 0, mislukt: 0, overgeslagen: 0, wacht: 0 },
}

function health(items: Record<'rss' | 'web_lijst' | 'web_pagina', number>, oorzaak = 'ok'): SourceHealth {
  return {
    checkedAt: '2026-09-25T05:23:44.879Z',
    sources: (['rss', 'web_lijst', 'web_pagina'] as const).map((soort) => ({
      label: soort,
      url: `https://voorbeeld.nl/${soort}`,
      soort,
      type: soort === 'rss' ? ('rss' as const) : ('web' as const),
      items: items[soort],
      nieuw: 0,
      oorzaak: (items[soort] > 0 ? 'ok' : oorzaak) as SourceHealth['sources'][number]['oorzaak'],
    })),
  }
}

function req() {
  return new Request('https://fin-first.vercel.app/api/news-ingest/cron')
}

function laatsteJobRun() {
  return mockRecordJobRun.mock.calls.at(-1)?.[1] as {
    status: string
    summary: IngestSummary & { verlies: string[] }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://voorbeeld.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
  delete process.env.CRON_SECRET
  mockHartslag.mockResolvedValue({ laatste: null, vers: false })
})

describe('news-ingest cron — status volgt de uitkomst', () => {
  it('een volledige run blijft "success" zonder verlies-regels', async () => {
    mockRunNewsIngest.mockResolvedValue({
      summary: SUMMARY_BASIS,
      health: health({ rss: 15, web_lijst: 33, web_pagina: 45 }),
    })

    const res = await GET(req())
    expect(res.status).toBe(200)

    const run = laatsteJobRun()
    expect(run.status).toBe('success')
    expect(run.summary.verlies).toEqual([])
  })

  it('REPRO 25 sep: duiding 0 van 2 én web_lijst weggevallen → "partial" met reden', async () => {
    mockRunNewsIngest.mockResolvedValue({
      summary: {
        ...SUMMARY_BASIS,
        perSoort: { rss: 15, web_lijst: 0, web_pagina: 45 },
        duiding: { geduid: 0, afgewezen: 0, mislukt: 2, overgeslagen: 0, wacht: 2 },
      },
      health: health({ rss: 15, web_lijst: 0, web_pagina: 45 }, 'model_fout'),
    })

    const res = await GET(req())
    expect(res.status).toBe(200)

    const run = laatsteJobRun()
    expect(run.status).toBe('partial')
    expect(run.summary.verlies).toEqual([
      'duiding: 0 van 2 geduid (afgewezen 0, mislukt 2)',
      'bronsoort web_lijst: 0 kandidaten uit 1 bevraagde bron(nen) (model_fout)',
    ])
    // De reden staat óók in het antwoord van de route, niet alleen in job_runs.
    const body = (await res.json()) as { status: string; summary: { verlies: string[] } }
    expect(body.status).toBe('partial')
    expect(body.summary.verlies).toHaveLength(2)
  })

  it('een harde fout blijft "error" — partial verdringt het alarm niet', async () => {
    mockRunNewsIngest.mockRejectedValue(new Error('bronlijst onleesbaar'))

    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(mockRecordJobRun.mock.calls.at(-1)?.[1]).toMatchObject({ status: 'error' })
  })
})

describe('news-ingest cron — token-logging als systeemcall', () => {
  it('vraagt beide modellen aan met expliciet userId: null (geen getUser achteraf)', async () => {
    mockRunNewsIngest.mockResolvedValue({
      summary: SUMMARY_BASIS,
      health: health({ rss: 15, web_lijst: 33, web_pagina: 45 }),
    })

    await GET(req())

    const calls = vi.mocked(getModel).mock.calls
    expect(calls.map((c) => c[1])).toEqual(['nieuws_ingest', 'nieuws_duiding'])
    for (const c of calls) expect(c[2]).toEqual({ userId: null })
  })
})

describe('news-ingest cron — ochtendhartslag (ADR 0171-aanvulling 29 sep)', () => {
  const opties = () => mockRunNewsIngest.mock.calls.at(-1)?.[2] as { duidingModel?: unknown; duidingVersieBumpZonderModel?: boolean }

  beforeEach(() => {
    mockRunNewsIngest.mockResolvedValue({
      summary: { ...SUMMARY_BASIS, duiding: { geduid: 0, afgewezen: 0, mislukt: 0, overgeslagen: 0, wacht: 7 } },
      health: health({ rss: 15, web_lijst: 33, web_pagina: 45 }),
    })
  })

  it('verse hartslag: geen duidingsmodel maar wél de versie-bump; linkkeuze en categorisatie houden het model; blijft success', async () => {
    mockHartslag.mockResolvedValue({ laatste: '2026-09-28T08:00:00.000Z', vers: true })
    await GET(req())
    expect(vi.mocked(getModel).mock.calls.map((c) => c[1])).toEqual(['nieuws_ingest'])
    expect(mockRunNewsIngest.mock.calls.at(-1)?.[1]).toEqual({ id: 'model' })
    expect(opties().duidingModel).toBeNull()
    expect(opties().duidingVersieBumpZonderModel).toBe(true)
    const run = laatsteJobRun() as unknown as { status: string; summary: { ochtend: unknown } }
    expect(run.status).toBe('success')
    expect(run.summary.ochtend).toEqual({ hartslag: '2026-09-28T08:00:00.000Z', uitbesteed: true })
  })

  it('verlopen of ontbrekende hartslag = vangnet: de cron doet alles zelf', async () => {
    mockHartslag.mockResolvedValue({ laatste: '2026-09-25T08:00:00.000Z', vers: false })
    await GET(req())
    expect(vi.mocked(getModel).mock.calls.map((c) => c[1])).toEqual(['nieuws_ingest', 'nieuws_duiding'])
    expect(opties().duidingModel).toEqual({ id: 'model' })
    expect(opties().duidingVersieBumpZonderModel).toBe(false)
    const run = laatsteJobRun() as unknown as { summary: { ochtend: unknown } }
    expect(run.summary.ochtend).toEqual({ hartslag: '2026-09-25T08:00:00.000Z', uitbesteed: false })
  })
})
