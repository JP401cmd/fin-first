import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * ADR 0129 F1 — het stop-anker op /api/fire-settings.
 *
 * De kolommen `fire_stop_anchor`/`fire_stop_age` komen uit migratie 20260903140000,
 * die bewust nog niet is uitgerold. Deze suite bewaakt drie dingen:
 *
 *  (a) DE INVARIANT VAN DE ROUTE (geërfd van de ADR 0127-review): een keuze die
 *      nergens landt, mag NOOIT als succes terugkomen. Bij een ontbrekende kolom
 *      geeft de route een eerlijke 409 — niet "opgeslagen" met een stopmoment dat
 *      bij de volgende load verdwenen is.
 *  (b) DE TEGENSPRAAK-REGEL (D2): draagt de oude kolom nog een anker
 *      ('pensioen'/'nu-stoppen'), dan WINT die van de nieuwe ankerkolom. Zo kan een
 *      half-gebackfillde rij niet halverwege van plan wisselen.
 *  (c) De halve-jaren-resolutie (B6) wordt afgewezen, niet stil afgerond.
 */

type Row = Record<string, unknown>

interface FakeDb {
  row: Row
  /** false = migratie 20260903140000 nog niet uitgerold → 42703 op die kolommen. */
  hasAnchorColumns: boolean
  updates: Row[]
}

const ANCHOR_KEYS = ['fire_stop_anchor', 'fire_stop_age']

function makeSupabase(db: FakeDb) {
  function builder() {
    let pendingUpdate: Row | null = null
    let selectedAnchor = false
    const q: Record<string, unknown> = {}
    q.select = (cols?: string) => {
      selectedAnchor = typeof cols === 'string' && cols.includes('fire_stop_anchor')
      return q
    }
    q.update = (payload: Row) => {
      pendingUpdate = payload
      return q
    }
    q.eq = () => {
      if (pendingUpdate) {
        const raaktAnker = ANCHOR_KEYS.some((k) => k in pendingUpdate!)
        if (raaktAnker && !db.hasAnchorColumns) {
          pendingUpdate = null
          return Promise.resolve({
            error: { code: '42703', message: 'column "fire_stop_anchor" of relation "profiles" does not exist' },
          })
        }
        db.updates.push(pendingUpdate)
        Object.assign(db.row, pendingUpdate)
        pendingUpdate = null
        return Promise.resolve({ error: null })
      }
      return q
    }
    const lees = () => {
      if (selectedAnchor && !db.hasAnchorColumns) {
        return Promise.resolve({
          data: null,
          error: { code: '42703', message: 'column "fire_stop_anchor" does not exist' },
        })
      }
      return Promise.resolve({ data: { ...db.row }, error: null })
    }
    q.single = lees
    q.maybeSingle = lees
    return q
  }
  return {
    from: () => builder(),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
  }
}

let db: FakeDb
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(makeSupabase(db)),
  getAuthClaims: () => Promise.resolve({ sub: 'u1' }),
}))

import { GET, PUT } from './route'

const put = (body: Row) =>
  PUT(new NextRequest('http://localhost/api/fire-settings', { method: 'PUT', body: JSON.stringify(body) }))

const getPlan = async () =>
  (await (await GET()).json()) as { fire_end_strategy: string; fire_stop_anchor: string; fire_stop_age: number | null }

const BASE_ROW: Row = {
  fire_end_strategy: 'deplete',
  fire_end_age: 90,
  fire_legacy_amount: null,
  feature_preferences: {},
  retirement_expense_method: 'essential_budgets',
  retirement_expense_custom_amount: null,
  deficit_loan_rate: null,
  monthly_savings_override: null,
  fire_stop_anchor: 'solved',
  fire_stop_age: null,
}

beforeEach(() => {
  db = { row: { ...BASE_ROW }, hasAnchorColumns: true, updates: [] }
})

describe('PUT — anker opslaan zodra de kolommen bestaan', () => {
  it('schrijft anker en stopleeftijd en geeft ze terug', async () => {
    const res = await put({ fire_end_strategy: 'deplete', fire_end_age: 90, fire_stop_anchor: 'age', fire_stop_age: 58.5 })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Row
    expect(body.success).toBe(true)
    expect(body.fire_stop_anchor).toBe('age')
    expect(body.fire_stop_age).toBe(58.5)
    expect(db.row.fire_stop_anchor).toBe('age')
    expect(db.row.fire_stop_age).toBe(58.5)
  })

  it('wist de stopleeftijd wanneer het anker terug naar solved gaat', async () => {
    db.row.fire_stop_anchor = 'age'
    db.row.fire_stop_age = 58
    await put({ fire_end_strategy: 'deplete', fire_end_age: 90, fire_stop_anchor: 'solved' })
    expect(db.row.fire_stop_anchor).toBe('solved')
    expect(db.row.fire_stop_age).toBeNull()
  })

  it('laat het anker met rust wanneer de client het veld niet stuurt', async () => {
    // Een oudere client mag een zelfgekozen stopmoment niet stil op 'solved' zetten.
    db.row.fire_stop_anchor = 'age'
    db.row.fire_stop_age = 62
    await put({ fire_end_strategy: 'deplete', fire_end_age: 90 })
    expect(db.row.fire_stop_anchor).toBe('age')
    expect(db.row.fire_stop_age).toBe(62)
    expect(db.updates.every((u) => !ANCHOR_KEYS.some((k) => k in u))).toBe(true)
  })
})

describe('PUT — INVARIANT: een keuze die nergens landt is geen succes', () => {
  it('ontbrekende kolom → 409, geen success, en de overige velden zijn wél bewaard', async () => {
    db.hasAnchorColumns = false
    const res = await put({ fire_end_strategy: 'legacy', fire_end_age: 85, fire_stop_anchor: 'age', fire_stop_age: 58 })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { success?: boolean; code?: string; error?: string }
    expect(body.success).toBeUndefined()
    expect(body.code).toBe('stop_anchor_not_supported')
    // De hoofd-update ging wél door; dat zegt de foutmelding ook.
    expect(db.row.fire_end_strategy).toBe('legacy')
    expect(body.error).toMatch(/overige instellingen zijn wél bewaard/i)
  })

  it('zonder anker in de body raakt een ontbrekende kolom niets — gewoon 200', async () => {
    db.hasAnchorColumns = false
    const res = await put({ fire_end_strategy: 'perpetual', fire_end_age: 90 })
    expect(res.status).toBe(200)
  })
})

describe('PUT — validatie van de stopleeftijd', () => {
  it.each([
    ['58,3 is geen halve stap', { fire_stop_anchor: 'age', fire_stop_age: 58.3 }, /half jaar/i],
    ['17 ligt buiten het bereik', { fire_stop_anchor: 'age', fire_stop_age: 17 }, /tussen 18 en 100/i],
    ['101 ligt buiten het bereik', { fire_stop_anchor: 'age', fire_stop_age: 101 }, /tussen 18 en 100/i],
    ['age zonder leeftijd', { fire_stop_anchor: 'age' }, /kies een stopleeftijd/i],
    ['leeftijd zonder age-anker', { fire_stop_anchor: 'aow', fire_stop_age: 58 }, /alleen bij het anker/i],
    ['onbekend anker', { fire_stop_anchor: 'ooit' }, /ongeldig stop-anker/i],
  ])('%s → 400, niets geschreven', async (_naam, extra, patroon) => {
    const res = await put({ fire_end_strategy: 'deplete', fire_end_age: 90, ...extra })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toMatch(patroon)
    expect(db.updates).toHaveLength(0)
  })

  it('58,5 wordt NIET stil afgerond maar geaccepteerd', async () => {
    const res = await put({ fire_end_strategy: 'deplete', fire_end_age: 90, fire_stop_anchor: 'age', fire_stop_age: 58.5 })
    expect(res.status).toBe(200)
    expect(db.row.fire_stop_age).toBe(58.5)
  })
})

describe('GET — de tegenspraak-regel (D2)', () => {
  it('een legacy-anker in de oude kolom wint van de nieuwe kolom', async () => {
    // De rij die halverwege de backfill bestaat: oude kolom zegt 'pensioen',
    // nieuwe kolom staat nog op de default.
    db.row.fire_end_strategy = 'pensioen'
    db.row.fire_stop_anchor = 'solved'
    expect((await getPlan()).fire_stop_anchor).toBe('aow')
  })

  it("'nu-stoppen' levert het now-anker", async () => {
    db.row.fire_end_strategy = 'nu-stoppen'
    db.row.fire_stop_anchor = 'solved'
    expect((await getPlan()).fire_stop_anchor).toBe('now')
  })

  it('bij een eind-vorm leidt de nieuwe ankerkolom', async () => {
    db.row.fire_end_strategy = 'deplete'
    db.row.fire_stop_anchor = 'age'
    db.row.fire_stop_age = 58
    const plan = await getPlan()
    expect(plan.fire_stop_anchor).toBe('age')
    expect(plan.fire_stop_age).toBe(58)
  })

  it('ontbrekende kolom → anker afgeleid uit de legacy-strategie, geen 500', async () => {
    db.hasAnchorColumns = false
    db.row.fire_end_strategy = 'pensioen'
    const res = await GET()
    expect(res.status).toBe(200)
    const plan = (await res.json()) as { fire_stop_anchor: string; fire_stop_age: number | null }
    expect(plan.fire_stop_anchor).toBe('aow')
    expect(plan.fire_stop_age).toBeNull()
  })

  it('ontbrekende kolom bij een gewone eind-vorm → solved', async () => {
    db.hasAnchorColumns = false
    db.row.fire_end_strategy = 'legacy'
    expect((await getPlan()).fire_stop_anchor).toBe('solved')
  })
})
