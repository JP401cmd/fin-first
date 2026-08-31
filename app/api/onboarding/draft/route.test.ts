import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * /api/onboarding/draft — het lopende onboarding-concept (kaart UR2-01).
 *
 * Wat hier bewaakt wordt:
 *  1. alle drie de werkwoorden zijn auth-gated (401 zonder sessie);
 *  2. lezen én schrijven raken UITSLUITEND de eigen profielrij — de
 *    `.eq('id', user.id)`-scoping is de reden dat dit veilig op `profiles` mag
 *    staan, en een concept van een ander mag nooit bereikbaar zijn;
 *  3. de PUT weigert een concept met een onbekend veld — de vangrail die het
 *    geparste pensioenoverzicht (ADR 0115) buiten de database houdt;
 *  4. DELETE zet de kolom op `null` (afronden/afbreken laat niets achter).
 */

const { mockCreateClient, mockGetCachedUser } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetCachedUser: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('@/lib/supabase/cached-user', () => ({ getCachedUser: mockGetCachedUser }))

import { GET, PUT, DELETE } from './route'
import { serializeDraft, type DraftStateSource } from '@/app/(onboarding)/onboarding/draft-persistence'

const USER_ID = 'user-1'

/** Gespiede aanroepen van de supabase-mock, zodat de scoping toetsbaar is. */
let selectEq: string | null
let updateEq: string | null
let updatePayload: Record<string, unknown> | null
let storedDraft: unknown

function makeSupabase() {
  return {
    from: (table: string) => {
      expect(table).toBe('profiles')
      return {
        select: () => ({
          eq: (_col: string, value: string) => {
            selectEq = value
            return {
              maybeSingle: async () => ({
                data: { onboarding_draft: storedDraft },
                error: null,
              }),
            }
          },
        }),
        update: (payload: Record<string, unknown>) => {
          updatePayload = payload
          return {
            eq: async (_col: string, value: string) => {
              updateEq = value
              storedDraft = payload.onboarding_draft
              return { error: null }
            },
          }
        },
      }
    },
  }
}

function makeDraft() {
  return serializeDraft({
    step: 'bezittingen',
    identity: {
      full_name: 'Jan Paul',
      date_of_birth: '1986-04-05',
      household_type: 'solo',
      number_of_children: 0,
      net_monthly_income: '',
      estimated_yearly_income: '42000',
      estimated_monthly_expenses: '2200',
    },
    selectedGoals: [],
    activeModules: [],
    deferredFields: [],
    budgetAmounts: {},
    quickAssets: [{ asset_type: 'cash', name: 'Betaalrekening', current_value: 1800 }],
    quickDebts: [],
    bezittingenPhases: [{ kind: 'review' }],
    schuldenPhases: [],
    spaardoel: { presetKey: null, name: '', target_value: '', target_date: '', skipped: false },
    pension: { mode: null, grossMonthly: '', startAge: '', parseResult: null },
    retirementExpense: { method: 'custom_amount', customAmount: '', skipped: false },
    horizon: {
      fire_end_strategy: 'deplete',
      fire_end_age: 90,
      fire_legacy_amount: '',
      retirement_expense_method: 'current_income',
      retirement_custom_amount: '',
      temporal_balance: 3,
      life_events: [],
    },
  } as unknown as DraftStateSource)
}

function putRequest(body: unknown): Request {
  return new Request('http://localhost/api/onboarding/draft', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/onboarding/draft', () => {
  beforeEach(() => {
    selectEq = null
    updateEq = null
    updatePayload = null
    storedDraft = null
    mockCreateClient.mockResolvedValue(makeSupabase())
    mockGetCachedUser.mockResolvedValue({ id: USER_ID })
  })

  it('GET zonder sessie geeft 401', async () => {
    mockGetCachedUser.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('PUT zonder sessie geeft 401 en schrijft niets', async () => {
    mockGetCachedUser.mockResolvedValue(null)
    const res = await PUT(putRequest({ draft: makeDraft() }))
    expect(res.status).toBe(401)
    expect(updatePayload).toBeNull()
  })

  it('DELETE zonder sessie geeft 401', async () => {
    mockGetCachedUser.mockResolvedValue(null)
    const res = await DELETE()
    expect(res.status).toBe(401)
  })

  it('GET leest uitsluitend de eigen profielrij', async () => {
    storedDraft = makeDraft()
    const res = await GET()
    expect(res.status).toBe(200)
    expect(selectEq).toBe(USER_ID)
    const body = (await res.json()) as { draft: { lastStep: string } }
    expect(body.draft.lastStep).toBe('bezittingen')
  })

  it('GET geeft null terug wanneer er geen concept loopt', async () => {
    const res = await GET()
    expect((await res.json()).draft).toBeNull()
  })

  it('PUT schrijft het concept naar uitsluitend de eigen rij', async () => {
    const draft = makeDraft()
    const res = await PUT(putRequest({ draft }))
    expect(res.status).toBe(200)
    expect(updateEq).toBe(USER_ID)
    expect(updatePayload).toEqual({ onboarding_draft: draft })
  })

  it('PUT weigert een concept met een onbekend veld (vangrail ADR 0115)', async () => {
    const draft = makeDraft()
    const gesmokkeld = {
      ...draft,
      pension: { ...draft.pension, parseResult: { aowBedrag: 1300 } },
    }
    const res = await PUT(putRequest({ draft: gesmokkeld }))
    expect(res.status).toBe(400)
    expect(updatePayload).toBeNull()
  })

  it('PUT weigert een body zonder concept', async () => {
    const res = await PUT(putRequest({}))
    expect(res.status).toBe(400)
    expect(updatePayload).toBeNull()
  })

  it('PUT weigert een concept met absurd veel budgetposten', async () => {
    const draft = makeDraft()
    // `budgetAmounts` was de enige onbegrensde collectie in het schema — de
    // sleuteltelling-cap sluit dat gat vóór de zod-walk hem uitloopt.
    draft.budgetAmounts = Object.fromEntries(
      Array.from({ length: 2000 }, (_, i) => [`budget-${i}`, i]),
    )
    const res = await PUT(putRequest({ draft }))
    expect(res.status).toBe(400)
    expect(updatePayload).toBeNull()
  })

  it('PUT weigert een concept dat de totale omvangsgrens overschrijdt', async () => {
    const draft = makeDraft()
    // Binnen alle per-veld- en tellingsmaxima, maar samen ruim over 64 kB.
    draft.quickAssets = Array.from({ length: 100 }, (_, i) => ({
      asset_type: 'cash' as const,
      name: `Rekening ${i} `.padEnd(200, 'x'),
      current_value: i,
      field3: 'x'.repeat(200),
    }))
    draft.quickDebts = Array.from({ length: 100 }, (_, i) => ({
      debt_type: 'other' as const,
      name: `Lening ${i} `.padEnd(200, 'x'),
      current_balance: i,
      field3: 'x'.repeat(200),
    }))
    draft.budgetAmounts = Object.fromEntries(
      Array.from({ length: 200 }, (_, i) => [`budget-${i}`.padEnd(64, 'x'), i]),
    )
    const res = await PUT(putRequest({ draft }))
    expect(res.status).toBe(400)
    expect(updatePayload).toBeNull()
  })

  it('PUT weigert een te grote body al op content-length, vóór het inlezen', async () => {
    // Body-stream bewust NIET meegegeven: slaagt de test, dan is de body
    // gegarandeerd niet ingelezen — precies wat de voorcontrole moet doen.
    const req = new Request('http://localhost/api/onboarding/draft', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(9_000_000) },
    })
    const res = await PUT(req)
    expect(res.status).toBe(400)
    expect(updatePayload).toBeNull()
  })

  it('DELETE zet het concept op null voor uitsluitend de eigen rij', async () => {
    storedDraft = makeDraft()
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(updateEq).toBe(USER_ID)
    expect(updatePayload).toEqual({ onboarding_draft: null })
    expect(storedDraft).toBeNull()
  })
})
