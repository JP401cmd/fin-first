// ── freedomCalc-tool: één dagtarief overal (B-040) ──────────────────
//
// De tool rekent met het canonieke 12-maands dagtarief dat ook
// /overzicht/bezittingen toont (getRecentDailyExpenseRate). Het model
// levert alleen het bedrag; een meegestuurde noemer is een schemafout.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RecentDailyExpenseRate } from '@/lib/expense-rate'

const getRecentDailyExpenseRate = vi.fn<(...args: unknown[]) => Promise<RecentDailyExpenseRate>>()
vi.mock('@/lib/expense-rate', () => ({
  getRecentDailyExpenseRate: (...args: unknown[]) => getRecentDailyExpenseRate(...args),
}))

import { createFreedomCalcTool, freedomCalcInputSchema } from './freedom-calc'

const supabase = {} as SupabaseClient
const opts = { toolCallId: 't1', messages: [] }

type ToolResult = Record<string, unknown>
async function run(amount: number, s: SupabaseClient = supabase): Promise<ToolResult> {
  const t = createFreedomCalcTool(s)
  return (await t.execute!({ amount }, opts)) as ToolResult
}

beforeEach(() => {
  getRecentDailyExpenseRate.mockReset()
})

describe('createFreedomCalcTool — canoniek dagtarief', () => {
  it('€1.250 bij €251/dag ≈ 4,98 dagen (niet 12,5)', async () => {
    getRecentDailyExpenseRate.mockResolvedValue({
      dailyRate: 251,
      monthlyExpenses: 251 * 365 / 12,
      dataMonths: 12,
      source: 'transactions',
    })
    const r = await run(1250)
    expect(r.error).toBeUndefined()
    expect(r.freedomDays as number).toBeCloseTo(1250 / 251, 1)
    expect(r.dailyExpense).toBe(251)
    expect(r.rateSource).toBe('transactions')
    expect(r.formatted).toBe('5 dagen')
    // De output noemt het gebruikte tarief, zodat Fin het kan uitleggen.
    expect(String(r.rateExplanation)).toContain('251')
    expect(String(r.rateExplanation)).toContain('12 maanden')
  })

  it('leest het tarief via dezelfde aanroep als de bezittingen-loader (supabase, peildatum, geen terugval)', async () => {
    getRecentDailyExpenseRate.mockResolvedValue({ dailyRate: 100, monthlyExpenses: 3041.67, dataMonths: 12, source: 'transactions' })
    await run(500)
    expect(getRecentDailyExpenseRate).toHaveBeenCalledTimes(1)
    const args = getRecentDailyExpenseRate.mock.calls[0]
    expect(args[0]).toBe(supabase)
    expect(args[1]).toBeInstanceOf(Date)
    expect(args).toHaveLength(2)
  })

  it('haalt het tarief één keer op per request, ook bij meerdere tool-calls', async () => {
    getRecentDailyExpenseRate.mockResolvedValue({ dailyRate: 100, monthlyExpenses: 3041.67, dataMonths: 12, source: 'transactions' })
    const t = createFreedomCalcTool(supabase)
    await t.execute!({ amount: 100 }, opts)
    await t.execute!({ amount: 200 }, { ...opts, toolCallId: 't2' })
    expect(getRecentDailyExpenseRate).toHaveBeenCalledTimes(1)
  })

  it('zonder dagtarief (geen historie) → nette fout, geen terugval', async () => {
    getRecentDailyExpenseRate.mockResolvedValue({ dailyRate: 0, monthlyExpenses: 0, dataMonths: 0, source: 'none' })
    const r = await run(1250)
    expect(typeof r.error).toBe('string')
    expect(r.freedomDays).toBeUndefined()
  })

  it('als het ophalen faalt → nette fout, geen stacktrace naar het model', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    getRecentDailyExpenseRate.mockRejectedValue(new Error('db down: secret detail'))
    const r = await run(1250)
    expect(typeof r.error).toBe('string')
    expect(String(r.error)).not.toContain('secret detail')
    spy.mockRestore()
  })
})

describe('freedomCalcInputSchema — het model levert geen noemer meer', () => {
  it('accepteert alleen amount', () => {
    expect(freedomCalcInputSchema.safeParse({ amount: 1250 }).success).toBe(true)
  })

  it('weigert monthlyMustExpenses / monthlyExpenses / dailyExpense', () => {
    expect(freedomCalcInputSchema.safeParse({ amount: 1250, monthlyMustExpenses: 3000 }).success).toBe(false)
    expect(freedomCalcInputSchema.safeParse({ amount: 1250, monthlyExpenses: 3000 }).success).toBe(false)
    expect(freedomCalcInputSchema.safeParse({ amount: 1250, dailyExpense: 100 }).success).toBe(false)
  })

  it('heeft amount als enige veld', () => {
    expect(Object.keys(freedomCalcInputSchema.shape)).toEqual(['amount'])
  })
})
