import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  render as rtlRender,
  screen,
  fireEvent,
  within,
  waitFor,
} from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { CashflowInstellingenBlok } from './cashflow-instellingen-blok'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { HideInSimple } from '@/components/app/hide-in-simple'
import type { CashflowSettingsData } from '@/lib/cashflow-settings-data'
import type { BasisSource, BudgetBasisEntry, ResolvedBasis } from '@/lib/budget-basis'
import type { SavingsRateMethod } from '@/lib/core-metrics'

/**
 * WAT DEZE SUITE PINT (na de herbouw tot één gecombineerd venster, ADR 0103)
 * ─────────────────────────────────────────────────────────────────────────
 * De vorige versie testte drie afzonderlijke sheets ('income'/'expenses'/
 * 'savings'). Die bestaan niet meer: de drie kaarten openen hetzelfde venster
 * met drie blokken. De suite is daarop herschreven, met behoud van de
 * eigenschap die er het meest toe deed:
 *
 *   bij savingsRateMethod 'estimate'/'net_worth_delta' produceerden de
 *   maandrijen het percentage NIET, dus de 6-maands transactie-kassabon mag
 *   dan niet verschijnen.
 *
 * Nieuw erbij, omdat de herbouw ze introduceert:
 *   - elke kaart benoemt zijn grondslag (het harde acceptatiecriterium uit de
 *     ADR — een grondslag die kan schuiven moet zich bekendmaken);
 *   - de kaartwaarde volgt de grondslag uit de BUNDEL, niet een eigen
 *     client-side beslissing;
 *   - de budget-kassabon is aan/uit te vinken en persisteert bron én selectie
 *     in ÉÉN PUT;
 *   - alles uitgevinkt levert nooit €0 op maar een zichtbare terugval-melding;
 *   - zonder budgetten van dat type is de budget-keuze uitgeschakeld, niet
 *     verstopt.
 */

/**
 * `useDisplayMode()` valt BUITEN een provider terug op 'simple' — en de
 * cijferstrook reduceert daar (terecht) naar twee cellen. In de echte app hangt
 * de provider altijd in de app-layout, dus rendert deze suite standaard in
 * 'full'. Tests die juist de Eenvoudig-reductie toetsen nesten hun eigen
 * provider; de binnenste context wint.
 */
function render(ui: ReactElement) {
  return rtlRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <DisplayModeProvider initialMode="full">{children}</DisplayModeProvider>
    ),
  })
}

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}))

interface DataOverrides {
  savingsRateMethod?: SavingsRateMethod
  /** Rauwe 6-maands TRANSACTIEquote — hoort alleen bij de transactie-kassabon. */
  savingsRate6m?: number
  /** ADR-uniforme (I−E)/I op de gekozen grondslagen — kaart + afgeleid blok. */
  effectiveSavingsRatePct?: number
  computedMonthlyExpenses?: number
  /** Canoniek dagtarief uit de bundel (M22) — 0 = geen eerlijke dagbasis. */
  dailyExpenseRate?: number
  monthlyBreakdown?: CashflowSettingsData['monthlyBreakdown']
  incomeSource?: BasisSource
  expensesSource?: BasisSource
  incomeBasis?: ResolvedBasis
  expensesBasis?: ResolvedBasis
  budgetIncomeEntries?: BudgetBasisEntry[]
  budgetExpenseEntries?: BudgetBasisEntry[]
  budgetIncomeOpts?: { realizedWindowMonths?: number; truncationSuspected?: boolean }
  /** Maanden historie onder `estimatedAnnualIncome` (12 = geen extrapolatie). */
  incomeMonths?: number
}

/**
 * Bouwt een `BudgetBasisEntry` met de contract-defaults: een post is
 * GEREALISEERD (12 maanden transacties) tenzij de test iets anders zegt.
 */
function entry(
  partial: Pick<BudgetBasisEntry, 'id' | 'name' | 'annualAmount'> & Partial<BudgetBasisEntry>,
): BudgetBasisEntry {
  return {
    interval: 'monthly',
    excluded: false,
    source: 'realized',
    realizedMonths: 12,
    plannedAnnualAmount: partial.annualAmount,
    ...partial,
  }
}

function budgetBasis(
  entries: BudgetBasisEntry[],
  opts: { realizedWindowMonths?: number; truncationSuspected?: boolean } = {},
): CashflowSettingsData['budgetIncome'] {
  const annualTotal = entries.filter((e) => !e.excluded).reduce((s, e) => s + e.annualAmount, 0)
  return {
    annualTotal,
    monthlyTotal: annualTotal / 12,
    entries,
    hasBudgets: entries.length > 0,
    allExcluded: entries.length > 0 && entries.every((e) => e.excluded),
    realizedWindowMonths: opts.realizedWindowMonths ?? 12,
    truncationSuspected: opts.truncationSuspected ?? false,
  }
}

function makeData(overrides: DataOverrides = {}): CashflowSettingsData {
  const months = Array.from({ length: 12 }, (_, i) => ({
    label: `maand ${i + 1}`,
    income: 4000,
    expenses: 3000,
  }))
  return {
    estimatedAnnualIncome: 48000,
    // Volledige historie tenzij een test iets anders zegt: dan is er niets te
    // extrapoleren en hoort de transactie-kassabon over zijn venster te zwijgen.
    incomeMonths: overrides.incomeMonths ?? 12,
    // Het EFFECTIEVE jaarinkomen op de gekozen grondslag (ADR 0103); gelijk aan
    // de transactiewaarde zolang de mock op grondslag 'transaction' staat.
    effectiveAnnualIncome: 48000,
    netMonthlyIncome: 4000,
    savingsRate6m: overrides.savingsRate6m ?? 25,
    effectiveSavingsRatePct: overrides.effectiveSavingsRatePct ?? 25,
    targetSavingsRate: null,
    estimatedMonthlyExpenses: 3000,
    // Canoniek dagtarief uit de bundel (M22): 3000 × 12 / 365. Bewust NIET
    // 3000/30 = 100 — dat wás de tweede noemer die deze kaart heeft opgeruimd.
    dailyExpenseRate: overrides.dailyExpenseRate ?? (3000 * 12) / 365,
    retirementExpenseMethod: 'essential_budgets',
    retirementCustomAmount: 0,
    budgetingActive: false,
    fireInput: {
      totalAssets: 0,
      totalDebts: 0,
      monthlyIncome: 4000,
      monthlyExpenses: 3000,
      yearlyMustExpenses: 36000,
      monthlyContributions: 0,
      dateOfBirth: null,
      last12MonthsIncome: 48000,
    },
    grossReturn: 0.07,
    effectiveSwr: 0.04,
    inflationRate: 0.02,
    fireStrategy: { strategy: 'perpetual', endAge: 95 },
    // Default: de gebruiker stuurt bewust op de gemeten werkelijkheid. Bewust
    // NIET 'auto' — deze mock heeft budgetten, en 'auto' betekent "kies voor
    // mij", wat dan (terecht) de budgetgrondslag oplevert.
    incomeSource: overrides.incomeSource ?? 'transaction',
    expensesSource: overrides.expensesSource ?? 'transaction',
    incomeBasis: overrides.incomeBasis ?? 'transaction',
    expensesBasis: overrides.expensesBasis ?? 'transaction',
    budgetIncome: budgetBasis(
      overrides.budgetIncomeEntries ?? [
        entry({ id: 'inc-1', name: 'Salaris', annualAmount: 60000 }),
        entry({ id: 'inc-2', name: 'Belastingteruggaaf', interval: 'yearly', annualAmount: 1200 }),
      ],
      overrides.budgetIncomeOpts,
    ),
    budgetExpenses: budgetBasis(
      overrides.budgetExpenseEntries ?? [
        entry({ id: 'exp-1', name: 'Vaste lasten', annualAmount: 24000 }),
      ],
    ),
    savingsRateMethod: overrides.savingsRateMethod ?? 'transaction',
    computedMonthlyExpenses: overrides.computedMonthlyExpenses ?? 3000,
    savingsBudgetTotal6m: 0,
    debtAflossingTotal6m: 0,
    monthlyBreakdown: overrides.monthlyBreakdown ?? months,
  }
}

/**
 * Opent het gecombineerde venster via de expliciete affordance. De cijferstrook
 * op de pagina is bewust leesvorm — de ENIGE ingang is deze knop met zichtbaar
 * label, geen onzichtbaar klikvlak op een cijfer.
 */
function openVenster(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: /Instellingen aanpassen/i }))
  return screen.getByRole('dialog')
}

/** Alias zolang tests per blok redeneren; het venster is er maar één. */
function openVia(_blockLabel?: string): HTMLElement {
  return openVenster()
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  refreshMock.mockClear()
  // Spiegelt de echte route: de PUT echoot terug wat hij DAADWERKELIJK heeft
  // opgeslagen (`persistedCashSettings`). Ontbreekt `cashflow_basis_prefs` in de
  // response, dan is de selectie niet bewaard — ook bij een 200.
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('cashflow-settings')) {
      return { ok: true, json: async () => makeData() } as unknown as Response
    }
    const sent = init?.body ? JSON.parse(init.body as string) : {}
    return {
      ok: true,
      json: async () => ({ success: true, ...sent }),
    } as unknown as Response
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CashflowInstellingenBlok — samenvatting op de pagina', () => {
  it('toont de drie getallen als één cijferstrook, niet als drie klikbare kaarten', () => {
    render(<CashflowInstellingenBlok data={makeData()} />)
    expect(screen.getByText('Geschat jaarinkomen')).toBeTruthy()
    expect(screen.getByText('Geschatte uitgaven')).toBeTruthy()
    expect(screen.getByText('Spaarquote')).toBeTruthy()
    // Vóór openen is er precies ÉÉN knop op de pagina: de ingang naar de
    // instellingen. De cijfers zelf zijn leesvorm.
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].textContent).toMatch(/Instellingen aanpassen/i)
  })

  it('draagt het afkap-voorbehoud op de PAGINA, niet alleen in het venster', () => {
    // Wie het venster nooit opent, moet toch zien dat het getal te laag kan zijn.
    render(
      <CashflowInstellingenBlok
        data={makeData({
          incomeSource: 'budget',
          incomeBasis: 'budget',
          budgetIncomeOpts: { truncationSuspected: true },
        })}
      />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('uit je budgetten · mogelijk onvolledig')).toBeTruthy()
  })

  it('reduceert in Eenvoudig naar twee cellen — inkomen en de uitkomst', () => {
    render(
      <DisplayModeProvider initialMode="simple">
        <CashflowInstellingenBlok data={makeData()} />
      </DisplayModeProvider>,
    )
    expect(screen.getByText('Geschat jaarinkomen')).toBeTruthy()
    expect(screen.getByText('Spaarquote')).toBeTruthy()
    expect(screen.queryByText('Geschatte uitgaven')).toBeNull()
  })

  it('benoemt per getal de grondslag, ook zonder het venster te openen', () => {
    render(
      <CashflowInstellingenBlok
        data={makeData({ incomeSource: 'budget', incomeBasis: 'budget' })}
      />,
    )
    // Inkomen uit budgetten, uitgaven uit transacties → en de spaarquote die uit
    // die twee volgt, meldt dat hij gemengd is.
    expect(screen.getByText('uit je budgetten')).toBeTruthy()
    expect(screen.getByText('uit je transacties')).toBeTruthy()
    expect(screen.getByText('gemengde grondslag')).toBeTruthy()
  })

  it('opent het instellingenvenster via de knop met zichtbaar label', () => {
    render(<CashflowInstellingenBlok data={makeData()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    const sheet = openVenster()
    expect(within(sheet).getByText('Waar komt je inkomen vandaan?')).toBeTruthy()
  })
})

describe('CashflowInstellingenBlok — één venster, drie blokken', () => {
  it('opent vanuit elke kaart hetzelfde venster met alle drie de blokken', () => {
    render(<CashflowInstellingenBlok data={makeData()} />)
    const sheet = openVia('Geschat jaarinkomen')
    expect(within(sheet).getByText('Waar komt je inkomen vandaan?')).toBeTruthy()
    expect(within(sheet).getByText('Waar komen je uitgaven vandaan?')).toBeTruthy()
    expect(within(sheet).getByText('Wat je overhoudt aan vrijheid')).toBeTruthy()
  })

  it('biedt per kant drie grondslagen in plaats van twee', () => {
    render(<CashflowInstellingenBlok data={makeData()} />)
    const sheet = openVia('Geschatte uitgaven')
    const groep = within(sheet).getByRole('radiogroup', { name: 'Grondslag voor je uitgaven' })
    expect(within(groep).getByText('Uit je budgetten')).toBeTruthy()
    expect(within(groep).getByText('Uit je transacties')).toBeTruthy()
    expect(within(groep).getByText('Eigen bedrag')).toBeTruthy()
  })
})

describe('CashflowInstellingenBlok — spaarquote-blok methode-afhankelijk', () => {
  it("'transaction': toont de 6-maands transactie-kassabon", () => {
    render(<CashflowInstellingenBlok data={makeData({ savingsRateMethod: 'transaction' })} />)
    const sheet = openVia('Spaarquote')
    expect(within(sheet).getByText(/Σ Inkomen \(6 mnd\)/i)).toBeTruthy()
  })

  it("'estimate': toont de 'opgegeven inkomsten en uitgaven'-intro en GEEN transactie-kassabon", () => {
    render(<CashflowInstellingenBlok data={makeData({ savingsRateMethod: 'estimate' })} />)
    const sheet = openVia('Spaarquote')
    expect(
      within(sheet).getByText(/^Geschat uit je opgegeven inkomsten en uitgaven/i),
    ).toBeTruthy()
    expect(within(sheet).queryByText(/Σ Inkomen \(6 mnd\)/i)).toBeNull()
  })

  it("'net_worth_delta': toont de 'groei van je vermogen'-intro en GEEN transactie-kassabon", () => {
    render(<CashflowInstellingenBlok data={makeData({ savingsRateMethod: 'net_worth_delta' })} />)
    const sheet = openVia('Spaarquote')
    expect(within(sheet).getByText(/^Geschat uit de groei van je vermogen/i)).toBeTruthy()
    expect(within(sheet).queryByText(/Σ Inkomen \(6 mnd\)/i)).toBeNull()
  })

  it('toont in het afgeleide blok de spaarquote die bij zijn EIGEN bedragen hoort (40%, niet 5%)', () => {
    // Budgetgrondslag €5.000 in / €3.000 uit → 40%. De transactiewerkelijkheid
    // (€4.000 in / €3.800 uit) geeft 5%; dat is de rauwe `savingsRate6m` en
    // hoort NIET onder een kassabon die effectieve, grondslag-geresolveerde
    // bedragen toont — anders spreekt de bon zichzelf rekenkundig tegen.
    render(
      <CashflowInstellingenBlok
        data={makeData({
          incomeSource: 'budget',
          incomeBasis: 'budget',
          expensesSource: 'budget',
          expensesBasis: 'budget',
          budgetIncomeEntries: [entry({ id: 'inc-1', name: 'Salaris', annualAmount: 60000 })],
          budgetExpenseEntries: [
            entry({ id: 'exp-1', name: 'Vaste lasten', annualAmount: 36000 }),
          ],
          savingsRate6m: 5,
          effectiveSavingsRatePct: 40,
          computedMonthlyExpenses: 3800,
          monthlyBreakdown: Array.from({ length: 12 }, (_, i) => ({
            label: `maand ${i + 1}`,
            income: 4000,
            expenses: 3800,
          })),
        })}
      />,
    )
    const sheet = openVia('Spaarquote')
    // De bedragen van het afgeleide blok…
    expect(within(sheet).getAllByText('€ 5.000').length).toBeGreaterThan(0)
    expect(within(sheet).getAllByText('€ 3.000').length).toBeGreaterThan(0)
    // …en het percentage dat daarbij hoort.
    expect(within(sheet).getAllByText('40%').length).toBeGreaterThan(0)
    // De rauwe transactiequote mag hier nergens staan — ook niet op de kaart.
    expect(screen.queryByText('5%')).toBeNull()
  })

  it('houdt de rauwe 6-maands quote onder de TRANSACTIE-kassabon', () => {
    // Beide grondslagen op transactie: dan is de 6-maands quote wél het getal
    // dat uit de getoonde rijen volgt.
    render(
      <CashflowInstellingenBlok
        data={makeData({ savingsRate6m: 5, effectiveSavingsRatePct: 5 })}
      />,
    )
    const sheet = openVia('Spaarquote')
    expect(within(sheet).getByText(/Σ Inkomen \(6 mnd\)/i)).toBeTruthy()
    expect(within(sheet).getAllByText('5%').length).toBeGreaterThan(0)
  })

  it('laat de correctieregels weg zodra één grondslag budget of handmatig is', () => {
    render(
      <CashflowInstellingenBlok
        data={{
          ...makeData({ incomeSource: 'budget', incomeBasis: 'budget' }),
          savingsBudgetTotal6m: 1200,
          debtAflossingTotal6m: 600,
        }}
      />,
    )
    const sheet = openVia('Spaarquote')
    // De kassabon-correctieregels zelf (niet de uitleg-tekst eronder).
    expect(within(sheet).queryByText('+ Sparen in budgetten')).toBeNull()
    expect(within(sheet).queryByText('+ Schuldaflossing')).toBeNull()
    // Maar de uitkomst zelf blijft de canonieke spaarquote uit de bundel.
    expect(within(sheet).getAllByText('25%').length).toBeGreaterThan(0)
  })
})

describe('CashflowInstellingenBlok — grondslag is zichtbaar op elke kaart', () => {
  it('toont "uit je transacties" wanneer de bundel dat als grondslag geeft', () => {
    render(<CashflowInstellingenBlok data={makeData()} />)
    expect(screen.getAllByText('uit je transacties').length).toBeGreaterThanOrEqual(3)
  })

  it('toont "uit je budgetten" en het budgetbedrag wanneer de bundel budget-grondslag geeft', () => {
    render(
      <CashflowInstellingenBlok
        data={makeData({ incomeSource: 'budget', incomeBasis: 'budget' })}
      />,
    )
    // Grondslag-label op de inkomenskaart.
    expect(screen.getAllByText('uit je budgetten').length).toBeGreaterThan(0)
    // Waarde = som van de geselecteerde inkomsten-budgetten (60.000 + 1.200),
    // niet de transactie-extrapolatie van 48.000.
    expect(screen.getAllByText('€ 61.200').length).toBeGreaterThan(0)
    // Inkomen budget, uitgaven transactie → gemengde grondslag op de spaarkaart.
    expect(screen.getByText('gemengde grondslag')).toBeTruthy()
  })

  it('toont "eigen invoer" bij een handmatige grondslag', () => {
    render(
      <CashflowInstellingenBlok
        data={makeData({ expensesSource: 'manual', expensesBasis: 'manual' })}
      />,
    )
    expect(screen.getAllByText('eigen invoer').length).toBeGreaterThan(0)
  })
})

describe('CashflowInstellingenBlok — budget-selectie', () => {
  it('vinkt een post uit, verlaagt het totaal optimistisch en schrijft bron + selectie in ÉÉN PUT', async () => {
    render(
      <CashflowInstellingenBlok
        data={makeData({ incomeSource: 'budget', incomeBasis: 'budget' })}
      />,
    )
    const sheet = openVia('Geschat jaarinkomen')
    const post = within(sheet).getByText('Belastingteruggaaf').closest('label')
    const checkbox = within(post as HTMLElement).getByRole('checkbox')
    fireEvent.click(checkbox)

    // Optimistisch: 61.200 − 1.200 = 60.000 op de kaart.
    await waitFor(() => expect(screen.getAllByText('€ 60.000').length).toBeGreaterThan(0))

    const put = fetchMock.mock.calls.find(
      ([url, init]) => String(url) === '/api/parameters' && (init as RequestInit)?.method === 'PUT',
    )
    expect(put).toBeTruthy()
    const body = JSON.parse((put?.[1] as RequestInit).body as string)
    expect(body.income_source).toBe('budget')
    expect(body.cashflow_basis_prefs).toEqual({
      v: 1,
      excludedIncomeBudgetIds: ['inc-2'],
      excludedExpenseBudgetIds: [],
    })
    // Eén call naar /api/parameters — nooit twee (bron los van selectie).
    const putCalls = fetchMock.mock.calls.filter(([url]) => String(url) === '/api/parameters')
    expect(putCalls).toHaveLength(1)
  })

  it('draait het vinkje terug en meldt het rustig wanneer de PUT mislukt', async () => {
    // De PUT weigert (bv. de nog niet uitgerolde kolom, of validatie); de
    // settings-refetch blijft werken. Zonder terugdraaien zou de gebruiker een
    // selectie blijven zien die nergens is opgeslagen — en die selectie werkt
    // door tot in het bruto Box 1-inkomen en de jaarruimte.
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url) === '/api/parameters' && init?.method === 'PUT') {
        return { ok: false, status: 400, json: async () => ({ error: 'Ongeldig verzoek' }) } as unknown as Response
      }
      return { ok: true, json: async () => makeData() } as unknown as Response
    })

    render(
      <CashflowInstellingenBlok
        data={makeData({ incomeSource: 'budget', incomeBasis: 'budget' })}
      />,
    )
    const sheet = openVia('Geschat jaarinkomen')
    const post = within(sheet).getByText('Belastingteruggaaf').closest('label')
    const checkbox = within(post as HTMLElement).getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(true)

    fireEvent.click(checkbox)

    // Melding zichtbaar…
    await waitFor(() =>
      expect(
        within(screen.getByRole('dialog')).getByText(/Niet gelukt om dit op te slaan/i),
      ).toBeTruthy(),
    )
    // …en het vinkje staat terug in de oude staat.
    const postAfter = within(screen.getByRole('dialog'))
      .getByText('Belastingteruggaaf')
      .closest('label')
    const checkboxAfter = within(postAfter as HTMLElement).getByRole('checkbox') as HTMLInputElement
    expect(checkboxAfter.checked).toBe(true)
    // Het bedrag is dus ook níet stilletjes verlaagd.
    expect(screen.getAllByText('€ 61.200').length).toBeGreaterThan(0)
    expect(screen.queryByText('€ 60.000')).toBeNull()
  })

  it('behandelt een 200 zónder cashflow_basis_prefs in de response als mislukt', async () => {
    // De route geeft 200 wanneer de nog niet uitgerolde kolom uit de payload is
    // gestript: de bronwaarde IS opgeslagen, de selectie NIET — en hij laat het
    // veld daarom uit de response. `res.ok` is hier dus het verkeerde signaal.
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url) === '/api/parameters' && init?.method === 'PUT') {
        const sent = init.body ? JSON.parse(init.body as string) : {}
        const { cashflow_basis_prefs: _stripped, ...persisted } = sent
        return { ok: true, json: async () => ({ success: true, ...persisted }) } as unknown as Response
      }
      return { ok: true, json: async () => makeData() } as unknown as Response
    })

    render(
      <CashflowInstellingenBlok
        data={makeData({ incomeSource: 'budget', incomeBasis: 'budget' })}
      />,
    )
    const sheet = openVia('Geschat jaarinkomen')
    const post = within(sheet).getByText('Belastingteruggaaf').closest('label')
    fireEvent.click(within(post as HTMLElement).getByRole('checkbox'))

    await waitFor(() =>
      expect(
        within(screen.getByRole('dialog')).getByText(/Niet gelukt om dit op te slaan/i),
      ).toBeTruthy(),
    )
    const postAfter = within(screen.getByRole('dialog'))
      .getByText('Belastingteruggaaf')
      .closest('label')
    expect(
      (within(postAfter as HTMLElement).getByRole('checkbox') as HTMLInputElement).checked,
    ).toBe(true)
    expect(screen.queryByText('€ 60.000')).toBeNull()
  })

  it('meldt niets wanneer alleen het verversen ná een geslaagde PUT mislukt', async () => {
    // De schrijfactie is geslaagd (response bevestigt de selectie); alleen het
    // verversen faalt. De optimistische weergave is dan de waarheid.
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('cashflow-settings')) {
        return { ok: false, status: 500, json: async () => ({ error: 'x' }) } as unknown as Response
      }
      const sent = init?.body ? JSON.parse(init.body as string) : {}
      return { ok: true, json: async () => ({ success: true, ...sent }) } as unknown as Response
    })

    render(
      <CashflowInstellingenBlok
        data={makeData({ incomeSource: 'budget', incomeBasis: 'budget' })}
      />,
    )
    const sheet = openVia('Geschat jaarinkomen')
    const post = within(sheet).getByText('Belastingteruggaaf').closest('label')
    fireEvent.click(within(post as HTMLElement).getByRole('checkbox'))

    await waitFor(() => expect(screen.getAllByText('€ 60.000').length).toBeGreaterThan(0))
    expect(screen.queryByText(/Niet gelukt om dit op te slaan/i)).toBeNull()
  })

  it('valt zichtbaar terug op transacties wanneer alles is uitgevinkt (nooit €0)', async () => {
    render(
      <CashflowInstellingenBlok
        data={makeData({
          incomeSource: 'budget',
          incomeBasis: 'budget',
          budgetIncomeEntries: [
            entry({ id: 'inc-1', name: 'Salaris', annualAmount: 60000, excluded: true }),
          ],
        })}
      />,
    )
    const sheet = openVia('Geschat jaarinkomen')
    expect(within(sheet).getByText(/We rekenen daarom voorlopig met je transacties/i)).toBeTruthy()
    // Kaart valt terug op de transactiegrondslag i.p.v. €0.
    expect(screen.getAllByText('€ 48.000').length).toBeGreaterThan(0)
    expect(screen.getAllByText('uit je transacties').length).toBeGreaterThan(0)
  })

  it('markeert een post die terugvalt op de planning als zwakker getal', () => {
    render(
      <CashflowInstellingenBlok
        data={makeData({
          incomeSource: 'budget',
          incomeBasis: 'budget',
          budgetIncomeEntries: [
            entry({ id: 'inc-1', name: 'Salaris', annualAmount: 60000 }),
            entry({
              id: 'inc-2',
              name: 'Belastingteruggaaf',
              annualAmount: 1200,
              source: 'planned',
              realizedMonths: 0,
              plannedAnnualAmount: 1200,
            }),
          ],
        })}
      />,
    )
    const sheet = openVia('Geschat jaarinkomen')
    expect(within(sheet).getByText('gepland — nog geen transacties gelogd')).toBeTruthy()
    // De gerealiseerde post die niet van zijn planning afwijkt, blijft stil.
    expect(within(sheet).queryByText(/^gepland €/)).toBeNull()
  })

  it('toont het geplande bedrag erbij zodra de realisatie er wezenlijk van afwijkt', () => {
    render(
      <CashflowInstellingenBlok
        data={makeData({
          incomeSource: 'budget',
          incomeBasis: 'budget',
          budgetIncomeEntries: [
            entry({
              id: 'inc-1',
              name: 'Salaris',
              annualAmount: 60000,
              plannedAnnualAmount: 48000, // 12.000 hoger dan begroot
            }),
          ],
        })}
      />,
    )
    const sheet = openVia('Geschat jaarinkomen')
    expect(within(sheet).getByText(/gepland € 4\.000 per maand/)).toBeTruthy()
  })

  it('zegt het rustig wanneer op minder dan het volle venster is gemeten', () => {
    // `realizedWindowMonths` staat in productie ALTIJD op 12; het aantal maanden
    // met werkelijke data zit per post in `realizedMonths`. De regel hangt dus
    // aan de posten, niet aan de venster-constante — anders was hij onbereikbaar.
    // Leunt ÉLKE post op een korter venster, dan is de spanne het hele verhaal.
    render(
      <CashflowInstellingenBlok
        data={makeData({
          incomeSource: 'budget',
          incomeBasis: 'budget',
          budgetIncomeEntries: [
            entry({ id: 'inc-1', name: 'Salaris', annualAmount: 60000, realizedMonths: 5 }),
            entry({ id: 'inc-2', name: 'Bijverdienste', annualAmount: 1200, realizedMonths: 3 }),
          ],
        })}
      />,
    )
    const sheet = openVia('Geschat jaarinkomen')
    expect(
      within(sheet).getByText(/Gemeten over 3–5 maanden en doorgerekend naar een heel jaar/i),
    ).toBeTruthy()
  })

  it('B-017: een post met een vol jaar mag een korte post niet wegdrukken', () => {
    // De regel werd samengevat met `Math.max` over de posten, dus "Salaris" (12
    // maanden) zette 'm op 12 en liet de melding vallen — terwijl "Bijverdienste"
    // uit 2 maanden ×6 was doorgerekend. Precies het "bovenaan 12 maanden, in de
    // budgetten 10 of 2" uit de melding.
    render(
      <CashflowInstellingenBlok
        data={makeData({
          incomeSource: 'budget',
          incomeBasis: 'budget',
          budgetIncomeEntries: [
            entry({ id: 'inc-1', name: 'Salaris', annualAmount: 60000, realizedMonths: 12 }),
            entry({ id: 'inc-2', name: 'Bijverdienste', annualAmount: 1200, realizedMonths: 2 }),
          ],
        })}
      />,
    )
    const sheet = openVia('Geschat jaarinkomen')
    expect(
      within(sheet).getByText(
        /1 van de 2 posten is gemeten over 2 maanden en doorgerekend naar een heel jaar/i,
      ),
    ).toBeTruthy()
  })

  it('zwijgt over het meetvenster zodra ELKE post het volle jaar dekt', () => {
    render(
      <CashflowInstellingenBlok
        data={makeData({ incomeSource: 'budget', incomeBasis: 'budget' })}
      />,
    )
    const sheet = openVia('Geschat jaarinkomen')
    expect(within(sheet).queryByText(/doorgerekend naar een heel jaar/i)).toBeNull()
  })

  it('B-017: de transactie-kassabon meldt zijn eigen extrapolatie', () => {
    // "Totaal (12 mnd)" met eronder een "≈ €X/mnd" uit het GEËXTRAPOLEERDE jaar:
    // twee noemers zolang er minder dan twaalf maanden historie is. Dezelfde
    // zin als onder de budget-kassabon — één formulering voor één feit.
    render(
      <CashflowInstellingenBlok
        data={makeData({ incomeSource: 'transaction', incomeBasis: 'transaction', incomeMonths: 5 })}
      />,
    )
    const sheet = openVia('Geschat jaarinkomen')
    expect(
      within(sheet).getByText(/Gemeten over 5 maanden en doorgerekend naar een heel jaar/i),
    ).toBeTruthy()
  })

  it('de transactie-kassabon zwijgt bij een volle jaarhistorie', () => {
    render(
      <CashflowInstellingenBlok
        data={makeData({ incomeSource: 'transaction', incomeBasis: 'transaction' })}
      />,
    )
    const sheet = openVia('Geschat jaarinkomen')
    expect(within(sheet).queryByText(/doorgerekend naar een heel jaar/i)).toBeNull()
  })

  it('meldt een vermoedelijke afkapping zonder alarm', () => {
    render(
      <CashflowInstellingenBlok
        data={makeData({
          incomeSource: 'budget',
          incomeBasis: 'budget',
          budgetIncomeOpts: { truncationSuspected: true },
        })}
      />,
    )
    const sheet = openVia('Geschat jaarinkomen')
    expect(
      within(sheet).getByText(/dit bedrag kan aan de lage kant zijn/i),
    ).toBeTruthy()
  })

  it('schakelt de budget-keuze uit met uitleg wanneer er geen budgetten van dat type zijn', () => {
    render(<CashflowInstellingenBlok data={makeData({ budgetIncomeEntries: [] })} />)
    const sheet = openVia('Geschat jaarinkomen')
    const groep = within(sheet).getByRole('radiogroup', { name: 'Grondslag voor je inkomen' })
    const radios = within(groep).getAllByRole('radio')
    expect((radios[0] as HTMLInputElement).disabled).toBe(true)
    expect(
      within(groep).getByText('Je hebt nog geen inkomsten-budgetten om uit te rekenen.'),
    ).toBeTruthy()
  })
})

/**
 * Eenvoudig-modus zichtbaarheid: de instellingen (inkomen, spaarquote,
 * uitgaven) MOETEN óók in 'simple' zichtbaar blijven — het blok wordt op de
 * pagina bewust NIET in <HideInSimple> gewrapt. De controle-case toont dat
 * HideInSimple in dezelfde 'simple'-context wél verbergt (zodat de test
 * daadwerkelijk discrimineert).
 */
describe('CashflowInstellingenBlok — zichtbaar in Eenvoudig', () => {
  it('blijft in modus simple zichtbaar en bedienbaar (geen HideInSimple)', () => {
    render(
      <DisplayModeProvider initialMode="simple">
        <CashflowInstellingenBlok data={makeData()} />
      </DisplayModeProvider>,
    )
    // De strip reduceert in Eenvoudig bewust naar twee cellen (app-brede norm,
    // SIMPLE_MAX_FIGURES) — maar het blok zelf blijft staan, mét zijn ingang.
    expect(screen.getByText('Geschat jaarinkomen')).toBeTruthy()
    expect(screen.getByText('Spaarquote')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Instellingen aanpassen/i })).toBeTruthy()
  })

  it('controle: HideInSimple verbergt zijn inhoud wél in modus simple', () => {
    render(
      <DisplayModeProvider initialMode="simple">
        <HideInSimple>
          <CashflowInstellingenBlok data={makeData()} />
        </HideInSimple>
      </DisplayModeProvider>,
    )
    expect(screen.queryByText('Geschat jaarinkomen')).toBeNull()
  })
})
