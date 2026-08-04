import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LocalChatOverview } from './local-chat-context'
import type { LocalNewsSource } from './local-news-source'

// ── Mock van de on-device runtime ────────────────────────────────────────────
// De echte runtime laadt een 2 GB WebGPU-model; hier scripten we de uitvoer per
// call zodat de orkestratie zelf getest wordt.
const generate = vi.fn<(messages: unknown, maxTokens: number) => Promise<string>>()
const disposeSession = vi.fn(async () => {})

vi.mock('./litert-runtime', () => ({
  loadModelSession: async () => ({ generate }),
  disposeSession: () => disposeSession(),
}))

const { generateLocalNewsEdition } = await import('./local-news-resolver')

const OVERVIEW: LocalChatOverview = {
  hasData: true,
  nettoVermogen: 85000,
  vrijheidstijd: '2 jaar en 9 maanden',
  fireDoel: 600000,
  vrijheidsPct: 14,
  maandinkomen: 3400,
  maanduitgaven: 2550,
  spaarquotePct: 25,
  dagtarief: 85,
  swrPct: 3.4,
  noodbuffer: { bedrag: 7500, maanden: 2.9 },
  jaarruimte: { onbenut: 22155, besparing: 12409, vrijheidsdagen: 108 },
  kansen: [],
  openstaandeActies: [],
  budgetten: null,
  uitgavenpatronen: [],
  terugkerend: null,
}

function source(id: string): LocalNewsSource {
  return {
    id,
    title: `Artikel ${id}`,
    summary: 'De rente gaat naar 3,25 procent.',
    sourceUrl: `https://echte-bron.example/${id}`,
    sourceName: 'ECB',
    category: 'rente',
    date: '2026-03-07',
    potentialImpact: null,
  }
}

const JA = 'RELEVANT: ja · TYPE: direct · SCORE: 5 · RICHTING: negatief'
const NEE = 'RELEVANT: nee · TYPE: relevant · SCORE: 1 · RICHTING: neutraal'
const PROZA = [
  'KOP: Rente stijgt',
  'SAMENVATTING: De ECB verhoogt de rente.',
  'IMPACT: Met jouw maanduitgaven van €2.550 merk je dit.',
].join('\n')

beforeEach(() => {
  generate.mockReset()
  disposeSession.mockClear()
})

describe('generateLocalNewsEdition — twee passes', () => {
  it('scoort elk artikel apart en schrijft alleen voor de overlevers', async () => {
    const sources = [source('a'), source('b'), source('c')]
    // Pass A: a=ja, b=nee, c=ja → daarna twee pass-B-calls.
    generate
      .mockResolvedValueOnce(JA)
      .mockResolvedValueOnce(NEE)
      .mockResolvedValueOnce(JA)
      .mockResolvedValue(PROZA)

    const items = await generateLocalNewsEdition({ sources, overview: OVERVIEW })

    // 3 scoring-calls + 2 schrijf-calls = 5 losse calls (map-reduce, niet één grote).
    expect(generate).toHaveBeenCalledTimes(5)
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.sourceUrl)).toEqual([
      'https://echte-bron.example/a',
      'https://echte-bron.example/c',
    ])
  })

  it('meldt voortgang per fase zodat de UI geen blokkerende spinner hoeft', async () => {
    generate.mockResolvedValueOnce(JA).mockResolvedValue(PROZA)
    const progress: string[] = []

    await generateLocalNewsEdition({
      sources: [source('a')],
      overview: OVERVIEW,
      onProgress: (p) => progress.push(`${p.phase} ${p.done}/${p.total}`),
    })

    expect(progress).toContain('scoren 0/1')
    expect(progress).toContain('scoren 1/1')
    expect(progress).toContain('schrijven 1/1')
  })

  it('bewaart per bericht — een halve editie mag niet verdampen', async () => {
    const sources = [source('a'), source('b')]
    generate.mockResolvedValueOnce(JA).mockResolvedValueOnce(JA).mockResolvedValue(PROZA)

    const persisted: number[] = []
    await generateLocalNewsEdition({
      sources,
      overview: OVERVIEW,
      onItem: (items) => {
        persisted.push(items.length)
      },
    })

    // Na bericht 1 en na bericht 2 — niet één keer aan het eind.
    expect(persisted).toEqual([1, 2])
  })

  it('laat de generatie doorlopen als het bewaren faalt', async () => {
    generate.mockResolvedValueOnce(JA).mockResolvedValue(PROZA)
    const items = await generateLocalNewsEdition({
      sources: [source('a')],
      overview: OVERVIEW,
      onItem: async () => {
        throw new Error('netwerk weg')
      },
    })
    expect(items).toHaveLength(1)
  })
})

describe('generateLocalNewsEdition — schade blijft lokaal (fail-closed)', () => {
  it('slaat één artikel over bij een blijvende fout, in plaats van de editie te laten sneuvelen', async () => {
    const sources = [source('a'), source('b')]
    // Artikel a faalt twee keer (call + retry na sessieherstel); b slaagt.
    generate
      .mockRejectedValueOnce(new Error('device lost'))
      .mockRejectedValueOnce(new Error('device lost'))
      .mockResolvedValueOnce(JA)
      .mockResolvedValue(PROZA)

    const items = await generateLocalNewsEdition({ sources, overview: OVERVIEW })

    expect(disposeSession).toHaveBeenCalled()
    expect(items).toHaveLength(1)
    expect(items[0].sourceUrl).toBe('https://echte-bron.example/b')
  })

  it('herstelt de sessie en probeert één keer opnieuw', async () => {
    generate
      .mockRejectedValueOnce(new Error('device lost'))
      .mockResolvedValueOnce(JA)
      .mockResolvedValue(PROZA)

    const items = await generateLocalNewsEdition({ sources: [source('a')], overview: OVERVIEW })
    expect(disposeSession).toHaveBeenCalledTimes(1)
    expect(items).toHaveLength(1)
  })

  it('levert een lege editie op wanneer ALLES faalt — nooit een cloud-terugval', async () => {
    generate.mockRejectedValue(new Error('kapot'))
    const items = await generateLocalNewsEdition({ sources: [source('a')], overview: OVERVIEW })
    expect(items).toEqual([])
  })

  it('behandelt onparseerbare scoring als "niet relevant"', async () => {
    // Geen oordeel is geen goedkeuring.
    generate.mockResolvedValue('Ik weet het niet zo goed.')
    const items = await generateLocalNewsEdition({ sources: [source('a')], overview: OVERVIEW })
    expect(items).toEqual([])
  })

  it('stopt op een afgebroken signaal', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      generateLocalNewsEdition({
        sources: [source('a')],
        overview: OVERVIEW,
        signal: controller.signal,
      }),
    ).rejects.toThrow(/afgebroken/i)
    expect(generate).not.toHaveBeenCalled()
  })
})

// ── Structurele waarborg ─────────────────────────────────────────────────────
describe('het lokale nieuwspad kent geen cloud-pad', () => {
  const FILES = [
    'local-news-resolver.ts',
    'local-news-prompt.ts',
    'local-news-select.ts',
    'local-news-guard.ts',
    'local-news-parse.ts',
    'local-news-source.ts',
    'local-news-reconcile.ts',
  ]

  it.each(FILES)('%s importeert geen getModel en roept /api/news niet aan', (file) => {
    const src = readFileSync(join(__dirname, file), 'utf8')
    // Een stille terugval naar de cloud is de fout die deze hele architectuur
    // moet voorkomen; die mag dus nergens in dit pad te vinden zijn.
    expect(src).not.toMatch(/from '@\/lib\/ai\/config'/)
    expect(src).not.toMatch(/getModel\(/)
    expect(src).not.toMatch(/fetch\(\s*['"`]\/api\/news/)
  })
})
