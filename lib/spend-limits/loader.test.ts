/**
 * LOADER-tests voor grenzenpotten — de data-toevoer, niet de rekenregels.
 *
 * Wat hier vastligt is precies wat de motor NIET kan bewaken: hoeveel queries er
 * draaien (compute-gate), hoe het venster in stukken wordt geknipt (max_rows), of
 * een mogelijk afgekapt antwoord eerlijk gemeld wordt, of de aanmaak-ondergrens
 * van de motor daadwerkelijk het RAPPORT bereikt, en of het dagtarief op exact
 * dezelfde bron staat als het bundelveld dat de widget consumeert.
 *
 * De nep-client is BEWUST lokaal en niet `test/helpers/fake-supabase.ts`: die mock
 * kent `spend_limits` en de aggregaat-RPC niet, telt geen RPC-ARGUMENTEN (en
 * juist de chunk-grenzen zijn hier het onderwerp) en wordt door twee parallelle
 * pariteitstests gedeeld — hem uitbreiden zou die tests raken voor iets dat ze
 * niet meten.
 *
 * ── DE NEP-RPC IS EEN PARITY-SPIEGEL, GEEN STUB (10-08-2026) ────────────────
 * `spend_limit_rule_aggregate` bevat de combinatie-semantiek zélf: OF binnen een
 * dimensie, EN tussen de dimensies, en de ontdubbeling per pot. Die logica moet
 * hier meebewegen, want anders zouden deze tests groen blijven terwijl de SQL
 * iets anders doet. Het is dus een HAND-GEBORGD paar met de migratie
 * 20260810120000 — wie de ene aanraakt, raakt de andere aan. De prijs daarvan is
 * bewust betaald: een stub die alleen vaste rijen teruggeeft, zou de ontdubbeling
 * (de kern van "meerdere regels") helemaal niet kunnen bewaken.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadSpendLimitsSection, SPEND_LIMIT_WINDOW_PERIODS } from './loader'
import {
  SPEND_LIMIT_TREND_WINDOW,
  SPEND_LIMIT_WINDOW_BY_PERIOD,
  computeSpendLimitTrend,
} from './engine'
import { spendLimitCounterpartyKey } from './counterparty-key'
import { resolveEffectiveIncomeExpenses } from '@/lib/effective-financials'
import { dailyExpenseRate } from '@/lib/format'
import { recentDailyExpenseRateFromRows } from '@/lib/expense-rate'
import { aggToExpenseRows, type TxMonthAggregateRow } from '@/lib/server-data/tx-aggregates'
import { localMonthBounds, localMonthStartMonthsAgo } from '@/lib/month-range'

type Row = Record<string, unknown>

const NOW = new Date(2026, 7, 8) // zaterdag 8 augustus 2026 — Q3, midden in de maand

/** Eén synthetische transactie waar de nep-RPC op matcht. */
interface FakeTx {
  date: string
  /** Positief uitgavebedrag; wordt intern als negatief bedrag geboekt. */
  spend?: number
  /** Ontvangst (refund/chargeback), positief bedrag. */
  refund?: number
  budgetId?: string | null
  counterpartyName?: string | null
  type?: string | null
}

// ── Nep-client ──────────────────────────────────────────────────────────────

interface FakeOpts {
  limits?: Row[]
  budgets?: Row[]
  profile?: Row | null
  /** Rijen zoals `getCurrentMonthTx` ze levert (venster is diens eigen zorg). */
  monthTx?: Row[]
  /** Transacties waar `spend_limit_rule_aggregate` op matcht. */
  tx?: FakeTx[]
  /** Maandaggregaat-rijen voor `tx_month_aggregate` (voedt alléén het dagtarief). */
  monthAgg?: Row[]
  /** Forceer een afgekapt antwoord: zoveel dummy-rijen per chunk. */
  ruleAggRowCount?: number
  configError?: unknown
}

/** De maandag van de ISO-week waarin `iso` valt — spiegelt de SQL en de motor. */
function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7))
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${dt.getFullYear()}-${mm}-${dd}`
}

function bucketFor(grain: string, date: string): string {
  if (grain === 'day') return date
  if (grain === 'week') return mondayOf(date)
  return `${date.slice(0, 7)}-01`
}

function makeFake(opts: FakeOpts) {
  const tableCalls: string[] = []
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = []

  const tables: Record<string, Row[]> = {
    spend_limits: opts.limits ?? [],
    budgets: opts.budgets ?? [],
    profiles: opts.profile ? [opts.profile] : [],
    // Het maandvenster van getCurrentMonthTx heeft zijn eigen tests; hier zijn de
    // rijen per definitie "de huidige maand".
    transactions: opts.monthTx ?? [],
  }

  function builder(table: string) {
    const filters: { op: string; col: string; val: unknown }[] = []
    const settle = () => {
      let rows = tables[table] ?? []
      for (const f of filters) {
        rows = rows.filter((r) => {
          const v = r[f.col]
          if (f.op === 'eq') return v === f.val
          return true
        })
      }
      const error = table === 'spend_limits' ? (opts.configError ?? null) : null
      return { data: error ? null : rows, error }
    }
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'order', 'gte', 'lt', 'gt', 'lte', 'in', 'limit', 'not', 'is']) {
      q[m] = () => q
    }
    q.eq = (col: string, val: unknown) => {
      filters.push({ op: 'eq', col, val })
      return q
    }
    q.single = () => Promise.resolve({ data: settle().data?.[0] ?? null, error: null })
    q.maybeSingle = q.single
    q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(res, rej)
    return q
  }

  /**
   * De spiegel van `public.spend_limit_rule_aggregate`. Zie de kop van dit
   * bestand: dit is bewust geen stub.
   */
  function ruleAggregate(args: Record<string, unknown>) {
    const from = String(args.p_from ?? '')
    const to = String(args.p_to ?? '')
    const grain = String(args.p_grain ?? 'month')
    const rules = (args.p_rules ?? []) as { p: number; i: number; b: string[]; k: string[] }[]

    if (opts.ruleAggRowCount !== undefined) {
      return {
        data: Array.from({ length: opts.ruleAggRowCount }, () => ({
          rule_index: rules[0]?.i ?? 0,
          bucket_start: from,
          budget_id: null,
          transaction_type: 'expense',
          sum_positief: 0,
          sum_negatief: -1,
          count: 1,
        })),
        error: null,
      }
    }

    const txs = (opts.tx ?? []).filter((t) => t.date >= from && t.date < to)

    // DISTINCT ON (pot, transactie) ORDER BY regelindex — de ontdubbeling.
    const winnerByPotAndTx = new Map<string, { rule: (typeof rules)[number]; tx: FakeTx }>()
    for (const rule of [...rules].sort((a, b) => a.i - b.i)) {
      for (const [idx, t] of txs.entries()) {
        const budgetOk = rule.b.length === 0 || (t.budgetId != null && rule.b.includes(t.budgetId))
        const key = spendLimitCounterpartyKey(t.counterpartyName ?? '')
        const cpOk = rule.k.length === 0 || rule.k.some((k) => k !== '' && key.includes(k))
        if (!budgetOk || !cpOk) continue
        const mapKey = `${rule.p}|${idx}`
        if (winnerByPotAndTx.has(mapKey)) continue
        winnerByPotAndTx.set(mapKey, { rule, tx: t })
      }
    }

    const grouped = new Map<string, Row>()
    for (const { rule, tx: t } of winnerByPotAndTx.values()) {
      const bucket = bucketFor(grain, t.date)
      const budgetId = grain === 'month' && rule.k.length === 0 ? (t.budgetId ?? null) : null
      const type = t.type === undefined ? 'expense' : t.type
      const gk = `${rule.i}|${bucket}|${budgetId}|${type}`
      let row = grouped.get(gk)
      if (!row) {
        row = {
          rule_index: rule.i,
          bucket_start: bucket,
          budget_id: budgetId,
          transaction_type: type,
          sum_positief: 0,
          sum_negatief: 0,
          count: 0,
          matched_names: rule.k.length > 0 ? [] : null,
        }
        grouped.set(gk, row)
      }
      row.sum_positief = Number(row.sum_positief) + (t.refund ?? 0)
      row.sum_negatief = Number(row.sum_negatief) - (t.spend ?? 0)
      row.count = Number(row.count) + 1
      if (rule.k.length > 0 && t.counterpartyName) {
        const names = row.matched_names as string[]
        if (!names.includes(t.counterpartyName)) names.push(t.counterpartyName)
      }
    }

    return { data: [...grouped.values()], error: null }
  }

  const client = {
    from: (table: string) => {
      tableCalls.push(table)
      return builder(table)
    },
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      rpcCalls.push({ fn, args })
      if (fn === 'spend_limit_rule_aggregate') return ruleAggregate(args)
      if (fn === 'tx_month_aggregate') {
        const from = String(args.p_from ?? '')
        const to = String(args.p_to ?? '')
        return {
          data: (opts.monthAgg ?? []).filter((r) => {
            const m = String(r.month)
            return m >= from.slice(0, 7) && m < to.slice(0, 7)
          }),
          error: null,
        }
      }
      return { data: [], error: null }
    },
  } as unknown as SupabaseClient

  return {
    client,
    tableCalls: () => tableCalls,
    tableCallsFor: (t: string) => tableCalls.filter((x) => x === t).length,
    rpcCalls: () => rpcCalls,
    rpcCallsFor: (fn: string) => rpcCalls.filter((c) => c.fn === fn),
  }
}

// ── Fixture-hulpjes ─────────────────────────────────────────────────────────

let ruleIdSeq = 0
function ruleRow(over: Partial<Row> = {}): Row {
  ruleIdSeq += 1
  return {
    id: `r-${ruleIdSeq}`,
    sort_order: 0,
    budget_ids: [],
    include_child_budgets: true,
    counterparty_keys: [],
    counterparty_labels: [],
    ...over,
  }
}

/** Een pot met, tenzij anders gezegd, één tegenpartij-regel op SHELL. */
function limitRow(over: Partial<Row> & { id: string }): Row {
  return {
    name: `Pot ${over.id}`,
    purpose: null,
    // De loader filtert écht op `is_archived: false` (en de mock past dat toe) —
    // een fixture zonder deze kolom zou stil als "gearchiveerd" wegvallen.
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
    limit_amount: 100,
    period: 'month',
    is_active: true,
    spend_limit_rules: [
      ruleRow({ counterparty_keys: ['SHELL'], counterparty_labels: ['Shell'] }),
    ],
    ...over,
  }
}

/** Kortere schrijfwijze voor een budget-regel. */
function budgetRule(budgetIds: string[], includeChildren = true): Row {
  return ruleRow({ budget_ids: budgetIds, include_child_budgets: includeChildren })
}

/** Kortere schrijfwijze voor een tegenpartij-regel. */
function cpRule(labels: string[]): Row {
  return ruleRow({
    counterparty_keys: labels.map((l) => spendLimitCounterpartyKey(l)),
    counterparty_labels: labels,
  })
}

/** Eén tegenpartij-transactie op de vijftiende van de maand. */
function shellTx(month: string, spend: number, day = '15'): FakeTx {
  return { date: `${month}-${day}`, spend, counterpartyName: 'Shell Express' }
}

/** Eén budget-transactie op de vijftiende van de maand. */
function budgetTx(month: string, budgetId: string, spend: number, type: string | null = 'expense'): FakeTx {
  return { date: `${month}-15`, spend, budgetId, type }
}

/** Aggregaat-rij voor `tx_month_aggregate` (dagtarief-pad). */
function aggRow(month: string, budgetId: string, spend: number, type: string | null = 'expense'): Row {
  return {
    month,
    budget_id: budgetId,
    transaction_type: type,
    sum_positief: 0,
    sum_negatief: -spend,
    count: 1,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Compute-gate ────────────────────────────────────────────────────────────

describe('compute-gate', () => {
  it('doet na de configuratie-query NIETS meer bij 0 potten en withBudgetOptions:false (AC-B2-06)', async () => {
    const fake = makeFake({ limits: [] })
    const data = await loadSpendLimitsSection(fake.client, NOW, { withBudgetOptions: false })

    expect(fake.tableCalls()).toEqual(['spend_limits'])
    expect(fake.rpcCalls()).toEqual([])
    expect(data.limits).toEqual([])
    expect(data.budgetOptions).toEqual([])
    expect(data.dailyExpenseRate).toBeNull()
    expect(data.aggregateTruncationSuspected).toBe(false)
  })

  it('haalt bij 0 potten wél de keuzelijst op zodra het formulier die nodig heeft', async () => {
    const fake = makeFake({
      limits: [],
      budgets: [{ id: 'b1', name: 'Boodschappen', parent_id: null, budget_type: 'expense', is_archived: false }],
    })
    const data = await loadSpendLimitsSection(fake.client, NOW)

    expect(fake.tableCallsFor('budgets')).toBe(1)
    expect(fake.rpcCalls()).toEqual([])
    expect(data.budgetOptions).toEqual([
      { id: 'b1', name: 'Boodschappen', hasChildren: false, parentId: null },
    ])
    // Geen potten ⇒ geen dagtarief-afleiding: die is er voor de bedragen van een pot.
    expect(fake.tableCallsFor('profiles')).toBe(0)
  })

  it('slaat de budgets-query over bij uitsluitend tegenpartij-regels zonder keuzelijst', async () => {
    const fake = makeFake({
      limits: [limitRow({ id: 'p1' })],
      tx: [shellTx('2026-07', 40)],
    })
    await loadSpendLimitsSection(fake.client, NOW, {
      withBudgetOptions: false,
      withDailyExpenseRate: false,
    })
    expect(fake.tableCallsFor('budgets')).toBe(0)
  })

  it('houdt de budgets-query bij een budget-regel, óók zonder keuzelijst (kind-oprol + naam)', async () => {
    const fake = makeFake({
      limits: [limitRow({ id: 'p1', spend_limit_rules: [budgetRule(['b1'])] })],
      budgets: [
        { id: 'b1', name: 'Boodschappen', parent_id: null, budget_type: 'expense', is_archived: false },
        { id: 'b2', name: 'Supermarkt', parent_id: 'b1', budget_type: 'expense', is_archived: false },
      ],
      tx: [budgetTx('2026-07', 'b2', 40)],
    })
    const data = await loadSpendLimitsSection(fake.client, NOW, {
      withBudgetOptions: false,
      withDailyExpenseRate: false,
    })

    expect(fake.tableCallsFor('budgets')).toBe(1)
    expect(data.budgetOptions).toEqual([]) // keuzelijst blijft leeg
    expect(data.limits[0].config.rules[0].budgets[0].name).toBe('Boodschappen')
    // Kind-oprol werkt: de €40 stond op het KIND-budget.
    expect(data.limits[0].report.lastClosedPeriod?.periodMatchedAmount).toBe(40)
  })
})

// ── Chunking ────────────────────────────────────────────────────────────────

describe('chunking van het unie-venster', () => {
  it('doet één call per CHUNK — niet per pot en niet per regel (AC-B4-06)', async () => {
    // 5 potten, maar het venster wordt bepaald door de LANGSTE terugblik: een
    // kwartaalpot kijkt 9 kwartalen terug (Q3-2024 t/m Q3-2026 = 26 maanden).
    // Alle vijf rekenen op maand-korrel, dus ze delen één venster en één reeks
    // calls; de regels reizen samen in één `p_rules`.
    const fake = makeFake({
      limits: [
        limitRow({ id: 'p1', period: 'month' }),
        limitRow({ id: 'p2', period: 'month', spend_limit_rules: [cpRule(['AH'])] }),
        limitRow({ id: 'p3', period: 'quarter' }),
        limitRow({ id: 'p4', period: 'month', spend_limit_rules: [budgetRule(['b1'])] }),
        limitRow({ id: 'p5', period: 'quarter', spend_limit_rules: [budgetRule(['b1'])] }),
      ],
      budgets: [{ id: 'b1', name: 'Boodschappen', parent_id: null, budget_type: 'expense', is_archived: false }],
    })
    await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })

    const calls = fake.rpcCallsFor('spend_limit_rule_aggregate')

    // Er zit een budget-only regel bij, dus het antwoord draagt de
    // per-budget-uitsplitsing en wordt in stukken van 4 maanden geknipt:
    // 2024-07 t/m 2026-09 = 26 maanden ⇒ 7 stukken.
    expect(calls).toHaveLength(7)
    // Half-open en sluitend: elk stuk begint waar het vorige eindigt.
    expect(calls[0].args.p_from).toBe('2024-07-01')
    expect(calls[0].args.p_to).toBe('2024-11-01')
    expect(calls[calls.length - 1].args.p_to).toBe('2026-09-01')
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i].args.p_from).toBe(calls[i - 1].args.p_to)
    }

    // ALLE regels van ALLE potten in elke call — niet één call per pot.
    const rules = calls[0].args.p_rules as { p: number; i: number }[]
    expect(rules).toHaveLength(5)
    expect(new Set(rules.map((r) => r.p)).size).toBe(5)
    // De regelindexen zijn uniek: ze zijn de sleutel waarmee de rijen terugvinden.
    expect(new Set(rules.map((r) => r.i)).size).toBe(5)
    expect(calls[0].args.p_grain).toBe('month')
  })

  it('rekt het venster naar 4 kalenderjaren zodra er een jaarpot bij zit', async () => {
    const fake = makeFake({ limits: [limitRow({ id: 'p1', period: 'year' })] })
    await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })

    const calls = fake.rpcCallsFor('spend_limit_rule_aggregate')
    // Zuivere tegenpartij-regel ⇒ geen budget-uitsplitsing ⇒ stukken van 12
    // maanden: 2023-01 t/m 2026-09 = 44 maanden ⇒ 4 stukken.
    expect(calls).toHaveLength(4)
    expect(calls[0].args.p_from).toBe('2023-01-01')
    expect(calls[calls.length - 1].args.p_to).toBe('2026-09-01')
  })

  it('houdt een maandpot op twee stukken over 13 maanden', async () => {
    const fake = makeFake({ limits: [limitRow({ id: 'p1' })] })
    await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })
    const calls = fake.rpcCallsFor('spend_limit_rule_aggregate')
    expect(SPEND_LIMIT_WINDOW_PERIODS).toBe(SPEND_LIMIT_WINDOW_BY_PERIOD.month)
    expect(calls).toHaveLength(2) // 13 maanden past niet in één stuk van 12
    expect(calls[0].args.p_from).toBe('2025-08-01')
    expect(calls[calls.length - 1].args.p_to).toBe('2026-09-01')
  })

  it('vraagt per KORREL een eigen venster op — een dagpot trekt de maandpot niet mee', async () => {
    const fake = makeFake({
      limits: [
        limitRow({ id: 'p-dag', period: 'day' }),
        limitRow({ id: 'p-jaar', period: 'year' }),
      ],
    })
    await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })

    const calls = fake.rpcCallsFor('spend_limit_rule_aggregate')
    const perGrain = new Map<string, typeof calls>()
    for (const c of calls) {
      const g = String(c.args.p_grain)
      perGrain.set(g, [...(perGrain.get(g) ?? []), c])
    }

    // De dagpot kijkt 31 dagen terug (één stuk), de jaarpot 4 kalenderjaren.
    expect(perGrain.get('day')).toHaveLength(1)
    expect(perGrain.get('day')?.[0].args.p_from).toBe('2026-07-09')
    expect(perGrain.get('month')).toHaveLength(4)
    expect(perGrain.get('month')?.[0].args.p_from).toBe('2023-01-01')
  })
})

// ── Truncatie-kanarie ───────────────────────────────────────────────────────

describe('truncatie-kanarie', () => {
  it('meldt een chunk op de max_rows-cap in plaats van stil een te laag getal te tonen (AC-B4-07)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = makeFake({
      limits: [limitRow({ id: 'p1', spend_limit_rules: [budgetRule(['b1'])] })],
      budgets: [{ id: 'b1', name: 'Boodschappen', parent_id: null, budget_type: 'expense', is_archived: false }],
      ruleAggRowCount: 1000,
    })
    const data = await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })

    expect(data.aggregateTruncationSuspected).toBe(true)
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0][0])).toContain('[spend-limits:loader] mogelijke afkapping')
  })

  it('zwijgt bij een normaal antwoord', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = makeFake({
      limits: [limitRow({ id: 'p1', spend_limit_rules: [budgetRule(['b1'])] })],
      budgets: [{ id: 'b1', name: 'Boodschappen', parent_id: null, budget_type: 'expense', is_archived: false }],
      ruleAggRowCount: 999,
    })
    const data = await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })
    expect(data.aggregateTruncationSuspected).toBe(false)
    expect(warn).not.toHaveBeenCalled()
  })
})

// ── Periodesoorten ──────────────────────────────────────────────────────────

describe('kwartaal- en jaarpotten', () => {
  it('rekent een kwartaalpot dóór in plaats van hem over te slaan (FR-B4-02)', async () => {
    const fake = makeFake({
      limits: [limitRow({ id: 'p1', period: 'quarter', limit_amount: 100 })],
      tx: [
        // Q1 2026: alleen januari.
        shellTx('2026-01', 30),
        // Q2 2026: drie maanden samen 120 ⇒ boven de grens van 100.
        shellTx('2026-04', 40),
        shellTx('2026-05', 40),
        shellTx('2026-06', 40),
      ],
    })
    const data = await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })
    const pot = data.limits[0]

    expect(pot.config.period).toBe('quarter')
    expect(pot.report.currentPeriod.periodKey).toBe('2026-Q3')
    expect(pot.report.closedPeriods).toHaveLength(SPEND_LIMIT_WINDOW_BY_PERIOD.quarter - 1)

    const byKey = new Map(pot.report.closedPeriods.map((p) => [p.periodKey, p]))
    expect(byKey.get('2026-Q1')?.periodMatchedAmount).toBe(30)
    expect(byKey.get('2026-Q2')?.periodMatchedAmount).toBe(120)
    expect(byKey.get('2026-Q2')?.status).toBe('exceeded')
    expect(byKey.get('2026-Q2')?.periodOverAmount).toBe(20)
  })

  it('levert uitsluitend echte kalenderkwartalen — geen verzonnen periodesleutels (AC-B4-08)', async () => {
    const fake = makeFake({
      limits: [limitRow({ id: 'p1', period: 'quarter', limit_amount: 100 })],
      tx: [shellTx('2026-04', 40), shellTx('2026-07', 10)],
    })
    const data = await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })
    const report = data.limits[0].report

    for (const p of [...report.closedPeriods, report.currentPeriod]) {
      expect(p.periodKey).toMatch(/^\d{4}-Q[1-4]$/)
      expect(Number.isFinite(p.periodMatchedAmount)).toBe(true)
    }
    expect(report.closedPeriods.filter((p) => p.matchedTransactionCount > 0)).toHaveLength(1)
    expect(report.trend.recentAvgMatchedAmount).not.toBeNaN()
  })

  it('rekent een jaarpot over twaalf kalendermaanden (AC-B4-04)', async () => {
    const maanden = Array.from({ length: 12 }, (_, i) =>
      shellTx(`2025-${String(i + 1).padStart(2, '0')}`, 10),
    )
    const fake = makeFake({
      limits: [limitRow({ id: 'p1', period: 'year', limit_amount: 1000 })],
      tx: [shellTx('2024-12', 999), ...maanden],
    })
    const data = await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })
    const byKey = new Map(data.limits[0].report.closedPeriods.map((p) => [p.periodKey, p]))
    expect(byKey.get('2025')?.periodMatchedAmount).toBe(120)
    expect(byKey.get('2024')?.periodMatchedAmount).toBe(999)
  })
})

describe('dag- en weekpotten', () => {
  it('rekent een dagpot per kalenderdag door', async () => {
    const fake = makeFake({
      limits: [limitRow({ id: 'p1', period: 'day', limit_amount: 10 })],
      tx: [shellTx('2026-08', 25, '06'), shellTx('2026-08', 4, '07')],
    })
    const data = await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })
    const report = data.limits[0].report

    expect(data.limits[0].config.period).toBe('day')
    expect(report.currentPeriod.periodKey).toBe('2026-08-08')
    const byKey = new Map(report.closedPeriods.map((p) => [p.periodKey, p]))
    expect(byKey.get('2026-08-06')?.periodMatchedAmount).toBe(25)
    expect(byKey.get('2026-08-06')?.status).toBe('exceeded')
    expect(byKey.get('2026-08-07')?.periodMatchedAmount).toBe(4)
    expect(byKey.get('2026-08-07')?.status).toBe('within')
    // 31 periodes in het venster, waarvan 30 afgesloten.
    expect(report.streaks.closedPeriodCount).toBe(SPEND_LIMIT_WINDOW_BY_PERIOD.day - 1)
  })

  it('rekent een weekpot per ISO-week (maandag t/m zondag) door', async () => {
    const fake = makeFake({
      limits: [limitRow({ id: 'p1', period: 'week', limit_amount: 50 })],
      // Zondag 2 augustus valt nog in de wéék van maandag 27 juli;
      // maandag 3 augustus begint de volgende.
      tx: [shellTx('2026-08', 60, '02'), shellTx('2026-08', 20, '03')],
    })
    const data = await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })
    const report = data.limits[0].report

    const byKey = new Map(report.closedPeriods.map((p) => [p.periodKey, p]))
    // Week van maandag 27 juli t/m zondag 2 augustus = ISO-week 31 van 2026.
    expect(byKey.get('2026-W31')?.periodMatchedAmount).toBe(60)
    expect(byKey.get('2026-W31')?.status).toBe('exceeded')

    // 8 augustus is een zaterdag, dus de week van maandag 3 augustus (W32) LOOPT
    // nog. Die hoort dus NIET in de afgesloten periodes — de boeking van 3
    // augustus zit in de lopende, voorlopige week.
    expect(report.currentPeriod.periodKey).toBe('2026-W32')
    expect(report.currentPeriod.periodMatchedAmount).toBe(20)
    expect(report.currentPeriod.since).toBe('2026-08-03')
    expect(report.currentPeriod.until).toBe('2026-08-09')
    expect(byKey.has('2026-W32')).toBe(false)
  })

  it('vraagt de dag-korrel op bij een dagpot, niet de maand-korrel', async () => {
    const fake = makeFake({ limits: [limitRow({ id: 'p1', period: 'day' })] })
    await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })
    for (const c of fake.rpcCallsFor('spend_limit_rule_aggregate')) {
      expect(c.args.p_grain).toBe('day')
    }
  })
})

// ── Meerdere regels ─────────────────────────────────────────────────────────

describe('meerdere regels per pot', () => {
  it('telt de regels bij elkaar op tegen één grensbedrag', async () => {
    const fake = makeFake({
      limits: [
        limitRow({
          id: 'p1',
          limit_amount: 100,
          spend_limit_rules: [budgetRule(['b1']), cpRule(['Shell'])],
        }),
      ],
      budgets: [{ id: 'b1', name: 'Boodschappen', parent_id: null, budget_type: 'expense', is_archived: false }],
      tx: [
        budgetTx('2026-07', 'b1', 60),
        { date: '2026-07-20', spend: 30, counterpartyName: 'Shell Express', budgetId: 'b9' },
      ],
    })
    const data = await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })
    const juli = data.limits[0].report.closedPeriods.find((p) => p.periodKey === '2026-07')

    expect(juli?.periodMatchedAmount).toBe(90)
    expect(juli?.status).toBe('within')
    expect(data.limits[0].config.ruleType).toBe('mixed')
  })

  it('telt een transactie die TWEE regels raakt maar één keer (geen dubbeltelling)', async () => {
    const fake = makeFake({
      limits: [
        limitRow({
          id: 'p1',
          limit_amount: 100,
          spend_limit_rules: [budgetRule(['b1']), cpRule(['Shell'])],
        }),
      ],
      budgets: [{ id: 'b1', name: 'Boodschappen', parent_id: null, budget_type: 'expense', is_archived: false }],
      // Deze ENE transactie hangt aan b1 én heet Shell: hij matcht beide regels.
      tx: [{ date: '2026-07-15', spend: 40, budgetId: 'b1', counterpartyName: 'Shell Express' }],
    })
    const data = await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })
    const juli = data.limits[0].report.closedPeriods.find((p) => p.periodKey === '2026-07')

    // 40, niet 80 — de ontdubbeling rekent hem toe aan de EERSTE regel.
    expect(juli?.periodMatchedAmount).toBe(40)
    expect(juli?.matchedTransactionCount).toBe(1)
  })

  it('splitst per REGEL uit, en die som is exact het periodebedrag', async () => {
    const budgetR = budgetRule(['b1'])
    const cpR = cpRule(['Shell'])
    const fake = makeFake({
      limits: [limitRow({ id: 'p1', limit_amount: 500, spend_limit_rules: [budgetR, cpR] })],
      budgets: [{ id: 'b1', name: 'Boodschappen', parent_id: null, budget_type: 'expense', is_archived: false }],
      tx: [
        budgetTx('2026-07', 'b1', 60),
        { date: '2026-07-20', spend: 30, counterpartyName: 'Shell Express', budgetId: 'b9' },
      ],
    })
    const data = await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })
    const juli = data.limits[0].ruleSplit.filter((r) => r.periodKey === '2026-07')

    expect(juli).toHaveLength(2)
    expect(juli.find((r) => r.ruleId === budgetR.id)?.matchedAmount).toBe(60)
    expect(juli.find((r) => r.ruleId === cpR.id)?.matchedAmount).toBe(30)

    const periode = data.limits[0].report.closedPeriods.find((p) => p.periodKey === '2026-07')
    expect(juli.reduce((s, r) => s + r.matchedAmount, 0)).toBe(periode?.periodMatchedAmount)
  })

  it('behandelt een regel met budget ÉN tegenpartij als een EN-voorwaarde', async () => {
    const fake = makeFake({
      limits: [
        limitRow({
          id: 'p1',
          limit_amount: 500,
          spend_limit_rules: [
            ruleRow({
              budget_ids: ['b1'],
              counterparty_keys: ['SHELL'],
              counterparty_labels: ['Shell'],
            }),
          ],
        }),
      ],
      budgets: [{ id: 'b1', name: 'Boodschappen', parent_id: null, budget_type: 'expense', is_archived: false }],
      tx: [
        // Alleen deze telt: goed budget én goede tegenpartij.
        { date: '2026-07-15', spend: 25, budgetId: 'b1', counterpartyName: 'Shell Express' },
        // Goed budget, verkeerde tegenpartij.
        { date: '2026-07-16', spend: 99, budgetId: 'b1', counterpartyName: 'Albert Heijn' },
        // Goede tegenpartij, verkeerd budget.
        { date: '2026-07-17', spend: 99, budgetId: 'b9', counterpartyName: 'Shell Express' },
      ],
    })
    const data = await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })
    const juli = data.limits[0].report.closedPeriods.find((p) => p.periodKey === '2026-07')

    expect(juli?.periodMatchedAmount).toBe(25)
    expect(data.limits[0].config.ruleType).toBe('mixed')
  })

  it('matcht ÉÉN van meerdere budgetten binnen dezelfde regel (OF)', async () => {
    const fake = makeFake({
      limits: [limitRow({ id: 'p1', limit_amount: 500, spend_limit_rules: [budgetRule(['b1', 'b2'])] })],
      budgets: [
        { id: 'b1', name: 'Boodschappen', parent_id: null, budget_type: 'expense', is_archived: false },
        { id: 'b2', name: 'Horeca', parent_id: null, budget_type: 'expense', is_archived: false },
      ],
      tx: [budgetTx('2026-07', 'b1', 20), budgetTx('2026-07', 'b2', 30)],
    })
    const data = await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })

    expect(
      data.limits[0].report.closedPeriods.find((p) => p.periodKey === '2026-07')?.periodMatchedAmount,
    ).toBe(50)
    expect(data.limits[0].config.ruleType).toBe('budget')
  })
})

// ── Per-budget-uitsplitsing ─────────────────────────────────────────────────

describe('per-budget-uitsplitsing', () => {
  it('splitst per (kind)budget per periode uit dezelfde rijen, zonder tweede fetch', async () => {
    const fake = makeFake({
      limits: [limitRow({ id: 'p1', spend_limit_rules: [budgetRule(['b1'])] })],
      budgets: [
        { id: 'b1', name: 'Boodschappen', parent_id: null, budget_type: 'expense', is_archived: false },
        { id: 'b2', name: 'Supermarkt', parent_id: 'b1', budget_type: 'expense', is_archived: false },
      ],
      tx: [
        budgetTx('2026-07', 'b1', 30),
        budgetTx('2026-07', 'b2', 20),
        budgetTx('2026-06', 'b2', 15),
        // Een eigen overboeking telt nergens mee — net als in de motor.
        budgetTx('2026-07', 'b2', 500, 'transfer'),
      ],
    })
    const data = await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })
    const split = data.limits[0].budgetSplit

    const juli = split.filter((s) => s.periodKey === '2026-07')
    expect(juli).toHaveLength(2)
    expect(juli.find((s) => s.budgetId === 'b1')).toMatchObject({ budgetName: 'Boodschappen', matchedAmount: 30 })
    expect(juli.find((s) => s.budgetId === 'b2')).toMatchObject({ budgetName: 'Supermarkt', matchedAmount: 20 })
    expect(split.find((s) => s.periodKey === '2026-06')?.matchedAmount).toBe(15)
    // Som van de uitsplitsing == het periodebedrag van de motor: één waarheid.
    const juliTotaal = juli.reduce((s, r) => s + r.matchedAmount, 0)
    const juliPeriode = data.limits[0].report.closedPeriods.find((p) => p.periodKey === '2026-07')
    expect(juliTotaal).toBe(juliPeriode?.periodMatchedAmount)
  })

  it('blijft leeg bij een tegenpartij-pot (die haalt zijn namen on-demand op)', async () => {
    const fake = makeFake({
      limits: [limitRow({ id: 'p1' })],
      tx: [shellTx('2026-07', 40)],
    })
    const data = await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })
    expect(data.limits[0].budgetSplit).toEqual([])
    // …maar de per-regel-uitsplitsing bestaat er wél, zodat de pane altijd iets
    // te tonen heeft.
    expect(data.limits[0].ruleSplit.find((r) => r.periodKey === '2026-07')?.matchedAmount).toBe(40)
  })

  it('blijft leeg op dag-korrel — de SQL draagt daar bewust geen budget-kolom', async () => {
    const fake = makeFake({
      limits: [limitRow({ id: 'p1', period: 'day', spend_limit_rules: [budgetRule(['b1'])] })],
      budgets: [{ id: 'b1', name: 'Boodschappen', parent_id: null, budget_type: 'expense', is_archived: false }],
      tx: [{ date: '2026-08-06', spend: 12, budgetId: 'b1', type: 'expense' }],
    })
    const data = await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })

    expect(data.limits[0].budgetSplit).toEqual([])
    expect(data.limits[0].ruleSplit.find((r) => r.periodKey === '2026-08-06')?.matchedAmount).toBe(12)
  })
})

// ── Staat van de gekoppelde budgetten + aanmaakdatum ────────────────────────

describe('configuratie-velden die niet uit de spend_limits-rij alleen volgen', () => {
  const budgetPot = (over: Partial<Row> = {}) =>
    limitRow({ id: 'p1', spend_limit_rules: [budgetRule(['b1'])], ...over })

  it('markeert een GEARCHIVEERD budget als zodanig, met naam en historie intact (AC-B1-02)', async () => {
    const fake = makeFake({
      limits: [budgetPot()],
      budgets: [
        { id: 'b1', name: 'Vakantie', parent_id: null, budget_type: 'expense', is_archived: true },
      ],
      tx: [budgetTx('2026-07', 'b1', 40)],
    })
    const { config, report } = (
      await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })
    ).limits[0]

    expect(config.rules[0].budgets[0].archived).toBe(true)
    // Gearchiveerd ≠ verdwenen: naam én doorgerekende historie blijven staan.
    expect(config.rules[0].budgets[0].name).toBe('Vakantie')
    expect(report.closedPeriods.find((p) => p.periodKey === '2026-07')?.periodMatchedAmount).toBe(40)
    // En hij hoort niet in de keuzelijst van het formulier.
    expect((await loadSpendLimitsSection(fake.client, NOW)).budgetOptions).toEqual([])
  })

  it('onderscheidt gearchiveerd van verdwenen', async () => {
    // Budget bestaat niet (meer) in de RLS-zichtbare set: geen naam, en dan is
    // "gearchiveerd" een uitspraak die we niet kunnen doen.
    const fake = makeFake({ limits: [budgetPot()], budgets: [] })
    const { config } = (
      await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })
    ).limits[0]

    expect(config.rules[0].budgets[0].name).toBeNull()
    expect(config.rules[0].budgets[0].archived).toBe(false)
  })

  it('leidt het soort pot af uit de regels in plaats van uit een kolom', async () => {
    const fake = makeFake({ limits: [limitRow({ id: 'p1' })] })
    const { config } = (
      await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })
    ).limits[0]
    expect(config.ruleType).toBe('counterparty')
    expect(config.rules[0].counterparties).toEqual([{ key: 'SHELL', label: 'Shell' }])
  })

  it('draagt de aanmaakdatum door — de ondergrens van betekenis voor reeks-meldingen', async () => {
    const fake = makeFake({
      limits: [limitRow({ id: 'p1', created_at: '2026-07-14T08:30:00Z' })],
    })
    const { config } = (
      await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })
    ).limits[0]
    expect(config.createdAt).toBe('2026-07-14T08:30:00Z')
  })

  it('houdt de regels op formuliervolgorde, ongeacht de volgorde uit de database', async () => {
    const eerste = ruleRow({ sort_order: 0, budget_ids: ['b1'] })
    const tweede = ruleRow({ sort_order: 1, counterparty_keys: ['SHELL'], counterparty_labels: ['Shell'] })
    const fake = makeFake({
      // Bewust omgekeerd aangeleverd: PostgREST garandeert geen volgorde op een
      // ingebedde bron, en de volgorde bepaalt wélke regel een gedeelde
      // transactie vangt.
      limits: [limitRow({ id: 'p1', spend_limit_rules: [tweede, eerste] })],
      budgets: [{ id: 'b1', name: 'Boodschappen', parent_id: null, budget_type: 'expense', is_archived: false }],
    })
    const { config } = (
      await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })
    ).limits[0]

    expect(config.rules.map((r) => r.id)).toEqual([eerste.id, tweede.id])
  })

  it('geeft elke budget-optie zijn ouder mee, zodat de kiezer een boom kan tonen', async () => {
    const fake = makeFake({
      limits: [],
      budgets: [
        { id: 'b1', name: 'Boodschappen', parent_id: null, budget_type: 'expense', is_archived: false },
        { id: 'b2', name: 'Supermarkt', parent_id: 'b1', budget_type: 'expense', is_archived: false },
      ],
    })
    const { budgetOptions } = await loadSpendLimitsSection(fake.client, NOW)

    expect(budgetOptions).toEqual([
      { id: 'b1', name: 'Boodschappen', hasChildren: true, parentId: null },
      { id: 'b2', name: 'Supermarkt', hasChildren: false, parentId: 'b1' },
    ])
  })
})

// ── Aanmaak-ondergrens: bereikt hij het RAPPORT? ────────────────────────────
//
// `computeSpendLimitTrend` past de ondergrens uitsluitend toe wanneer
// `rule.createdAt` gevuld is, en de motor-docstring wijst déze loader aan als de
// enige adapter die dat kan doen. Een motor-test kan dus groen staan terwijl de
// ondergrens in productie dood is; dat is precies wat er gebeurde. Deze suite
// kijkt daarom naar `report.trend` zoals de loader hem teruggeeft.

describe('aanmaak-ondergrens voor de trend (loader → motor)', () => {
  /**
   * Twaalf afgesloten maanden waarvan alleen de laatste twee uitgaven dragen.
   * ZONDER ondergrens: recent = [0, 100, 100] tegen prior = [0, 0, 0] ⇒ prior 0,
   * verandering ≠ 0 ⇒ richting 'worsening' over maanden waarin de pot niet bestond.
   */
  const TX_LAATSTE_TWEE = [shellTx('2026-06', 100), shellTx('2026-07', 100)]

  it('draagt createdAt door, zodat een jonge pot in het RAPPORT trend "unknown" krijgt', async () => {
    const fake = makeFake({
      limits: [limitRow({ id: 'p1', limit_amount: 1000, created_at: '2026-06-01T09:00:00Z' })],
      tx: TX_LAATSTE_TWEE,
    })
    const { report } = (
      await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })
    ).limits[0]

    expect(report.trend.direction).toBe('unknown')
    expect(report.trend.recentAvgMatchedAmount).toBeNull()
    // De reeks bevat UITSLUITEND periodes vanaf de aanmaak — geen lijn over
    // lege pre-bestaan-maanden.
    expect(report.trend.movingAvgMatchedAmountByPeriod.map((p) => p.periodKey)).toEqual([
      '2026-06',
      '2026-07',
    ])

    // DE ANTI-REGRESSIE-GETUIGE: exact dezelfde afgesloten periodes, maar zonder
    // de ondergrens (= het gedrag vóór de fix) leveren een richting op. Draait
    // iemand `createdAt` weer uit de rule-invoer, dan gaat de assertie hierboven
    // om en wijst deze regel aan wát er dan gebeurt.
    expect(computeSpendLimitTrend(report.closedPeriods, SPEND_LIMIT_TREND_WINDOW).direction).toBe(
      'worsening',
    )

    // WAT NIET VERANDERT: de reeks-getallen zien de ondergrens niet (motorcontract).
    expect(report.streaks.closedPeriodCount).toBe(SPEND_LIMIT_WINDOW_BY_PERIOD.month - 1)
  })

  it('laat een pot die ouder is dan zijn venster ongemoeid (ondergrens inert)', async () => {
    const fake = makeFake({
      limits: [limitRow({ id: 'p1', limit_amount: 1000, created_at: '2020-01-01T00:00:00Z' })],
      tx: TX_LAATSTE_TWEE,
    })
    const { report } = (
      await loadSpendLimitsSection(fake.client, NOW, { withDailyExpenseRate: false })
    ).limits[0]

    expect(report.trend.movingAvgMatchedAmountByPeriod).toHaveLength(
      SPEND_LIMIT_WINDOW_BY_PERIOD.month - 1,
    )
    expect(report.trend.direction).toBe('worsening')
  })
})

// ── Dagtarief (vrijheidstijd) — PARITEIT met het bundelveld ─────────────────
//
// De widget van een grenzenpot leest `DashboardData.dailyExpenseRate` (het
// canonieke 12-maands rolling tarief uit `recentDailyExpenseRateFromRows`); de
// pane op de transactiepagina leest `SpendLimitsSectionData.dailyExpenseRate`.
// Twee oppervlakken over dezelfde pot, dus één grondslag — anders spreekt het
// ene scherm het andere tegen over exact hetzelfde bedrag.
//
// Deze suite legt beide op IDENTIEKE INVOER naast elkaar in plaats van een
// verwacht getal na te leggen: de vorige test rekende de losse-kalendermaand-
// conversie zélf na en bevestigde daarmee juist het defect.
//
// TOLERANTIE — bewuste keuze: `toBe` (exacte float-gelijkheid, tolerantie NUL).
// Dat is hier de juiste meetlat en geen strengheid om de strengheid: beide zijden
// draaien dezelfde functie over dezelfde invoer, dus elk verschil — hoe klein ook —
// betekent een andere BRON of een ander VENSTER, niet afrondingsruis. Een epsilon
// zou precies de foutklasse verbergen die deze test moet vangen. Alleen bij de
// ratio-assertie (een dimensieloos getal) is een relatieve `toBeCloseTo` gepast.

describe('dailyExpenseRate — pariteit met DashboardData.dailyExpenseRate', () => {
  const PROFILE_AUTO: Row = {
    id: 'u1',
    net_monthly_income: 5000,
    estimated_monthly_expenses: 0,
    income_source: 'auto',
    expenses_source: 'auto',
  }

  // `getTxAgg12m` berekent zijn 12-maands venster INTERN uit `new Date()` (de
  // React-`cache()`-sleutel mag geen vers object zijn). Zonder bevroren klok
  // hangt het venster — en dus deze suite — aan de dag waarop hij draait.
  // Alleen `Date` wordt gefakete; timers blijven echt, zodat awaits normaal lopen.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * Twaalf maanden × €3.000 in het rolling venster [2025-09, 2026-09).
   * Het maandaggregaat is de bron van het BUNDELVELD; de pot hieronder is een
   * tegenpartij-pot, dus deze rijen raken de potberekening niet — ze voeden
   * uitsluitend het dagtarief.
   */
  const AGG_12M: Row[] = Array.from({ length: 12 }, (_, i) => {
    const maand = i < 4 ? `2025-${String(9 + i).padStart(2, '0')}` : `2026-${String(i - 3).padStart(2, '0')}`
    return aggRow(maand, 'b1', 3000)
  })

  /** De keten die lib/dashboard-data-loader.ts draait voor `DashboardData.dailyExpenseRate`. */
  function bundelDagtarief(agg: Row[], fallbackMonthlyExpenses: number): number {
    return recentDailyExpenseRateFromRows(
      aggToExpenseRows(agg as unknown as TxMonthAggregateRow[], { realOnly: false }),
      NOW,
      fallbackMonthlyExpenses,
    ).dailyRate
  }

  it('is identiek aan het bundelveld op dezelfde invoer (en NIET de kalendermaand-conversie)', async () => {
    // Het scenario uit de bevinding: 8 augustus, €120 geboekt deze maand.
    const monthTx: Row[] = [
      { amount: -120, date: '2026-08-03', budget_id: 'b1', transaction_type: 'expense' },
      // Eigen overboeking: telt in geen van beide paden mee.
      { amount: -9000, date: '2026-08-04', budget_id: null, transaction_type: 'transfer' },
    ]
    const fake = makeFake({
      limits: [limitRow({ id: 'p1' })],
      profile: PROFILE_AUTO,
      monthTx,
      monthAgg: AGG_12M,
      tx: [shellTx('2026-07', 40)],
    })
    const data = await loadSpendLimitsSection(fake.client, NOW, { withBudgetOptions: false })

    // De effective maanduitgaven zijn nog slechts de FALLBACK-invoer.
    const effectief = resolveEffectiveIncomeExpenses(PROFILE_AUTO, 0, 120).expenses
    expect(effectief).toBe(120)

    expect(data.dailyExpenseRate).toBe(bundelDagtarief(AGG_12M, effectief))
    expect(data.dailyExpenseRate).toBeCloseTo((3000 * 12) / 365, 10)

    // En aantoonbaar NIET de afgeschafte losse-kalendermaand-conversie: dat is
    // hier een factor 25 op elke vrijheidstijd-regel (relatieve maatstaf op een
    // dimensieloze verhouding — daarom hier wél toBeCloseTo).
    const oudeGrondslag = dailyExpenseRate(effectief)
    expect(data.dailyExpenseRate).not.toBe(oudeGrondslag)
    expect((data.dailyExpenseRate as number) / oudeGrondslag).toBeCloseTo(25, 10)
  })

  it('vraagt exact het canonieke 12-maands venster op — geen eigen vensterrekening', async () => {
    const fake = makeFake({
      limits: [limitRow({ id: 'p1' })],
      profile: PROFILE_AUTO,
      monthAgg: AGG_12M,
      tx: [shellTx('2026-07', 40)],
    })
    await loadSpendLimitsSection(fake.client, NOW, { withBudgetOptions: false })

    // De potberekening draait op `spend_limit_rule_aggregate`, dus de
    // tx_month_aggregate-calls komen uit twee bronnen: de dagtarief-fetch
    // (`getTxAgg12m`, het volle 12-maands venster) en — sinds de budgetgrondslag
    // op REALISATIE draait (ADR 0103, correctie 11 aug 2026) — drie
    // gechunkte calls van 4 maanden uit `getRealizedBudgetAmounts`.
    //
    // De assertie blijft wat ze was: de dagtarief-fetch gebruikt het CANONIEKE
    // venster en rekent er geen eigen variant op na. Alleen het aantal calls is
    // niet langer 1.
    const calls = fake.rpcCallsFor('tx_month_aggregate')
    const canoniek = calls.filter(
      c =>
        c.args.p_from === localMonthStartMonthsAgo(NOW, 11) &&
        c.args.p_to === localMonthBounds(NOW).end,
    )
    expect(canoniek).toHaveLength(1)
    expect(canoniek[0].args).toEqual({
      p_from: localMonthStartMonthsAgo(NOW, 11),
      p_to: localMonthBounds(NOW).end,
      p_own_only: false,
    })
  })

  it('gebruikt de effective/handmatige inschatting UITSLUITEND als fallback', async () => {
    const manual: Row = { ...PROFILE_AUTO, expenses_source: 'manual', estimated_monthly_expenses: 500 }

    // (a) Geen aggregaat-rijen ⇒ de schatting is de enige grondslag (onboarding
    //     zonder transacties ziet dus geen "0 vrijheid").
    const zonderRijen = makeFake({
      limits: [limitRow({ id: 'p1' })],
      profile: manual,
      monthTx: [],
      tx: [shellTx('2026-07', 40)],
    })
    const a = await loadSpendLimitsSection(zonderRijen.client, NOW, { withBudgetOptions: false })
    expect(a.dailyExpenseRate).toBe(bundelDagtarief([], 500))
    expect(a.dailyExpenseRate).toBeCloseTo((500 * 12) / 365, 10)

    // (b) Mét aggregaat-rijen wint het gemeten rolling tarief — óók van een
    //     handmatige inschatting. Zo blijft er één grondslag per metriek.
    const metRijen = makeFake({
      limits: [limitRow({ id: 'p1' })],
      profile: manual,
      monthTx: [],
      monthAgg: AGG_12M,
      tx: [shellTx('2026-07', 40)],
    })
    const b = await loadSpendLimitsSection(metRijen.client, NOW, { withBudgetOptions: false })
    expect(b.dailyExpenseRate).toBe(bundelDagtarief(AGG_12M, 500))
    expect(b.dailyExpenseRate).not.toBe(dailyExpenseRate(500))
  })

  it('geeft null zonder uitgaven-grondslag in plaats van een verzonnen dagtarief', async () => {
    const fake = makeFake({
      limits: [limitRow({ id: 'p1' })],
      profile: { ...PROFILE_AUTO, estimated_monthly_expenses: 0 },
      monthTx: [],
      monthAgg: [],
      tx: [],
    })
    const data = await loadSpendLimitsSection(fake.client, NOW, { withBudgetOptions: false })
    expect(data.dailyExpenseRate).toBeNull()
  })

  it('raakt profiel, transacties noch het 12-maands aggregaat aan met withDailyExpenseRate:false', async () => {
    const fake = makeFake({
      limits: [limitRow({ id: 'p1' })],
      profile: PROFILE_AUTO,
      monthTx: [{ amount: -1000, date: '2026-08-02', budget_id: null, transaction_type: 'expense' }],
      monthAgg: AGG_12M,
    })
    const data = await loadSpendLimitsSection(fake.client, NOW, {
      withBudgetOptions: false,
      withDailyExpenseRate: false,
    })
    expect(data.dailyExpenseRate).toBeNull()
    expect(fake.tableCallsFor('profiles')).toBe(0)
    expect(fake.tableCallsFor('transactions')).toBe(0)
    // Staat de dagtarief-afleiding uit, dan hoort er geen enkele
    // tx_month_aggregate-call te zijn — de pot rekent op een eigen aggregaat.
    expect(fake.rpcCallsFor('tx_month_aggregate')).toHaveLength(0)
  })
})

// ── Foutpad ─────────────────────────────────────────────────────────────────

describe('foutpad', () => {
  it('levert een lege sectie (en geen crash) als de configuratie-query faalt', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = makeFake({ configError: { message: 'relation does not exist' } })
    const data = await loadSpendLimitsSection(fake.client, NOW)

    expect(data.limits).toEqual([])
    expect(data.budgetOptions).toEqual([])
    expect(data.dailyExpenseRate).toBeNull()
    expect(fake.tableCalls()).toEqual(['spend_limits'])
    expect(err).toHaveBeenCalled()
  })
})
