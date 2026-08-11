import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveAmountWithBasis, resolveEffectiveIncomeExpenses } from './effective-financials'

/**
 * REGRESSIESLOT — "een grondslag hoort bij één bedrag" (ADR 0103).
 *
 * HERKOMST: dit bestand begon als BEVINDING uit het testtraject. Het legde vast
 * dat `lib/core-data-loader.ts` de inkomens-grondslagbeslissing meerdere keren
 * neemt, op VERSCHILLENDE grootheden, en dat de bundel er één van exporteerde als
 * `incomeBasis` — óók naast bedragen die uit een ándere resolutie kwamen.
 * `lib/box1-income.ts` consumeerde dat paar rechtstreeks en gaf de mismatch door.
 *
 * NA DE FIX beschrijft dit bestand het JUISTE gedrag. Wat er aan de intentie
 * veranderde:
 *  • Blok 1 bewees eerst "de twee resoluties lopen uiteen — dat is de bug". Het
 *    bewijst nu "de twee resoluties lopen uiteen — dat is een EIGENSCHAP van twee
 *    verschillende grootheden, en precies daarom mag één gedeeld basis-veld niet
 *    bestaan".
 *  • Blok 2 asserteerde eerst `estimateNetBasis === 'profile'` naast een
 *    transactie-bedrag, met de opmerking "dit hoort te breken zodra het wordt
 *    samengevoegd". Dat moment is nu; de assertie is omgedraaid naar de eis dat
 *    label en bedrag uit dezelfde resolutie komen.
 *  • Blok 3 is NIEUW en is het eigenlijke slot: het toetst de PRODUCENT
 *    (`loadCashflowSettingsData`), want daar valt de paarvorming. Een test op
 *    box1-income alleen kan de bug niet vangen — die krijgt het paar al kant en
 *    klaar aangeleverd.
 *
 * De loader draagt sinds de fix VIER expliciete basis-velden i.p.v. één gedeeld
 * veld: `monthlyIncomeBasis` / `monthlyExpensesBasis` (huidige kalendermaand),
 * `annualIncomeBasis` (12-maands extrapolatie) en `savingsExpensesBasis`
 * (6-maands gemiddelde, de grondslag waarop `savingsRate6m` staat).
 */

describe('de MAANDelijkse en de JAARlijkse grondslagresolutie kunnen uiteenlopen — daarom vier velden', () => {
  it('geen transacties deze kalendermaand, wél 12-mnd-historie: maand zegt profile, jaar zegt transaction', () => {
    const profile = {
      net_monthly_income: 4000,
      estimated_monthly_expenses: 2500,
      income_source: 'auto',
      expenses_source: 'auto',
    }

    // Grootheid 1 — de huidige kalendermaand (voedt rawFinancials.monthlyIncome).
    // monthlyIncome = 0: vroeg in de maand, vóór salarisdag.
    const monthlyResolution = resolveEffectiveIncomeExpenses(profile, 0, 2200, {
      income: 0, // geen budgetten
      expenses: 0,
    })
    expect(monthlyResolution.incomeBasis).toBe('profile')

    // Grootheid 2 — de 12-maands extrapolatie (voedt effectiveAnnualIncome).
    const annualResolution = resolveAmountWithBasis(
      profile.income_source,
      profile.net_monthly_income * 12,
      52_000, // extrapolatedIncome — 12 maanden reële inkomsten
      0, // geen budgetten
    )
    expect(annualResolution.basis).toBe('transaction')
    expect(annualResolution.amount).toBe(52_000)

    // Beide uitspraken zijn WAAR over hun eigen grootheid. Ze zijn alleen niet
    // uitwisselbaar — en dat is exact waarom de bundel ze apart moet dragen in
    // plaats van er één als "de" grondslag te exporteren.
    expect(monthlyResolution.incomeBasis).not.toBe(annualResolution.basis)
  })
})

// ── Consumptie: box1-income krijgt een paar dat per contract klopt ──

const { mockLoadSettings } = vi.hoisted(() => ({ mockLoadSettings: vi.fn() }))
vi.mock('@/lib/cashflow-settings-data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./cashflow-settings-data')>()
  return { ...actual, loadCashflowSettingsData: mockLoadSettings }
})

import { resolveBox1GrossIncome } from './box1-income'
import { grossFromNet } from './box1-tax'
import type { CashflowSettingsData } from './cashflow-settings-data'

function fakeSupabase(box1GrossIncome: number | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { box1_gross_income: box1GrossIncome }, error: null }),
        }),
      }),
    }),
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

beforeEach(() => {
  mockLoadSettings.mockReset()
})

describe('resolveBox1GrossIncome — label en bedrag komen uit dezelfde resolutie', () => {
  it('neemt de grondslag die BIJ effectiveAnnualIncome hoort over', async () => {
    // `incomeBasis` op CashflowSettingsData is per contract de grondslag van
    // `effectiveAnnualIncome` — beide 12-maands. De producent garandeert dat
    // paar (zie het derde blok); box1-income hoeft het alleen niet te breken.
    mockLoadSettings.mockResolvedValue({
      effectiveAnnualIncome: 52_000,
      incomeBasis: 'transaction',
    } as unknown as CashflowSettingsData)

    const result = await resolveBox1GrossIncome(fakeSupabase(null), 'user-1')

    expect(result.estimateNetYearly).toBe(52_000)
    expect(result.estimateNetBasis).toBe('transaction')
    expect(result.estimateGross).toBe(grossFromNet(52_000, 2026))
  })

  it('een budgetgrondslag reist ongeschonden door naar de Box 1-pagina', async () => {
    mockLoadSettings.mockResolvedValue({
      effectiveAnnualIncome: 61_200,
      incomeBasis: 'budget',
    } as unknown as CashflowSettingsData)

    const result = await resolveBox1GrossIncome(fakeSupabase(null), 'user-1')
    expect(result.estimateNetBasis).toBe('budget')
    expect(result.estimateNetYearly).toBe(61_200)
  })

  it('geen bundel → geen bedrag én geen bewering over de herkomst', async () => {
    mockLoadSettings.mockResolvedValue(null)
    const result = await resolveBox1GrossIncome(fakeSupabase(null), 'user-1')
    expect(result.estimateNetYearly).toBe(0)
    expect(result.estimateNetBasis).toBe('profile')
  })
})

// ── HET EIGENLIJKE SLOT: de producent paart label aan bedrag ──

const { mockCore, mockUser } = vi.hoisted(() => ({ mockCore: vi.fn(), mockUser: vi.fn() }))
vi.mock('@/lib/core-data-loader', () => ({ loadCoreData: mockCore }))
vi.mock('@/lib/supabase/cached-user', () => ({ getCachedUser: mockUser }))

import type { CorePageData } from './core-data-loader'

/**
 * Het tweede blok vervangt `loadCashflowSettingsData` door een stub (box1-income
 * moet immers een bundel KRIJGEN). Dit blok test juist de ECHTE producent, dus
 * het haalt hem langs die mock heen op. `importActual` un-mockt uitsluitend deze
 * module; zijn eigen imports (`loadCoreData`, `getCachedUser`) blijven wél
 * gemockt — precies wat we nodig hebben.
 */
async function realLoadCashflowSettingsData() {
  const actual = await vi.importActual<typeof import('./cashflow-settings-data')>(
    './cashflow-settings-data',
  )
  return actual.loadCashflowSettingsData
}

/** Chainbare stub: profielrij voor de bundel + `null` voor de goals-lookup. */
function bundleSupabase() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({ data: null, error: null }),
  }
  return { from: () => builder } as unknown as import('@supabase/supabase-js').SupabaseClient
}

const EMPTY_BASIS = {
  annualTotal: 0,
  monthlyTotal: 0,
  entries: [],
  hasBudgets: false,
  allExcluded: false,
}

/** De vier basis-velden staan hier BEWUST allemaal verschillend. */
function coreStub(): CorePageData {
  return {
    rawFinancials: {
      monthlyIncome: 4000,
      monthlyExpenses: 2500,
      totalAssets: 0,
      totalDebts: 0,
      extrapolatedIncome: 52_000,
      effectiveAnnualIncome: 52_000,
      yearlyMustExpenses: 0,
    },
    fullAssets: [],
    // Twee VERSCHILLENDE quotes, zodat een verwisseling luid faalt.
    savingsRate6m: 5,
    effectiveSavingsRatePct: 40,
    retirementMethodUsed: 'essential_budgets',
    budgetingActive: true,
    fireParams: { grossReturn: 0.07, effectiveSwr: 0.04, inflationRate: 0.02 },
    fireStrategy: { strategy: 'perpetual', endAge: 95 },
    savingsRateMethod: 'transaction',
    savingsReceiptData: { extHalfYearExpenses: 15_000 },
    monthlyIncomeExpenseSeries: [],
    savingsBudgetTotal6m: 0,
    debtAflossingTotal6m: 0,
    incomeSource: 'auto',
    expensesSource: 'auto',
    // De vier grondslagen, elk anders — zo faalt de test luid zodra de mapping
    // het verkeerde veld pakt.
    monthlyIncomeBasis: 'profile',
    monthlyExpensesBasis: 'manual',
    annualIncomeBasis: 'transaction',
    savingsExpensesBasis: 'budget',
    budgetIncome: EMPTY_BASIS,
    budgetExpenses: EMPTY_BASIS,
  } as unknown as CorePageData
}

describe('loadCashflowSettingsData — paart elk basis-veld aan het bedrag dat het beschrijft', () => {
  beforeEach(() => {
    mockCore.mockReset()
    mockUser.mockReset()
    mockUser.mockResolvedValue({ id: 'user-1' })
  })

  it('incomeBasis volgt de JAAR-resolutie (want het bundelbedrag is een jaarinkomen)', async () => {
    mockCore.mockResolvedValue(coreStub())
    const data = await (await realLoadCashflowSettingsData())(bundleSupabase())

    expect(data!.effectiveAnnualIncome).toBe(52_000)
    expect(data!.incomeBasis).toBe('transaction')
    // En NIET de huidige-maand-resolutie — dat was precies de bug: label
    // 'profile' naast een bedrag dat uit transacties kwam.
    expect(data!.incomeBasis).not.toBe('profile')
  })

  it('expensesBasis volgt de 6-MAANDS resolutie (want daarop staan computedMonthlyExpenses én savingsRate6m)', async () => {
    mockCore.mockResolvedValue(coreStub())
    const data = await (await realLoadCashflowSettingsData())(bundleSupabase())

    expect(data!.expensesBasis).toBe('budget')
    expect(data!.expensesBasis).not.toBe('manual') // de huidige-maand-resolutie
  })

  it('de bronKEUZE blijft ongemoeid doorgegeven (auto is geen grondslag)', async () => {
    mockCore.mockResolvedValue(coreStub())
    const data = await (await realLoadCashflowSettingsData())(bundleSupabase())
    expect(data!.incomeSource).toBe('auto')
    expect(data!.expensesSource).toBe('auto')
  })

  it('draagt BEIDE spaarquotes: de effectieve (oordeel) én de rauwe transactiemeting', async () => {
    // De kaart toont een kassabon met EFFECTIEVE bedragen; daar hoort de
    // effectieve quote onder, niet de transactiemeting. Vóór deze fix kwam
    // alleen `savingsRate6m` op de bundel, waardoor het blok 5 % toonde terwijl
    // de gezondheidsscore en de FIRE-datum op 40 % rekenden.
    mockCore.mockResolvedValue(coreStub())
    const data = await (await realLoadCashflowSettingsData())(bundleSupabase())

    expect(data!.effectiveSavingsRatePct).toBe(40)
    // De meting blijft apart bestaan — de transactie-kassabon verklaart die.
    expect(data!.savingsRate6m).toBe(5)
    expect(data!.effectiveSavingsRatePct).not.toBe(data!.savingsRate6m)
  })
})
