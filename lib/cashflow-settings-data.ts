import type { SupabaseClient } from '@supabase/supabase-js'
import { loadCoreData } from '@/lib/core-data-loader'
import { getCachedUser } from '@/lib/supabase/cached-user'
import type { FinancialInput, SavingsRateMethod } from '@/lib/core-metrics'
import type { RetirementExpenseMethod } from '@/lib/budget-utils'
import type { FireEndStrategy } from '@/lib/fire-strategy'
import type { BasisSource, BudgetBasisResult, ResolvedBasis } from '@/lib/budget-basis'
import type { RecentDailyExpenseRate } from '@/lib/expense-rate'

export interface CashflowSettingsData {
  /** TRANSACTIE-grondslag: het 12-maands geëxtrapoleerde inkomen ("berekend"). */
  estimatedAnnualIncome: number
  /**
   * Het EFFECTIEVE jaarinkomen op de gekozen grondslag (ADR 0103) — dít is het
   * getal op de "Geschat jaarinkomen"-kaart, en dezelfde waarde die de FIRE-keten
   * en het bruto Box 1-inkomen voeden. Consumenten beslissen de grondslag NIET
   * opnieuw; `incomeBasis` zegt waar het vandaan komt.
   */
  effectiveAnnualIncome: number
  netMonthlyIncome: number
  /**
   * De RAUWE 6-maands TRANSACTIEquote. Hoort bij de transactie-kassabon: hij
   * verklaart de 6-maands bedragen die daar staan.
   */
  savingsRate6m: number
  /**
   * De EFFECTIEVE spaarquote (%) op de gekozen grondslag (ADR 0103) — hetzelfde
   * percentage waarop de gezondheidsscore en de FIRE-prognose draaien.
   *
   * DIT is het getal dat het instellingenblok toont, ook (en juist) onder het
   * afgeleide kassabon-blok: dáár staan effectieve, grondslag-geresolveerde
   * bedragen, en `savingsRate6m` eronder zetten zou een transactiepercentage bij
   * budgetbedragen plaatsen. Gelijk aan `savingsRate6m` zolang beide grondslagen
   * 'transaction' zijn.
   */
  effectiveSavingsRatePct: number
  targetSavingsRate: number | null
  estimatedMonthlyExpenses: number
  retirementExpenseMethod: RetirementExpenseMethod
  retirementCustomAmount: number
  budgetingActive: boolean
  fireInput: FinancialInput
  grossReturn: number
  effectiveSwr: number
  inflationRate: number
  fireStrategy: { strategy: FireEndStrategy; endAge: number }
  /**
   * De KEUZE van de gebruiker (ADR 0103): 'budget' | 'transaction' | 'manual', of
   * 'auto' zolang hij nooit koos. 'auto' is geen optie in de interface.
   */
  incomeSource: BasisSource
  expensesSource: BasisSource
  /**
   * De UITKOMST van de grondslagbeslissing — nooit 'auto'. Hierop benoemt de kaart
   * zichtbaar waar zijn getal vandaan komt ("uit je budgetten" / "uit je
   * transacties" / "eigen bedrag"); zonder die vermelding zou een grondslag die
   * kan schuiven een tweede waarheid met vertraging zijn.
   *
   * ELK VELD HOORT BIJ HET BEDRAG IN DÍT type, niet bij een gelijknamig bedrag
   * elders in de app:
   *  • `incomeBasis`   ↔ `effectiveAnnualIncome` (12-maands grootheid);
   *  • `expensesBasis` ↔ `computedMonthlyExpenses` / de grondslag waarop
   *    `savingsRate6m` staat (6-maands gemiddelde).
   *
   * Ze komen dus BEWUST NIET uit de huidige-maand-resolutie van de core-bundel
   * (`monthlyIncomeBasis`/`monthlyExpensesBasis`). Dat was de bug: het label kwam
   * uit de kalendermaand terwijl het bedrag ernaast de 12-maands-extrapolatie
   * was, en die twee lopen uiteen zodra er in de lopende maand nog geen inkomen
   * geboekt is (label 'profile' naast een transactie-bedrag).
   */
  incomeBasis: ResolvedBasis
  expensesBasis: ResolvedBasis
  /**
   * De budgetgrondslag per kant, met ALLE selecteerbare posten (ook de
   * uitgesloten) zodat het detailvenster de aanvinklijst kan tonen.
   * `hasBudgets: false` → er valt niets te kiezen; `allExcluded: true` → alles
   * uitgesloten, de grondslag valt terug op transacties (zichtbare melding).
   */
  budgetIncome: BudgetBasisResult
  budgetExpenses: BudgetBasisResult
  /**
   * Hoe de getoonde spaarquote tot stand kwam: 'transaction' (echte 6-mnd
   * transacties), 'estimate' (uit profiel-schattingen) of 'net_worth_delta'
   * (afgeleid uit vermogensgroei). De UI toont een schatting-badge bij de
   * laatste twee, zodat de gebruiker weet dat het een benadering is.
   */
  savingsRateMethod: SavingsRateMethod
  /** Transaction-computed monthly expenses (distinct from estimatedMonthlyExpenses = stored profile value). */
  computedMonthlyExpenses: number
  /**
   * Het CANONIEKE dagtarief (€/dag) uit `lib/expense-rate.ts` — 12-mnd rolling
   * gerealiseerde uitgaven ×12/365, doorgegeven uit `CorePageData`.
   *
   * ── Waarom dit veld er is (M22, besluit B1) ─────────────────────────────
   * Dit blok rekende zélf `dailyExpenseRate(monthlyExpenses)` op de GEKOZEN
   * grondslag (ADR 0103) — bij de tak 'budget' dus op budgetbedragen, bij
   * 'computed' op het 6-maands gemiddelde. Dat was de derde wisselkoers in
   * dezelfde module: "Eén dag vrijheid kost je nu €106" hier, terwijl de rest
   * van de app met ~€124/dag rekende.
   *
   * De grondslagkeuze blijft bepalen welk BEDRAG er staat; het dagtarief is
   * geen grondslagkeuze maar een app-brede wisselkoers. De kassabon blijft
   * kloppend doordat de regel eronder benoemt wáár het tarief vandaan komt —
   * dat is de "grondslagregel" uit B1, niet een tarief dat stilzwijgend met een
   * vinkje meebeweegt.
   */
  dailyExpenseRate: number
  /**
   * Herkomst van dat tarief (`CorePageData.dailyExpenseRateSource`): de
   * voetnoot onder de vrijheidstijd noemt een profielschatting dan ook zo,
   * i.p.v. een hardcoded "gemeten" (1b, nazorg R2+R3). Optioneel voor fixtures.
   */
  dailyExpenseRateSource?: RecentDailyExpenseRate['source']
  /** 6-maands spaarbudget-stortingen (correctie-component van savingsRate6m). */
  savingsBudgetTotal6m: number
  /** 6-maands schuldaflossing (correctie-component van savingsRate6m). */
  debtAflossingTotal6m: number
  /**
   * Vaste 12-maands reeks (oudste → nieuwste) van inkomsten/uitgaven per
   * kalendermaand, rechtstreeks uit `loadCoreData` (transfer-gefilterde
   * transacties, geen extra query). De inkomen-kassabon toont alle 12 rijen;
   * de spaarquote-kassabon gebruikt de laatste 6; de hefboomkaarten gebruiken
   * 'm als trend-achtergrond.
   */
  monthlyBreakdown: { label: string; income: number; expenses: number }[]
}

/**
 * Leest het spaarquote-doel (doel-%) uit de goals-bron: de door het /toekomst-lab
 * gegenereerde parameter-rij (`goal_type='savings_rate'`, `metadata.bron='parameter'`,
 * nog niet afgerond). Ronde 4 (besluit 3): de goals-rij is dé bron voor het
 * spaarquote-doel; `profiles.target_savings_rate` is DEPRECATED en dient enkel nog
 * als fallback zolang er geen parameter-rij bestaat.
 *
 * Eén gerichte, kolom-scoped query (hergebruikt door `loadCashflowSettingsData` én
 * de `GET /api/parameters`-route — geen duplicatie). Tolerant: elke fout (bv. de
 * `metadata`-kolom ontbreekt nog op een legacy-DB) → `null`, zodat de caller
 * terugvalt op de profielkolom en het bestaande default-gedrag intact blijft.
 *
 * @returns het doel-% uit de goals-rij, of `null` als er geen (open) parameter-rij is.
 */
export async function loadParameterSavingsRateTarget(
  supabase: SupabaseClient,
  userId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from('goals')
    .select('target_value')
    .eq('user_id', userId)
    .eq('goal_type', 'savings_rate')
    .eq('metadata->>bron', 'parameter')
    .eq('is_completed', false)
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  const v = Number((data as { target_value: unknown }).target_value)
  return Number.isFinite(v) ? v : null
}

/**
 * Assembles a serializable props-bundle for the cashflow-instellingen-blok.
 * Reuses the request-level cached `loadCoreData` call — within a single
 * server render this is a no-op if the loader has already run.
 *
 * Idem voor de auth-check: `getCachedUser` is `cache()`-gewrapt en deelt de ene
 * `/auth/v1/user`-roundtrip met de andere loaders in dezelfde render. Een rauwe
 * `auth.getUser()` was hier extra duur omdat hij als eerste, blokkerende stap
 * vóór alle vervolgqueries staat.
 */
export async function loadCashflowSettingsData(
  supabase: SupabaseClient,
): Promise<CashflowSettingsData | null> {
  const user = await getCachedUser(supabase)
  if (!user) return null

  // loadCoreData is wrapped with React cache() — no duplicate DB round-trips
  // when called multiple times within the same server request.
  const core = await loadCoreData(supabase)

  // Re-read only the profile columns that core-data-loader does NOT expose as
  // individual fields (target_savings_rate, net_monthly_income,
  // estimated_monthly_expenses). The retirement columns are already available
  // via core.retirementMethodUsed, but we read the raw numbers here too.
  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'date_of_birth, target_savings_rate, net_monthly_income, estimated_monthly_expenses, retirement_expense_method, retirement_expense_custom_amount, income_source, expenses_source',
    )
    .eq('id', user.id)
    .maybeSingle()

  // Spaarquote-doel: goals-bron wint, profielkolom is fallback (ronde 4, besluit 3).
  const goalTargetSavingsRate = await loadParameterSavingsRateTarget(supabase, user.id)

  const rf = core.rawFinancials

  // Build the FinancialInput bundle that recomputeFireFromSettings expects.
  // monthlyContributions: sum of monthly_contribution fields on fullAssets —
  // cast to unknown first because the Asset type doesn't declare that column,
  // but the DB row may carry it via the wildcard select in the loader.
  const fireInput: FinancialInput = {
    totalAssets: rf.totalAssets,
    totalDebts: rf.totalDebts,
    monthlyIncome: rf.monthlyIncome,
    monthlyExpenses: rf.monthlyExpenses,
    yearlyMustExpenses: rf.yearlyRetirementExpenses ?? rf.yearlyMustExpenses,
    monthlyContributions: core.fullAssets.reduce(
      (s, a) =>
        s + Number((a as unknown as { monthly_contribution?: number }).monthly_contribution ?? 0),
      0,
    ),
    dateOfBirth: profile?.date_of_birth ?? null,
    last12MonthsIncome: rf.extrapolatedIncome,
  }

  return {
    estimatedAnnualIncome: rf.extrapolatedIncome,
    effectiveAnnualIncome: rf.effectiveAnnualIncome,
    netMonthlyIncome: Number(profile?.net_monthly_income ?? 0),
    savingsRate6m: core.savingsRate6m,
    effectiveSavingsRatePct: core.effectiveSavingsRatePct,
    targetSavingsRate: goalTargetSavingsRate ?? profile?.target_savings_rate ?? null,
    estimatedMonthlyExpenses: Number(profile?.estimated_monthly_expenses ?? 0),
    retirementExpenseMethod:
      (profile?.retirement_expense_method as RetirementExpenseMethod) ??
      core.retirementMethodUsed,
    retirementCustomAmount: Number(profile?.retirement_expense_custom_amount ?? 0),
    budgetingActive: core.budgetingActive,
    fireInput,
    grossReturn: core.fireParams.grossReturn,
    effectiveSwr: core.fireParams.effectiveSwr,
    inflationRate: core.fireParams.inflationRate,
    fireStrategy: {
      strategy: core.fireStrategy.strategy,
      endAge: core.fireStrategy.endAge,
    },
    // Grondslag: CONSUME uit de core-bundel — daar ontstaat de beslissing één
    // keer (ADR 0103), hier wordt ze niet opnieuw genomen. De PAARVORMING is de
    // enige keuze die hier valt: dit type levert een JAARinkomen en een
    // 6-MAANDS uitgavencijfer, dus het neemt de basis van precies die twee
    // resoluties over — niet die van de huidige kalendermaand.
    incomeSource: core.incomeSource,
    expensesSource: core.expensesSource,
    incomeBasis: core.annualIncomeBasis,
    expensesBasis: core.savingsExpensesBasis,
    budgetIncome: core.budgetIncome,
    budgetExpenses: core.budgetExpenses,
    savingsRateMethod: core.savingsRateMethod,
    // Transactie-berekend (6-mnd gemiddelde), bewust NIET rf.monthlyExpenses —
    // dat is de effectieve (post-resolver) waarde die bij een handmatige
    // override gelijk is aan het ingevoerde bedrag. extHalfYearExpenses komt
    // puur uit transacties, dus de kassabon toont "berekend" los van "handmatig".
    computedMonthlyExpenses: Math.round(core.savingsReceiptData.extHalfYearExpenses / 6),
    // Doorgeef-veld, GEEN eigen som: `loadCoreData` heeft het canonieke tarief
    // al langs `recentDailyExpenseRateFromRows` gehaald (M22).
    dailyExpenseRate: core.dailyExpenseRate ?? 0,
    dailyExpenseRateSource: core.dailyExpenseRateSource ?? (core.dailyExpenseRate ? 'transactions' : 'none'),
    // Per-maand reeks (12 slots, oudste → nieuwste) uit dezelfde core-load —
    // serializable en zonder extra DB-round-trip.
    monthlyBreakdown: core.monthlyIncomeExpenseSeries,
    savingsBudgetTotal6m: core.savingsBudgetTotal6m,
    debtAflossingTotal6m: core.debtAflossingTotal6m,
  }
}
