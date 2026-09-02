import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * ADR 0127-review — het schaduwpad van /api/fire-settings.
 *
 * De val: bij een CHECK-violation (23514) op `fire_end_strategy` parkeerde de route de
 * kolom op 'deplete', schreef de échte keuze in `feature_preferences.fire_strategy_override`
 * en antwoordde HTTP 200 `success: true` — terwijl de GET-kant die override alleen voor
 * 'pensioen' terug las. Een derde strategie liep zo stil verloren: geslaagde opslag,
 * na herladen "Vermogen opeten".
 *
 * DE INVARIANT (ongeacht de waarde): een PUT met een strategie die de database weigert
 * eindigt NIET met succes terwijl een GET erna iets anders teruggeeft dan wat er is
 * opgeslagen. Concreet: (a) het legacy-'pensioen'-schaduwpad blijft werken én leest
 * terug; (b) elke andere geweigerde waarde → eerlijke 409, niets geschreven, GET geeft
 * de vorige keuze; (c) het terugleespad is generiek voor de canonieke allowlist.
 */

// ── Nep-database: één profielrij met een simuleerbare CHECK-constraint ──────────

type Row = Record<string, unknown>

interface FakeDb {
  row: Row
  /** De waarden die de CHECK-constraint accepteert (simuleert de DB-staat). */
  allowedStrategies: Set<string>
  updates: Row[]
}

function makeDb(row: Row, allowed: string[]): FakeDb {
  return { row: { ...row }, allowedStrategies: new Set(allowed), updates: [] }
}

function makeSupabase(db: FakeDb) {
  const userId = 'u1'
  function builder() {
    let pendingUpdate: Row | null = null
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.update = (payload: Row) => {
      pendingUpdate = payload
      return q
    }
    q.eq = () => {
      if (pendingUpdate) {
        const strategy = pendingUpdate.fire_end_strategy
        if (typeof strategy === 'string' && !db.allowedStrategies.has(strategy)) {
          pendingUpdate = null
          return Promise.resolve({
            error: {
              code: '23514',
              message: 'new row for relation "profiles" violates check constraint "profiles_fire_end_strategy_check" (fire_end_strategy)',
            },
          })
        }
        db.updates.push(pendingUpdate)
        Object.assign(db.row, pendingUpdate)
        pendingUpdate = null
        return Promise.resolve({ error: null })
      }
      return q
    }
    q.single = () => Promise.resolve({ data: { ...db.row }, error: null })
    q.maybeSingle = () => Promise.resolve({ data: { ...db.row }, error: null })
    return q
  }
  return {
    from: () => builder(),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: userId } } }) },
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
const getStrategy = async () => ((await (await GET()).json()) as { fire_end_strategy: string }).fire_end_strategy

const BASE_ROW: Row = {
  fire_end_strategy: 'deplete',
  fire_end_age: 90,
  fire_legacy_amount: null,
  feature_preferences: {},
  retirement_expense_method: 'essential_budgets',
  retirement_expense_custom_amount: null,
  deficit_loan_rate: null,
  monthly_savings_override: null,
}

beforeEach(() => {
  db = makeDb(BASE_ROW, ['perpetual', 'legacy', 'deplete', 'pensioen'])
})

describe('PUT — CHECK-violation op een strategie die de database (nog) weigert', () => {
  it('INVARIANT: een geweigerde niet-legacy-waarde eindigt niet met succes en GET geeft de vorige keuze', async () => {
    // Simuleer een database die op de app achterloopt: 'legacy' niet in de CHECK.
    db = makeDb({ ...BASE_ROW, fire_end_strategy: 'perpetual' }, ['perpetual', 'deplete', 'pensioen'])
    const res = await put({ fire_end_strategy: 'legacy', fire_end_age: 90 })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { success?: boolean; code?: string }
    expect(body.success).toBeUndefined()
    expect(body.code).toBe('strategy_not_supported')
    // Niets geschreven: geen 'deplete'-parkeerwaarde, geen override.
    expect(db.updates).toHaveLength(0)
    expect(db.row.fire_end_strategy).toBe('perpetual')
    expect((db.row.feature_preferences as Row).fire_strategy_override).toBeUndefined()
    // En de GET zegt precies wat er staat.
    expect(await getStrategy()).toBe('perpetual')
  })

  it("legacy-schaduwpad: 'pensioen' op een database zonder pensioen-CHECK → fallback, en GET leest 'm terug", async () => {
    db = makeDb(BASE_ROW, ['perpetual', 'legacy', 'deplete'])
    const res = await put({ fire_end_strategy: 'pensioen', fire_end_age: 90 })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; fallback?: boolean }
    expect(body.success).toBe(true)
    expect(body.fallback).toBe(true)
    expect(db.row.fire_end_strategy).toBe('deplete')
    expect((db.row.feature_preferences as Row).fire_strategy_override).toBe('pensioen')
    expect(await getStrategy()).toBe('pensioen')
  })

  it("'nu-stoppen' wordt geaccepteerd en in de kolom geschreven — geen schaduwpad", async () => {
    // De volgorde-eis van ADR 0127 is afgehandeld: migratie 20260902120000 is live
    // (constraint geverifieerd op vijf waarden), dus de route valideert via de
    // canonieke `isFireEndStrategy` en de database accepteert de waarde. Wat deze
    // test bewaakt is dat de strategie in de KOLOM landt en niet in het
    // legacy-schaduwpad: een keuze die als `deplete` + override wordt geparkeerd is
    // op een database die haar wél aankan een stille degradatie.
    db = makeDb(BASE_ROW, ['perpetual', 'legacy', 'deplete', 'pensioen', 'nu-stoppen'])
    const res = await put({ fire_end_strategy: 'nu-stoppen', fire_end_age: 90 })
    expect(res.status).toBe(200)
    expect(db.row.fire_end_strategy).toBe('nu-stoppen')
    expect((db.row.feature_preferences as Row).fire_strategy_override).toBeUndefined()
    expect(await getStrategy()).toBe('nu-stoppen')
  })

  it('een strategie die de database niet kent wordt luid geweigerd, niet stil geparkeerd', async () => {
    // De invariant die het schaduwpad verving: geen 200 die niets bewaart. Een
    // waarde buiten de canonieke allowlist strandt vóór elke write.
    const res = await put({ fire_end_strategy: 'verzonnen-strategie', fire_end_age: 90 })
    expect(res.status).toBe(400)
    expect(db.updates).toHaveLength(0)
  })
})

describe('PUT — gewone opslag', () => {
  it('slaat op en ruimt een stale override op', async () => {
    db = makeDb({ ...BASE_ROW, feature_preferences: { fire_strategy_override: 'pensioen' } }, ['perpetual', 'legacy', 'deplete', 'pensioen'])
    const res = await put({ fire_end_strategy: 'perpetual', fire_end_age: 90 })
    expect(res.status).toBe(200)
    expect(db.row.fire_end_strategy).toBe('perpetual')
    expect((db.row.feature_preferences as Row).fire_strategy_override).toBeUndefined()
    expect(await getStrategy()).toBe('perpetual')
  })
})

describe('GET — generiek terugleespad (canonieke allowlist, niet hardcoded pensioen)', () => {
  it("kolom 'deplete' + override 'nu-stoppen' → nu-stoppen", async () => {
    db = makeDb({ ...BASE_ROW, feature_preferences: { fire_strategy_override: 'nu-stoppen' } }, [])
    expect(await getStrategy()).toBe('nu-stoppen')
  })

  it("kolom 'deplete' + override 'pensioen' → pensioen (legacy blijft)", async () => {
    db = makeDb({ ...BASE_ROW, feature_preferences: { fire_strategy_override: 'pensioen' } }, [])
    expect(await getStrategy()).toBe('pensioen')
  })

  it('de kolom wint zodra ze iets anders dan de parkeerwaarde draagt', async () => {
    db = makeDb({ ...BASE_ROW, fire_end_strategy: 'legacy', feature_preferences: { fire_strategy_override: 'pensioen' } }, [])
    expect(await getStrategy()).toBe('legacy')
  })

  it('een override buiten de allowlist wordt genegeerd', async () => {
    db = makeDb({ ...BASE_ROW, feature_preferences: { fire_strategy_override: 'fixed_age' } }, [])
    expect(await getStrategy()).toBe('deplete')
  })
})
