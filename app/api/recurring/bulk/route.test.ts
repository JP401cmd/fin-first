import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * /api/recurring/bulk — de laag die RLS níét levert.
 *
 * De "Alles toevoegen"-knop schreef eerst client-direct naar
 * `recurring_transactions`. De INSERT-policy daar eist `auth.uid() = user_id`,
 * dus schrijven namens een ander lukte al niet. Maar `account_id` en `budget_id`
 * zijn vreemde sleutels zónder eigenaarschapscheck in die policy: een client kon
 * de rekening of het budget van een ander aan zijn eigen regel hangen.
 *
 * DE INVARIANT die deze suite bewaakt: `user_id` komt uit de SESSIE en nooit uit
 * de body, en elke vreemde sleutel in de body wordt tegen de eigenaar getoetst
 * vóór er één rij geschreven wordt. Een afgewezen verzoek schrijft niets — half
 * doorgevoerd is hier het slechtste resultaat, want de gebruiker ziet
 * "toegevoegd" en moet daarna zelf uitzoeken welke helft ontbreekt.
 */

const SESSIE_USER = 'user-eigen'

/** Echte uuid's: het schema eist ze, dus leesbare pseudo-id's zouden hier al op
 *  de invoervalidatie stranden en de eigenaarschapstoets nooit bereiken. */
const ACC_EIGEN = '11111111-1111-4111-8111-111111111111'
const ACC_ANDER = '22222222-2222-4222-8222-222222222222'
const BUD_EIGEN = '33333333-3333-4333-8333-333333333333'
const BUD_ANDER = '44444444-4444-4444-8444-444444444444'

interface FakeDb {
  /** bank_accounts-rijen als id → eigenaar. */
  accounts: Record<string, string>
  /** budgets-rijen als id → eigenaar. */
  budgets: Record<string, string>
  /** Alles wat daadwerkelijk in recurring_transactions is geschreven. */
  inserts: Record<string, unknown>[][]
}

function makeDb(over: Partial<FakeDb> = {}): FakeDb {
  return {
    accounts: { [ACC_EIGEN]: SESSIE_USER, [ACC_ANDER]: 'user-ander' },
    budgets: { [BUD_EIGEN]: SESSIE_USER, [BUD_ANDER]: 'user-ander' },
    inserts: [],
    ...over,
  }
}

/** Minimale supabase-dubbel die `.eq('user_id', …)` daadwerkelijk toepast. */
function makeSupabase(db: FakeDb, user: { id: string } | null = { id: SESSIE_USER }) {
  function from(tabel: string) {
    const filters: Record<string, unknown> = {}
    let inFilter: string[] | null = null

    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = (kolom: string, waarde: unknown) => { filters[kolom] = waarde; return q }
    q.in = (_kolom: string, waarden: string[]) => { inFilter = waarden; return q }

    function eigenaarVan(id: string): string | undefined {
      return tabel === 'bank_accounts' ? db.accounts[id] : db.budgets[id]
    }

    q.maybeSingle = async () => {
      const id = filters.id as string
      const past = eigenaarVan(id) === filters.user_id
      return { data: past ? { id } : null, error: null }
    }
    // `.select().in().eq()` zonder maybeSingle → thenable lijst.
    q.then = (resolve: (v: unknown) => unknown) => {
      if (tabel === 'recurring_transactions') {
        return resolve({ count: 0, error: null })
      }
      const ids = inFilter ?? []
      const eigen = ids.filter((id) => eigenaarVan(id) === filters.user_id).map((id) => ({ id }))
      return resolve({ data: eigen, error: null })
    }
    q.insert = (rijen: Record<string, unknown>[]) => {
      db.inserts.push(rijen)
      return { select: async () => ({ data: rijen.map(() => ({ id: 'x' })), error: null }) }
    }
    return q
  }
  return { auth: { getUser: async () => ({ data: { user } }) }, from }
}

let db: FakeDb
let supabase: ReturnType<typeof makeSupabase>

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => supabase }))

async function post(body: unknown) {
  const { POST } = await import('./route')
  return POST(new Request('http://localhost/api/recurring/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

const GELDIG_PATROON = {
  name: 'Spotify',
  amount: -11.99,
  frequency: 'monthly' as const,
  day_of_month: 28,
  budget_id: BUD_EIGEN,
}

beforeEach(() => {
  db = makeDb()
  supabase = makeSupabase(db)
})

describe('POST /api/recurring/bulk — eigenaarschap van de vreemde sleutels', () => {
  it('schrijft de regels met de user_id uit de SESSIE, niet uit de body', async () => {
    const res = await post({
      account_id: ACC_EIGEN,
      // Een meegestuurde eigenaar is geen invoer maar een aanname over wie je bent.
      user_id: 'user-ander',
      patterns: [GELDIG_PATROON],
    })
    expect(res.status).toBe(200)
    expect(db.inserts).toHaveLength(1)
    expect(db.inserts[0][0].user_id).toBe(SESSIE_USER)
  })

  it('weigert een rekening van iemand anders en schrijft NIETS', async () => {
    const res = await post({ account_id: ACC_ANDER, patterns: [GELDIG_PATROON] })
    expect(res.status).toBe(403)
    expect(db.inserts).toEqual([])
  })

  it('weigert een budget van iemand anders en schrijft NIETS', async () => {
    const res = await post({
      account_id: ACC_EIGEN,
      patterns: [{ ...GELDIG_PATROON, budget_id: BUD_ANDER }],
    })
    expect(res.status).toBe(403)
    expect(db.inserts).toEqual([])
  })

  it('weigert wanneer één patroon in de lijst een vreemd budget draagt (geen halve doorvoer)', async () => {
    const res = await post({
      account_id: ACC_EIGEN,
      patterns: [GELDIG_PATROON, { ...GELDIG_PATROON, budget_id: BUD_ANDER }],
    })
    expect(res.status).toBe(403)
    expect(db.inserts).toEqual([])
  })

  it('zonder sessie: 401, geen writes', async () => {
    supabase = makeSupabase(db, null)
    const res = await post({ account_id: ACC_EIGEN, patterns: [GELDIG_PATROON] })
    expect(res.status).toBe(401)
    expect(db.inserts).toEqual([])
  })
})

describe('POST /api/recurring/bulk — invoervalidatie', () => {
  it('weigert een lege lijst', async () => {
    const res = await post({ account_id: ACC_EIGEN, patterns: [] })
    expect(res.status).toBe(400)
    expect(db.inserts).toEqual([])
  })

  it('weigert een onbekende frequentie', async () => {
    const res = await post({
      account_id: ACC_EIGEN,
      patterns: [{ ...GELDIG_PATROON, frequency: 'elke-maandag' }],
    })
    expect(res.status).toBe(400)
    expect(db.inserts).toEqual([])
  })

  it('weigert een account_id dat geen uuid is — vóór elke query', async () => {
    const res = await post({ account_id: 'niet-een-uuid', patterns: [GELDIG_PATROON] })
    expect(res.status).toBe(400)
    expect(db.inserts).toEqual([])
  })

  it('accepteert een patroon zonder budget (ongecategoriseerd mag)', async () => {
    const res = await post({
      account_id: ACC_EIGEN,
      patterns: [{ name: 'Onbekend', amount: -5, frequency: 'monthly' as const }],
    })
    expect(res.status).toBe(200)
    expect(db.inserts[0][0].budget_id).toBeNull()
  })
})
