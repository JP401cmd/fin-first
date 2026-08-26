import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FinancialInput } from '@/lib/horizon-data'
import { computeFireProjection } from '@/lib/horizon-data'
import { computeScalarFireProjection } from '@/lib/horizon-kernel/scalar-router'
import { resolveFireParams } from '@/lib/fire-params'
import { resolveSavingsSource } from '@/lib/savings-source'

/**
 * GET /api/report — de FIRE-leeftijd van het PDF-rapport komt uit de horizon-kernel.
 *
 * ## Waarom deze test bestaat
 *
 * Het rapport riep de legacy scalar `computeFireProjection` (`lib/horizon/fire-scalar.ts`,
 * via de barrel `lib/horizon-data`) rechtstreeks aan, terwijl de rest van de app de
 * FIRE-leeftijd al uit de horizon-kernel consumeerde: `loadDashboardData` →
 * `fireProjResult` (= `computeScalarFireProjection(...).result`), de deelbare
 * vrijheidskaart (`app/api/share/freedom-card/route.ts`) en /toekomst. Twee motoren op
 * één grootheid → een gedeeld/afgedrukt artefact dat de app tegensprak. Op het
 * fixture-profiel hieronder scheelt dat ~5 jaar; dat is geen afrondingsruis maar een
 * structureel verschil (gesloten-vorm uitgaven/SWR vs. behoefte-/eindstrategie-solve).
 *
 * ## Twee soorten assertie, met opzet
 *
 *  1. **Broncontrole** — de routes IMPORTEREN de kernel-router en dragen geen eigen
 *     `computeFireProjection(`-aanroep meer. Rood op de code van vóór de fix. Dit is de
 *     assertie die bijt zodra iemand de legacy-motor terugzet: een puur numerieke test
 *     kan dat niet betrappen zolang beide motoren "een getal" opleveren.
 *  2. **Gedragspin** — de route wordt écht gedraaid (Supabase-stub) en het geleverde
 *     `horizon.fireAge`/`fireDate` moet exact gelijk zijn aan `computeScalarFireProjection`
 *     op dezelfde invoer, én meetbaar afwijken van de legacy-uitkomst. Zo bewijst de test
 *     dat de kernel-tak daadwerkelijk het antwoord levert en niet alleen geïmporteerd is.
 *
 * De verwachte invoer wordt in de test NIET opnieuw uitgerekend maar via dezelfde
 * canonieke helpers samengesteld als de route (`resolveFireParams`, `resolveSavingsSource`),
 * zodat de spiegel niet stilletjes uit de pas kan lopen met de bron.
 */

const { mockCreateClient, mockCheckTierGate, mockIsCloudAllowed, mockDailyRate } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockCheckTierGate: vi.fn(),
  mockIsCloudAllowed: vi.fn(),
  mockDailyRate: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
  getAuthClaims: vi.fn(),
}))
vi.mock('@/lib/require-tier', () => ({ checkTierGate: mockCheckTierGate }))
vi.mock('@/lib/ai/privacy-gate', () => ({
  isCloudAllowed: mockIsCloudAllowed,
  PRIVACY_GATE_CODE: 'privacy_mode_active',
}))
vi.mock('@/lib/expense-rate', () => ({ getRecentDailyExpenseRate: mockDailyRate }))

import { GET, POST, DELETE } from './route'

// ── Fixture ──────────────────────────────────────────────────────────────────
// Bewust het profiel uit de bug-analyse: vermogen €180k, schuld €20k, geboren
// 15-04-1990, €24k essentiële jaaruitgaven, handmatig inkomen/uitgaven → €900
// maandsurplus, 7 % rendement, 2 % inflatie.
const DOB = '1990-04-15'

const PROFILE_ROW = {
  full_name: 'Testgebruiker',
  date_of_birth: DOB,
  expected_return: 0.07,
  inflation_rate: 0.02,
  box3_method: null,
  marginaal_tarief: null,
  net_monthly_income: 4000,
  estimated_monthly_expenses: 3100,
  income_source: 'manual',
  expenses_source: 'manual',
  housing_strategy_config: null,
}

const ESSENTIAL_BUDGET = {
  id: 'budget-vast',
  name: 'Vaste lasten',
  slug: 'vaste-lasten',
  icon: 'home',
  budget_type: 'expense',
  default_limit: 2000, // maandelijks → €24.000/jaar essentieel
  interval: 'monthly',
  is_essential: true,
  parent_id: null,
}

const ASSET_ROW = {
  id: 'asset-1',
  name: 'Beleggingsrekening',
  asset_type: 'investment',
  current_value: 180000,
  woz_value: null,
  monthly_contribution: 0,
  expected_return: 7,
  is_active: true,
  net_worth_inclusion_pct: 100,
}

const DEBT_ROW = {
  id: 'debt-1',
  name: 'Persoonlijke lening',
  debt_type: 'personal_loan',
  original_amount: 30000,
  current_balance: 20000,
  interest_rate: 4,
  monthly_payment: 300,
  is_active: true,
  linked_asset_id: null,
  net_worth_inclusion_pct: 100,
  include_aflossing_in_savings: false,
  custom_aflossing_amount: null,
  repayment_type: 'annuity',
  end_date: null,
  start_date: null,
}

const TX_ROWS = [
  { id: 'tx-1', amount: 4000, date: '2026-05-01', is_income: true, budget_id: null, description: 'Salaris', counterparty_name: null },
  { id: 'tx-2', amount: -3100, date: '2026-05-08', is_income: false, budget_id: 'budget-vast', description: 'Vaste lasten', counterparty_name: null },
]

type TableRows = Record<string, unknown[]>

const DEFAULT_TABLES: TableRows = {
  net_worth_snapshots: [],
  transactions: TX_ROWS,
  budgets: [ESSENTIAL_BUDGET],
  assets: [ASSET_ROW],
  debts: [DEBT_ROW],
  actions: [],
  goals: [],
  profiles: [PROFILE_ROW],
  report_configs: [],
}

/**
 * Minimale chainbare Supabase-stub: elke query-methode geeft de keten terug, `then`
 * levert de rijen van de tabel. `single()` schakelt naar objectvorm — het profiel wordt
 * met `.single()` opgehaald en verderop als object gelezen.
 */
function buildClient(tables: TableRows) {
  function chain(table: string, single: boolean): Record<string, unknown> {
    const rows = tables[table] ?? []
    const target: Record<string, unknown> = {
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: single ? (rows[0] ?? null) : rows, error: null })),
    }
    return new Proxy(target, {
      get(t, prop) {
        if (typeof prop !== 'string') return undefined
        if (prop in t) return t[prop]
        if (prop === 'single' || prop === 'maybeSingle') return () => chain(table, true)
        return () => chain(table, single)
      },
    })
  }
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: (table: string) => chain(table, false),
  }
}

type ReportResponse = {
  horizon: { fireAge: number | null; fireDate: string | null; monthlyPassiveIncome: number | null }
  kern: { totalAssets: number; totalDebts: number }
}

async function reportFor(tables: TableRows = DEFAULT_TABLES): Promise<ReportResponse> {
  mockCreateClient.mockResolvedValue(buildClient(tables))
  mockCheckTierGate.mockResolvedValue(null)
  mockIsCloudAllowed.mockResolvedValue(true)
  mockDailyRate.mockResolvedValue({ dailyRate: 100 })
  // use_ai=false → het modelblok wordt volledig overgeslagen; het rapport blijft
  // verder volledig deterministisch.
  const res = await GET(
    new Request('http://localhost/api/report?period_type=month&date_from=2026-05-01&date_to=2026-06-01&use_ai=false'),
  )
  return (await res.json()) as ReportResponse
}

/** Exact de `horizonInput` die de route samenstelt — via dezelfde canonieke helpers. */
function expectedHorizonInput(profile: typeof PROFILE_ROW, dateOfBirth: string | null): FinancialInput {
  const { baseAnnualSavings } = resolveSavingsSource({
    incomeSource: profile.income_source,
    expensesSource: profile.expenses_source,
    netMonthlyIncome: profile.net_monthly_income,
    estimatedAnnualIncome: 4000 * 12,
    estimatedMonthlyExpenses: profile.estimated_monthly_expenses,
    savingsRate6m: 0,
  })
  return {
    totalAssets: 180000,
    totalDebts: 20000,
    // yearlyMustExpenses > 0 → de route drukt inkomen uit als het spaarbron-surplus
    // en zet uitgaven op 0 (het FIRE-doel hangt dan alleen aan yearlyMustExpenses).
    monthlyIncome: baseAnnualSavings / 12,
    monthlyExpenses: 0,
    monthlyContributions: 0,
    yearlyMustExpenses: 24000,
    dateOfBirth,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/report — broncontrole: consumeert de horizon-kernel', () => {
  const reportSrc = readFileSync(path.resolve(__dirname, 'route.ts'), 'utf-8')
  const cardSrc = readFileSync(
    path.resolve(__dirname, '..', 'share', 'freedom-card', 'route.ts'),
    'utf-8',
  )

  it('importeert computeScalarFireProjection uit de scalar-router', () => {
    expect(reportSrc).toMatch(
      /import\s*\{\s*computeScalarFireProjection\s*\}\s*from\s*'@\/lib\/horizon-kernel\/scalar-router'/,
    )
  })

  it('roept de legacy computeFireProjection niet meer aan', () => {
    // Alleen de AANROEP is verboden; het woord mag in toelichtende commentaren staan.
    expect(reportSrc).not.toMatch(/(?<!\w)computeFireProjection\s*\(/)
    expect(reportSrc).not.toMatch(/import[^;]*\bcomputeFireProjection\b[^;]*from/)
  })

  it('de deelbare vrijheidskaart roept de legacy computeFireProjection evenmin aan', () => {
    // AC #1 dekt beide outbound-artefacten; de kaart was al gemigreerd naar de
    // bundel (loadDashboardData → fireProjResult) — deze assertie houdt dat vast.
    expect(cardSrc).not.toMatch(/(?<!\w)computeFireProjection\s*\(/)
    expect(cardSrc).toMatch(/loadDashboardData/)
  })
})

describe('GET /api/report — gedragspin op de FIRE-leeftijd', () => {
  it('levert exact de FIRE-leeftijd/-datum van de horizon-kernel', async () => {
    const data = await reportFor()
    const fireParams = resolveFireParams(PROFILE_ROW)
    const kernel = computeScalarFireProjection({
      input: expectedHorizonInput(PROFILE_ROW, DOB),
      annualReturn: fireParams.grossReturn,
      swrOverride: fireParams.effectiveSwr,
      inflationOverride: fireParams.inflationRate,
    })

    expect(kernel.engine).toBe('kernel')
    expect(data.kern.totalAssets).toBe(180000)
    expect(data.kern.totalDebts).toBe(20000)
    expect(data.horizon.fireAge).toBe(kernel.result.fireAge)
    expect(data.horizon.fireDate).toBe(kernel.result.fireDate)
  })

  it('wijkt meetbaar af van de legacy scalar-motor — de fixture discrimineert', async () => {
    const fireParams = resolveFireParams(PROFILE_ROW)
    const input = expectedHorizonInput(PROFILE_ROW, DOB)
    const kernelAge = computeScalarFireProjection({
      input,
      annualReturn: fireParams.grossReturn,
      swrOverride: fireParams.effectiveSwr,
      inflationOverride: fireParams.inflationRate,
    }).result.fireAge
    const legacyAge = computeFireProjection(
      input,
      fireParams.grossReturn,
      fireParams.effectiveSwr,
      fireParams.inflationRate,
    ).fireAge

    expect(kernelAge).not.toBeNull()
    expect(legacyAge).not.toBeNull()
    // Zonder een discriminerende fixture zou de test hierboven ook groen zijn op de
    // legacy-motor; deze ondergrens bewaakt dat het onderscheid blijft bestaan.
    expect(Math.abs((kernelAge as number) - (legacyAge as number))).toBeGreaterThan(1)

    const data = await reportFor()
    expect(data.horizon.fireAge).not.toBe(legacyAge)
  })

  it('houdt monthlyPassiveIncome op de scalar-weergaveformule (netto vermogen × SWR ÷ 12)', async () => {
    // Bewuste grens van de router: alleen de TIJD-velden komen uit de kernel-solve,
    // de statische ratio-/weergavevelden blijven de scalar-formules. Deze pin legt
    // vast dat de fix dat veld NIET stilletjes van grondslag heeft laten wisselen.
    const data = await reportFor()
    const fireParams = resolveFireParams(PROFILE_ROW)
    expect(data.horizon.monthlyPassiveIncome).toBe(
      Math.round(((180000 - 20000) * fireParams.effectiveSwr) / 12),
    )
  })
})

describe('GET /api/report — nette degradatie (gedocumenteerd gedrag, geen bug)', () => {
  it('zonder geboortedatum valt de router terug op de scalar-formule en levert het rapport nog steeds', async () => {
    const profile = { ...PROFILE_ROW, date_of_birth: null }
    const data = await reportFor({ ...DEFAULT_TABLES, profiles: [profile] })
    const fireParams = resolveFireParams(profile)
    const outcome = computeScalarFireProjection({
      input: expectedHorizonInput(PROFILE_ROW, null),
      annualReturn: fireParams.grossReturn,
      swrOverride: fireParams.effectiveSwr,
      inflationOverride: fireParams.inflationRate,
    })

    expect(outcome.engine).toBe('scalar-fallback')
    expect(outcome.fallbackReason).toMatch(/geboortedatum/)
    expect(data.horizon.fireAge).toBe(outcome.result.fireAge)
    expect(data.horizon.fireDate).toBe(outcome.result.fireDate)
  })

  it('bij negatief netto vermogen degradeert de router eveneens, zonder crash', async () => {
    const bigDebt = { ...DEBT_ROW, current_balance: 400000 }
    const data = await reportFor({ ...DEFAULT_TABLES, debts: [bigDebt] })
    const fireParams = resolveFireParams(PROFILE_ROW)
    const outcome = computeScalarFireProjection({
      input: { ...expectedHorizonInput(PROFILE_ROW, DOB), totalDebts: 400000 },
      annualReturn: fireParams.grossReturn,
      swrOverride: fireParams.effectiveSwr,
      inflationOverride: fireParams.inflationRate,
    })

    expect(outcome.engine).toBe('scalar-fallback')
    expect(outcome.fallbackReason).toMatch(/negatief netto vermogen/)
    expect(data.horizon.fireAge).toBe(outcome.result.fireAge)
  })
})

/**
 * H28 — de AI-abonnementspoort mag alleen het AI-pad bewaken.
 *
 * `checkTierGate('ai')` stond in alle drie de handlers bovenaan, vóór het
 * uitlezen van `use_ai`. Wie op /rapportages expliciet "standaard" (zonder
 * AI-inleiding) koos, kreeg daardoor alsnog "Deze functie vereist een AI
 * abonnement" — ná het invullen, voor een rapport dat op één alinea na volledig
 * deterministisch is. DELETE had helemaal geen AI-vraagstuk en blokkeerde
 * gratis accounts bij het opruimen van hun eigen archief.
 *
 * Deze suite pint beide helften: de poort verschuift, hij verdwijnt niet. Elk
 * pad dat wél om een AI-inleiding vraagt blijft 403 (eigenaarskader: alle
 * AI-gebruik zit achter de betaalmuur; het lokale/on-device pad wordt op zijn
 * eigen laag gegated in `useExecutionMode`, dat op `hasAiSubscription` sluit).
 *
 * Het 403-pad was hiervoor 0x getest — de bestaande suite zet `checkTierGate`
 * altijd op `null`.
 */
describe('/api/report — AI-poort geldt alleen voor het AI-pad (H28)', () => {
  const TIER_GATE = {
    subscriptions: [] as string[],
    error: 'Deze functie vereist een AI abonnement',
  }

  /** Account zónder 'ai'-abonnement; cloud is verder gewoon toegestaan. */
  function setupWithoutSubscription(cloudAllowed = true) {
    mockCreateClient.mockResolvedValue(buildClient(DEFAULT_TABLES))
    mockCheckTierGate.mockResolvedValue(TIER_GATE)
    mockIsCloudAllowed.mockResolvedValue(cloudAllowed)
    mockDailyRate.mockResolvedValue({ dailyRate: 100 })
  }

  function getRequest(query: string) {
    return new Request(
      `http://localhost/api/report?period_type=month&date_from=2026-05-01&date_to=2026-06-01${query}`,
    )
  }

  it('GET met use_ai=false levert 200 + een volledig rapport zonder abonnement', async () => {
    setupWithoutSubscription()
    const res = await GET(getRequest('&use_ai=false'))

    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      useAi: boolean
      aiIntroduction: string | null
      kern: { totalAssets: number }
    }
    expect(data.useAi).toBe(false)
    expect(data.aiIntroduction).toBeNull()
    // Niet alleen "geen 403": de cijfers komen er ook echt uit.
    expect(data.kern.totalAssets).toBe(180000)
    // De poort wordt niet eens geraadpleegd — er is geen AI-pad om te bewaken.
    expect(mockCheckTierGate).not.toHaveBeenCalled()
  })

  it('GET met use_ai=true blijft 403 zonder abonnement — de betaalmuur lekt niet weg', async () => {
    setupWithoutSubscription()
    const res = await GET(getRequest('&use_ai=true'))

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: TIER_GATE.error })
    expect(mockCheckTierGate).toHaveBeenCalledWith(expect.anything(), 'user-1', 'ai')
  })

  it('GET zonder use_ai-parameter telt als "met inleiding" en blijft dus 403', async () => {
    setupWithoutSubscription()
    const res = await GET(getRequest(''))

    expect(res.status).toBe(403)
  })

  it('GET met use_ai=false in privé-modus levert 200 zonder AI-inleiding', async () => {
    // Samenloop met de privé-modus-gate: die zet `useAi` op false, waarna de
    // abonnementspoort niet meer hoort te vuren.
    setupWithoutSubscription(false)
    const res = await GET(getRequest('&use_ai=false'))

    expect(res.status).toBe(200)
    const data = (await res.json()) as { useAi: boolean; aiIntroduction: string | null }
    expect(data.useAi).toBe(false)
    expect(data.aiIntroduction).toBeNull()
    expect(mockCheckTierGate).not.toHaveBeenCalled()
  })

  it('GET met use_ai=true in privé-modus geeft de privé-403, niet de abonnements-403', async () => {
    setupWithoutSubscription(false)
    const res = await GET(getRequest('&use_ai=true'))

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'privacy_mode_active' })
  })

  it('POST slaat een configuratie zónder AI-inleiding op zonder abonnement', async () => {
    setupWithoutSubscription()
    const res = await POST(
      new Request('http://localhost/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Mei 2026',
          period_type: 'month',
          date_from: '2026-05-01',
          date_to: '2026-06-01',
          use_ai: false,
        }),
      }),
    )

    expect(res.status).toBe(201)
    expect(mockCheckTierGate).not.toHaveBeenCalled()
  })

  it('POST met use_ai:true blijft 403 zonder abonnement', async () => {
    setupWithoutSubscription()
    const res = await POST(
      new Request('http://localhost/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Mei 2026',
          period_type: 'month',
          date_from: '2026-05-01',
          date_to: '2026-06-01',
          use_ai: true,
        }),
      }),
    )

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: TIER_GATE.error })
  })

  it('DELETE van een eigen configuratie heeft nooit een AI-abonnement nodig', async () => {
    // Dit is óók de bron van de "spookverwijdering": de 403 die hier stond werd
    // door de UI niet gelezen, dus de rij verdween alleen op het scherm.
    setupWithoutSubscription()
    const res = await DELETE(new Request('http://localhost/api/report?id=cfg-1', { method: 'DELETE' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(mockCheckTierGate).not.toHaveBeenCalled()
  })
})

describe('GET /api/report — de cache honoreert de keuze "zonder AI-inleiding"', () => {
  const CACHED = {
    reportId: 'cached-1',
    reportName: 'Mei 2026',
    useAi: true,
    aiIntroduction: 'Een eerder door het model geschreven inleiding.',
    kern: { totalAssets: 1 },
  }

  function setup(hasSubscription: boolean) {
    mockCreateClient.mockResolvedValue(
      buildClient({ ...DEFAULT_TABLES, report_configs: [{ cached_data: CACHED }] }),
    )
    mockCheckTierGate.mockResolvedValue(
      hasSubscription ? null : { subscriptions: [], error: 'Deze functie vereist een AI abonnement' },
    )
    mockIsCloudAllowed.mockResolvedValue(true)
    mockDailyRate.mockResolvedValue({ dailyRate: 100 })
  }

  const cachedRequest = (aiQuery: string) =>
    new Request(
      `http://localhost/api/report?period_type=month&date_from=2026-05-01&date_to=2026-06-01&config_id=cfg-1${aiQuery}`,
    )

  it('strijkt de eerder gegenereerde inleiding weg bij use_ai=false', async () => {
    // Anders zou de keuze óók hier genegeerd worden — en zou een verlopen
    // abonnement via de cache alsnog AI-tekst blijven leveren.
    setup(false)
    const res = await GET(cachedRequest('&use_ai=false'))

    expect(res.status).toBe(200)
    const data = (await res.json()) as { useAi: boolean; aiIntroduction: string | null; reportId: string }
    expect(data.reportId).toBe('cached-1')
    expect(data.aiIntroduction).toBeNull()
    expect(data.useAi).toBe(false)
  })

  it('laat de inleiding staan wanneer de gebruiker er wél om vraagt en er recht op heeft', async () => {
    setup(true)
    const res = await GET(cachedRequest('&use_ai=true'))

    expect(res.status).toBe(200)
    const data = (await res.json()) as { aiIntroduction: string | null }
    expect(data.aiIntroduction).toBe(CACHED.aiIntroduction)
  })
})
