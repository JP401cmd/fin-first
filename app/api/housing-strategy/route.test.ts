import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { ASSET_CLIENT_COLUMNS } from '@/lib/asset-data'

/**
 * Beveiligingstest voor /api/housing-strategy (UR3-04).
 *
 * De val die deze suite bewaakt: de SELECT-policy op `assets` (en `debts`) is
 * HUISHOUD-GEDEELD —
 *
 *     (auth.uid() = user_id)
 *     OR (ownership = 'shared' AND household_id = user_household_id())
 *
 * RLS scopet daar dus NIET op de gebruiker. Een `select()` zonder expliciete
 * `.eq('user_id', <eigen id>)` levert óók de gedeelde woning van de PARTNER, en
 * die bepaalde vervolgens de housing-context (inclusief bedragen) van deze
 * gebruiker — terwijl `housing_strategy_config` een PER-PROFIEL-instelling is.
 *
 * De nep-database hieronder modelleert dat eerlijk: `db.assets` / `db.debts` is
 * de RLS-ZICHTBARE set (eigen rijen + gedeelde partnerrijen). Wie de
 * `user_id`-filter weglaat, krijgt de partnerrij dus gewoon binnen — precies
 * zoals in productie. Bijt-proef: haal `.eq('user_id', userId)` uit de route en
 * de eerste twee tests vallen om.
 *
 * Daarnaast bewaakt deze suite de kolomregel (geen `select('*')` op `assets`:
 * die tabel draagt `account_number_encrypted` (ciphertext) en
 * `account_number_hash` (blind index onder een server-only sleutel = stabiele
 * correlatiesleutel)) en de ADR 0044-error-envelope.
 */

type Row = Record<string, unknown>

interface Db {
  /** RLS-zichtbare set per tabel: eigen rijen + gedeelde partnerrijen. */
  profiles: Row[]
  assets: Row[]
  debts: Row[]
  /** Alle `select()`-argumenten per tabel — voor de kolomregel-assertie. */
  selects: Record<string, string[]>
  /** De rijen zoals ze na kolom-projectie de route in gaan. */
  projected: Record<string, Row[]>
  upserts: Row[]
}

const ME = 'user-me'
const PARTNER = 'user-partner'
const HOUSEHOLD = 'hh-1'

/** Projecteert een rij op de gevraagde kolommen — `'*'` levert alles. */
function project(row: Row, cols: string): Row {
  if (cols.trim() === '*') return { ...row }
  const wanted = cols.split(',').map((c) => c.trim())
  const out: Row = {}
  for (const c of wanted) if (c in row) out[c] = row[c]
  return out
}

function makeSupabase(db: Db, authed: boolean) {
  function builder(table: 'profiles' | 'assets' | 'debts') {
    let rows = [...db[table]]
    let cols = '*'
    const q: Record<string, unknown> = {}

    q.select = (c: string) => {
      cols = c
      db.selects[table].push(c)
      return q
    }
    q.eq = (col: string, val: unknown) => {
      rows = rows.filter((r) => r[col] === val)
      return q
    }
    q.upsert = (payload: Row) => {
      db.upserts.push({ ...payload })
      const idx = db.profiles.findIndex((r) => r.id === payload.id)
      if (idx >= 0) db.profiles[idx] = { ...db.profiles[idx], ...payload }
      else db.profiles.push({ ...payload })
      return Promise.resolve({ error: null })
    }
    q.single = () => {
      const out = rows.map((r) => project(r, cols))
      db.projected[table] = out
      if (out.length !== 1) {
        return Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'no rows' } })
      }
      return Promise.resolve({ data: out[0], error: null })
    }
    // Thenable: `await supabase.from(...).select(...).eq(...)` levert de lijst.
    q.then = (
      resolve: (v: { data: Row[]; error: null }) => unknown,
      reject?: (e: unknown) => unknown,
    ) => {
      const out = rows.map((r) => project(r, cols))
      db.projected[table] = out
      return Promise.resolve({ data: out, error: null }).then(resolve, reject)
    }
    return q
  }

  return {
    from: (table: 'profiles' | 'assets' | 'debts') => builder(table),
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: authed ? { id: ME } : null }, error: null }),
      getClaims: () =>
        Promise.resolve({ data: authed ? { claims: { sub: ME } } : null, error: null }),
    },
  }
}

let db: Db
let authed = true

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(makeSupabase(db, authed)),
  getAuthClaims: () => Promise.resolve(authed ? { sub: ME } : null),
}))

import { GET, PUT } from './route'

// ── Rij-fabrieken ────────────────────────────────────────────────────

function asset(overrides: Row): Row {
  return {
    id: 'a-x',
    user_id: ME,
    name: 'Woning',
    asset_type: 'eigen_huis',
    current_value: 0,
    purchase_value: 0,
    purchase_date: null,
    expected_return: 2,
    monthly_contribution: 0,
    institution: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    subtype: null,
    risk_profile: null,
    tax_benefit: null,
    is_liquid: false,
    lock_end_date: null,
    ticker_symbol: null,
    rental_income: null,
    woz_value: null,
    retirement_provider_type: null,
    depreciation_rate: null,
    address_postcode: null,
    address_house_number: null,
    kvk_number: null,
    ownership_percentage: null,
    annual_dividend: null,
    linked_asset_id: null,
    ownership: 'private',
    household_id: null,
    net_worth_inclusion_pct: 100,
    // Kolommen die NOOIT opgehaald mogen worden (crypto-materiaal).
    account_number: 'NL91ABNA0417164300',
    account_number_encrypted: '\\xdeadbeef',
    account_number_hash: 'sha256:stabiele-correlatiesleutel',
    ...overrides,
  }
}

function debt(overrides: Row): Row {
  return {
    id: 'd-x',
    user_id: ME,
    name: 'Hypotheek',
    debt_type: 'mortgage',
    current_balance: 0,
    monthly_payment: 0,
    interest_rate: 3,
    end_date: null,
    is_active: true,
    linked_asset_id: null,
    net_worth_inclusion_pct: 100,
    ownership: 'private',
    household_id: null,
    creditor: 'Gevoelige vrije tekst',
    notes: 'Gevoelige vrije tekst',
    ...overrides,
  }
}

/** De gedeelde woning van de partner — via RLS zichtbaar, niet van mij. */
const PARTNER_HUIS = asset({
  id: 'a-partner',
  user_id: PARTNER,
  name: 'Woning partner',
  current_value: 500_000,
  woz_value: 480_000,
  ownership: 'shared',
  household_id: HOUSEHOLD,
})
const PARTNER_HYPOTHEEK = debt({
  id: 'd-partner',
  user_id: PARTNER,
  current_balance: 200_000,
  monthly_payment: 900,
  linked_asset_id: 'a-partner',
  ownership: 'shared',
  household_id: HOUSEHOLD,
})

const MIJN_HUIS = asset({
  id: 'a-me',
  user_id: ME,
  current_value: 400_000,
  woz_value: 390_000,
})
const MIJN_HYPOTHEEK = debt({
  id: 'd-me',
  user_id: ME,
  current_balance: 150_000,
  monthly_payment: 700,
  linked_asset_id: 'a-me',
})

interface GetBody {
  config: { mode: string }
  choice: 'sell' | 'exclude' | null
  has_eigen_huis: boolean
  dismissed_at: string | null
  context: {
    has_eigen_huis: boolean
    eigen_huis_value: number
    woz_value: number
    mortgage_balance: number
    mortgage_monthly_payment: number
    estimated_equity: number
  }
}

const getBody = async () => (await (await GET()).json()) as GetBody
const put = (body: Row) =>
  PUT(
    new NextRequest('http://localhost/api/housing-strategy', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  )

beforeEach(() => {
  authed = true
  db = {
    profiles: [{ id: ME, housing_strategy_config: null, housing_strategy_dismissed_at: null }],
    assets: [],
    debts: [],
    selects: { profiles: [], assets: [], debts: [] },
    projected: { profiles: [], assets: [], debts: [] },
    upserts: [],
  }
})

// ── 1. Het huishoud-lek ──────────────────────────────────────────────

describe('huishoud-scoping (assets/debts SELECT-policy is huishoud-gedeeld)', () => {
  it('de GEDEELDE woning van de partner bepaalt mijn housing-context NIET', async () => {
    // RLS-zichtbaar voor mij: alleen de gedeelde rijen van de partner. Zelf heb
    // ik geen woning.
    db.assets = [PARTNER_HUIS]
    db.debts = [PARTNER_HYPOTHEEK]

    const body = await getBody()

    expect(body.has_eigen_huis).toBe(false)
    expect(body.context.has_eigen_huis).toBe(false)
    // Geen enkel bedrag van de partner mag hier uitkomen.
    expect(body.context.eigen_huis_value).toBe(0)
    expect(body.context.woz_value).toBe(0)
    expect(body.context.mortgage_balance).toBe(0)
    expect(body.context.mortgage_monthly_payment).toBe(0)
    expect(body.context.estimated_equity).toBe(0)
  })

  it('mijn eigen woning telt wél, en wordt niet opgeteld bij die van de partner', async () => {
    db.assets = [MIJN_HUIS, PARTNER_HUIS]
    db.debts = [MIJN_HYPOTHEEK, PARTNER_HYPOTHEEK]

    const body = await getBody()

    expect(body.has_eigen_huis).toBe(true)
    expect(body.context.eigen_huis_value).toBe(400_000)
    expect(body.context.woz_value).toBe(390_000)
    expect(body.context.mortgage_balance).toBe(150_000)
    expect(body.context.mortgage_monthly_payment).toBe(700)
    expect(body.context.estimated_equity).toBe(250_000)
  })

  it('scopet expliciet op user_id — RLS is hier niet de scoping', async () => {
    db.assets = [MIJN_HUIS, PARTNER_HUIS]
    db.debts = [MIJN_HYPOTHEEK, PARTNER_HYPOTHEEK]
    await getBody()

    expect(db.projected.assets.map((r) => r.id)).toEqual(['a-me'])
    expect(db.projected.debts.map((r) => r.id)).toEqual(['d-me'])
  })
})

// ── 2. Kolomregel ────────────────────────────────────────────────────

describe('kolomregel — geen ciphertext of blind index ophalen', () => {
  it("assets wordt met ASSET_CLIENT_COLUMNS gelezen, nooit met select('*')", async () => {
    db.assets = [MIJN_HUIS]
    await getBody()

    expect(db.selects.assets).toEqual([ASSET_CLIENT_COLUMNS])
    expect(db.selects.assets).not.toContain('*')
  })

  it('de opgehaalde asset-rijen dragen geen *_encrypted / *_hash / account_number', async () => {
    db.assets = [MIJN_HUIS]
    await getBody()

    const keys = Object.keys(db.projected.assets[0] ?? {})
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.filter((k) => /(_encrypted|_hash)$/.test(k))).toEqual([])
    expect(keys).not.toContain('account_number')
  })

  it('debts wordt met een expliciete kolomlijst gelezen — geen vrije tekst mee', async () => {
    db.debts = [MIJN_HYPOTHEEK]
    await getBody()

    expect(db.selects.debts).not.toContain('*')
    const keys = Object.keys(db.projected.debts[0] ?? {})
    expect(keys).not.toContain('creditor')
    expect(keys).not.toContain('notes')
  })
})

// ── 3. Beginners-contract (ADR 0131) ─────────────────────────────────

describe('beginners-keuze naast het expert-pad', () => {
  it("GET meldt choice null zolang de config include_full is ('nog niet beantwoord')", async () => {
    const body = await getBody()
    expect(body.config.mode).toBe('include_full')
    expect(body.choice).toBeNull()
  })

  it("PUT { choice: 'sell' } schrijft de downsize-config en GET leest 'sell' terug", async () => {
    const res = await put({ choice: 'sell' })
    expect(res.status).toBe(200)

    const written = db.upserts[0].housing_strategy_config as { mode: string; trigger: string }
    expect(written.mode).toBe('downsize')
    expect(written.trigger).toBe('on_depletion')
    expect(await getBody().then((b) => b.choice)).toBe('sell')
  })

  it("PUT { choice: 'exclude' } schrijft exclude_from_fire", async () => {
    await put({ choice: 'exclude' })
    expect((db.upserts[0].housing_strategy_config as { mode: string }).mode).toBe(
      'exclude_from_fire',
    )
    expect(await getBody().then((b) => b.choice)).toBe('exclude')
  })

  it('het expert-pad blijft werken: een volledige config gaat er ongewijzigd in', async () => {
    const res = await put({
      config: {
        mode: 'reverse_mortgage',
        trigger: 'fixed_age',
        triggerAge: 70,
        depletionThresholdYears: 2,
        maxLoanPct: 0.4,
        interestRate: 0.05,
        monthlyPayout: 1000,
      },
    })
    expect(res.status).toBe(200)
    expect((db.upserts[0].housing_strategy_config as { mode: string }).mode).toBe(
      'reverse_mortgage',
    )
    // reverse_mortgage leest terug als 'sell' — de woning wordt verzilverd.
    expect(await getBody().then((b) => b.choice)).toBe('sell')
  })

  it('mark_dismissed blijft bestaan en zet een tijdstempel', async () => {
    const res = await put({ mark_dismissed: true })
    expect(res.status).toBe(200)
    expect(typeof db.upserts[0].housing_strategy_dismissed_at).toBe('string')
    expect(db.upserts[0].housing_strategy_config).toBeUndefined()
  })
})

// ── 4. Error-envelope (ADR 0044) ─────────────────────────────────────

describe('error-envelope', () => {
  it("GET zonder sessie geeft een platte 401 met 'Niet ingelogd'", async () => {
    authed = false
    const res = await GET()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Niet ingelogd', code: 'unauthorized' })
  })

  it('PUT zonder sessie geeft dezelfde platte 401', async () => {
    authed = false
    const res = await put({ choice: 'sell' })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: unknown }
    expect(typeof body.error).toBe('string')
    expect(db.upserts).toHaveLength(0)
  })

  it('config én choice tegelijk is ambigu → 400, niets geschreven', async () => {
    const res = await put({ config: { mode: 'exclude_from_fire' }, choice: 'sell' })
    expect(res.status).toBe(400)
    expect(db.upserts).toHaveLength(0)
  })

  it('lege body → 400 "Niets om op te slaan"', async () => {
    const res = await put({})
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('Niets om op te slaan')
  })

  it('een onbekende choice wordt door zod geweigerd, niet stil genegeerd', async () => {
    const res = await put({ choice: 'opeethypotheek' })
    expect(res.status).toBe(400)
    expect(db.upserts).toHaveLength(0)
  })

  it('een meegestuurde id uit de body kan de schrijf-eigenaar niet kapen', async () => {
    await put({ id: PARTNER, user_id: PARTNER, choice: 'sell' })
    expect(db.upserts[0].id).toBe(ME)
    expect(db.upserts[0].user_id).toBeUndefined()
  })

  it('een DB-fout lekt geen rauwe message naar de client', async () => {
    const res = await put({ choice: 'sell' })
    expect(res.status).toBe(200)

    // Tweede ronde: laat de upsert falen met een PostgrestError-vormig object.
    const failing = {
      from: () => ({
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
        upsert: () =>
          Promise.resolve({
            error: { message: 'permission denied for table profiles', code: '42501' },
          }),
      }),
      auth: { getUser: () => Promise.resolve({ data: { user: { id: ME } }, error: null }) },
    }
    const server = await import('@/lib/supabase/server')
    const spy = vi
      .spyOn(server, 'createClient')
      .mockResolvedValue(failing as unknown as Awaited<ReturnType<typeof server.createClient>>)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const bad = await put({ choice: 'sell' })
    expect(bad.status).toBe(500)
    const body = (await bad.json()) as { error: string }
    expect(body.error).not.toContain('permission denied')
    expect(body.error).not.toContain('42501')

    spy.mockRestore()
    errSpy.mockRestore()
  })
})
