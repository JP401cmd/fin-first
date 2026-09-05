import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * ADR 0129 — het stop-anker op /api/fire-settings (F1, aangescherpt in de
 * contract-ronde van 5 sep 2026).
 *
 * De kolommen `fire_stop_anchor`/`fire_stop_age` (migratie 20260903140000) en de
 * backfill (20260903141000) zijn live en geregistreerd; het 42703-vangnet dat de
 * splitsing in twee statements motiveerde is weg. Deze suite bewaakt:
 *
 *  R1  ÉÉN UPDATE voor het hele plan — een falende schrijfactie laat nooit een half
 *      plan achter (statement 1 'legacy' geslaagd, statement 2 anker gefaald ⇒
 *      `aow × legacy` waar `solved × legacy` gevraagd was).
 *  R2  KRUISTOETS strategie × anker — een expliciet anker naast `pensioen`/
 *      `nu-stoppen` is een 400, niet een 200 met een echo die lezen (D2) tegenspreekt.
 *  R3  SYMMETRISCH CONTRACT — geen geladen defaults ('deplete'/90) voor wat ontbreekt:
 *      een deel-plan is een 400; alleen losse velden mag; een lege body is een 400.
 *  R4  B7 — `fire_stop_age ≥ fire_end_age` is een 400, niet een stil geklemd plan.
 *  D2  De tegenspraak-regel op GET (legacy-label in de oude kolom wint) via de ENE
 *      parser (`parseFirePlan`), en de eind-vorm-alleen-vorm schrijft het legacy-
 *      anker mee zodat geen rij zichzelf tegenspreekt.
 *  B6  De halve-jaren-resolutie wordt bij SCHRIJVEN afgewezen, niet stil afgerond.
 */

type Row = Record<string, unknown>

interface FakeDb {
  row: Row
  updates: Row[]
  /** Als gezet: de eerstvolgende `update().eq()` faalt met deze fout (één keer). */
  failNextUpdate: { code: string; message: string } | null
}

const PLAN_KEYS = ['fire_end_strategy', 'fire_end_age', 'fire_legacy_amount', 'fire_stop_anchor', 'fire_stop_age']
const ANCHOR_KEYS = ['fire_stop_anchor', 'fire_stop_age']

function makeSupabase(db: FakeDb) {
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
        if (db.failNextUpdate) {
          const error = db.failNextUpdate
          db.failNextUpdate = null
          pendingUpdate = null
          return Promise.resolve({ error })
        }
        db.updates.push(pendingUpdate)
        Object.assign(db.row, pendingUpdate)
        pendingUpdate = null
        return Promise.resolve({ error: null })
      }
      return q
    }
    const lees = () => Promise.resolve({ data: { ...db.row }, error: null })
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
  (await (await GET()).json()) as { fire_end_strategy: string; fire_end_age: number; fire_stop_anchor: string; fire_stop_age: number | null }

const planUpdates = () => db.updates.filter((u) => PLAN_KEYS.some((k) => k in u))

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
  db = { row: { ...BASE_ROW }, updates: [], failNextUpdate: null }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('PUT — het volledige plan (F3b-vorm)', () => {
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

  it('R1 — het hele plan gaat in ÉÉN UPDATE met alle vijf kolommen', async () => {
    db.row.fire_stop_anchor = 'aow'
    await put({ fire_end_strategy: 'legacy', fire_end_age: 85, fire_legacy_amount: 100_000, fire_stop_anchor: 'solved' })
    const plan = planUpdates()
    expect(plan).toHaveLength(1)
    for (const k of PLAN_KEYS) expect(plan[0], `kolom ${k} ontbreekt in de plan-update`).toHaveProperty(k)
    expect(plan[0]).toMatchObject({
      fire_end_strategy: 'legacy',
      fire_end_age: 85,
      fire_legacy_amount: 100_000,
      fire_stop_anchor: 'solved',
      fire_stop_age: null,
    })
  })

  it('R1 — faalt de schrijfactie, dan blijft het OUDE plan volledig staan (geen half plan)', async () => {
    // Het scenario uit de review: pensioen-gebruiker kiest "Nalatenschap + laat de app
    // rekenen". Vóór R1 schreef statement 1 'legacy' (D2-anker valt weg, kolom nog 'aow')
    // en faalde statement 2 → 500 met `aow × legacy` in de database.
    db.row = { ...BASE_ROW, fire_end_strategy: 'pensioen', fire_end_age: 100, fire_stop_anchor: 'aow' }
    db.failNextUpdate = { code: 'XX000', message: 'deadlock detected' }
    const res = await put({ fire_end_strategy: 'legacy', fire_end_age: 90, fire_legacy_amount: 50_000, fire_stop_anchor: 'solved' })
    expect(res.status).toBe(500)
    expect(db.updates).toHaveLength(0)
    expect(db.row.fire_end_strategy).toBe('pensioen')
    expect(db.row.fire_end_age).toBe(100)
    expect(db.row.fire_stop_anchor).toBe('aow')
    // En lezen zegt nog steeds het oude plan.
    expect(await getPlan()).toMatchObject({ fire_end_strategy: 'pensioen', fire_stop_anchor: 'aow' })
  })
})

describe('PUT — R2: kruistoets strategie × anker', () => {
  it.each([
    ['pensioen + age 58', { fire_end_strategy: 'pensioen', fire_end_age: 100, fire_stop_anchor: 'age', fire_stop_age: 58 }],
    ['pensioen + aow (consistent, maar de client hoort de eind-vorm te sturen)', { fire_end_strategy: 'pensioen', fire_end_age: 100, fire_stop_anchor: 'aow' }],
    ['nu-stoppen + solved', { fire_end_strategy: 'nu-stoppen', fire_end_age: 90, fire_stop_anchor: 'solved' }],
    ['nu-stoppen + aow', { fire_end_strategy: 'nu-stoppen', fire_end_age: 90, fire_stop_anchor: 'aow' }],
  ])('%s → 400, niets geschreven', async (_naam, body) => {
    const res = await put(body)
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toMatch(/eind-vorm/i)
    expect(db.updates).toHaveLength(0)
  })

  it('de tegenspraak-PUT uit de review: {pensioen, age, 58} echoot NIET 58 terwijl lezen aow zegt', async () => {
    const res = await put({ fire_end_strategy: 'pensioen', fire_end_age: 100, fire_stop_anchor: 'age', fire_stop_age: 58 })
    expect(res.status).toBe(400)
    // De rij is onaangeroerd en lezen geeft het bestaande plan.
    expect(await getPlan()).toMatchObject({ fire_end_strategy: 'deplete', fire_stop_anchor: 'solved', fire_stop_age: null })
  })
})

describe('PUT — R3: symmetrisch contract, geen geladen defaults', () => {
  it('alleen een anker → 400; de rij krijgt NIET stil deplete × aow × 90', async () => {
    // De F3b-client die alleen het anker stuurt, op een M1-rij (pensioen, eindleeftijd 100).
    db.row = { ...BASE_ROW, fire_end_strategy: 'pensioen', fire_end_age: 100, fire_stop_anchor: 'aow' }
    const res = await put({ fire_stop_anchor: 'aow' })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toMatch(/volledige plan/i)
    expect(db.updates).toHaveLength(0)
    expect(db.row.fire_end_strategy).toBe('pensioen')
    expect(db.row.fire_end_age).toBe(100)
  })

  it.each([
    ['strategie zonder eindleeftijd', { fire_end_strategy: 'legacy' }],
    ['eindleeftijd zonder strategie', { fire_end_age: 85 }],
    ['alleen een nalatenschapsbedrag', { fire_legacy_amount: 10_000 }],
    ['anker + eindleeftijd zonder strategie', { fire_end_age: 85, fire_stop_anchor: 'solved' }],
  ])('deel-plan (%s) → 400, niets geschreven', async (_naam, body) => {
    const res = await put(body)
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toMatch(/horen samen|volledige plan/i)
    expect(db.updates).toHaveLength(0)
  })

  it('alleen losse velden (deficit_loan_rate) → 200 en het plan blijft onaangeraakt', async () => {
    db.row = { ...BASE_ROW, fire_end_strategy: 'pensioen', fire_end_age: 100, fire_stop_anchor: 'aow' }
    const res = await put({ deficit_loan_rate: 0.04 })
    expect(res.status).toBe(200)
    expect(db.row.deficit_loan_rate).toBe(0.04)
    expect(planUpdates()).toHaveLength(0)
    expect(db.row.fire_end_strategy).toBe('pensioen')
    expect(db.row.fire_end_age).toBe(100)
    expect(db.row.fire_stop_anchor).toBe('aow')
  })

  it('een lege body is een client-fout → 400, niets geschreven', async () => {
    const res = await put({})
    expect(res.status).toBe(400)
    expect(db.updates).toHaveLength(0)
  })

  it('eind-vorm-alleen (pre-F3b-client) blijft werken en laat het anker met rust', async () => {
    // Een oudere client mag een zelfgekozen stopmoment niet stil op 'solved' zetten.
    db.row.fire_stop_anchor = 'age'
    db.row.fire_stop_age = 62
    const res = await put({ fire_end_strategy: 'deplete', fire_end_age: 90 })
    expect(res.status).toBe(200)
    expect(db.row.fire_stop_anchor).toBe('age')
    expect(db.row.fire_stop_age).toBe(62)
    expect(db.updates.every((u) => !ANCHOR_KEYS.some((k) => k in u))).toBe(true)
  })

  it.each([
    ['pensioen', 'aow'],
    ['nu-stoppen', 'now'],
  ])('eind-vorm-alleen met legacy-label %s schrijft het anker %s mee (geen rij spreekt zichzelf tegen)', async (strategy, anchor) => {
    db.row.fire_stop_anchor = 'age'
    db.row.fire_stop_age = 58
    const res = await put({ fire_end_strategy: strategy, fire_end_age: 100 })
    expect(res.status).toBe(200)
    expect(planUpdates()).toHaveLength(1)
    expect(db.row.fire_stop_anchor).toBe(anchor)
    expect(db.row.fire_stop_age).toBeNull()
    expect(await getPlan()).toMatchObject({ fire_end_strategy: strategy, fire_stop_anchor: anchor, fire_stop_age: null })
  })
})

describe('PUT — R4 (B7): stopleeftijd vs. eindleeftijd', () => {
  it.each([
    ['95 bij eindleeftijd 90', 95, 90],
    ['gelijk aan de eindleeftijd', 90, 90],
    ['89,5 bij eindleeftijd 89', 89.5, 89],
  ])('%s → 400, plan niet stil op eind − 1/12 geklemd', async (_naam, stopAge, endAge) => {
    const res = await put({ fire_end_strategy: 'deplete', fire_end_age: endAge, fire_stop_anchor: 'age', fire_stop_age: stopAge })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toMatch(/vóór de eindleeftijd/i)
    expect(db.updates).toHaveLength(0)
  })

  it('89,5 bij eindleeftijd 90 → 200 (één maand marge is genoeg)', async () => {
    const res = await put({ fire_end_strategy: 'deplete', fire_end_age: 90, fire_stop_anchor: 'age', fire_stop_age: 89.5 })
    expect(res.status).toBe(200)
    expect(db.row.fire_stop_age).toBe(89.5)
  })
})

describe('PUT — validatie van de stopleeftijd (B6)', () => {
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

describe('GET — de tegenspraak-regel (D2) via de ene parser', () => {
  it('een legacy-anker in de oude kolom wint van de nieuwe kolom', async () => {
    // De rij die halverwege de backfill bestaat: oude kolom zegt 'pensioen',
    // nieuwe kolom staat nog op de default.
    db.row.fire_end_strategy = 'pensioen'
    db.row.fire_stop_anchor = 'solved'
    expect((await getPlan()).fire_stop_anchor).toBe('aow')
  })

  it("'nu-stoppen' levert het now-anker, ook naast een age-kolom", async () => {
    db.row.fire_end_strategy = 'nu-stoppen'
    db.row.fire_stop_anchor = 'age'
    db.row.fire_stop_age = 58
    const plan = await getPlan()
    expect(plan.fire_stop_anchor).toBe('now')
    expect(plan.fire_stop_age).toBeNull()
  })

  it('bij een eind-vorm leidt de nieuwe ankerkolom', async () => {
    db.row.fire_end_strategy = 'deplete'
    db.row.fire_stop_anchor = 'age'
    db.row.fire_stop_age = 58
    const plan = await getPlan()
    expect(plan.fire_stop_anchor).toBe('age')
    expect(plan.fire_stop_age).toBe(58)
  })

  it('een geparkeerde pensioen-override (schaduwpad) levert óók het aow-anker', async () => {
    db.row.fire_end_strategy = 'deplete'
    db.row.feature_preferences = { fire_strategy_override: 'pensioen' }
    db.row.fire_stop_anchor = 'solved'
    const plan = await getPlan()
    expect(plan.fire_end_strategy).toBe('pensioen')
    expect(plan.fire_stop_anchor).toBe('aow')
  })
})
