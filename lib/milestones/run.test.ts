import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runMilestoneDetection, type CompletedGoalInput } from './run'
import type { MilestoneObservation } from './types'

// ── Mini-Supabase ────────────────────────────────────────────────────
//
// Een echte in-memory tabel, geen vi.fn()-ketting: de eigenschap die deze motor
// moet hebben is IDEMPOTENTIE, en die kun je alleen aantonen door tweemaal te
// draaien tegen dezelfde staat. Een mock die alleen registreert dát er een
// upsert kwam, bewijst niets over het resultaat.
//
// De upsert honoreert `ignoreDuplicates` op `(user_id, milestone_key)` — dat is
// exact de unieke sleutel die de migratie legt.

type Row = Record<string, unknown>

interface MockDb {
  profiles: Row[]
  achieved_milestones: Row[]
  net_worth_snapshots: Row[]
}

interface MockCalls {
  upserts: { table: string; rows: Row[]; options: Record<string, unknown> | undefined }[]
  updates: { table: string; payload: Row }[]
}

type Filter = { op: 'eq' | 'neq' | 'is' | 'gte'; column: string; value: unknown }

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const v = row[f.column]
    switch (f.op) {
      case 'eq':
        return v === f.value
      case 'neq':
        return v !== f.value
      case 'is':
        return f.value === null ? v === null || v === undefined : v === f.value
      case 'gte':
        return String(v) >= String(f.value)
    }
  })
}

class MockQuery implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: Filter[] = []
  private orderCol: string | null = null
  private orderAsc = true
  private limitN: number | null = null
  private op: 'select' | 'upsert' | 'update' = 'select'
  private payload: Row | Row[] = {}
  private options: Record<string, unknown> | undefined
  private single = false
  private failWith: unknown = null
  private cols = '*'

  constructor(
    private table: keyof MockDb,
    private db: MockDb,
    private calls: MockCalls,
    failures: Partial<Record<string, unknown>>,
    private blindKeyRead = false,
  ) {
    this.failWith = failures[table] ?? null
  }

  select(cols?: string) {
    if (cols) this.cols = cols
    return this
  }
  eq(column: string, value: unknown) {
    this.filters.push({ op: 'eq', column, value })
    return this
  }
  neq(column: string, value: unknown) {
    this.filters.push({ op: 'neq', column, value })
    return this
  }
  is(column: string, value: unknown) {
    this.filters.push({ op: 'is', column, value })
    return this
  }
  gte(column: string, value: unknown) {
    this.filters.push({ op: 'gte', column, value })
    return this
  }
  order(column: string, opts?: { ascending?: boolean }) {
    this.orderCol = column
    this.orderAsc = opts?.ascending !== false
    return this
  }
  limit(n: number) {
    this.limitN = n
    return this
  }
  maybeSingle() {
    this.single = true
    return this
  }
  upsert(rows: Row[], options?: Record<string, unknown>) {
    this.op = 'upsert'
    this.payload = rows
    this.options = options
    return this
  }
  update(payload: Row) {
    this.op = 'update'
    this.payload = payload
    return this
  }

  private run(): { data: unknown; error: unknown } {
    if (this.failWith) return { data: null, error: this.failWith }

    if (this.op === 'upsert') {
      const rows = this.payload as Row[]
      this.calls.upserts.push({ table: this.table, rows, options: this.options })
      const target = this.db[this.table]
      for (const row of rows) {
        const dupe = target.some(
          (existing) =>
            existing.user_id === row.user_id && existing.milestone_key === row.milestone_key,
        )
        // ON CONFLICT DO NOTHING
        if (dupe && this.options?.ignoreDuplicates) continue
        if (dupe) throw new Error('unique violation (ignoreDuplicates stond uit)')
        target.push({ id: `row-${target.length + 1}`, ...row })
      }
      return { data: null, error: null }
    }

    if (this.op === 'update') {
      this.calls.updates.push({ table: this.table, payload: this.payload as Row })
      for (const row of this.db[this.table]) {
        if (matches(row, this.filters)) Object.assign(row, this.payload as Row)
      }
      return { data: null, error: null }
    }

    // Race-simulatie: de "welke sleutels heeft deze gebruiker al"-lees mist een
    // rij die er wél staat (twee kruisende requests). De unieke sleutel moet het
    // dan alsnog opvangen.
    if (this.blindKeyRead && this.table === 'achieved_milestones' && this.cols === 'milestone_key') {
      return { data: [], error: null }
    }

    let rows = this.db[this.table].filter((r) => matches(r, this.filters))
    if (this.orderCol) {
      const col = this.orderCol
      rows = [...rows].sort((a, b) => {
        const av = String(a[col] ?? '')
        const bv = String(b[col] ?? '')
        return this.orderAsc ? av.localeCompare(bv) : bv.localeCompare(av)
      })
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN)
    return this.single ? { data: rows[0] ?? null, error: null } : { data: rows, error: null }
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    try {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected)
    } catch (err) {
      return Promise.reject(err).then(onfulfilled, onrejected)
    }
  }
}

function createMockClient(
  db: MockDb,
  failures: Partial<Record<string, unknown>> = {},
  opts: { blindKeyRead?: boolean; calls?: MockCalls } = {},
): { client: SupabaseClient; calls: MockCalls } {
  const calls: MockCalls = opts.calls ?? { upserts: [], updates: [] }
  const client = {
    from: (table: keyof MockDb) =>
      new MockQuery(table, db, calls, failures, opts.blindKeyRead === true),
  } as unknown as SupabaseClient
  return { client, calls }
}

const USER = 'user-1'

function emptyDb(seededAt: string | null = null, milestones: Row[] = [], snapshots: Row[] = []): MockDb {
  return {
    profiles: [{ id: USER, milestones_seeded_at: seededAt }],
    achieved_milestones: milestones,
    net_worth_snapshots: snapshots,
  }
}

const RICH: MilestoneObservation = {
  netWorth: 120_000,
  freedomPct: 30,
  totalDebts: 0,
  emergencyFundMonthsCovered: 6,
  emergencyFundTargetMonths: 3,
}

const POOR: MilestoneObservation = {
  netWorth: 500,
  freedomPct: 2,
  totalDebts: 15_000,
  emergencyFundMonthsCovered: 0.2,
  emergencyFundTargetMonths: 3,
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  errorSpy.mockRestore()
})

// ── Seed-pad ─────────────────────────────────────────────────────────

describe('runMilestoneDetection — seed-pad (eerste run viert niets)', () => {
  it('logt alles stil, zet de seed-markering en geeft geen verse mijlpaal', async () => {
    const db = emptyDb(null)
    const { client, calls } = createMockClient(db)

    const result = await runMilestoneDetection(client, USER, RICH, [
      { id: 'goal-a', completedAt: '2026-01-05T10:00:00.000Z' },
    ])

    expect(result).toEqual({ fresh: null })

    // Alles acknowledged + source 'seed' — niets is te vieren.
    expect(db.achieved_milestones.length).toBeGreaterThan(0)
    for (const row of db.achieved_milestones) {
      expect(row.source).toBe('seed')
      expect(row.acknowledged_at).not.toBeNull()
    }

    // De seed-markering is gezet.
    expect(calls.updates).toHaveLength(1)
    expect(calls.updates[0].table).toBe('profiles')
    expect(calls.updates[0].payload.milestones_seeded_at).toEqual(expect.any(String))
    expect(db.profiles[0].milestones_seeded_at).toEqual(expect.any(String))
  })

  it('dateert vermogen en vrijheid historisch uit de vroegste passende snapshot', async () => {
    const db = emptyDb(null, [], [
      { user_id: USER, snapshot_date: '2025-03-01', net_worth: '5000', freedom_percentage: '4' },
      // NUMERIC komt als string binnen; lexicografisch is "9000" > "10000",
      // dus zonder expliciete cast zou dít de 10k-datering worden.
      { user_id: USER, snapshot_date: '2025-06-01', net_worth: '9000', freedom_percentage: '9' },
      { user_id: USER, snapshot_date: '2025-09-01', net_worth: '40000', freedom_percentage: '27' },
      { user_id: USER, snapshot_date: '2026-02-01', net_worth: '120000', freedom_percentage: '30' },
      // Snapshot van iemand anders: mag de datering nooit beïnvloeden.
      { user_id: 'iemand-anders', snapshot_date: '2020-01-01', net_worth: '999999', freedom_percentage: '99' },
    ])
    const { client } = createMockClient(db)

    await runMilestoneDetection(client, USER, RICH, [])

    const byKey = Object.fromEntries(
      db.achieved_milestones.map((r) => [r.milestone_key as string, r.achieved_at as string]),
    )
    expect(byKey['vermogen-10k']).toContain('2025-09-01')
    expect(byKey['vermogen-25k']).toContain('2025-09-01')
    expect(byKey['vermogen-100k']).toContain('2026-02-01')
    expect(byKey['vrijheid-25']).toContain('2025-09-01')
  })

  it('valt terug op nu wanneer geen snapshot de drempel haalt', async () => {
    const db = emptyDb(null, [], [
      { user_id: USER, snapshot_date: '2025-03-01', net_worth: '10', freedom_percentage: '0' },
    ])
    const { client } = createMockClient(db)

    await runMilestoneDetection(client, USER, RICH, [])
    const row = db.achieved_milestones.find((r) => r.milestone_key === 'vermogen-100k')
    expect(row?.achieved_at).toEqual(expect.any(String))
    expect(String(row?.achieved_at)).not.toContain('2025-03-01')
  })

  it('logt reeds gepasseerde checkpoints STIL op het seed-pad', async () => {
    const db = emptyDb()
    const { client } = createMockClient(db)

    const result = await runMilestoneDetection(client, USER, POOR, [], [
      { id: 'g1', name: 'Wereldreis', progressPct: 60 },
    ])

    expect(result.fresh).toBeNull()
    const keys = db.achieved_milestones.map((r) => r.milestone_key).sort()
    expect(keys).toEqual(['doel-checkpoint:g1:25', 'doel-checkpoint:g1:50'])
    for (const row of db.achieved_milestones) {
      expect(row.source).toBe('seed')
      expect(row.acknowledged_at).not.toBeNull()
    }
  })

  it('een verse gebruiker zonder gepasseerde drempel komt tóch uit de seed-modus', async () => {
    const db = emptyDb(null)
    const { client, calls } = createMockClient(db)

    const result = await runMilestoneDetection(client, USER, POOR, [])

    expect(result).toEqual({ fresh: null })
    expect(db.achieved_milestones).toHaveLength(0)
    expect(calls.upserts).toHaveLength(0)
    // Zonder deze markering zou de eerste échte €10.000 stil worden ingeslikt.
    expect(db.profiles[0].milestones_seeded_at).toEqual(expect.any(String))
  })

  it('markeert niet als de log niet geschreven kon worden', async () => {
    const db = emptyDb(null)
    const { client, calls } = createMockClient(db, {
      achieved_milestones: { message: 'insert geweigerd' },
    })

    const result = await runMilestoneDetection(client, USER, RICH, [])

    expect(result).toEqual({ fresh: null })
    expect(calls.updates).toHaveLength(0)
    expect(db.profiles[0].milestones_seeded_at).toBeNull()
  })
})

// ── Detect-pad ───────────────────────────────────────────────────────

describe('runMilestoneDetection — detect-pad', () => {
  it('nieuwe drempel geeft een onbevestigde rij terug als verse mijlpaal', async () => {
    const db = emptyDb('2026-01-01T00:00:00.000Z', [
      {
        id: 'm1',
        user_id: USER,
        milestone_key: 'vermogen-10k',
        kind: 'vermogen',
        threshold_value: 10_000,
        observed_value: 11_000,
        achieved_at: '2026-01-01T00:00:00.000Z',
        acknowledged_at: '2026-01-01T00:00:00.000Z',
        source: 'seed',
      },
    ])
    const { client } = createMockClient(db)

    const result = await runMilestoneDetection(client, USER, { ...POOR, netWorth: 26_000 }, [])

    expect(result.fresh).not.toBeNull()
    expect(result.fresh?.milestone_key).toBe('vermogen-25k')
    expect(result.fresh?.source).toBe('detect')
    expect(result.fresh?.acknowledged_at).toBeNull()
  })

  it('één grote sprong over meerdere drempels viert alleen de belangrijkste (geen vieringsregen)', async () => {
    // Review M4: een eerste import van €0 → €60k + 30% vrijheid passeert in één
    // run vier drempels. Zes opeenvolgende vieringen is de devaluatie die ADR
    // 0123 §7 wil voorkomen: alleen de zwaarste kandidaat blijft onbevestigd
    // (vrijheid > vermogen), de rest wordt stil gelogd maar blijft in de log.
    const db = emptyDb('2026-01-01T00:00:00.000Z')
    const { client } = createMockClient(db)

    const result = await runMilestoneDetection(
      client,
      USER,
      { ...POOR, netWorth: 60_000, freedomPct: 30 },
      [],
    )

    const onbevestigd = db.achieved_milestones.filter((r) => r.acknowledged_at === null)
    expect(onbevestigd).toHaveLength(1)
    expect(onbevestigd[0].milestone_key).toBe('vrijheid-25')
    expect(result.fresh?.milestone_key).toBe('vrijheid-25')
    // De stil gelogde drempels staan wél compleet in de log.
    const keys = db.achieved_milestones.map((r) => r.milestone_key).sort()
    expect(keys).toEqual(['vermogen-10k', 'vermogen-25k', 'vermogen-50k', 'vrijheid-25'])
  })

  it('een checkpoint op een ver doel wordt gevierd, maar verliest van een zwaardere drempel in dezelfde run', async () => {
    // Alleen een checkpoint gepasseerd → die is de verse mijlpaal.
    const db1 = emptyDb('2026-01-01T00:00:00.000Z')
    const { client: c1 } = createMockClient(db1)
    const r1 = await runMilestoneDetection(c1, USER, POOR, [], [
      { id: 'g1', name: 'Wereldreis', progressPct: 55 },
    ])
    expect(r1.fresh?.milestone_key).toBe('doel-checkpoint:g1:50')
    expect(r1.fresh?.kind).toBe('doel')

    // Checkpoint + vermogensdrempel in één run → het checkpoint (gewicht 0)
    // wordt stil gelogd, de drempel wint de viering.
    const db2 = emptyDb('2026-01-01T00:00:00.000Z')
    const { client: c2 } = createMockClient(db2)
    const r2 = await runMilestoneDetection(c2, USER, { ...POOR, netWorth: 12_000 }, [], [
      { id: 'g1', name: 'Wereldreis', progressPct: 30 },
    ])
    expect(r2.fresh?.milestone_key).toBe('vermogen-10k')
    const checkpoint = db2.achieved_milestones.find(
      (r) => r.milestone_key === 'doel-checkpoint:g1:25',
    )
    expect(checkpoint).toBeDefined()
    expect(checkpoint?.acknowledged_at).not.toBeNull()
  })

  it('tweemaal draaien voegt niets toe — de tweede upsert wordt niet eens verstuurd', async () => {
    const db = emptyDb('2026-01-01T00:00:00.000Z')
    const { client, calls } = createMockClient(db)

    await runMilestoneDetection(client, USER, RICH, [])
    const afterFirst = db.achieved_milestones.length
    expect(afterFirst).toBeGreaterThan(0)
    expect(calls.upserts).toHaveLength(1)

    await runMilestoneDetection(client, USER, RICH, [])
    expect(db.achieved_milestones).toHaveLength(afterFirst)
    expect(calls.upserts).toHaveLength(1)
  })

  it('een race (bestaande sleutel niet gezien) botst op ignoreDuplicates zonder duplicaat', async () => {
    // De rij staat er al, maar de "bestaande sleutels"-lees mist 'm — precies
    // wat er gebeurt als twee requests elkaar kruisen. De unieke sleutel plus
    // ignoreDuplicates moet dan de tweede rij tegenhouden.
    const db = emptyDb('2026-01-01T00:00:00.000Z')
    const { client, calls } = createMockClient(db)
    await runMilestoneDetection(client, USER, RICH, [])
    const afterFirst = db.achieved_milestones.length

    // Dezelfde tabel, maar de sleutel-lees ziet niets — de motor denkt dus dat
    // alle drempels nieuw zijn en stuurt ze opnieuw de upsert in.
    const blind = createMockClient(db, {}, { blindKeyRead: true, calls })
    await runMilestoneDetection(blind.client, USER, RICH, [])

    expect(db.achieved_milestones).toHaveLength(afterFirst)
    expect(calls.upserts.at(-1)?.options).toMatchObject({
      onConflict: 'user_id,milestone_key',
      ignoreDuplicates: true,
    })
  })

  it('logt een behaald doel STIL — nooit als verse mijlpaal', async () => {
    const db = emptyDb('2026-01-01T00:00:00.000Z')
    const goals: CompletedGoalInput[] = [{ id: 'goal-x', completedAt: '2026-03-02T08:00:00.000Z' }]
    const { client } = createMockClient(db)

    const result = await runMilestoneDetection(client, USER, POOR, goals)

    const goalRow = db.achieved_milestones.find((r) => r.milestone_key === 'doel-behaald:goal-x')
    expect(goalRow).toBeDefined()
    expect(goalRow?.kind).toBe('doel')
    expect(goalRow?.acknowledged_at).not.toBeNull()
    expect(goalRow?.achieved_at).toBe('2026-03-02T08:00:00.000Z')
    // POOR passeert niets, dus de enige rij is het doel — en die is stil.
    expect(result.fresh).toBeNull()
  })

  it('geeft een eerder gelogde, nog onbevestigde mijlpaal terug ook zonder nieuwe kandidaat', async () => {
    const db = emptyDb('2026-01-01T00:00:00.000Z', [
      {
        id: 'm1',
        user_id: USER,
        milestone_key: 'schuldenvrij',
        kind: 'schuldenvrij',
        threshold_value: 0,
        observed_value: 0,
        achieved_at: '2026-08-30T09:00:00.000Z',
        acknowledged_at: null,
        source: 'detect',
      },
    ])
    const { client, calls } = createMockClient(db)

    const result = await runMilestoneDetection(client, USER, { ...POOR, totalDebts: 0 }, [])

    expect(calls.upserts).toHaveLength(0)
    expect(result.fresh?.milestone_key).toBe('schuldenvrij')
  })

  it('kiest de nieuwste onbevestigde rij', async () => {
    const db = emptyDb('2026-01-01T00:00:00.000Z', [
      {
        id: 'm1',
        user_id: USER,
        milestone_key: 'schuldenvrij',
        kind: 'schuldenvrij',
        threshold_value: 0,
        observed_value: 0,
        achieved_at: '2026-08-20T09:00:00.000Z',
        acknowledged_at: null,
        source: 'detect',
      },
      {
        id: 'm2',
        user_id: USER,
        milestone_key: 'vermogen-10k',
        kind: 'vermogen',
        threshold_value: 10_000,
        observed_value: 10_500,
        achieved_at: '2026-08-29T09:00:00.000Z',
        acknowledged_at: null,
        source: 'detect',
      },
    ])
    const { client } = createMockClient(db)

    const result = await runMilestoneDetection(client, USER, POOR, [])
    expect(result.fresh?.milestone_key).toBe('vermogen-10k')
  })

  it('rijen van een andere gebruiker blijven buiten beeld', async () => {
    const db = emptyDb('2026-01-01T00:00:00.000Z', [
      {
        id: 'm1',
        user_id: 'iemand-anders',
        milestone_key: 'vermogen-1m',
        kind: 'vermogen',
        threshold_value: 1_000_000,
        observed_value: 1_000_000,
        achieved_at: '2026-08-30T09:00:00.000Z',
        acknowledged_at: null,
        source: 'detect',
      },
    ])
    const { client } = createMockClient(db)

    const result = await runMilestoneDetection(client, USER, POOR, [])
    expect(result.fresh).toBeNull()
  })
})

// ── Faalgedrag ───────────────────────────────────────────────────────

describe('runMilestoneDetection — faalt zacht', () => {
  it('een leesfout op profiles levert { fresh: null } en schrijft niets', async () => {
    const db = emptyDb(null)
    const { client, calls } = createMockClient(db, { profiles: { message: 'RLS' } })

    const result = await runMilestoneDetection(client, USER, RICH, [])

    expect(result).toEqual({ fresh: null })
    expect(calls.upserts).toHaveLength(0)
    expect(db.achieved_milestones).toHaveLength(0)
  })

  it('een kapotte client gooit niet door naar de aanroeper', async () => {
    const broken = {
      from: () => {
        throw new Error('boem')
      },
    } as unknown as SupabaseClient

    await expect(runMilestoneDetection(broken, USER, RICH, [])).resolves.toEqual({ fresh: null })
  })
})
