import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CorePageData } from '@/lib/core-data-loader'
import type { HorizonFireSim } from '@/lib/fire-target-shared'

/**
 * Kaart "Fin kent je plan-instellingen niet" — de plan-regels in FINANCIEEL OVERZICHT.
 *
 * Wat deze suite bewaakt:
 *  - de instellingen bereiken het model, óók onder `solved` (waar voorheen géén enkel
 *    plan-veld de prompt bereikte);
 *  - de bron is de EIGEN profielrij van de canonieke run, met de losse profiel-select
 *    als terugval wanneer de kernel-run niet draaide;
 *  - `rawContext.partner` wordt NOOIT gelezen — de scoping-grendel uit de kaart.
 */
const loadCoreDataMock = vi.fn<() => Promise<CorePageData>>()
vi.mock('@/lib/core-data-loader', () => ({ loadCoreData: () => loadCoreDataMock() }))

// De mock geeft de ARGUMENTEN door: het perspectief waarmee de bouwer de canonieke
// run aanroept is onderdeel van de scoping-grendel, en een mock die z'n argumenten
// weggooit laat een stille wissel naar `household` groen.
const horizonFireSimMock = vi.fn<(...args: unknown[]) => Promise<HorizonFireSim | null>>()
const solvedFireAgeMock = vi.fn<() => Promise<number | null>>()
vi.mock('@/lib/fire-target-shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/fire-target-shared')>()),
  computeHorizonFireSim: (...args: unknown[]) => horizonFireSimMock(...args),
  computeHorizonSolvedFireAge: () => solvedFireAgeMock(),
}))

import { buildSharedContext } from './shared-context'

const SOLVED_PLAN = { anchor: { kind: 'solved' }, endForm: 'deplete', endAge: 90, legacyAmount: 0 }

function makeCoreData(overrides: Record<string, unknown> = {}): CorePageData {
  const base = {
    userName: 'Test', currentAge: 42, hasTransactions: true, retirementMethodUsed: 'essential_budgets',
    budgetingActive: true, savingsRate6m: 9, effectiveSavingsRatePct: 25,
    fireParams: { effectiveSwr: 0.0288, grossReturn: 0.07, inflationRate: 0.02 },
    fireTargetFromHorizon: 500_000, fireNetWorthTargetFromHorizon: null,
    rawFinancials: { monthlyIncome: 4000, monthlyExpenses: 3000, totalAssets: 600_000, totalDebts: 200_000, extrapolatedIncome: 48_000, yearlyMustExpenses: 24_000, yearlyRetirementExpenses: 24_000 },
    fullAssets: [], fullDebts: [],
    firePlan: SOLVED_PLAN,
    healthScoreInput: { freedomPct: 62.4 },
  }
  return { ...(base as unknown as CorePageData), ...(overrides as Partial<CorePageData>) }
}

function makeSupabase(profile: Record<string, unknown> | null) {
  return { from: () => ({ select: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }) } as never
}

/** Een run met een eigen profielrij (en desgewenst een partnerblok dat niet gelezen mag worden). */
function makeRun(over: { profile?: Record<string, unknown>; partner?: unknown; eindsituatie?: unknown } = {}): HorizonFireSim {
  return {
    sim: { fireAge: 55, fireAgeFractional: 54.2, requiredFireIsAnchorPortfolio: false, stopAnker: null, displayEndAge: 90, kernelDepletionMonth: null },
    rawContext: {
      profile: { date_of_birth: '1984-01-01', housing_strategy_config: { mode: 'include_full' }, ...over.profile },
      ...(over.partner !== undefined ? { partner: over.partner } : {}),
    },
    firePlan: SOLVED_PLAN,
    unifiedRows: [],
    aowAgeFractional: 67,
    eindsituatie: over.eindsituatie ?? null,
  } as unknown as HorizonFireSim
}

beforeEach(() => {
  loadCoreDataMock.mockReset()
  horizonFireSimMock.mockReset()
  solvedFireAgeMock.mockReset()
  loadCoreDataMock.mockResolvedValue(makeCoreData())
})

describe('buildSharedContext — plan-instellingen', () => {
  it('zet de instellingen in FINANCIEEL OVERZICHT, óók onder `solved`', async () => {
    horizonFireSimMock.mockResolvedValue(makeRun())
    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))
    const overzicht = ctx.split('== FINANCIEEL OVERZICHT ==')[1] ?? ''
    expect(overzicht).toContain('Eind-vorm van je plan: vermogen opeten')
    expect(overzicht).toContain('Tekort-lening: UIT')
    // Náást (niet in plaats van) de bestaande regels.
    expect(overzicht).toMatch(/^FIRE-doel:/m)
    expect(overzicht).toMatch(/^Vrijheidsleeftijd:/m)
  })

  it('leest de instellingen uit de EIGEN profielrij van de run', async () => {
    horizonFireSimMock.mockResolvedValue(
      makeRun({
        profile: {
          fire_no_deficit_loan: false,
          deficit_loan_rate: 0.062,
          housing_strategy_config: { mode: 'reverse_mortgage', trigger: 'fixed_age', triggerAge: 70 },
        },
      }),
    )
    // De losse profiel-select zegt iets ánders: de run moet winnen (één run, één waarheid).
    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))
    expect(ctx).toContain('Tekort-lening: AAN')
    expect(ctx).toContain('6.2%')
    expect(ctx).toContain('opeethypotheek')
  })

  it('valt zonder kernel-run terug op de losse profiel-select', async () => {
    horizonFireSimMock.mockResolvedValue(null)
    const ctx = await buildSharedContext(
      makeSupabase({
        fire_no_deficit_loan: false,
        deficit_loan_rate: 0.07,
        housing_strategy_config: { mode: 'downsize', trigger: 'fixed_age', triggerAge: 72 },
      }),
    )
    expect(ctx).toContain('Tekort-lening: AAN')
    expect(ctx).toContain('7%')
    expect(ctx).toContain('huis verkopen')
    // De eind-vorm komt dan uit de Kern-bundel, niet uit de run.
    expect(ctx).toContain('Eind-vorm van je plan')
  })

  it('noemt de eindsituatie-oorzaken met leeftijden wanneer de run ze draagt (laag C)', async () => {
    horizonFireSimMock.mockResolvedValue(
      makeRun({
        eindsituatie: {
          eindAge: 90,
          overschot: { age: 90, bedrag: 412_000, inflationFactor: 2.2 },
          dieptepunt: { age: 69, bedrag: 8_400, inflationFactor: 1.8 },
          oorzaken: [
            { id: 'geen-tekort-lening', age: 69, bedrag: { age: 69, bedrag: 8_400, inflationFactor: 1.8 } },
            { id: 'later-inkomen', age: 80, bedrag: null },
          ],
          context: { huis: null, opeetschuld: null },
          eenduidig: true,
        },
      }),
    )
    const ctx = await buildSharedContext(makeSupabase({}))
    expect(ctx).toContain('rond je 69e is je liquide geld (bijna) op')
    expect(ctx).toContain('vanaf je 80e dekt inkomen')
    // Bedragen uit de duiding blijven eruit.
    expect(ctx).not.toContain('412')
    expect(ctx).not.toContain('8.400')
  })

  it('leest NOOIT rawContext.partner (scoping-grendel — een perspectief-wissel mag niet lekken)', async () => {
    horizonFireSimMock.mockResolvedValue(
      makeRun({
        partner: {
          date_of_birth: '1979-07-07',
          net_monthly_income: 4321,
          aow_age: 68,
          naam: 'PartnerGeheim',
          housing_strategy_config: { mode: 'reverse_mortgage', trigger: 'fixed_age', triggerAge: 63 },
          fire_no_deficit_loan: false,
          deficit_loan_rate: 0.099,
        },
      }),
    )
    const ctx = await buildSharedContext(makeSupabase({}))
    expect(ctx).not.toContain('PartnerGeheim')
    expect(ctx).not.toContain('4321')
    expect(ctx).not.toContain('1979')
    expect(ctx).not.toContain('9.9%')
    expect(ctx).not.toContain('63e')
    // De eigen instelling staat er wél (bewijst dat het blok gerenderd is).
    expect(ctx).toContain('Tekort-lening: UIT')
    // En de run draait in de EIGEN blik — een wissel naar `household` zou het
    // partnerblok überhaupt laten ontstaan (en de duiding partner-afgeleid maken).
    expect(horizonFireSimMock.mock.calls[0]?.[1] ?? 'personal').toBe('personal')
  })
})
