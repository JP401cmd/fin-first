import type { ResolvedBasis } from './budget-basis'

export type { ResolvedBasis }

export interface IncomeExpenseSources {
  net_monthly_income?: number | null
  estimated_monthly_expenses?: number | null
  income_source?: string | null
  expenses_source?: string | null
}

export interface ResolvedAmount {
  amount: number
  basis: ResolvedBasis
}

/**
 * DE grondslagbeslissing (ADR 0103) — één plek, één precedentie.
 *
 * Vóór dit besluit stond "welk getal is het effectieve inkomen" op vijf plaatsen
 * onafhankelijk gecodeerd, waarvan er vier alleen `manual` versus "berekend"
 * kenden. Een derde bronwaarde toevoegen zonder die vijf tot één te brengen
 * vermenigvuldigt de drift in plaats van hem te dragen.
 *
 * Precedentie, per veld onafhankelijk:
 *   • `'manual'`      → het handmatige bedrag, altijd, ook als het 0 is. Een door
 *                       de gebruiker ingevuld bedrag wordt door niets overruled.
 *   • `'budget'`      → de budgetsom als die > 0, anders de transactiewaarde als
 *                       die > 0, anders de profielschatting.
 *   • `'transaction'` → de transactiewaarde als die > 0, anders de profielschatting.
 *   • `'auto'` / leeg / onbekend → budget als > 0, anders transactie als > 0,
 *                       anders de profielschatting.
 *   • `'estimate'`    → als `'auto'` (echte data verdringt de gok vanzelf), maar
 *                       wint het profiel dan heet de grondslag `'estimate'`
 *                       (ADR 0131 — de app heeft geraden; het label reist mee).
 *
 * De uitkomst is NOOIT `'auto'`: dat is een strategie ("kies voor mij"), geen
 * grondslag. `'profile'` is de terugval en gebruikt dezelfde profielkolom als
 * `'manual'` — het verschil zit in de uitspraak, niet in het getal.
 *
 * ONBEKEND IS GEEN NUL (ADR 0131): valt de keten helemaal door tot het profiel
 * en staat dáár niets (0/leeg — de DB-default na "Later invullen"), dan is de
 * grondslag `'unknown'`. Het bedrag blijft numeriek 0 zodat de rekenketen niet
 * op NaN/null hoeft te toetsen, maar de VLAG draagt de betekenis: consumenten
 * die een oordeel vellen (score, spaarquote, briefing) toetsen de grondslag en
 * onthouden zich. Alleen `'manual'` met 0 is een geverifieerde nul — de gebruiker
 * koos dat, en dat blijft `'manual'`.
 *
 * SCHAALVRIJ: de functie kent geen maand of jaar. De caller kiest de eenheid en
 * levert alle drie de bedragen in DEZELFDE eenheid aan (maandbedragen voor de
 * cashflow-kaarten, jaarbedragen voor de FIRE-/Box 1-keten).
 */
export function resolveAmountWithBasis(
  source: string | null | undefined,
  profileAmount: number,
  transactionAmount: number,
  budgetAmount?: number | null,
): ResolvedAmount {
  if (source === 'manual') return { amount: profileAmount, basis: 'manual' }

  const budget = Number(budgetAmount ?? 0)
  const budgetUsable = Number.isFinite(budget) && budget > 0
  const txUsable = transactionAmount > 0

  // 'transaction' slaat de budgetsom bewust over: wie expliciet op de gemeten
  // werkelijkheid stuurt, mag daar niet stil door zijn budgetten van worden
  // afgeduwd (ADR 0103 — dat is precies waarom deze waarde bestaat).
  if (source !== 'transaction' && budgetUsable) return { amount: budget, basis: 'budget' }
  if (txUsable) return { amount: transactionAmount, basis: 'transaction' }

  const profileUsable = Number.isFinite(profileAmount) && profileAmount > 0
  if (!profileUsable) return { amount: 0, basis: 'unknown' }
  return { amount: profileAmount, basis: source === 'estimate' ? 'estimate' : 'profile' }
}

/**
 * Grondslag voor een OORDEEL (score, briefing): een meting over een breder
 * venster telt als bekend, ook als de lopende maand nog leeg is.
 *
 * De effectieve maandgrondslag (`resolveEffectiveIncomeExpenses`) rekent op de
 * LOPENDE kalendermaand; op de 2e van de maand is die bij een transactie-
 * gebruiker nog leeg en valt hij door naar het profiel. Zonder deze correctie
 * zou zo'n gebruiker één dag per maand "inkomen onbekend" te zien krijgen
 * terwijl er zes maanden aan boekingen liggen. De caller geeft daarom de
 * bredere meting (6-/12-maands som of gemiddelde) mee; is die > 0, dan is de
 * kant bekend op de transactiegrondslag.
 */
export function judgementBasis(effectiveBasis: ResolvedBasis, measuredWide: number): ResolvedBasis {
  if (effectiveBasis === 'unknown' && Number.isFinite(measuredWide) && measuredWide > 0) {
    return 'transaction'
  }
  return effectiveBasis
}

/**
 * Bepaalt het effectieve MAANDinkomen en de maanduitgaven, plus de grondslag
 * waarop elk van beide staat.
 *
 * Het `budget`-argument is optioneel: een aanroeper die het weglaat krijgt exact
 * de getallen van vóór ADR 0103 terug (auto → transactie indien > 0, anders de
 * profielschatting; manual → het handmatige bedrag). Vergrendeld in
 * lib/effective-financials.test.ts.
 */
export function resolveEffectiveIncomeExpenses(
  profile: IncomeExpenseSources,
  txIncome: number,
  txExpenses: number,
  budget?: { income: number | null; expenses: number | null },
): { income: number; expenses: number; incomeBasis: ResolvedBasis; expensesBasis: ResolvedBasis } {
  const manualIncome = Number(profile.net_monthly_income ?? 0)
  const manualExpenses = Number(profile.estimated_monthly_expenses ?? 0)

  const income = resolveAmountWithBasis(profile.income_source, manualIncome, txIncome, budget?.income)
  const expenses = resolveAmountWithBasis(
    profile.expenses_source,
    manualExpenses,
    txExpenses,
    budget?.expenses,
  )

  return {
    income: income.amount,
    expenses: expenses.amount,
    incomeBasis: income.basis,
    expensesBasis: expenses.basis,
  }
}
