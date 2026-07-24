import { describe, it, expect, vi, beforeEach } from 'vitest'

// De zware/DB-afhankelijke bronnen mocken; de mapping-/dedup-/cap-logica van
// buildLocalChatOverview is wat we hier bewaken. computeJaarruimteFacts wordt
// gemockt zodat de test niet aan de exacte fiscale motor hangt (die heeft eigen
// suites) — we testen de doorgifte + de vrijheidsdagen-omrekening via dagtarief.
vi.mock('@/lib/core-data-loader', () => ({ loadCoreData: vi.fn() }))
vi.mock('@/lib/ai/context/fin-financial-facts', () => ({ buildWillFinancialFacts: vi.fn() }))
vi.mock('@/lib/aandachtspunten-loader', () => ({ collectAandachtspunten: vi.fn() }))
vi.mock('@/lib/aandachtspunten-actions', () => ({ loadActionedAandachtspuntIds: vi.fn() }))
vi.mock('@/lib/jaarruimte-facts', () => ({ computeJaarruimteFacts: vi.fn() }))
vi.mock('@/lib/supabase/cached-user', () => ({ getCachedUser: vi.fn() }))

import { buildLocalChatOverview } from './local-chat-context'
import { loadCoreData } from '@/lib/core-data-loader'
import { buildWillFinancialFacts } from '@/lib/ai/context/fin-financial-facts'
import { collectAandachtspunten } from '@/lib/aandachtspunten-loader'
import { loadActionedAandachtspuntIds } from '@/lib/aandachtspunten-actions'
import { computeJaarruimteFacts } from '@/lib/jaarruimte-facts'
import { getCachedUser } from '@/lib/supabase/cached-user'

const FACTS = {
  hasData: true,
  nettoVermogen: 85000,
  freedomYears: 2,
  freedomMonths: 9,
  vrijheidsPct: 14,
  displayFireGoal: 600000,
  fireDoel: 600000,
  spaarquotePct: 25,
  swr: 0.034,
  dagtarief: 114,
  maandinkomen: 3400,
  maanduitgaven: 2550,
}

function makeSupabase(profile: unknown, actions: unknown[]) {
  return {
    from(table: string) {
      if (table === 'profiles') {
        return { select: () => ({ maybeSingle: async () => ({ data: profile }) }) }
      }
      if (table === 'actions') {
        return {
          select: () => ({
            eq: () => ({ in: () => ({ order: () => ({ limit: async () => ({ data: actions }) }) }) }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  } as never
}

beforeEach(() => {
  vi.mocked(loadCoreData).mockResolvedValue({
    rawFinancials: {
      monthlyIncome: 3400,
      monthlyExpenses: 2550,
      totalAssets: 100000,
      totalDebts: 15000,
      yearlyRetirementExpenses: 0,
    },
    healthScoreInput: { emergencyFundMonths: 2.9 },
    hasTransactions: true,
  } as never)
  vi.mocked(buildWillFinancialFacts).mockReturnValue(FACTS as never)
  vi.mocked(collectAandachtspunten).mockResolvedValue([])
  vi.mocked(loadActionedAandachtspuntIds).mockResolvedValue(new Set<string>())
  vi.mocked(computeJaarruimteFacts).mockReturnValue({
    hasData: true,
    onbenut: 22155,
    besparing: 12409,
    grossYearly: 60000,
  })
  vi.mocked(getCachedUser).mockResolvedValue({ id: 'user-1' } as never)
})

describe('buildLocalChatOverview — jaarruimte', () => {
  it('neemt de jaarruimte-lever mee met vrijheidsdagen via het dagtarief', async () => {
    const overview = await buildLocalChatOverview(makeSupabase({ net_monthly_income: 3400 }, []))
    expect(overview.jaarruimte).toEqual({
      onbenut: 22155,
      besparing: 12409,
      vrijheidsdagen: Math.round(12409 / 114), // = 109
    })
  })

  it('geeft jaarruimte=null wanneer de motor geen ruimte vindt', async () => {
    vi.mocked(computeJaarruimteFacts).mockReturnValue({
      hasData: false,
      onbenut: 0,
      besparing: 0,
      grossYearly: 0,
    })
    const overview = await buildLocalChatOverview(makeSupabase({ net_monthly_income: 0 }, []))
    expect(overview.jaarruimte).toBeNull()
  })

  it('onderdrukt het jaarruimte-blok wanneer de kans al als actie is genomen', async () => {
    // computeJaarruimteFacts vindt WEL ruimte (default beforeEach), maar de
    // gebruiker heeft de jaarruimte-kans al geactioneerd → geen tip meer, anders
    // blijft de lokale Fin "benut je jaarruimte" herhalen (de gerapporteerde bug).
    vi.mocked(loadActionedAandachtspuntIds).mockResolvedValue(new Set(['tax:jaarruimte']))
    const overview = await buildLocalChatOverview(makeSupabase({ net_monthly_income: 3400 }, []))
    expect(overview.jaarruimte).toBeNull()
  })
})

describe('buildLocalChatOverview — kansen (aandachtspunten)', () => {
  it('filtert de jaarruimte-kans (op stabiele id, niet titel) eruit en capt op 3', async () => {
    vi.mocked(collectAandachtspunten).mockResolvedValue([
      // Titel bewust hernoemd om te bewijzen dat de dedup op de STABIELE id draait,
      // niet op de (prompt-dna-)titel.
      { id: 'tax:jaarruimte', domain: 'tax', title: 'Pensioenaftrekruimte benutten', savings: 12409, freedomDays: 108, href: '' },
      { id: 'budget:a', domain: 'budget', title: 'Bespaar op boodschappen', savings: 600, freedomDays: 5, href: '', deadline: '31 dec' },
      { id: 'debt:b', domain: 'debt', title: 'Los dure schuld af', savings: 400, freedomDays: 3, href: '' },
      { id: 'asset:c', domain: 'asset', title: 'Zet cash aan het werk', savings: 300, freedomDays: 2, href: '' },
      { id: 'budget:d', domain: 'budget', title: 'Minder abonnementen', savings: 200, freedomDays: 1, href: '' },
    ] as never)
    const overview = await buildLocalChatOverview(makeSupabase({ net_monthly_income: 3400 }, []))
    expect(overview.kansen).toHaveLength(3)
    expect(overview.kansen.map((k) => k.titel)).not.toContain('Pensioenaftrekruimte benutten')
    expect(overview.kansen[0]).toEqual({
      titel: 'Bespaar op boodschappen',
      besparingPerJaar: 600,
      vrijheidsdagen: 5,
      deadline: '31 dec',
    })
    // Geen deadline → veld weggelaten (niet undefined-property).
    expect(overview.kansen[1]).toEqual({ titel: 'Los dure schuld af', besparingPerJaar: 400, vrijheidsdagen: 3 })
  })
})

describe('buildLocalChatOverview — openstaande acties', () => {
  it('mapt de acties naar titel/vrijheidsdagen/status', async () => {
    const overview = await buildLocalChatOverview(
      makeSupabase({ net_monthly_income: 3400 }, [
        { title: 'Benut je jaarruimte', freedom_days_impact: 108, status: 'open' },
        { title: 'Verhoog je buffer', freedom_days_impact: null, status: 'postponed' },
      ]),
    )
    expect(overview.openstaandeActies).toEqual([
      { titel: 'Benut je jaarruimte', vrijheidsdagen: 108, status: 'open' },
      { titel: 'Verhoog je buffer', vrijheidsdagen: 0, status: 'postponed' },
    ])
  })
})

describe('buildLocalChatOverview — geen kern-data', () => {
  it('geeft een minimaal overzicht zonder verrijking', async () => {
    vi.mocked(buildWillFinancialFacts).mockReturnValue({ ...FACTS, hasData: false } as never)
    vi.mocked(collectAandachtspunten).mockResolvedValue([
      { id: 'budget:a', domain: 'budget', title: 'x', savings: 100, freedomDays: 1, href: '' },
    ] as never)
    const overview = await buildLocalChatOverview(
      makeSupabase({ net_monthly_income: 3400 }, [{ title: 'a', freedom_days_impact: 1, status: 'open' }]),
    )
    expect(overview.hasData).toBe(false)
    expect(overview.jaarruimte).toBeNull()
    expect(overview.kansen).toEqual([])
    expect(overview.openstaandeActies).toEqual([])
  })
})
