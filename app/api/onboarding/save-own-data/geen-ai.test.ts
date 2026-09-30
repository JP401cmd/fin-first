import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

/**
 * POST /api/onboarding/save-own-data bereikt geen AI-leverancier meer.
 *
 * Tot Krant 2C (30 sep 2026) had deze opslagroute een news-only-tak: bij
 * `activeModules = ['nieuws']` ging de vrije tekst (`newsDescription`) via
 * `extractFinancialData` naar een model, of kwam een client-extractie
 * (`extractionData`) mee, en die werd weggeschreven als bezittingen, schulden,
 * life events en `profiles.financial_context`. Die tak is weg: een
 * Krant-account onboardt via `/onboarding/krant` en schrijft alleen zijn
 * nieuwsprofiel. De kolom `profiles.financial_context` wordt gedropt
 * (migratie `20261010130000`), dus deze route mag hem ook niet meer noemen.
 *
 * Deze suite bewijst twee dingen:
 *  - bron: de route importeert niets uit de AI-laag en noemt de kolommen
 *    `financial_context`/`news_description` niet;
 *  - gedrag: een oude client die `newsDescription` + `extractionData` nog
 *    meestuurt krijgt gewoon een 200, maar er wordt niets uit die velden
 *    weggeschreven.
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/onboarding-bank-cleanup', () => ({
  deleteEmptyOnboardingBankAccounts: vi.fn(async () => undefined),
}))

const mockCreateClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}))

import { POST } from './route'

const USER = { id: 'user-1' }

interface Call {
  table: string
  op: string
  payload: unknown
}

/**
 * Chainable Supabase-dubbel: elke query-methode geeft zichzelf terug en het
 * geheel is awaitable naar `{ data: null, error: null }`. Legt vast WELKE
 * schrijfacties zijn gedaan — dat is wat we hier willen bewijzen.
 */
function buildSupabase(calls: Call[]) {
  const CHAIN = [
    'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'not',
    'order', 'limit', 'maybeSingle', 'single',
  ] as const
  const WRITE = ['insert', 'update', 'upsert', 'delete'] as const

  const from = vi.fn((table: string) => {
    const node: Record<string, unknown> = {
      then: (resolve: (v: { data: null; error: null }) => unknown) =>
        resolve({ data: null, error: null }),
    }
    for (const m of CHAIN) node[m] = () => node
    for (const m of WRITE) {
      node[m] = (payload: unknown) => {
        calls.push({ table, op: m, payload })
        return node
      }
    }
    return node
  })

  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: USER } }) }, from }
}

/** Body zoals een client van vóór 2C 'm voor een news-only-account stuurde. */
function legacyNewsOnlyRequest() {
  return {
    json: () =>
      Promise.resolve({
        identity: {
          full_name: 'Test Gebruiker',
          date_of_birth: '1985-04-01',
          household_type: 'solo',
          number_of_children: 0,
          net_monthly_income: 3500,
        },
        activeModules: ['nieuws'],
        newsDescription: 'Ik heb ongeveer 20.000 euro spaargeld en een hypotheek van 250.000 euro.',
        extractionData: {
          assets: [{ name: 'Spaargeld', asset_type: 'cash', estimated_value: 20000 }],
          debts: [{ name: 'Hypotheek', debt_type: 'mortgage', estimated_balance: 250000 }],
          life_events: [{ name: 'Verhuizen', event_type: 'custom', target_age: 50 }],
          monthly_income_estimate: 9999,
          monthly_expenses_estimate: 8888,
          financial_context_remainder: 'Alleenstaand, huurwoning',
        },
      }),
  } as unknown as Request
}

let calls: Call[]

beforeEach(() => {
  vi.clearAllMocks()
  calls = []
  mockCreateClient.mockResolvedValue(buildSupabase(calls))
})

describe('save-own-data — bron: geen AI-laag, geen financial_context', () => {
  const src = readSourceLF(join(__dirname, 'route.ts'))
  // Alleen code, geen commentaar: de kopcomment legt juist uit wat er weg is.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('importeert niets uit de AI-laag of de AI-poorten', () => {
    const imports = code.match(/from\s+'[^']+'/g) ?? []
    for (const imp of imports) {
      expect(imp).not.toMatch(/'@\/lib\/ai(\/|-credits'|')/)
      expect(imp).not.toMatch(/'@\/lib\/require-tier'/)
    }
  })

  it('noemt de kolommen financial_context en news_description niet', () => {
    expect(code).not.toMatch(/\bfinancial_context\b/)
    expect(code).not.toMatch(/\bnews_description\b/)
  })
})

describe('save-own-data — een oude news-only-body schrijft niets uit de extractie', () => {
  it('200 en afgerond, maar geen extractie-rijen en geen extractie-velden op het profiel', async () => {
    const res = await POST(legacyNewsOnlyRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)

    const upsert = calls.find((c) => c.table === 'profiles' && c.op === 'upsert')
    expect(upsert).toBeDefined()
    const profile = upsert!.payload as Record<string, unknown>
    expect(profile).not.toHaveProperty('financial_context')
    expect(profile).not.toHaveProperty('news_description')
    // Het inkomen komt uit de identity, niet uit de oude AI-schatting.
    expect(profile.net_monthly_income).toBe(3500)
    expect(profile.estimated_monthly_expenses).toBeUndefined()
    expect(profile.completed_onboarding_steps).toEqual(['identity', 'modules'])

    // Geen bezitting of schuld uit `extractionData`.
    expect(calls.some((c) => c.table === 'assets' && c.op === 'insert')).toBe(false)
    expect(calls.some((c) => c.table === 'debts' && c.op === 'insert')).toBe(false)
    // Alleen de standaard AOW-gebeurtenis, niet het geëxtraheerde "Verhuizen".
    const lifeEventInserts = calls.filter((c) => c.table === 'life_events' && c.op === 'insert')
    expect(lifeEventInserts).toHaveLength(1)
    expect((lifeEventInserts[0].payload as Record<string, unknown>).event_type).toBe('aow')

    // En de onboarding is afgerond.
    expect(
      calls.some(
        (c) =>
          c.table === 'profiles' &&
          c.op === 'update' &&
          (c.payload as Record<string, unknown> | null)?.onboarding_completed === true,
      ),
    ).toBe(true)
  })
})
