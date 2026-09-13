import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST/PATCH /api/questionnaires/[id]/respond — de vragenlijst in de chat bij Fin.
 *
 * Vastgelegd:
 *   - 401 zonder gebruiker, 400 op een ongeldige body (zod)
 *   - 404 op een inactieve vragenlijst, 403 op een sessie die niet (meer) open/van jou is
 *   - 400 als de vraag niet bij de vragenlijst hoort of het antwoord niet bij het type past
 *   - de vraagtekst-snapshot komt uit de DATABASE, niet uit de request
 *   - PATCH rondt alleen af als alle verplichte vragen beantwoord zijn
 */

type Resultaat = { data: unknown; error: unknown }

/** Per tabel een wachtrij met resultaten; elke keten eindigt in één ervan. */
let resultaten: Record<string, Resultaat[]>
let upserts: { tabel: string; rij: Record<string, unknown> }[]
let updates: { tabel: string; rij: Record<string, unknown> }[]
const mockGetUser = vi.fn()

function keten(tabel: string) {
  const volgende = (): Resultaat => resultaten[tabel]?.shift() ?? { data: null, error: null }
  const k: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit']) k[m] = () => k
  k.maybeSingle = async () => volgende()
  k.single = async () => volgende()
  k.then = (resolve: (r: Resultaat) => unknown) => resolve(volgende())
  k.upsert = (rij: Record<string, unknown>) => {
    upserts.push({ tabel, rij })
    return Promise.resolve(volgende())
  }
  k.update = (rij: Record<string, unknown>) => {
    updates.push({ tabel, rij })
    return k
  }
  return k
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: (tabel: string) => keten(tabel),
  })),
}))

import { POST, PATCH } from './route'

const QID = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e'
const SID = '3f2b6c1e-8a4d-4c2b-9f1e-2d3c4b5a6f70'
const VID = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const params = { params: Promise.resolve({ id: QID }) }

function req(method: string, body: unknown) {
  return new Request(`http://localhost/api/questionnaires/${QID}/respond`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const VRAAG_SCHAAL = {
  id: VID,
  type: 'scale',
  question_text: 'Uit de database',
  options: null,
  scale_min_label: null,
  scale_max_label: null,
  is_required: true,
  is_multi_select: false,
}

beforeEach(() => {
  resultaten = {}
  upserts = []
  updates = []
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
})

describe('POST respond', () => {
  it('401 zonder gebruiker', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(req('POST', { session_id: SID, question_id: VID, answer_scale: 5 }), params)
    expect(res.status).toBe(401)
  })

  it('404 (geen 500) op een vragenlijst-id dat geen uuid is', async () => {
    const res = await POST(
      req('POST', { session_id: SID, question_id: VID, answer_scale: 5 }),
      { params: Promise.resolve({ id: 'geen-uuid' }) },
    )
    expect(res.status).toBe(404)
  })

  it('400 op een ongeldige body', async () => {
    const res = await POST(req('POST', { session_id: 'x', question_id: VID }), params)
    expect(res.status).toBe(400)
  })

  it('404 als de vragenlijst niet actief is', async () => {
    resultaten.questionnaires = [{ data: null, error: null }]
    const res = await POST(req('POST', { session_id: SID, question_id: VID, answer_scale: 5 }), params)
    expect(res.status).toBe(404)
    expect(upserts).toHaveLength(0)
  })

  it('403 als de sessie niet open of niet van jou is', async () => {
    resultaten.questionnaires = [{ data: { id: QID }, error: null }]
    resultaten.questionnaire_sessions = [{ data: null, error: null }]
    const res = await POST(req('POST', { session_id: SID, question_id: VID, answer_scale: 5 }), params)
    expect(res.status).toBe(403)
    expect(upserts).toHaveLength(0)
  })

  it('400 als de vraag niet bij de vragenlijst hoort', async () => {
    resultaten.questionnaires = [{ data: { id: QID }, error: null }]
    resultaten.questionnaire_sessions = [{ data: { id: SID }, error: null }]
    resultaten.questionnaire_questions = [{ data: null, error: null }]
    const res = await POST(req('POST', { session_id: SID, question_id: VID, answer_scale: 5 }), params)
    expect(res.status).toBe(400)
    expect(upserts).toHaveLength(0)
  })

  it('400 als het antwoord niet bij het vraagtype past', async () => {
    resultaten.questionnaires = [{ data: { id: QID }, error: null }]
    resultaten.questionnaire_sessions = [{ data: { id: SID }, error: null }]
    resultaten.questionnaire_questions = [{ data: VRAAG_SCHAAL, error: null }]
    const res = await POST(req('POST', { session_id: SID, question_id: VID, answer_text: 'geen cijfer' }), params)
    expect(res.status).toBe(400)
    expect(upserts).toHaveLength(0)
  })

  it('slaat per vraag op met de vraagtekst uit de database', async () => {
    resultaten.questionnaires = [{ data: { id: QID }, error: null }]
    resultaten.questionnaire_sessions = [{ data: { id: SID }, error: null }]
    resultaten.questionnaire_questions = [{ data: VRAAG_SCHAAL, error: null }]
    const res = await POST(
      req('POST', { session_id: SID, question_id: VID, answer_scale: 8, question_text: 'vervalst' }),
      params,
    )
    expect(res.status).toBe(200)
    expect(upserts).toEqual([
      {
        tabel: 'questionnaire_responses',
        rij: {
          session_id: SID,
          question_id: VID,
          question_text_snapshot: 'Uit de database',
          answer_text: null,
          answer_scale: 8,
          answer_choice: null,
        },
      },
    ])
  })

  it('stuurt nooit een rauwe databasefout naar de client', async () => {
    resultaten.questionnaires = [{ data: { id: QID }, error: null }]
    resultaten.questionnaire_sessions = [{ data: { id: SID }, error: null }]
    resultaten.questionnaire_questions = [{ data: VRAAG_SCHAAL, error: null }]
    resultaten.questionnaire_responses = [{ data: null, error: { message: 'duplicate key geheim_detail' } }]
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(req('POST', { session_id: SID, question_id: VID, answer_scale: 8 }), params)
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('geheim_detail')
  })
})

describe('PATCH respond (afronden)', () => {
  // Standaard een actieve lijst; de deactiveer-test overschrijft dit.
  beforeEach(() => {
    resultaten.questionnaires = [{ data: { id: QID }, error: null }]
  })

  it('400 zolang er een verplichte vraag open staat', async () => {
    resultaten.questionnaire_sessions = [{ data: { id: SID }, error: null }]
    resultaten.questionnaire_questions = [{ data: [{ id: 'a', is_required: true }, { id: 'b', is_required: true }], error: null }]
    resultaten.questionnaire_responses = [{ data: [{ question_id: 'a' }], error: null }]
    const res = await PATCH(req('PATCH', { session_id: SID }), params)
    expect(res.status).toBe(400)
    expect(updates).toHaveLength(0)
  })

  it('403 als de sessie tussen check en update al afgerond werd (0 rijen)', async () => {
    resultaten.questionnaire_sessions = [{ data: { id: SID }, error: null }, { data: [], error: null }]
    resultaten.questionnaire_questions = [{ data: [{ id: 'a', is_required: true }], error: null }]
    resultaten.questionnaire_responses = [{ data: [{ question_id: 'a' }], error: null }]
    const res = await PATCH(req('PATCH', { session_id: SID }), params)
    expect(res.status).toBe(403)
  })

  it('rondt af als alle verplichte vragen beantwoord zijn', async () => {
    resultaten.questionnaire_sessions = [{ data: { id: SID }, error: null }, { data: [{ id: SID }], error: null }]
    resultaten.questionnaire_questions = [{ data: [{ id: 'a', is_required: true }, { id: 'b', is_required: false }], error: null }]
    resultaten.questionnaire_responses = [{ data: [{ question_id: 'a' }], error: null }]
    const res = await PATCH(req('PATCH', { session_id: SID }), params)
    expect(res.status).toBe(200)
    expect(updates).toHaveLength(1)
    expect(updates[0].tabel).toBe('questionnaire_sessions')
    expect(typeof updates[0].rij.completed_at).toBe('string')
  })

  it('403 op een sessie die al afgerond of niet van jou is', async () => {
    resultaten.questionnaire_sessions = [{ data: null, error: null }]
    const res = await PATCH(req('PATCH', { session_id: SID }), params)
    expect(res.status).toBe(403)
  })

  it('404 (geen 500) als beheer de lijst intussen deactiveerde', async () => {
    resultaten.questionnaires = [{ data: null, error: null }]
    const res = await PATCH(req('PATCH', { session_id: SID }), params)
    expect(res.status).toBe(404)
    expect(updates).toHaveLength(0)
  })
})
