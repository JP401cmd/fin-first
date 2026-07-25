import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor POST /api/ai/actions — de ADR 0044-upgrade (C2c) naar
 * `parseBody(actionCreateSchema, req)` + de platte error-envelope.
 *
 * Het zod-schema is bewust de UNIE van alle bestaande callers (zie de
 * commentaarblok in route.ts). Deze suite bewijst dat elke bestaande caller
 * EXACT zijn eigen payload-vorm nog steeds ongewijzigd door de nieuwe
 * validatie + insert-laag komt — géén 400 waar voorheen een 200 was:
 *
 *  - lib/aandachtspunten.ts            → metadata.{kind,domain,aandachtspunt_id}
 *  - chat-panel.tsx (cloud tool-call)  → source:'chat', geen metadata
 *  - chat-panel.tsx (lokaal-chat pad)  → source:'chat', metadata.origin:'local-chat'
 *  - whatif-chat.tsx                   → source:'chat', geen metadata, description:null
 *  - health-score-receipt.tsx          → source:'manual', description:undefined, geen priority_score
 *  - news-components.tsx               → source:'manual', metadata vrij + due_date
 *  - aandachtspunt-actie-button.tsx    → spreidt aandachtspunten-payload + source:'manual'
 *  - action-board.tsx (handmatig)      → geen source-veld (impliciet 'manual')
 *
 * Plus de randgevallen: 401 zonder sessie, 400 bij ontbrekende title, de
 * dedupe-op-aandachtspunt_id-kortsluiting, en 500 bij een insert-fout
 * (server-side gelogd, generieke tekst naar de client — nooit error.message).
 *
 * Mocking-strategie gespiegeld op app/api/budgets/[id]/route.test.ts.
 */

const mockAuthGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockAuthGetUser },
    from: mockFrom,
  })),
}))

import type { NextRequest } from 'next/server'
import { POST } from './route'

const USER = { id: 'user-1' }

function postRequest(body: unknown) {
  return { json: () => Promise.resolve(body) } as unknown as NextRequest
}

/**
 * `from('actions')` levert twee onafhankelijke chains:
 *  - select().eq().eq().eq().limit().maybeSingle()  → dedupe-check
 *  - insert(payload).select().single()               → de create
 */
function buildSupabase(opts: {
  existingAction?: unknown
  insertError?: unknown
  insertResult?: unknown
} = {}) {
  const { existingAction = null, insertError = null, insertResult } = opts
  const insertSpy = vi.fn()

  const from = vi.fn((table: string) => {
    if (table !== 'actions') throw new Error(`onverwachte tabel: ${table}`)
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: existingAction, error: null }),
              })),
            })),
          })),
        })),
      })),
      insert: vi.fn((payload: unknown) => {
        insertSpy(payload)
        return {
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: insertError ? null : (insertResult ?? { id: 'action-1', ...(payload as object) }),
              error: insertError,
            }),
          })),
        }
      }),
    }
  })

  return { from, insertSpy }
}

beforeEach(() => {
  mockAuthGetUser.mockReset().mockResolvedValue({ data: { user: USER } })
  mockFrom.mockReset()
})

describe('POST /api/ai/actions — auth + validatie', () => {
  it('401 zonder sessie, geen from-aanroep', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } })
    const { from } = buildSupabase()
    mockFrom.mockImplementation(from)

    const res = await POST(postRequest({ title: 'x', freedom_days_impact: 1 }))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Niet ingelogd', code: 'unauthorized' })
    expect(from).not.toHaveBeenCalled()
  })

  it('400 bij ontbrekende title (zod-validatie, client-veilige envelope)', async () => {
    const { from } = buildSupabase()
    mockFrom.mockImplementation(from)

    const res = await POST(postRequest({ freedom_days_impact: 1 }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('validation_error')
    expect(body.error).toMatch(/title/)
    expect(from).not.toHaveBeenCalled()
  })

  it('400 bij ongeldig JSON', async () => {
    const req = { json: () => Promise.reject(new SyntaxError('bad json')) } as unknown as NextRequest
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})

describe('POST /api/ai/actions — bestaande callers blijven werken', () => {
  it('lib/aandachtspunten.ts payload (metadata.kind/domain/aandachtspunt_id, geen source)', async () => {
    const { from, insertSpy } = buildSupabase()
    mockFrom.mockImplementation(from)

    const res = await POST(postRequest({
      title: 'Benut je jaarruimte',
      description: 'Bespaar ~€500 per jaar · 3 vrijheidsdagen.',
      freedom_days_impact: 3,
      metadata: { kind: 'aandachtspunt', domain: 'tax', aandachtspunt_id: 'tax:jaarruimte' },
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.action).toBeDefined()
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
      source: 'manual', // geen source meegegeven → default 'manual'
      title: 'Benut je jaarruimte',
      metadata: { kind: 'aandachtspunt', domain: 'tax', aandachtspunt_id: 'tax:jaarruimte' },
    }))
  })

  it('chat-panel.tsx cloud tool-call pad (source:chat, geen metadata, description:null)', async () => {
    const { from, insertSpy } = buildSupabase()
    mockFrom.mockImplementation(from)

    const res = await POST(postRequest({
      title: 'Zeg je Netflix-abonnement op',
      description: null,
      freedom_days_impact: 2,
      euro_impact_monthly: 12,
      priority_score: 4,
      source: 'chat',
    }))

    expect(res.status).toBe(200)
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
      source: 'chat',
      description: null,
      metadata: null,
    }))
  })

  it('chat-panel.tsx lokaal-chat pad (source:chat, metadata.origin:local-chat)', async () => {
    const { from, insertSpy } = buildSupabase()
    mockFrom.mockImplementation(from)

    const res = await POST(postRequest({
      title: 'Verhoog je maandelijkse inleg',
      description: 'Lokaal geparste actie',
      freedom_days_impact: 5,
      euro_impact_monthly: 50,
      priority_score: 3,
      source: 'chat',
      metadata: { origin: 'local-chat' },
    }))

    expect(res.status).toBe(200)
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
      source: 'chat',
      metadata: { origin: 'local-chat' },
    }))
  })

  it('whatif-chat.tsx (source:chat, geen metadata)', async () => {
    const { from, insertSpy } = buildSupabase()
    mockFrom.mockImplementation(from)

    const res = await POST(postRequest({
      title: 'Werk 1 dag minder',
      description: null,
      freedom_days_impact: 10,
      euro_impact_monthly: null,
      priority_score: 3,
      source: 'chat',
    }))

    expect(res.status).toBe(200)
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ source: 'chat', metadata: null }))
  })

  it('health-score-receipt.tsx (source:manual, description undefined, geen priority_score/euro_impact)', async () => {
    const { from, insertSpy } = buildSupabase()
    mockFrom.mockImplementation(from)

    const res = await POST(postRequest({
      title: 'Bouw buffer op',
      description: undefined,
      freedom_days_impact: 0,
      source: 'manual',
    }))

    expect(res.status).toBe(200)
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
      source: 'manual',
      description: null, // '' || null → null in de route
      priority_score: 3, // fallback
      euro_impact_monthly: null,
    }))
  })

  it('news-components.tsx (source:manual, metadata vrij record + due_date)', async () => {
    const { from, insertSpy } = buildSupabase()
    mockFrom.mockImplementation(from)

    const res = await POST(postRequest({
      title: 'Nieuwsitem-headline',
      description: 'Persoonlijke impact-tekst',
      freedom_days_impact: 0,
      due_date: '2026-08-01',
      priority_score: 4,
      source: 'manual',
      metadata: { aandachtspunt_id: 'news:123', news_category: 'belasting' },
    }))

    expect(res.status).toBe(200)
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
      due_date: '2026-08-01',
      metadata: { aandachtspunt_id: 'news:123', news_category: 'belasting' },
    }))
  })

  it('aandachtspunt-actie-button.tsx (payload-spread + source:manual)', async () => {
    const { from, insertSpy } = buildSupabase()
    mockFrom.mockImplementation(from)

    const res = await POST(postRequest({
      title: 'Tegenbewijsregeling Box 3',
      description: 'Bespaar ~€1.200 per jaar.',
      freedom_days_impact: 8,
      metadata: { kind: 'aandachtspunt', domain: 'tax', aandachtspunt_id: 'tax:tegenbewijs' },
      source: 'manual',
    }))

    expect(res.status).toBe(200)
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ source: 'manual' }))
  })

  it('action-board.tsx handmatig aangemaakt (geen source-veld → default manual)', async () => {
    const { from, insertSpy } = buildSupabase()
    mockFrom.mockImplementation(from)

    const res = await POST(postRequest({
      title: 'Eigen actie',
      description: 'Zelf toegevoegd',
      freedom_days_impact: 1,
      euro_impact_monthly: 20,
      due_date: '2026-09-01',
      priority_score: 2,
    }))

    expect(res.status).toBe(200)
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ source: 'manual' }))
  })
})

describe('POST /api/ai/actions — dedupe + foutafhandeling', () => {
  it('bestaande OPEN actie met dezelfde aandachtspunt_id → deduped:true, geen insert', async () => {
    const existing = { id: 'existing-1', title: 'Al aangemaakt' }
    const { from, insertSpy } = buildSupabase({ existingAction: existing })
    mockFrom.mockImplementation(from)

    const res = await POST(postRequest({
      title: 'Benut je jaarruimte',
      freedom_days_impact: 3,
      metadata: { kind: 'aandachtspunt', domain: 'tax', aandachtspunt_id: 'tax:jaarruimte' },
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ action: existing, deduped: true })
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('insert-fout → 500 met generieke tekst, geen error.message-lek', async () => {
    const { from } = buildSupabase({ insertError: { message: 'duplicate key value violates unique constraint xyz_internal' } })
    mockFrom.mockImplementation(from)

    const res = await POST(postRequest({ title: 'x', freedom_days_impact: 1 }))

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).not.toMatch(/constraint|xyz_internal/)
    expect(body.code).toBe('server_error')
  })
})
