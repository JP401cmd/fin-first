import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { NewsItem } from '@/lib/news-item'
import type { LocalNewsProgress } from '@/lib/ai/local/local-news-resolver'
import type { ExecutionModeState } from '@/lib/ai/local/use-execution-mode'

/**
 * De vier uitvoertoestanden van /nieuws (ADR 0043).
 *
 * WAAROM DEZE TEST BESTAAT. De privacybelofte van het lokale pad is niet zichtbaar
 * in de UI — je ziet niet dát er niets vertrekt. De enige manier om te bewaken dat
 * 'resolving' en 'blocked' écht fail-closed zijn, is de fetch-laag pinnen:
 *
 *  1. 'resolving' → geen /api/news én geen lokale generatie;
 *  2. 'blocked'   → de concrete reden staat er, opnieuw proberen roept refresh()
 *                   aan, en er gaat nog steeds NIETS naar /api/news;
 *  3. 'cloud'     → het bestaande pad blijft ongewijzigd (/api/news wordt geraakt);
 *  4. 'lokaal'    → bewaarde editie (`cached`) toont zonder te genereren; zonder
 *                   bewaarde editie draait de resolver, verschijnen berichten
 *                   onderweg, en dragen de POST's de juiste vlaggen.
 */

const mocks = vi.hoisted(() => ({
  useExecutionMode: vi.fn(),
  generateLocalNewsEdition: vi.fn(),
}))

vi.mock('@/lib/ai/local/use-execution-mode', () => ({
  useExecutionMode: mocks.useExecutionMode,
}))
vi.mock('@/lib/ai/local/local-news-resolver', () => ({
  generateLocalNewsEdition: mocks.generateLocalNewsEdition,
}))

// Kind-componenten die zelf netwerk/context nodig hebben — hier niet ter zake.
vi.mock('./news-components', () => ({
  HeroNewsArticle: ({ item }: { item: NewsItem }) => <article>{item.headline}</article>,
  NewsArticle: ({ item }: { item: NewsItem }) => <article>{item.headline}</article>,
  NewsSkeletonLoader: () => <div data-testid="skeleton" />,
}))
vi.mock('./archive-section', () => ({ ArchiveSection: () => <div /> }))
vi.mock('@/components/app/ai-privacy-indicator', () => ({
  AiPrivacyIndicator: () => <span />,
}))
vi.mock('@/components/editorial', () => ({ PageInfoButton: () => null }))

import { NieuwsOnlyClient } from './nieuws-only-client'

// ── Helpers ────────────────────────────────────────────────────────────────

const refreshSpy = vi.fn()

function executionState(partial: Partial<ExecutionModeState>): ExecutionModeState {
  return {
    status: 'resolving',
    message: null,
    intended: null,
    canUseCloud: false,
    canUseLocal: false,
    refresh: refreshSpy,
    ...partial,
  }
}

function newsItem(id: string, headline: string): NewsItem {
  return {
    id,
    headline,
    summary: 'Samenvatting',
    impactType: 'relevant',
    personalImpact: '',
    impactScore: 3,
    impactDirection: 'neutraal',
    category: 'macro',
    date: '2026-08-01',
    sourceUrl: 'https://example.test/a',
    sourceName: 'Bron',
  }
}

interface PostCall {
  archivePrevious: boolean
  complete: boolean
  sourceCount: number
  itemCount: number
}

let postCalls: PostCall[]
let fetchMock: ReturnType<typeof vi.fn>
/** Wat GET /api/local-news-edition teruggeeft — per test instelbaar. */
let storedEdition: { items: NewsItem[]; cached: boolean; sourceCount?: number }

function urls(): string[] {
  return fetchMock.mock.calls.map((c) => String(c[0]))
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  postCalls = []
  storedEdition = { items: [], cached: false }

  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const json = (body: unknown) =>
      ({ ok: true, status: 200, json: async () => body }) as unknown as Response

    if (url.startsWith('/api/news/read')) return json({ readIds: [] })
    if (url.startsWith('/api/news')) {
      return json({ items: [newsItem('cloud-1', 'Cloudbericht')], sourceCount: 40 })
    }
    if (url.startsWith('/api/local-news-edition')) {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as {
          items: unknown[]
          archivePrevious: boolean
          complete: boolean
          sourceCount: number
        }
        postCalls.push({
          archivePrevious: body.archivePrevious,
          complete: body.complete,
          sourceCount: body.sourceCount,
          itemCount: body.items.length,
        })
        // De server is de bron van waarheid: hij geeft de bewaarde editie terug.
        return json({ items: body.items, editionNr: 7, jaargang: 2 })
      }
      return json({ ...storedEdition, editionNr: 7, jaargang: 2 })
    }
    if (url.startsWith('/api/local-news-sources')) {
      return json({ sources: [{ id: 'a1' }, { id: 'a2' }], sourceCount: 12, editionNr: 7, jaargang: 2 })
    }
    if (url.startsWith('/api/local-chat-overview')) return json({})
    return json({})
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── 0. cache-scoping — de editie van account A mag nooit bij account B ─────

describe('NieuwsOnlyClient — browsercache is accountgebonden', () => {
  const cloud = () =>
    executionState({ status: 'cloud', intended: 'cloud', canUseCloud: true })

  function seedCache(key: string, headline: string) {
    localStorage.setItem(
      key,
      JSON.stringify({ items: [newsItem('a-1', headline)], fetchedAt: Date.now() }),
    )
  }

  it('leest de cache van een ander account niet en haalt een eigen editie op', async () => {
    // Given account A heeft op dit toestel een editie in de browsercache staan
    seedCache('trifinity_news_cache:user-a', 'Editie van account A')
    mocks.useExecutionMode.mockReturnValue(cloud())

    // When account B op hetzelfde toestel /nieuws opent
    render(<NieuwsOnlyClient userId="user-b" />)

    // Then ziet B zijn eigen editie, niet die van A
    expect(await screen.findByText('Cloudbericht')).toBeInTheDocument()
    expect(screen.queryByText('Editie van account A')).not.toBeInTheDocument()
    expect(urls()).toContain('/api/news')
  })

  it('negeert en verwijdert de oude accountloze cachesleutel', async () => {
    // Given een cache uit de tijd dat de sleutel niet op user_id was gescoped —
    // die kan van elk account op dit toestel zijn en is dus onbruikbaar.
    seedCache('trifinity_news_cache', 'Editie van onbekend account')
    mocks.useExecutionMode.mockReturnValue(cloud())

    render(<NieuwsOnlyClient userId="user-b" />)

    expect(await screen.findByText('Cloudbericht')).toBeInTheDocument()
    expect(screen.queryByText('Editie van onbekend account')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(localStorage.getItem('trifinity_news_cache')).toBeNull(),
    )
  })

  it('leest de eigen cache wél en slaat de fetch dan over', async () => {
    seedCache('trifinity_news_cache:user-b', 'Eigen bewaarde editie')
    mocks.useExecutionMode.mockReturnValue(cloud())

    render(<NieuwsOnlyClient userId="user-b" />)

    expect(await screen.findByText('Eigen bewaarde editie')).toBeInTheDocument()
    expect(urls()).not.toContain('/api/news')
  })
})

// ── 1. resolving — er mag NIETS vertrekken ─────────────────────────────────

describe('NieuwsOnlyClient — uitvoertoestanden', () => {
  it("'resolving' start geen cloud-fetch en geen lokale generatie", async () => {
    mocks.useExecutionMode.mockReturnValue(executionState({ status: 'resolving' }))

    render(<NieuwsOnlyClient userId="user-b" />)

    await waitFor(() => expect(screen.getByTestId('skeleton')).toBeInTheDocument())
    expect(urls().some((u) => u.startsWith('/api/news?') || u === '/api/news')).toBe(false)
    expect(mocks.generateLocalNewsEdition).not.toHaveBeenCalled()
  })

  // ── 2. blocked — reden tonen, nooit terugvallen op de cloud ──────────────

  it("'blocked' toont de reden, biedt refresh() en raakt /api/news niet aan", async () => {
    mocks.useExecutionMode.mockReturnValue(
      executionState({
        status: 'blocked',
        intended: 'lokaal',
        message: 'Het lokale model staat niet (meer) op dit toestel.',
      }),
    )

    render(<NieuwsOnlyClient userId="user-b" />)

    expect(
      await screen.findByText('Het lokale model staat niet (meer) op dit toestel.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Je editie kan nog niet op dit toestel worden samengesteld'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /opnieuw proberen/i }))
    expect(refreshSpy).toHaveBeenCalled()

    expect(urls().some((u) => u === '/api/news' || u.startsWith('/api/news?'))).toBe(false)
    expect(mocks.generateLocalNewsEdition).not.toHaveBeenCalled()
  })

  // ── 3. cloud — ongewijzigd gedrag ────────────────────────────────────────

  it("'cloud' haalt de editie op via /api/news", async () => {
    mocks.useExecutionMode.mockReturnValue(
      executionState({ status: 'cloud', intended: 'cloud', canUseCloud: true }),
    )

    render(<NieuwsOnlyClient userId="user-b" />)

    expect(await screen.findByText('Cloudbericht')).toBeInTheDocument()
    expect(urls()).toContain('/api/news')
    expect(mocks.generateLocalNewsEdition).not.toHaveBeenCalled()
  })

  // ── 4. lokaal — bewaarde editie ──────────────────────────────────────────

  it("'lokaal' toont een bewaarde editie zonder te genereren", async () => {
    mocks.useExecutionMode.mockReturnValue(
      executionState({ status: 'lokaal', intended: 'lokaal', canUseLocal: true }),
    )
    storedEdition = { items: [newsItem('news-local-a1', 'Bewaard bericht')], cached: true, sourceCount: 12 }

    render(<NieuwsOnlyClient userId="user-b" />)

    expect(await screen.findByText('Bewaard bericht')).toBeInTheDocument()
    expect(mocks.generateLocalNewsEdition).not.toHaveBeenCalled()
    expect(urls().some((u) => u === '/api/news')).toBe(false)
  })

  it("'lokaal' genereert niet opnieuw bij een bewaarde LEGE editie", async () => {
    // De valkuil: `items.length > 0` zou hier "niets bewaard" lezen en bij élk
    // bezoek een generatie van twee tot vier minuten starten.
    mocks.useExecutionMode.mockReturnValue(
      executionState({ status: 'lokaal', intended: 'lokaal', canUseLocal: true }),
    )
    storedEdition = { items: [], cached: true, sourceCount: 12 }

    render(<NieuwsOnlyClient userId="user-b" />)

    expect(await screen.findByText('Geen nieuws met impact op jouw situatie')).toBeInTheDocument()
    expect(mocks.generateLocalNewsEdition).not.toHaveBeenCalled()
  })

  // ── 5. lokaal — verse generatie ──────────────────────────────────────────

  it("'lokaal' zonder bewaarde editie genereert on-device, toont voortgang en berichten onderweg", async () => {
    mocks.useExecutionMode.mockReturnValue(
      executionState({ status: 'lokaal', intended: 'lokaal', canUseLocal: true }),
    )
    storedEdition = { items: [], cached: false }

    // Handmatig aanstuurbare resolver: we duwen eerst voortgang, dan één bericht.
    let emit: {
      progress: (p: LocalNewsProgress) => void
      item: (items: NewsItem[]) => Promise<void>
      finish: (items: NewsItem[]) => void
    }
    mocks.generateLocalNewsEdition.mockImplementation(
      (args: {
        onProgress?: (p: LocalNewsProgress) => void
        onItem?: (items: NewsItem[]) => Promise<void>
      }) =>
        new Promise<NewsItem[]>((resolve) => {
          emit = {
            progress: (p) => args.onProgress?.(p),
            item: async (items) => { await args.onItem?.(items) },
            finish: resolve,
          }
        }),
    )

    render(<NieuwsOnlyClient userId="user-b" />)

    await waitFor(() => expect(mocks.generateLocalNewsEdition).toHaveBeenCalled())

    // Concrete voortgang per fase — geen kale spinner.
    emit!.progress({ phase: 'scoren', done: 4, total: 12 })
    expect(await screen.findByText('Bronnen wegen — 4 van 12')).toBeInTheDocument()

    // Berichten verschijnen onderweg, niet pas aan het eind.
    const first = [newsItem('news-local-a1', 'Eerste bericht')]
    await emit!.item(first)
    expect(await screen.findByText('Eerste bericht')).toBeInTheDocument()

    emit!.progress({ phase: 'schrijven', done: 1, total: 2 })
    expect(await screen.findByText('Berichten schrijven — 1 van 2')).toBeInTheDocument()

    emit!.finish(first)

    // Eerste POST archiveert de vorige editie, de slot-POST sluit af — beide met
    // het aantal GETOETSTE bronartikelen uit /api/local-news-sources.
    await waitFor(() => expect(postCalls).toHaveLength(2))
    expect(postCalls[0]).toEqual({
      archivePrevious: true,
      complete: false,
      sourceCount: 12,
      itemCount: 1,
    })
    expect(postCalls[1]).toEqual({
      archivePrevious: false,
      complete: true,
      sourceCount: 12,
      itemCount: 1,
    })
    expect(urls().some((u) => u === '/api/news')).toBe(false)
  })

  it("'lokaal': de voortgangsbalk loopt niet terug bij de overgang scoren → schrijven", async () => {
    // De valkuil: `done/total` telt PER FASE. Rechtstreeks tonen laat de balk van
    // 100% naar ~20% terugvallen zodra het schrijven begint — dat leest als een
    // fout, precies tijdens de langste wachttijd van de app.
    mocks.useExecutionMode.mockReturnValue(
      executionState({ status: 'lokaal', intended: 'lokaal', canUseLocal: true }),
    )
    storedEdition = { items: [], cached: false }

    let emitProgress: (p: LocalNewsProgress) => void
    mocks.generateLocalNewsEdition.mockImplementation(
      (args: { onProgress?: (p: LocalNewsProgress) => void }) =>
        new Promise<NewsItem[]>(() => {
          emitProgress = (p) => args.onProgress?.(p)
        }),
    )

    render(<NieuwsOnlyClient userId="user-b" />)
    await waitFor(() => expect(mocks.generateLocalNewsEdition).toHaveBeenCalled())

    const bar = () => screen.getByRole('progressbar')
    const pct = () => Number(bar().getAttribute('aria-valuenow'))

    emitProgress!({ phase: 'scoren', done: 12, total: 12 })
    await waitFor(() => expect(pct()).toBeGreaterThan(0))
    const afterScoring = pct()

    emitProgress!({ phase: 'schrijven', done: 1, total: 5 })
    await waitFor(() => expect(screen.getByText('Berichten schrijven — 1 van 5')).toBeInTheDocument())
    expect(pct()).toBeGreaterThanOrEqual(afterScoring)
    expect(pct()).toBeLessThan(100)
  })

  it("'lokaal': een mislukte verversing laat de bewaarde berichten staan", async () => {
    mocks.useExecutionMode.mockReturnValue(
      executionState({ status: 'lokaal', intended: 'lokaal', canUseLocal: true }),
    )
    storedEdition = { items: [newsItem('news-local-a1', 'Bewaard bericht')], cached: true, sourceCount: 12 }
    mocks.generateLocalNewsEdition.mockRejectedValue(new Error('Het model reageerde niet.'))

    render(<NieuwsOnlyClient userId="user-b" />)
    expect(await screen.findByText('Bewaard bericht')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /ververs/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Het samenstellen op je toestel is gestopt.')
    expect(alert).toHaveTextContent('Het model reageerde niet.')
    // De editie die er stond blijft leesbaar — de fout neemt 'm niet weg.
    expect(screen.getByText('Bewaard bericht')).toBeInTheDocument()
  })

  it("'lokaal' bewaart ook een LEGE uitkomst met complete: true", async () => {
    mocks.useExecutionMode.mockReturnValue(
      executionState({ status: 'lokaal', intended: 'lokaal', canUseLocal: true }),
    )
    storedEdition = { items: [], cached: false }
    mocks.generateLocalNewsEdition.mockResolvedValue([])

    render(<NieuwsOnlyClient userId="user-b" />)

    await waitFor(() => expect(postCalls).toHaveLength(1))
    // Zonder deze POST blijft `cached` false en start het volgende bezoek
    // opnieuw een generatie van twee tot vier minuten.
    expect(postCalls[0]).toEqual({
      archivePrevious: true,
      complete: true,
      sourceCount: 12,
      itemCount: 0,
    })
    expect(await screen.findByText('Geen nieuws met impact op jouw situatie')).toBeInTheDocument()
  })
})
