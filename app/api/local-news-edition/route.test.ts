import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor POST /api/local-news-edition — de persist-route van de ON-DEVICE
 * nieuwseditie.
 *
 * Deze route draagt een omgekeerde vertrouwensrelatie: op het cloudpad genereert
 * en bewaart de server in één beweging, hier is de BROWSER de auteur. Wat daar
 * impliciet klopte, moet hier bewezen worden. De suite legt vast dat:
 *
 *  - de toegangspoort staat (401 zonder sessie, 403 bij AI-kill-switch/tier);
 *  - een door de client meegestuurde `sourceUrl`/`sourceName` GENEGEERD wordt en
 *    de opgeslagen editie de waarden uit de database draagt — de kern van de
 *    herstructurering, hier end-to-end vastgelegd;
 *  - een bericht dat naar een onbekend artikel wijst niet wordt opgeslagen;
 *  - de editie hard op 0-8 wordt begrensd, ongeacht wat de client stuurt.
 *
 * Mocking-strategie gespiegeld op app/api/ai/actions/route.test.ts.
 */

const mockAuthGetUser = vi.fn()
const mockFrom = vi.fn()
const mockCheckTierGate = vi.fn()
const mockLoadArticlesByIds = vi.fn()
const mockSetCachedNews = vi.fn()
const mockArchive = vi.fn()
const mockMarkUsed = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockAuthGetUser },
    from: mockFrom,
  })),
}))

vi.mock('@/lib/require-tier', () => ({
  checkTierGate: (...args: unknown[]) => mockCheckTierGate(...args),
}))

vi.mock('@/lib/news-edition-store', () => ({
  loadNewsArticlesByIds: (...args: unknown[]) => mockLoadArticlesByIds(...args),
  setCachedNews: (...args: unknown[]) => mockSetCachedNews(...args),
  archiveCurrentEdition: (...args: unknown[]) => mockArchive(...args),
  markUsedArticles: (...args: unknown[]) => mockMarkUsed(...args),
  getCachedNews: vi.fn(async () => null),
  getNextEditionNr: vi.fn(async () => 4),
  currentJaargang: () => 1,
}))

const { POST } = await import('./route')

const USER = { id: 'user-1' }

/** `from('profiles').select().eq().single()` → de AI-kill-switch. */
function profilesChain(aiEnabled: boolean | null) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { ai_enabled: aiEnabled }, error: null }),
      })),
    })),
  }
}

function postRequest(body: unknown) {
  return { json: () => Promise.resolve(body) } as unknown as Request
}

function dbArticle(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Artikel ${id}`,
    summary: null,
    source_url: `https://echte-bron.example/${id}`,
    source_name: 'Rijksoverheid',
    category: 'fiscaal',
    published_at: '2026-03-07T08:00:00Z',
    potential_impact: null,
    is_used: false,
    ...overrides,
  }
}

function clientItem(articleId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `news-local-${articleId}`,
    headline: `Kop ${articleId}`,
    summary: `Samenvatting ${articleId}`,
    personalImpact: 'Iets relevants.',
    impactType: 'relevant',
    impactScore: 4,
    impactDirection: 'neutraal',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
  mockFrom.mockImplementation(() => profilesChain(true))
  mockCheckTierGate.mockResolvedValue(null)
  mockLoadArticlesByIds.mockResolvedValue([])
  mockSetCachedNews.mockResolvedValue(undefined)
  mockArchive.mockResolvedValue(undefined)
  mockMarkUsed.mockResolvedValue(undefined)
})

describe('POST /api/local-news-edition — toegangspoort', () => {
  it('401 zonder sessie', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(postRequest({ items: [] }))
    expect(res.status).toBe(401)
    expect(mockSetCachedNews).not.toHaveBeenCalled()
  })

  it('403 wanneer de AI-kill-switch uit staat', async () => {
    mockFrom.mockImplementation(() => profilesChain(false))
    const res = await POST(postRequest({ items: [] }))
    expect(res.status).toBe(403)
    expect(mockSetCachedNews).not.toHaveBeenCalled()
  })

  it('403 zonder ai-abonnement', async () => {
    mockCheckTierGate.mockResolvedValue({ error: 'Geen AI-abonnement' })
    const res = await POST(postRequest({ items: [] }))
    expect(res.status).toBe(403)
    expect(mockSetCachedNews).not.toHaveBeenCalled()
  })

  it('400 bij een onbruikbare body', async () => {
    const res = await POST(postRequest({ items: [{ id: 'x' }] }))
    expect(res.status).toBe(400)
    expect(mockSetCachedNews).not.toHaveBeenCalled()
  })
})

describe('POST /api/local-news-edition — de server is de autoriteit over de bronvelden', () => {
  it('NEGEERT een door de client meegestuurde sourceUrl en sourceName', async () => {
    mockLoadArticlesByIds.mockResolvedValue([
      dbArticle('a', { source_url: 'https://echt.example/a', source_name: 'Belastingdienst' }),
    ])

    const res = await POST(
      postRequest({
        items: [
          clientItem('a', {
            sourceUrl: 'https://kwaadaardig.example/phishing',
            sourceName: 'Nepbron',
            category: 'rente',
            date: '1999-01-01',
          }),
        ],
        complete: true,
        sourceCount: 12,
      }),
    )

    expect(res.status).toBe(200)
    const [, , persisted] = mockSetCachedNews.mock.calls[0]
    expect(persisted).toHaveLength(1)
    expect(persisted[0].sourceUrl).toBe('https://echt.example/a')
    expect(persisted[0].sourceName).toBe('Belastingdienst')
    expect(persisted[0].category).toBe('fiscaal')
    expect(persisted[0].date).toBe('2026-03-07')
    expect(JSON.stringify(persisted)).not.toContain('kwaadaardig')
    expect(JSON.stringify(persisted)).not.toContain('Nepbron')
  })

  it('bewaart geen bericht dat naar een onbekend artikel wijst', async () => {
    mockLoadArticlesByIds.mockResolvedValue([]) // artikel bestaat niet
    const res = await POST(postRequest({ items: [clientItem('spookartikel')] }))

    expect(res.status).toBe(200)
    const [, , persisted] = mockSetCachedNews.mock.calls[0]
    expect(persisted).toEqual([])
  })

  it('begrenst de editie hard op 8, ook bij 20 aangeleverde berichten', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `a${i}`)
    mockLoadArticlesByIds.mockResolvedValue(ids.map((id) => dbArticle(id)))
    const res = await POST(postRequest({ items: ids.map((id) => clientItem(id)) }))

    expect(res.status).toBe(200)
    const [, , persisted] = mockSetCachedNews.mock.calls[0]
    expect(persisted).toHaveLength(8)
  })

  it('klemt een buiten-bereik impactScore op 1-5', async () => {
    mockLoadArticlesByIds.mockResolvedValue([dbArticle('a')])
    await POST(postRequest({ items: [clientItem('a', { impactScore: 99 })] }))

    const [, , persisted] = mockSetCachedNews.mock.calls[0]
    expect(persisted[0].impactScore).toBe(5)
  })
})

describe('POST /api/local-news-edition — editie-levenscyclus', () => {
  it('archiveert de vorige editie alleen bij archivePrevious', async () => {
    mockLoadArticlesByIds.mockResolvedValue([dbArticle('a')])

    await POST(postRequest({ items: [clientItem('a')], archivePrevious: false }))
    expect(mockArchive).not.toHaveBeenCalled()

    await POST(postRequest({ items: [clientItem('a')], archivePrevious: true }))
    expect(mockArchive).toHaveBeenCalledTimes(1)
  })

  it('markeert bronartikelen pas bij complete', async () => {
    mockLoadArticlesByIds.mockResolvedValue([dbArticle('a')])

    await POST(postRequest({ items: [clientItem('a')], complete: false }))
    expect(mockMarkUsed).not.toHaveBeenCalled()

    await POST(postRequest({ items: [clientItem('a')], complete: true }))
    expect(mockMarkUsed).toHaveBeenCalledTimes(1)
  })

  it('bewaart een LEGE editie — dat is een geldige uitkomst', async () => {
    // Zonder dit zou de client bij "geen nieuws met impact" elke paginabezoek
    // opnieuw twee tot vier minuten gaan genereren.
    const res = await POST(postRequest({ items: [], complete: true, sourceCount: 12 }))

    expect(res.status).toBe(200)
    expect(mockSetCachedNews).toHaveBeenCalledTimes(1)
    const [, , persisted, meta] = mockSetCachedNews.mock.calls[0]
    expect(persisted).toEqual([])
    expect(meta.sourceCount).toBe(12)
  })

  it('bewaart het aantal GETOETSTE bronartikelen, niet het aantal gebruikte', async () => {
    mockLoadArticlesByIds.mockResolvedValue([dbArticle('a')])
    await POST(postRequest({ items: [clientItem('a')], sourceCount: 12 }))

    const [, , , meta] = mockSetCachedNews.mock.calls[0]
    expect(meta.sourceCount).toBe(12) // niet 1
  })
})
