import { describe, it, expect } from 'vitest'
import { buildAssignmentPlan, applyAssignmentPlan, type AssignmentInput } from './category-rules'

function input(overrides: Partial<AssignmentInput> = {}): AssignmentInput {
  return {
    tx: {
      id: 'tx-1',
      counterparty_name: 'Albert Heijn',
      counterparty_iban: 'nl91 abna 0417 1643 00',
      description: 'Betaalautomaat AH 1234',
    },
    siblingIds: [],
    budgetId: 'b-boodschappen',
    scope: 'one',
    isTransfer: false,
    makeShared: false,
    userId: 'u-1',
    ...overrides,
  }
}

describe('buildAssignmentPlan', () => {
  it('scope "one": alleen de transactie zelf, geen regel, geen retro', () => {
    const plan = buildAssignmentPlan(input())
    expect(plan.txUpdate.ids).toEqual(['tx-1'])
    expect(plan.txUpdate.set).toEqual({ budget_id: 'b-boodschappen', category_source: 'manual' })
    expect(plan.rules).toEqual([])
    expect(plan.retro).toBeNull()
  })

  it('scope "these": siblings mee in dezelfde update, geen regel', () => {
    const plan = buildAssignmentPlan(input({ scope: 'these', siblingIds: ['tx-2', 'tx-3'] }))
    expect(plan.txUpdate.ids).toEqual(['tx-1', 'tx-2', 'tx-3'])
    expect(plan.rules).toEqual([])
    expect(plan.retro).toBeNull()
  })

  it('scope "rule": naam-regel + genormaliseerde IBAN-regel + retroactieve update', () => {
    const plan = buildAssignmentPlan(input({ scope: 'rule', siblingIds: ['tx-2'] }))
    expect(plan.txUpdate.ids).toEqual(['tx-1', 'tx-2'])
    expect(plan.rules).toEqual([
      { match_field: 'counterparty_name', match_value: 'Albert Heijn', budget_id: 'b-boodschappen' },
      { match_field: 'counterparty_iban', match_value: 'NL91ABNA0417164300', budget_id: 'b-boodschappen' },
    ])
    expect(plan.retro).toEqual({
      set: { budget_id: 'b-boodschappen', category_source: 'rule' },
      nameFilter: { field: 'counterparty_name', value: 'Albert Heijn' },
      iban: 'NL91ABNA0417164300',
      userId: 'u-1',
    })
  })

  it('zonder counterparty: valt terug op description (substring-retro), geen IBAN-regel zonder IBAN', () => {
    const plan = buildAssignmentPlan(input({
      scope: 'rule',
      tx: { id: 'tx-1', counterparty_name: null, counterparty_iban: null, description: 'Spotify AB' },
    }))
    expect(plan.rules).toEqual([
      { match_field: 'description', match_value: 'Spotify AB', budget_id: 'b-boodschappen' },
    ])
    expect(plan.retro?.nameFilter).toEqual({ field: 'description', value: 'Spotify AB' })
    expect(plan.retro?.iban).toBeNull()
  })

  it('transfer (eigen rekening): category_source "transfer" + transaction_type, ook in retro', () => {
    const plan = buildAssignmentPlan(input({ scope: 'rule', isTransfer: true, budgetId: 'b-eigen' }))
    expect(plan.txUpdate.set).toEqual({
      budget_id: 'b-eigen',
      category_source: 'transfer',
      transaction_type: 'transfer',
    })
    expect(plan.retro?.set).toEqual({
      budget_id: 'b-eigen',
      category_source: 'rule',
      transaction_type: 'transfer',
    })
  })

  it('transfer + scope "rule": eigen-rekening-herkenning (user_own_ibans), géén budget-regels', () => {
    const plan = buildAssignmentPlan(input({ scope: 'rule', isTransfer: true, budgetId: 'b-eigen' }))
    expect(plan.rules).toEqual([])
    expect(plan.ownAccountRule).toEqual({
      matchType: 'iban',
      matchValue: 'NL91ABNA0417164300',
      label: 'Albert Heijn',
      userId: 'u-1',
    })
  })

  it('transfer + scope "rule" zonder IBAN: herkenning op tegenpartij-naam (lowercase)', () => {
    const plan = buildAssignmentPlan(input({
      scope: 'rule',
      isTransfer: true,
      budgetId: 'b-eigen',
      tx: { id: 'tx-1', counterparty_name: 'PayPal Europe', counterparty_iban: null, description: 'x' },
    }))
    expect(plan.ownAccountRule).toEqual({
      matchType: 'name',
      matchValue: 'paypal europe',
      label: 'PayPal Europe',
      userId: 'u-1',
    })
  })

  it('budget-drop (geen transfer) heeft géén ownAccountRule', () => {
    expect(buildAssignmentPlan(input({ scope: 'rule' })).ownAccountRule).toBeNull()
  })

  it('makeShared: ownership "shared" op de directe update (niet op retro)', () => {
    const plan = buildAssignmentPlan(input({ scope: 'rule', makeShared: true }))
    expect(plan.txUpdate.set.ownership).toBe('shared')
    expect(plan.retro?.set).not.toHaveProperty('ownership')
  })
})

// ── applyAssignmentPlan — recording fake voor de Supabase query-builder ──────

type Call = { table: string; op: string; args: unknown[]; filters: [string, ...unknown[]][] }

function fakeSupabase(selectRows: { id: string }[] = []) {
  const calls: Call[] = []
  function builder(table: string, op: string, args: unknown[]) {
    const call: Call = { table, op, args, filters: [] }
    calls.push(call)
    const b = {
      eq: (...a: unknown[]) => { call.filters.push(['eq', ...a]); return b },
      is: (...a: unknown[]) => { call.filters.push(['is', ...a]); return b },
      in: (...a: unknown[]) => { call.filters.push(['in', ...a]); return b },
      ilike: (...a: unknown[]) => { call.filters.push(['ilike', ...a]); return b },
      neq: (...a: unknown[]) => { call.filters.push(['neq', ...a]); return b },
      select: (...a: unknown[]) => { call.filters.push(['select', ...a]); return Promise.resolve({ data: selectRows, error: null }) },
      maybeSingle: () => { call.filters.push(['maybeSingle']); return Promise.resolve({ data: null, error: null }) },
      then: (resolve: (v: { data: null; error: null }) => void) => resolve({ data: null, error: null }),
    }
    return b
  }
  return {
    calls,
    from: (table: string) => ({
      update: (...args: unknown[]) => builder(table, 'update', args),
      delete: (...args: unknown[]) => builder(table, 'delete', args),
      insert: (...args: unknown[]) => builder(table, 'insert', args),
      select: (...args: unknown[]) => builder(table, 'select', args),
    }),
  }
}

/** De fake voldoet structureel; alleen de losse `then`-signatuur botst met PromiseLike. */
function asClient(fake: ReturnType<typeof fakeSupabase>): Parameters<typeof applyAssignmentPlan>[0] {
  return fake as unknown as Parameters<typeof applyAssignmentPlan>[0]
}

describe('applyAssignmentPlan', () => {
  it('chunkt grote id-lijsten per 200', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `tx-${i}`)
    const plan = buildAssignmentPlan(input({ scope: 'these', siblingIds: ids.slice(1) }))
    plan.txUpdate.ids = ids
    const supabase = fakeSupabase()
    await applyAssignmentPlan(asClient(supabase), plan)
    const updates = supabase.calls.filter((c) => c.table === 'transactions' && c.op === 'update')
    expect(updates).toHaveLength(2)
    expect((updates[0].filters[0][2] as string[]).length).toBe(200)
    expect((updates[1].filters[0][2] as string[]).length).toBe(50)
  })

  it('scope "rule": delete per regel, daarna één bulk-insert, dan retro (naam + IBAN) mét tellingen', async () => {
    const plan = buildAssignmentPlan(input({ scope: 'rule' }))
    const supabase = fakeSupabase([{ id: 'x1' }, { id: 'x2' }])
    const result = await applyAssignmentPlan(asClient(supabase), plan)

    const ops = supabase.calls.map((c) => `${c.table}:${c.op}`)
    // 1 tx-update, dan per regel een delete (2 regels), één bulk-insert, dan 2 retro-updates
    expect(ops).toEqual([
      'transactions:update',
      'category_corrections:delete', 'category_corrections:delete',
      'category_corrections:insert',
      'transactions:update', 'transactions:update',
    ])
    // de bulk-insert bevat beide regels (naam + IBAN) mét user_id
    const insertCall = supabase.calls.find((c) => c.table === 'category_corrections' && c.op === 'insert')
    const insertedRows = insertCall?.args[0] as Record<string, unknown>[]
    expect(insertedRows).toHaveLength(2)
    for (const row of insertedRows) {
      expect(row.user_id).toBe('u-1')
    }
    // retro-updates filteren op user + budget_id is null
    const retro = supabase.calls.slice(-2)
    for (const call of retro) {
      expect(call.filters).toContainEqual(['eq', 'user_id', 'u-1'])
      expect(call.filters).toContainEqual(['is', 'budget_id', null])
    }
    expect(result).toEqual({ assigned: 1, ruleCreated: true, bulkUpdated: 4 })
  })

  it('scope "one": alleen de tx-update, geen regels of retro', async () => {
    const supabase = fakeSupabase()
    const result = await applyAssignmentPlan(asClient(supabase), buildAssignmentPlan(input()))
    expect(supabase.calls.map((c) => `${c.table}:${c.op}`)).toEqual(['transactions:update'])
    expect(result).toEqual({ assigned: 1, ruleCreated: false, bulkUpdated: 0 })
  })

  it('transfer + scope "rule": registreert user_own_ibans (check-bestaat → insert), geen category_corrections', async () => {
    const plan = buildAssignmentPlan(input({ scope: 'rule', isTransfer: true, budgetId: 'b-eigen' }))
    const supabase = fakeSupabase([{ id: 'x1' }])
    const result = await applyAssignmentPlan(asClient(supabase), plan)

    const ops = supabase.calls.map((c) => `${c.table}:${c.op}`)
    expect(ops).toEqual([
      'transactions:update',
      'user_own_ibans:select', 'user_own_ibans:insert',
      'transactions:update', 'transactions:update', // retro: naam + IBAN
    ])
    const insert = supabase.calls.find((c) => c.table === 'user_own_ibans' && c.op === 'insert')
    expect(insert?.args[0]).toEqual({
      user_id: 'u-1',
      iban: 'NL91ABNA0417164300',
      match_type: 'iban',
      match_value: 'NL91ABNA0417164300',
      label: 'Albert Heijn',
    })
    expect(result.ruleCreated).toBe(true)
  })
})
