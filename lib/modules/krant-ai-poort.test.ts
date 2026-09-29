import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { ALL_MODULES } from '@/lib/module-registry'
import { AI_ROUTE_BINDINGS } from '@/lib/ai/execution-groups'

/**
 * De AI-poort weigert een Krant-account server-side (Krant 2B, besluit B11).
 *
 * Drie lagen bewijs:
 *   1. `checkTierGate(…, 'ai')` — de ene centrale poort — weigert een Krant-account,
 *      óók met 'ai' in zijn abonnementen, en laat elk ander profiel exact zoals
 *      vóór 2B.
 *   2. Bronscan: élke AI-route roept die poort aan en vertaalt een weigering naar
 *      een 403. De routelijst komt uit het AI-register (`AI_ROUTE_BINDINGS`) plus
 *      de lokale `local-*`-routes en de twee AI-instellingenroutes; routes die de
 *      poort bewust NIET gebruiken staan met reden in `BEWUST_ZONDER_POORT`.
 *   3. Eén echte route-aanroep (GET /api/local-knowledge) met de échte poort:
 *      Krant → 403, Geheel → 200.
 */

// ── 1 + 3: mocks voor de ingelogde client en de service-client ──────────────
const { profileRow, profileSelects, serviceRow } = vi.hoisted(() => ({
  profileRow: { value: null as Record<string, unknown> | null },
  profileSelects: [] as string[],
  serviceRow: { value: { value: [] } as unknown },
}))

function authClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => ({
      select: (cols: string) => {
        if (table === 'profiles') profileSelects.push(cols)
        return {
          eq: () => ({ single: async () => ({ data: profileRow.value, error: null }) }),
        }
      },
    }),
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => authClient()) }))
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: serviceRow.value, error: null }) }) }),
    }),
  }),
}))

import { checkTierGate } from '@/lib/require-tier'
import { GET as localKnowledgeGET } from '@/app/api/local-knowledge/route'
import type { SupabaseClient } from '@supabase/supabase-js'

beforeEach(() => {
  profileRow.value = null
  profileSelects.length = 0
  serviceRow.value = { value: [] }
})

const supabase = () => authClient() as unknown as SupabaseClient

describe('checkTierGate — de centrale AI-poort', () => {
  it('Krant-account met AI-abonnement: toch geweigerd, met reden "krant"', async () => {
    profileRow.value = { active_subscriptions: ['ai'], active_modules: ['nieuws'] }
    const gate = await checkTierGate(supabase(), 'user-1', 'ai')
    expect(gate).not.toBeNull()
    expect(gate?.reason).toBe('krant')
    expect(gate?.error).toMatch(/Krant/)
  })

  it('Krant-account zonder abonnement: geweigerd (reden krant, niet "abonnement")', async () => {
    profileRow.value = { active_subscriptions: [], active_modules: ['nieuws'] }
    const gate = await checkTierGate(supabase(), 'user-1', 'ai')
    expect(gate?.reason).toBe('krant')
  })

  it('één profiel-select, met active_modules erbij — geen extra query', async () => {
    profileRow.value = { active_subscriptions: ['ai'], active_modules: null }
    await checkTierGate(supabase(), 'user-1', 'ai')
    expect(profileSelects).toEqual(['active_subscriptions, active_modules'])
  })

  it.each([
    ['null', null],
    ['alle zes', [...ALL_MODULES]],
    ['kolom afwezig', undefined],
    ['nieuws + budgetteren', ['nieuws', 'budgetteren']],
  ])('Geheel (%s) met AI-abonnement: ongewijzigd door', async (_label, modules) => {
    profileRow.value = { active_subscriptions: ['ai'], active_modules: modules }
    expect(await checkTierGate(supabase(), 'user-1', 'ai')).toBeNull()
  })

  it.each([
    ['null', null],
    ['alle zes', [...ALL_MODULES]],
  ])('Geheel (%s) zónder AI-abonnement: de oude weigering, zonder krant-reden', async (_label, modules) => {
    profileRow.value = { active_subscriptions: [], active_modules: modules }
    const gate = await checkTierGate(supabase(), 'user-1', 'ai')
    expect(gate).toEqual({ subscriptions: [], error: 'Deze functie vereist een AI abonnement' })
  })

  it("de Krant-check geldt alleen voor 'ai' — 'connected' en 'gratis' ongewijzigd", async () => {
    profileRow.value = { active_subscriptions: ['connected'], active_modules: ['nieuws'] }
    expect(await checkTierGate(supabase(), 'user-1', 'connected')).toBeNull()
    expect(await checkTierGate(supabase(), 'user-1', 'gratis')).toBeNull()
  })

  it('geen profielrij: geen Krant-account, de oude abonnementsweigering', async () => {
    profileRow.value = null
    const gate = await checkTierGate(supabase(), 'user-1', 'ai')
    expect(gate?.reason).toBeUndefined()
  })
})

describe('echte route: GET /api/local-knowledge met de échte poort', () => {
  it('Krant-account (mét AI-abonnement) → 403, platte envelope', async () => {
    profileRow.value = { active_subscriptions: ['ai'], active_modules: ['nieuws'] }
    const res = await localKnowledgeGET()
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(body.code).toBe('ai_subscription')
  })

  it('Geheel (alle zes, AI-abonnement) → 200, zoals voorheen', async () => {
    profileRow.value = { active_subscriptions: ['ai'], active_modules: [...ALL_MODULES] }
    const res = await localKnowledgeGET()
    expect(res.status).toBe(200)
  })
})

// ── 2: bronscan over alle AI-routes ────────────────────────────────────────

/** De lokale AI-routes (on-device model) — geen getModel, wel AI; zelfde poort. */
const LOKALE_AI_ROUTES = [
  'app/api/local-chat-overview/route.ts',
  'app/api/local-knowledge/route.ts',
  'app/api/local-news-edition/route.ts',
  'app/api/local-news-sources/route.ts',
  'app/api/local-tips-candidates/route.ts',
  'app/api/local-tips/route.ts',
]

/** AI-instellingen die alleen met AI zin hebben — dragen dezelfde poort. */
const AI_INSTELLINGEN_ROUTES = ['app/api/ai-execution-prefs/route.ts', 'app/api/privacy-mode/route.ts']

/**
 * AI-routes die de poort bewust NIET dragen. Elk met reden; een nieuwe entry is
 * een besluit, geen gemaksoplossing.
 */
const BEWUST_ZONDER_POORT: Record<string, string> = {
  'app/api/news-ingest/cron/route.ts': 'Cron zonder gebruikerssessie; openbare bronnen, geen gebruikersdata.',
  'app/api/admin/news-ingest/route.ts': 'Superadmin-only beheervariant van de ingest; beheer valt buiten de productgrens.',
  'app/api/admin/extraction-test/route.ts':
    'Superadmin-only testbank voor documentextractie; beheer valt buiten de productgrens (privé-gate draagt hij wél).',
}

const AI_ROUTES = [
  ...AI_ROUTE_BINDINGS.map((b) => b.route).filter((r) => !(r in BEWUST_ZONDER_POORT)),
  ...LOKALE_AI_ROUTES,
  ...AI_INSTELLINGEN_ROUTES,
].sort()

function bron(rel: string): string {
  const abs = path.join(process.cwd(), ...rel.split('/'))
  expect(fs.existsSync(abs), `ontbrekend routebestand: ${rel}`).toBe(true)
  return fs.readFileSync(abs, 'utf-8').replace(/\r\n/g, '\n')
}

describe('bronscan — elke AI-route gaat door de centrale poort', () => {
  it('de lijst is niet leeg en bevat de bekende kernroutes', () => {
    expect(AI_ROUTES).toEqual(expect.arrayContaining(['app/api/ai/chat/route.ts', 'app/api/news/route.ts', 'app/api/briefing/refresh/route.ts']))
    expect(AI_ROUTES.length).toBeGreaterThanOrEqual(25)
  })

  it.each(AI_ROUTES)("%s roept checkTierGate(…, 'ai') aan en weigert met een 403", (route) => {
    const src = bron(route)
    expect(src, `${route} importeert de poort niet`).toMatch(/from '@\/lib\/require-tier'/)
    expect(src, `${route} roept checkTierGate(…, 'ai') niet aan`).toMatch(/checkTierGate\([^)]*'ai'\)/)
    // Weigering = de gedeelde 403 (aiSubscriptionRequired) — of, bij de
    // onboarding-helper die zelf geen response bouwt, een `return false` die
    // de AI-stap overslaat.
    const weigert =
      /aiSubscriptionRequired\(/.test(src) || /if \(await checkTierGate\([^)]*'ai'\)\) return false/.test(src)
    expect(weigert, `${route} vertaalt een weigering niet naar een 403`).toBe(true)
  })

  it('elke route die getModel/streamText/generateText aanroept staat op de lijst of heeft een reden', () => {
    const dir = path.join(process.cwd(), 'app', 'api')
    const gevonden: string[] = []
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name)
        if (e.isDirectory()) walk(full)
        else if (e.name === 'route.ts') {
          const src = fs.readFileSync(full, 'utf-8')
          if (/\b(getModel|streamText|generateText|generateObject|streamObject)\(/.test(src)) {
            gevonden.push(path.relative(process.cwd(), full).split(path.sep).join('/'))
          }
        }
      }
    }
    walk(dir)
    const onbekend = gevonden.filter((r) => !AI_ROUTES.includes(r) && !(r in BEWUST_ZONDER_POORT))
    expect(onbekend).toEqual([])
  })
})
