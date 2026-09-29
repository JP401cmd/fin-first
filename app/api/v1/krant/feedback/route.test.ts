import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NEP_JWT } from '@/lib/supabase/bearer.fixture'
import { maakNepClient } from '@/lib/krant/nep-client.fixture'
import { feedbackResponseSchema } from '@/lib/krant/contract'

/**
 * POST /api/v1/krant/feedback (Krant 3A, ADR 0187), met de echte vereisBearer:
 *   - 401 zonder Bearer, 403 zonder module of met Origin;
 *   - 400 bij een ongeldige of niet-strikte body (ook een meegestuurde user_id);
 *   - 200: idempotente upsert in news_feedback met user_id uit het token
 *     (getUser), respons volgens het contract;
 *   - DB-fout → generieke 500.
 */

const mockCreateClient = vi.fn()
vi.mock('@supabase/supabase-js', async (importActual) => ({
  ...(await importActual<typeof import('@supabase/supabase-js')>()),
  createClient: (...a: unknown[]) => mockCreateClient(...a),
}))

import { POST } from './route'

const mockGetClaims = vi.fn()
const mockGetUser = vi.fn()
let nep: ReturnType<typeof maakNepClient>

function maakNep(opties?: Parameters<typeof maakNepClient>[1]) {
  nep = maakNepClient(
    {
      profiles: [
        { id: 'user-a', active_modules: ['nieuws'] },
        { id: 'user-c', active_modules: ['budgetteren'] },
      ],
      news_feedback: [],
    },
    opties,
  )
}

const bearer = { authorization: `Bearer ${NEP_JWT}` }
const post = (body: unknown, headers: Record<string, string> = bearer) =>
  new Request('https://x.test/api/v1/krant/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

function alsGebruiker(id: string) {
  mockGetUser.mockResolvedValue({ data: { user: { id, role: 'authenticated', is_anonymous: false } }, error: null })
}

beforeEach(() => {
  vi.clearAllMocks()
  maakNep()
  mockCreateClient.mockImplementation(() => ({ ...nep.client, auth: { getClaims: mockGetClaims, getUser: mockGetUser } }))
  alsGebruiker('user-a')
})

const GELDIG = { articleId: 'art-1', verdict: 'less', category: 'wonen', headline: 'Huur stijgt' }

describe('toegang', () => {
  it('401 zonder Bearer', async () => {
    expect((await POST(post(GELDIG, {}))).status).toBe(401)
  })

  it('403 zonder module nieuws', async () => {
    alsGebruiker('user-c')
    expect((await POST(post(GELDIG))).status).toBe(403)
    expect(nep.queriesOp('news_feedback')).toHaveLength(0)
  })

  it('403 met Origin', async () => {
    expect((await POST(post(GELDIG, { ...bearer, origin: 'https://evil.test' }))).status).toBe(403)
  })
})

describe('validatie', () => {
  it.each([
    ['verdict ontbreekt', { articleId: 'art-1' }],
    ['verdict onbekend', { articleId: 'art-1', verdict: 'meh' }],
    ['articleId leeg', { articleId: '', verdict: 'less' }],
    ['user_id meegestuurd', { ...GELDIG, user_id: 'user-b' }],
    ['onbekende sleutel', { ...GELDIG, extra: true }],
  ])('%s → 400 zonder schrijfactie', async (_naam, body) => {
    const res = await POST(post(body))
    expect(res.status).toBe(400)
    expect(nep.queriesOp('news_feedback')).toHaveLength(0)
  })
})

describe('schrijven', () => {
  it('upsert met user_id uit het token, idempotent, respons volgens contract', async () => {
    const res = await POST(post(GELDIG))
    expect(res.status).toBe(200)
    feedbackResponseSchema.parse(await res.json())

    const stap = nep.queriesOp('news_feedback')[0].stappen.find((s) => s.m === 'upsert')!
    expect(stap.args).toEqual([
      { user_id: 'user-a', article_id: 'art-1', headline: 'Huur stijgt', category: 'wonen', verdict: 'less' },
      { onConflict: 'user_id,article_id,verdict', ignoreDuplicates: true },
    ])
    expect(mockGetUser).toHaveBeenCalledWith(NEP_JWT)
    expect(mockGetClaims).not.toHaveBeenCalled()
  })

  it('zonder headline/category schrijft null', async () => {
    await POST(post({ articleId: 'art-2', verdict: 'more' }))
    const rij = nep.rijen('news_feedback')[0]
    expect(rij).toMatchObject({ user_id: 'user-a', article_id: 'art-2', headline: null, category: null, verdict: 'more' })
  })

  it('een DB-fout → generieke 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    maakNep({ fouten: { 'news_feedback:upsert': 'duplicate key value violates' } })
    const res = await POST(post(GELDIG))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('duplicate')
    spy.mockRestore()
  })
})
