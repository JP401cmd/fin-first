import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CorePageData } from '@/lib/core-data-loader'
import { computeFreedomProgress } from '@/lib/core-metrics'
import { deflate, factorAtAge, type FactorRow } from '@/lib/euro-display'
import type { HorizonFireSim } from '@/lib/fire-target-shared'
import { readSourceLF } from '@/lib/test-utils/read-source'
import { formatCurrency } from './formatter'

// ── Mock loadCoreData ──────────────────────────────────────────
// shared-context leunt op de React-cached loader voor alle financiële
// kerngetallen. We mocken 'm zodat de test puur de afleiding van het
// Vrijheids-% (canonieke grondslag, ADR 0009) vastpint.
const loadCoreDataMock = vi.fn<() => Promise<CorePageData>>()
vi.mock('@/lib/core-data-loader', () => ({
  loadCoreData: () => loadCoreDataMock(),
}))

// ── Mock de canonieke FIRE-run ─────────────────────────────────
// shared-context leest hier UITSLUITEND `unifiedRows` (+ de FIRE-leeftijd) uit:
// de weergave-deflator per jaar. De echte run zou de hele horizon-kernel
// binnentrekken; de mock houdt de test op wat hij meet — de FIRE-doel-regel.
// Default `null` = geen run → de regel blijft exact zoals hij vóór dit werk was.
// Alleen déze export vervangen (`importOriginal` + spread): dezelfde module draagt
// óók `computeHorizonFireTarget`, die de echte `loadCoreData` gebruikt. Een factory
// zónder spread maakt elke andere export `undefined` en laat een toekomstige
// importgraaf-wijziging omvallen met een TypeError i.p.v. een leesbare assertie.
const horizonFireSimMock = vi.fn<() => Promise<HorizonFireSim | null>>()
vi.mock('@/lib/fire-target-shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/fire-target-shared')>()),
  computeHorizonFireSim: () => horizonFireSimMock(),
}))

import { buildSharedContext } from './shared-context'

// ── Helpers ────────────────────────────────────────────────────

/** Minimale CorePageData met alleen de velden die shared-context leest. */
function makeCoreData(overrides: Partial<CorePageData> = {}): CorePageData {
  const base = {
    userName: 'Test',
    currentAge: 40,
    hasTransactions: true,
    retirementMethodUsed: 'essential_budgets',
    budgetingActive: true,
    // De rauwe 6-maands MÉTING en de EFFECTIEVE quote staan bewust uit elkaar:
    // Fin citeert sinds 31 aug 2026 de effectieve (het getal dat het scherm
    // toont). Zou de context terugvallen op de meting, dan valt dat luid om.
    savingsRate6m: 9,
    effectiveSavingsRatePct: 25,
    fireParams: { effectiveSwr: 0.0288, grossReturn: 0.07, inflationRate: 0.02 },
    // FIRE-doel uit de unified projection (zelfde getal als de loaders).
    fireTargetFromHorizon: 500_000,
    rawFinancials: {
      monthlyIncome: 4000,
      monthlyExpenses: 3000,
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

/** Fake supabase met alleen de profiles-maybeSingle die shared-context doet. */
function makeSupabase(profile: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        maybeSingle: async () => ({ data: profile, error: null }),
      }),
    }),
  } as never
}

function extractFreedomPct(ctx: string): number {
  const m = ctx.match(/Vrijheids-%:\s*([\d.]+)%/)
  if (!m) throw new Error(`Geen Vrijheids-% gevonden in context:\n${ctx}`)
  return parseFloat(m[1])
}

const HOUSE_ASSET = {
  id: 'house-1',
  is_active: true,
  asset_type: 'eigen_huis',
  current_value: 400_000,
  woz_value: 400_000,
  net_worth_inclusion_pct: 100,
}

const MORTGAGE_DEBT = {
  id: 'mortgage-1',
  is_active: true,
  debt_type: 'mortgage',
  linked_asset_id: 'house-1',
  current_balance: 250_000,
  net_worth_inclusion_pct: 100,
  monthly_payment: 1000,
}

describe('buildSharedContext — Vrijheids-% (canonieke grondslag, ADR 0009)', () => {
  beforeEach(() => {
    loadCoreDataMock.mockReset()
    horizonFireSimMock.mockReset()
    horizonFireSimMock.mockResolvedValue(null)
  })

  it('rapporteert het percentage op FIRE-eligible vermogen ÷ benodigde portfolio (include_full)', async () => {
    // netWorth = 600k - 200k = 400k; required = 500k → 80%.
    loadCoreDataMock.mockResolvedValue(makeCoreData())
    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))

    const expected = computeFreedomProgress({ fireEligibleNetWorth: 400_000, requiredPortfolio: 500_000 })
    expect(expected).toBe(80)
    expect(extractFreedomPct(ctx)).toBe(80)
  })

  it('filtert de eigen woning uit het vermogen bij exclude_from_fire (lager % dan de oude grondslag)', async () => {
    // netWorth blijft 400k voor display, maar FIRE-eligible = 400k - (400k woning - 250k hypotheek = 150k equity) = 250k.
    // required = 500k → 50%. De OUDE grondslag (vol netWorth/doel) zou 80% tonen.
    loadCoreDataMock.mockResolvedValue(
      makeCoreData({
        fullAssets: [HOUSE_ASSET] as unknown as CorePageData['fullAssets'],
        fullDebts: [MORTGAGE_DEBT] as unknown as CorePageData['fullDebts'],
      }),
    )
    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'exclude_from_fire' } }))

    const expected = computeFreedomProgress({ fireEligibleNetWorth: 250_000, requiredPortfolio: 500_000 })
    expect(expected).toBe(50)
    expect(extractFreedomPct(ctx)).toBe(50)
  })

  it('valt terug op het simpele fireTarget als de unified projection geen portfolio gaf', async () => {
    // Geen fireTargetFromHorizon → noemer = computeCoreData.fireTarget
    // (= yearlyMustExpenses / swr = 24000 / 0.0288 ≈ 833.333). eligible 400k → ~48%.
    loadCoreDataMock.mockResolvedValue(makeCoreData({ fireTargetFromHorizon: null }))
    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))

    const fallbackTarget = 24_000 / 0.0288
    const expected = computeFreedomProgress({ fireEligibleNetWorth: 400_000, requiredPortfolio: fallbackTarget })
    expect(extractFreedomPct(ctx)).toBe(Math.round(expected * 10) / 10)
  })
})

const FREE_LINE = 'gebruiker is AL financieel vrij / met pensioen'

describe('buildSharedContext — levensfase-regel (al financieel vrij / met pensioen)', () => {
  beforeEach(() => {
    loadCoreDataMock.mockReset()
    horizonFireSimMock.mockReset()
    horizonFireSimMock.mockResolvedValue(null)
  })

  it('voegt de "al financieel vrij"-regel toe wanneer het vrijheids-% op 100 uitkomt', async () => {
    // eligible netWorth = 600k - 200k = 400k; required = 400k → 100% → vrij.
    loadCoreDataMock.mockResolvedValue(
      makeCoreData({ fireTargetFromHorizon: 400_000 }),
    )
    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))

    expect(extractFreedomPct(ctx)).toBe(100)
    expect(ctx).toContain(FREE_LINE)
  })

  it('laat de "al financieel vrij"-regel WEG wanneer het vrijheids-% onder 100 ligt', async () => {
    // eligible netWorth = 400k; required = 500k → 80% → nog op weg, geen regel.
    loadCoreDataMock.mockResolvedValue(makeCoreData())
    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))

    expect(extractFreedomPct(ctx)).toBe(80)
    expect(ctx).not.toContain(FREE_LINE)
  })
})

// ── FIRE-doel: nominaal + de canonieke omrekening ernaast ─────────────────────
//
// De euro-weergave (ADR 0090-vervolg, besluit D14) laat de AI-context NOMINAAL —
// maar zet bij het FIRE-doel het bedrag-van-vandaag erbij, zodat het scherm
// ("€650k") en Fin ("€1,2 mln") niet twee verschillende doelen lijken te noemen.
// Twee dingen moeten hier hard blijven:
//   1. Y is narekenbaar `deflate(X, factorAtAge(unifiedRows, fireAge), 'real')` —
//      geen tweede som, geen eigen `Math.pow`.
//   2. De "≈"-toevoeging verschijnt ALLEEN met een echte, van 1 afwijkende
//      kernelfactor. Een "≈" met hetzelfde getal is vals-precies: het suggereert
//      een omrekening die niet heeft plaatsgevonden.

const FIRE_AGE_FRACTIONAL = 55.4

/** Kernelrijen 40→70 met een oplopende factor; `atFireAge` zet de factor op 55. */
function makeUnifiedRows(atFireAge: number): FactorRow[] {
  // Rij 55 draagt exact `atFireAge`; de rest loopt daar omheen op, zodat
  // `factorAtAge` aantoonbaar de FIRE-jaar-rij pakt en niet zomaar de eerste.
  return Array.from({ length: 31 }, (_, i) => {
    const age = 40 + i
    return { age, inflationFactor: atFireAge ** ((age - 40) / 15) }
  })
}

function makeHorizonRun(unifiedRows: FactorRow[]): HorizonFireSim {
  return {
    sim: { fireAge: 55, fireAgeFractional: FIRE_AGE_FRACTIONAL },
    unifiedRows,
  } as unknown as HorizonFireSim
}

function extractFireGoalLine(ctx: string): string {
  const m = ctx.match(/^FIRE-doel:.*$/m)
  if (!m) throw new Error(`Geen FIRE-doel-regel gevonden in context:\n${ctx}`)
  return m[0]
}

describe('buildSharedContext — FIRE-doel in beide grondslagen (euro-weergave D14)', () => {
  beforeEach(() => {
    loadCoreDataMock.mockReset()
    horizonFireSimMock.mockReset()
    horizonFireSimMock.mockResolvedValue(null)
  })

  it('zet het bedrag-van-vandaag erbij zodra de kernel een van 1 afwijkende factor levert', async () => {
    const rows = makeUnifiedRows(1.5)
    loadCoreDataMock.mockResolvedValue(makeCoreData())
    horizonFireSimMock.mockResolvedValue(makeHorizonRun(rows))

    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))

    // Narekenbaar: Y = deflate(X, factorAtAge(rows, fireAge), 'real') — dezelfde
    // canonieke helpers, geen tweede berekening in de test.
    const factor = factorAtAge(rows, FIRE_AGE_FRACTIONAL)
    expect(factor).toBeCloseTo(1.5, 10)
    const nominal = formatCurrency(500_000)
    const real = formatCurrency(deflate(500_000, factor, 'real'))

    expect(extractFireGoalLine(ctx)).toBe(
      `FIRE-doel: ${nominal} (toekomstige euro's; ≈ ${real} in geld van vandaag)`,
    )
    // Het nominale bedrag blijft het bedrag dat er vandaag al staat.
    expect(real).not.toBe(nominal)
  })

  it('laat de "≈"-toevoeging WEG bij een lege factorlijst (gedegradeerde kernel-run)', async () => {
    loadCoreDataMock.mockResolvedValue(makeCoreData())
    horizonFireSimMock.mockResolvedValue(makeHorizonRun([]))

    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))

    expect(extractFireGoalLine(ctx)).toBe(`FIRE-doel: ${formatCurrency(500_000)}`)
    expect(ctx).not.toContain('in geld van vandaag')
  })

  it('laat de "≈"-toevoeging WEG bij een unit-factorlijst — een ≈ met hetzelfde getal is vals-precies', async () => {
    loadCoreDataMock.mockResolvedValue(makeCoreData())
    horizonFireSimMock.mockResolvedValue(makeHorizonRun(makeUnifiedRows(1)))

    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))

    expect(extractFireGoalLine(ctx)).toBe(`FIRE-doel: ${formatCurrency(500_000)}`)
    expect(ctx).not.toContain('≈')
  })

  it('laat de regel byte-identiek wanneer er helemaal geen kernel-run is', async () => {
    loadCoreDataMock.mockResolvedValue(makeCoreData())
    horizonFireSimMock.mockResolvedValue(null)

    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))

    expect(extractFireGoalLine(ctx)).toBe(`FIRE-doel: ${formatCurrency(500_000)}`)
  })

  it('valt terug op het nominale bedrag wanneer de kernel-run gooit', async () => {
    loadCoreDataMock.mockResolvedValue(makeCoreData())
    horizonFireSimMock.mockRejectedValue(new Error('kernel down'))

    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))

    expect(extractFireGoalLine(ctx)).toBe(`FIRE-doel: ${formatCurrency(500_000)}`)
  })

  // ── Herkomst van het doel, niet alleen de aanwezigheid van rijen ────────────
  //
  // Een geslaagde run mét rijen bewijst NIET dat het getoonde doel nominaal is:
  // `computeHorizonFireTarget` nult beide doelen weg zodra ze `<= 0` zijn, terwijl
  // dezelfde run gewoon rijen levert. Op zo'n terugvalpad staat het bedrag al
  // (deels) in euro's van VANDAAG; nóg eens deflateren zou een materieel te laag
  // tweede bedrag opleveren. Vandaar de expliciete kernel-herkomstvlag.

  it('laat de "≈"-toevoeging WEG op het 25×-terugvaldoel, óók met een volle factorlijst', async () => {
    // fireTargetFromHorizon === null → noemer/doel = core.fireTarget = de HUIDIGE
    // jaaruitgaven ÷ SWR, dus al in geld van vandaag. De run levert wél rijen.
    loadCoreDataMock.mockResolvedValue(makeCoreData({ fireTargetFromHorizon: null }))
    horizonFireSimMock.mockResolvedValue(makeHorizonRun(makeUnifiedRows(1.5)))

    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))

    expect(extractFireGoalLine(ctx)).toBe(`FIRE-doel: ${formatCurrency(24_000 / 0.0288)}`)
    expect(ctx).not.toContain('in geld van vandaag')
  })

  it('laat de "≈"-toevoeging WEG op de scalar-terugval (kernel-doel + overwaarde van VANDAAG)', async () => {
    // downsize + eigen woning: de overwaarde valt uit het FIRE-eligible vermogen,
    // dus `inclHomeTargetFromScalar` hoogt het kernel-doel op met de overwaarde van
    // VANDAAG (500k + 150k = 650k). Dat mengsel is geen nominaal kernelbedrag.
    loadCoreDataMock.mockResolvedValue(
      makeCoreData({
        fullAssets: [HOUSE_ASSET] as unknown as CorePageData['fullAssets'],
        fullDebts: [MORTGAGE_DEBT] as unknown as CorePageData['fullDebts'],
        fireNetWorthTargetFromHorizon: null,
      }),
    )
    horizonFireSimMock.mockResolvedValue(makeHorizonRun(makeUnifiedRows(1.5)))

    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'downsize' } }))

    expect(extractFireGoalLine(ctx)).toBe(`FIRE-doel: ${formatCurrency(650_000)}`)
    expect(ctx).not.toContain('in geld van vandaag')
  })

  it('zet het bedrag-van-vandaag WEL bij het kernel-geprojecteerde INCL.-doel (downsize)', async () => {
    // Zelfde fixture, maar nu levert de kernel `requiredFireNetWorth` (Prognose!I@FIRE)
    // — een op de FIRE-maand geprojecteerd, dus nominaal bedrag. Kernel-tak → ≈.
    const rows = makeUnifiedRows(1.5)
    loadCoreDataMock.mockResolvedValue(
      makeCoreData({
        fullAssets: [HOUSE_ASSET] as unknown as CorePageData['fullAssets'],
        fullDebts: [MORTGAGE_DEBT] as unknown as CorePageData['fullDebts'],
        fireNetWorthTargetFromHorizon: 590_000,
      }),
    )
    horizonFireSimMock.mockResolvedValue(makeHorizonRun(rows))

    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'downsize' } }))

    const real = formatCurrency(deflate(590_000, factorAtAge(rows, FIRE_AGE_FRACTIONAL), 'real'))
    expect(extractFireGoalLine(ctx)).toBe(
      `FIRE-doel: ${formatCurrency(590_000)} (toekomstige euro's; ≈ ${real} in geld van vandaag)`,
    )
  })
})

// ── De weergavevoorkeur bereikt het model nooit ───────────────────────────────
//
// `profiles.euro_view` gaat bewust NIET mee: een voorkeur zonder cijfers verleidt
// het model tot een eigen `(1 + i)^n`. Deze test kijkt naar de gegenereerde
// payload én naar de bron van beide context-bouwers — de payload alleen zou groen
// blijven zodra iemand het veld ophaalt maar (nog) niet print.

describe('buildSharedContext — euro_view gaat niet naar het model (D14)', () => {
  beforeEach(() => {
    loadCoreDataMock.mockReset()
    horizonFireSimMock.mockReset()
    horizonFireSimMock.mockResolvedValue(null)
  })

  it('noemt euro_view nergens in de gegenereerde context', async () => {
    loadCoreDataMock.mockResolvedValue(makeCoreData())
    horizonFireSimMock.mockResolvedValue(makeHorizonRun(makeUnifiedRows(1.5)))

    const ctx = await buildSharedContext(makeSupabase({ housing_strategy_config: { mode: 'include_full' } }))

    expect(ctx).not.toContain('euro_view')
    expect(ctx.toLowerCase()).not.toContain('euroview')
  })

  it('leest euro_view in geen van beide context-bouwers uit de bron', () => {
    for (const file of ['shared-context.ts', 'horizon-context.ts']) {
      // CRLF-veilig (zie lib/test-utils/read-source.ts): een verse Windows-
      // checkout zou de /gm-comment-strip hieronder anders stil laten falen.
      const src = readSourceLF(join(__dirname, file))
      // Alleen echte code-verwijzingen tellen; de toelichting in de kopcommentaren
      // mág het veld benoemen (dat is juist waar het besluit wordt uitgelegd).
      const codeOnly = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
      expect(codeOnly, `${file} verwijst naar euro_view`).not.toMatch(/euro_?view/i)
    }
  })
})
