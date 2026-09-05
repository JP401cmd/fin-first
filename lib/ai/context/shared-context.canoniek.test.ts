/**
 * UR3-06 — Fin noemt dezelfde cijfers als het scherm.
 *
 * Vier van de vijf gemelde afwijkingen zaten in DEZE contextbouwer: een eigen
 * FIRE-projectie, een eigen dagtarief, en marktaannames die het model helemaal niet
 * kreeg terwijl de DNA-basisprompt beweert dat ze er staan. Het vijfde geval (de
 * schulden-totaalregel) staat in `horizon-context.test.ts`.
 *
 * DE FIXTURE LAAT DE TWEE MOTOREN BEWUST UIT ELKAAR LOPEN — dat is de hele truc.
 * `computeCoreData` (naïeve projectie, vaste 7%, 25×-doel) zou hier "over ~4 jaar"
 * zeggen terwijl de kernel-bisectie de vrijheidsleeftijd al bereikt heeft. Zou de
 * context ooit terugvallen op het oude pad, dan faalt dit hard in plaats van
 * toevallig te kloppen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CorePageData } from '@/lib/core-data-loader'
import { computeCoreData, type FinancialInput } from '@/lib/core-metrics'
import { deriveCountdown } from '@/lib/horizon/fire-scalar'
import type { HorizonFireSim } from '@/lib/fire-target-shared'

const loadCoreDataMock = vi.fn<() => Promise<CorePageData>>()
vi.mock('@/lib/core-data-loader', () => ({
  loadCoreData: () => loadCoreDataMock(),
}))

const horizonFireSimMock = vi.fn<() => Promise<HorizonFireSim | null>>()
vi.mock('@/lib/fire-target-shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/fire-target-shared')>()),
  computeHorizonFireSim: () => horizonFireSimMock(),
}))

import { buildSharedContext } from './shared-context'

// ── Fixture ──────────────────────────────────────────────────────────────────

const CURRENT_AGE = 42

/** De profielaannames zoals /toekomst/voorkeuren ze toont — NIET de defaults. */
const FIRE_PARAMS = { effectiveSwr: 0.0288, grossReturn: 0.061, inflationRate: 0.02 }

/**
 * Het canonieke 12-maands rolling dagtarief uit de bundel. Bewust ánders dan
 * `monthlyExpenses × 12 ÷ 365` (= €98) zodat het oude, naïeve pad zichtbaar faalt.
 */
const CANONIEK_DAGTARIEF = 105

function makeCoreData(overrides: Partial<CorePageData> = {}): CorePageData {
  const base = {
    userName: 'Bas',
    currentAge: CURRENT_AGE,
    hasTransactions: true,
    retirementMethodUsed: 'essential_budgets',
    budgetingActive: true,
    savingsRate6m: 20,
    effectiveSavingsRatePct: 25,
    fireParams: FIRE_PARAMS,
    fireTargetFromHorizon: 500_000,
    dailyExpenseRate: CANONIEK_DAGTARIEF,
    rawFinancials: {
      monthlyIncome: 4_000,
      monthlyExpenses: 3_000,
      totalAssets: 600_000,
      totalDebts: 200_000,
      extrapolatedIncome: 48_000,
      yearlyMustExpenses: 24_000,
      yearlyRetirementExpenses: 24_000,
    },
    fullAssets: [],
    fullDebts: [],
  }
  return { ...(base as unknown as CorePageData), ...overrides }
}

function makeSupabase(profile: Record<string, unknown> | null = { housing_strategy_config: null }) {
  return {
    from: () => ({
      select: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }),
    }),
  } as never
}

/** Alleen de velden die `buildSharedContext` uit de run leest. */
function makeRun(fireAgeFractional: number | null): HorizonFireSim {
  return {
    sim: { fireAgeFractional, fireAge: fireAgeFractional == null ? null : Math.round(fireAgeFractional) },
    unifiedRows: [],
  } as unknown as HorizonFireSim
}

/** De datum die de OUDE, naïeve projectie zou hebben opgeleverd op deze fixture. */
function naieveFireDate(): string {
  const input: FinancialInput = {
    totalAssets: 600_000,
    totalDebts: 200_000,
    monthlyIncome: 4_000,
    monthlyExpenses: 3_000,
    yearlyMustExpenses: 24_000,
    monthlyContributions: 0,
    dateOfBirth: null,
  }
  return computeCoreData(input, FIRE_PARAMS.effectiveSwr).expectedFireDate
}

beforeEach(() => {
  loadCoreDataMock.mockReset()
  horizonFireSimMock.mockReset()
  loadCoreDataMock.mockResolvedValue(makeCoreData())
  horizonFireSimMock.mockResolvedValue(null)
})

// ── Geval 1 — het vrijheidsmoment ────────────────────────────────────────────

describe('buildSharedContext — vrijheidsmoment komt uit de kernel (UR3-06 geval 1)', () => {
  it('de fixture laat de twee motoren daadwerkelijk uiteenlopen (anders bewijst de suite niets)', () => {
    const naief = naieveFireDate()
    expect(naief).not.toBe('')
    expect(naief).not.toBe('Bereikt!')
  })

  it('zegt "bereikt" wanneer de kernel-vrijheidsleeftijd ~ de huidige leeftijd is', async () => {
    // Precies het gemelde account: /toekomst toont "42 — je kunt nu al stoppen".
    horizonFireSimMock.mockResolvedValue(makeRun(CURRENT_AGE + 1 / 12))
    const ctx = await buildSharedContext(makeSupabase())

    expect(ctx).toContain('Vrijheidsleeftijd: 42 — BEREIKT')
    expect(ctx).toContain('nu al stoppen met werken')
    // En vooral: NIET de datum uit de eigen projectie van core-metrics.
    expect(ctx).not.toContain(naieveFireDate())
    expect(ctx).not.toContain('Verwachte FIRE-datum')
  })

  it('noemt bij een echt toekomstig moment de kernel-leeftijd en -aftelling', async () => {
    horizonFireSimMock.mockResolvedValue(makeRun(55.5))
    const ctx = await buildSharedContext(makeSupabase())

    const countdown = deriveCountdown(55.5, CURRENT_AGE)
    expect(ctx).toContain('Vrijheidsleeftijd: 56')
    expect(ctx).toContain(`Verwachte FIRE-datum: ${countdown.fireDate}`)
    expect(ctx).toContain('nog 13 jaar en 6 maanden')
    expect(ctx).not.toContain(naieveFireDate())
  })

  it('zegt "onbekend" in plaats van te schatten wanneer de kernel-run niet draaide', async () => {
    horizonFireSimMock.mockResolvedValue(null)
    const ctx = await buildSharedContext(makeSupabase())

    expect(ctx).toContain('Vrijheidsmoment: onbekend')
    // Geen terugval op de tweede motor — acceptatiecriterium 4 van de kaart.
    expect(ctx).not.toContain(naieveFireDate())
  })

  it('behandelt de horizon-parkeerstand (leeftijd 100) als "geen antwoord", niet als feit', async () => {
    horizonFireSimMock.mockResolvedValue(makeRun(100))
    const ctx = await buildSharedContext(makeSupabase())

    expect(ctx).toContain('Vrijheidsmoment: onbekend')
    expect(ctx).not.toContain('Vrijheidsleeftijd: 100')
  })

  it('laat de kernel-leeftijd óók de levensfase-drempel voeden (was hardgecodeerd null)', async () => {
    // Leeftijd voorbij de vrijheidsleeftijd, maar vrijheids-% onder de 100: alleen
    // de leeftijd-tak kan hier "al financieel vrij" opleveren.
    horizonFireSimMock.mockResolvedValue(makeRun(40))
    const ctx = await buildSharedContext(makeSupabase())

    expect(ctx).toContain('Vrijheids-%: 80%')
    expect(ctx).toContain('Levensfase: gebruiker is AL financieel vrij')
  })
})

// ── Geval 3 — het dagtarief ──────────────────────────────────────────────────

describe('buildSharedContext — dagtarief komt uit de bundel (UR3-06 geval 3)', () => {
  it('citeert het canonieke 12-maands dagtarief, niet maanduitgaven ÷ 365', async () => {
    const ctx = await buildSharedContext(makeSupabase())

    expect(ctx).toContain('Dagtarief (uitgaven per dag): €105')
    // De naïeve variant (3.000 × 12 ÷ 365 = €98,6) mag nergens meer opduiken.
    expect(ctx).not.toContain('€99')
    expect(ctx).not.toContain('Dagelijkse uitgaven')
  })

  it('verwijst naar hetzelfde tarief als de cashflowpagina en verbiedt eigen afleiding', async () => {
    const ctx = await buildSharedContext(makeSupabase())
    expect(ctx).toContain('één dag vrijheid kost je nu')
    expect(ctx).toContain('leid het NIET af uit maandinkomen/-uitgaven')
  })
})

// ── Geval 4 — de marktaannames ───────────────────────────────────────────────

describe('buildSharedContext — rendement, inflatie en SWR staan in de context (UR3-06 geval 4)', () => {
  it('noemt de profielwaarden uit fireParams, niet de app-defaults', async () => {
    const ctx = await buildSharedContext(makeSupabase())

    expect(ctx).toContain('bruto rendement 6.1%')
    expect(ctx).toContain('inflatie 2%')
    expect(ctx).toContain('veilig opnamepercentage (SWR) 2.9%')
    // 7% is DEFAULT_RETURN — precies wat het model verzon toen het veld ontbrak.
    expect(ctx).not.toContain('rendement 7%')
  })

  it('beweegt mee met een ander profiel (geen hardgecodeerde percentages)', async () => {
    loadCoreDataMock.mockResolvedValue(
      makeCoreData({
        fireParams: { effectiveSwr: 0.035, grossReturn: 0.075, inflationRate: 0.025 },
      } as Partial<CorePageData>),
    )
    const ctx = await buildSharedContext(makeSupabase())

    expect(ctx).toContain('bruto rendement 7.5%')
    expect(ctx).toContain('inflatie 2.5%')
    expect(ctx).toContain('veilig opnamepercentage (SWR) 3.5%')
  })

  it('verwijst naar het scherm waar de gebruiker diezelfde aannames ziet', async () => {
    const ctx = await buildSharedContext(makeSupabase())
    expect(ctx).toContain('/toekomst/voorkeuren')
  })
})
