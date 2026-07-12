import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkCreditBudget, creditLimitMessage } from './credit-gate'

/**
 * Mock-supabase die de drie parallelle reads van checkCreditBudget dekt:
 *   profiles:    .from('profiles').select().eq().single()
 *   app_settings:.from('app_settings').select().eq().maybeSingle()
 *   ai_usage:    .from('ai_usage').select().eq().gte()   (direct awaited)
 */
function makeMockSupabase(opts: {
  activeSubscriptions?: string[]
  creditConfig?: string | null
  usageRows?: { credits: number }[]
  usageError?: boolean
}) {
  const {
    activeSubscriptions = [],
    creditConfig = null,
    usageRows = [],
    usageError = false,
  } = opts

  const from = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      gte: async () => {
        if (table === 'ai_usage') {
          return usageError
            ? { data: null, error: { message: 'boom' } }
            : { data: usageRows, error: null }
        }
        return { data: null, error: null }
      },
      single: async () => {
        if (table === 'profiles') {
          return { data: { active_subscriptions: activeSubscriptions }, error: null }
        }
        return { data: null, error: null }
      },
      maybeSingle: async () => {
        if (table === 'app_settings') {
          return { data: creditConfig != null ? { value: creditConfig } : null, error: null }
        }
        return { data: null, error: null }
      },
    }
    return chain
  }

  return { from: vi.fn(from) } as unknown as SupabaseClient
}

const NOW = new Date('2026-07-15T12:00:00Z')

describe('checkCreditBudget', () => {
  it('gratis-gebruiker onder budget → allowed', async () => {
    const mock = makeMockSupabase({ usageRows: [{ credits: 10 }] })
    const r = await checkCreditBudget(mock, 'user-1', 'chat', NOW)
    expect(r.allowed).toBe(true)
    expect(r.budget).toBe(50) // DEFAULT gratis
    expect(r.used).toBe(10)
    expect(r.remaining).toBe(40)
  })

  it('ai-abonnee krijgt het hogere budget (500)', async () => {
    const mock = makeMockSupabase({ activeSubscriptions: ['ai'], usageRows: [{ credits: 100 }] })
    const r = await checkCreditBudget(mock, 'user-1', 'chat', NOW)
    expect(r.budget).toBe(500)
    expect(r.allowed).toBe(true)
  })

  it('op de grens: used + kosten == budget → nog allowed', async () => {
    // gratis budget 50, chat kost 1 → 49 gebruikt laat de 50e credit toe.
    const mock = makeMockSupabase({ usageRows: [{ credits: 49 }] })
    const r = await checkCreditBudget(mock, 'user-1', 'chat', NOW)
    expect(r.allowed).toBe(true)
  })

  it('over de grens: used + kosten > budget → geblokkeerd', async () => {
    const mock = makeMockSupabase({ usageRows: [{ credits: 50 }] })
    const r = await checkCreditBudget(mock, 'user-1', 'chat', NOW)
    expect(r.allowed).toBe(false)
    expect(r.remaining).toBe(0)
  })

  it('duurdere feature (recommendations = 2) telt zijn kosten mee', async () => {
    // 49 gebruikt, recommendations kost 2 → 49+2=51 > 50 → geblokkeerd.
    const mock = makeMockSupabase({ usageRows: [{ credits: 49 }] })
    const r = await checkCreditBudget(mock, 'user-1', 'recommendations', NOW)
    expect(r.allowed).toBe(false)
  })

  it('configureerbaar: verlaagd budget uit app_settings slaat eerder om', async () => {
    const mock = makeMockSupabase({
      creditConfig: JSON.stringify({ budgets: { ai: 500, gratis: 5 } }),
      usageRows: [{ credits: 5 }],
    })
    const r = await checkCreditBudget(mock, 'user-1', 'chat', NOW)
    expect(r.budget).toBe(5)
    expect(r.allowed).toBe(false)
  })

  it('retryAfterSeconds wijst naar begin volgende maand', async () => {
    const mock = makeMockSupabase({ usageRows: [] })
    const r = await checkCreditBudget(mock, 'user-1', 'chat', NOW)
    // Van 15 juli 12:00 tot 1 augustus 00:00 (lokale tijd) is > 2 weken.
    expect(r.retryAfterSeconds).toBeGreaterThan(14 * 24 * 3600)
    expect(new Date(r.resetDate).getTime()).toBeGreaterThan(NOW.getTime())
  })

  it('fail-open: DB-leesfout op de teller blokkeert niet', async () => {
    const mock = makeMockSupabase({ usageError: true })
    const r = await checkCreditBudget(mock, 'user-1', 'chat', NOW)
    expect(r.allowed).toBe(true)
  })
})

describe('creditLimitMessage', () => {
  it('bevat het budget en een resetdatum', () => {
    const msg = creditLimitMessage({
      allowed: false,
      used: 50,
      budget: 50,
      remaining: 0,
      resetDate: '2026-08-01T00:00:00.000Z',
      retryAfterSeconds: 1000,
    })
    expect(msg).toContain('50 credits')
    expect(msg).toMatch(/augustus/)
  })
})
