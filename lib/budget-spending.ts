// lib/budget-spending.ts
// Gedeelde, pure aggregatie van uitgaven per budget — zodat verschillende
// oppervlakken (budgets-pagina, AI-lookup-tool) NIET elk hun eigen som maken.
//
// Canoniek gedrag (spiegelt lib/budgets-data-loader.ts):
//   - som van |amount| per budget_id over de gegeven transacties;
//   - split-regels tellen op hun eigen budget_id (parent-rij wordt overgeslagen);
//   - transfers tellen niet mee als besteding;
//   - op een UITGAVEN-budget (expense/debt) wordt een inkomst AFGETROKKEN van de
//     besteding: besteed = Sigma|negatieve rijen| - Sigma positieve rijen. Een
//     uitgave van 1.265 met inkomsten van 6.000 en 2.000 geeft dus -6.735, en
//     dat negatieve bedrag is ECHT: het wordt niet op 0 geklemd, want de
//     eigenaar wil zien dat er netto geld binnenkwam (norm-besluit 30 aug 2026,
//     verving de eerdere "uitsluiten"-lezing).
//   - op een INKOMSTEN-budget (income/savings) zit het precies andersom in
//     elkaar: de positieve rij IS de realisatie en telt op, een negatieve rij
//     (salariscorrectie, storno) gaat ERAF. +3.200 met -100 geeft dus 3.100.
//   - archive heeft geen richting: daar telt elk bedrag absoluut mee. Dat is de
//     teller "Deze maand: EUR X verschoven" van de post "Eigen rekening", en
//     daarom tellen de transfers daar juist wel.
//   - parent-rollup: een parent met kinderen = som van zijn kinderen, anders
//     zijn eigen directe besteding.
//
// Houdt bewust GEEN rekening met perspectief-weging of effectieve limieten —
// dat blijft loader/pagina-logica. Dit is enkel de spend-aggregatie + rollup.

export type SpendingTxRow = {
  /** Optioneel; alleen relevant voor callers die split-ids afleiden. */
  id?: string
  budget_id?: string | null
  amount: number | string
  is_income?: boolean | null
  transaction_type?: string | null
  is_split?: boolean | null
}

export type SpendingSplitRow = {
  budget_id?: string | null
  amount: number | string
}

/**
 * De budget-richtingen waarop een INKOMST van de besteding wordt AFGETROKKEN.
 * Dit is de kwalificatie "op een uitgaven-budget" uit de norm hierboven, en
 * zonder haar is de rekenregel aantoonbaar fout: op een `income`-budget IS de
 * positieve rij juist de realisatie ("Salaris & uitkering"), en op een
 * `archive`-budget ("Eigen rekening") zijn de transfers het hele punt.
 *
 * `budget_type` kent vijf waarden (lib/budget-data.ts): income · expense ·
 * savings · debt · archive. Alleen expense en debt lopen "de verkeerde kant
 * op" en krijgen daarom de aftrek.
 */
export const EXPENSE_DIRECTION_BUDGET_TYPES = ['expense', 'debt'] as const

/**
 * De spiegelbeeldige richtingen: hier IS de positieve rij de realisatie en gaat
 * een negatieve rij (correctie, storno, terugboeking) er juist AF. Een
 * salariscorrectie van −100 verlaagt dus de gerealiseerde €3.200 naar €3.100.
 *
 * `archive` hoort hier bewust NIET bij: dat is de "€X verschoven"-teller van de
 * post "Eigen rekening" en heeft geen richting — daar telt elk bedrag absoluut.
 */
export const INCOME_DIRECTION_BUDGET_TYPES = ['income', 'savings'] as const

/** True als op dit budget een uitgave de normale richting is. */
export function isExpenseDirectionBudget(budgetType: string | null | undefined): boolean {
  return budgetType === 'expense' || budgetType === 'debt'
}

/** True als op dit budget een inkomst de normale richting is. */
export function isIncomeDirectionBudget(budgetType: string | null | undefined): boolean {
  return budgetType === 'income' || budgetType === 'savings'
}

/**
 * De BIJDRAGE van een transactie-rij aan de bestedingssom van zijn budget.
 * Getekend: positief = besteding, negatief = geld dat terugkwam.
 *
 * Dit is geen filter maar een bedrag, en dat is het hele verschil met de
 * eerdere lezing. De norm luidt sinds 30 aug 2026: op een uitgaven-budget gaat
 * een inkomst ERAF (besteed = Sigma|negatief| - Sigma positief), niet eruit.
 *
 * `budgetType` is VERPLICHT en draagt de kwalificatie "op een uitgaven-budget"
 * uit de norm. Zonder richting zou de aftrek ook op inkomsten-, spaar- en
 * archief-budgetten slaan en daar de realisatie omkeren: EUR 4.401,81 aan
 * salaris/teruggave zou negatief worden en de 19 transfers van "Eigen rekening"
 * (EUR 277,56) zouden verdwijnen (beide gemeten op productie, augustus 2026).
 *
 * Op een uitgaven-richting (expense/debt):
 *   - transfer            -> 0 (telt nooit mee, geen van beide kanten op)
 *   - positief of is_income -> -|amount| (gaat van de besteding af)
 *   - anders              -> +|amount| (gewone uitgave)
 * Anders (income/savings/archive): altijd +|amount|.
 *
 * TEKEN VOOR VLAG: het teken is de harde marker. `is_income` doet mee omdat
 * callers die de kolom lezen er baat bij hebben, maar mag nooit de enige toets
 * zijn: de kolom is BOOLEAN DEFAULT false zonder CHECK tegen het teken. De
 * combinatie is_income=true met een negatief bedrag komt op productie 0x voor
 * (geverifieerd); zou ze ontstaan, dan wint de vlag en gaat het bedrag eraf.
 *
 * LET OP - alleen voor transactie-rijen. Split-regels gaan door
 * `splitContribution`; zie daar waarom ze geen teken-toets krijgen.
 */
export function spendingContribution(
  t: SpendingTxRow,
  budgetType: string | null | undefined,
): number {
  const amount = Number(t.amount) || 0
  const isTransfer =
    t.transaction_type === 'transfer' || t.transaction_type === 'joint_transfer'

  // Uitgaven-richting: uitgave telt op, inkomst gaat eraf.
  if (isExpenseDirectionBudget(budgetType)) {
    if (isTransfer) return 0
    if (amount > 0 || t.is_income === true) return -Math.abs(amount)
    return Math.abs(amount)
  }

  // Inkomsten-richting: exact het spiegelbeeld. De positieve rij IS de
  // realisatie en een negatieve rij (correctie/storno) gaat eraf. Dat is
  // precies `amount` zelf — het teken klopt al.
  if (isIncomeDirectionBudget(budgetType)) {
    if (isTransfer) return 0
    return amount
  }

  // archive + onbekend type: geen richting, dus absoluut tellen. Voor de
  // archief-post "Eigen rekening" ZIJN de transfers de realisatie (de teller
  // "Deze maand: €X verschoven"), dus die worden hier niet uitgesloten.
  return Math.abs(amount)
}

/**
 * De bijdrage van een SPLIT-regel. Altijd positief, zonder teken-toets en
 * zonder richting: `transaction_splits.amount` wordt POSITIEF opgeslagen (een
 * ouder van -29,24 staat in de DB als 4,50 + 24,74), dus het teken zegt daar
 * niets over inkomst-versus-uitgave. Een teken-regel over split-regels zou elke
 * split als inkomst aftrekken.
 */
export function splitContribution(s: SpendingSplitRow): number {
  return Math.abs(Number(s.amount) || 0)
}

/**
 * Bouwt de per-budget_id bestedingsmap. Split-transacties leveren hun bedragen
 * via `splits` aan; de parent-rij van een split wordt overgeslagen om dubbeltel
 * te voorkomen (gelijk aan de budgets-loader).
 *
 * `budgetTypes` is de canonieke type-map uit `buildBudgetTypeMap`
 * (lib/budget-utils.ts) — inclusief de erfregel dat een child het type van
 * zijn parent overneemt. VERPLICHT: zonder richting per budget kan
 * `spendingContribution` zijn kwalificatie niet toepassen.
 *
 * De uitkomst per budget KAN NEGATIEF ZIJN (meer inkomsten dan uitgaven op een
 * uitgaven-budget). Dat is bedoeld en mag niet op 0 geklemd worden; consumers
 * die een niet-negatieve grondslag nodig hebben — met name de rollover-carry —
 * klemmen zelf, bij de aanroep, met een expliciete reden.
 */
export function buildBudgetSpendingMap(
  transactions: SpendingTxRow[],
  splits: SpendingSplitRow[],
  budgetTypes: Map<string, string>,
): Record<string, number> {
  const spending: Record<string, number> = {}

  for (const t of transactions) {
    if (t.is_split) continue // bedragen leven op de splits
    if (!t.budget_id) continue
    spending[t.budget_id] =
      (spending[t.budget_id] ?? 0) + spendingContribution(t, budgetTypes.get(t.budget_id))
  }

  for (const s of splits) {
    if (!s.budget_id) continue
    spending[s.budget_id] = (spending[s.budget_id] ?? 0) + splitContribution(s)
  }

  return spending
}

/**
 * Bestede bedrag voor één budget, met parent-rollup. Een parent (kinderen
 * aanwezig) = som van de kinderen; een blad = zijn eigen directe besteding.
 */
export function spentForBudget(
  budgetId: string,
  childIds: string[],
  spending: Record<string, number>,
): number {
  if (childIds.length > 0) {
    return childIds.reduce((sum, cid) => sum + (spending[cid] ?? 0), 0)
  }
  return spending[budgetId] ?? 0
}

/**
 * Weergave-vulling van de budgetring, geklemd op [0, 1].
 *
 * De bestedingssom kan sinds de norm van 30 aug 2026 NEGATIEF zijn (meer
 * inkomsten dan uitgaven op een uitgaven-budget). Het BEDRAG blijft dan
 * negatief in beeld — dat is de expliciete wens — maar een ring vult niet
 * negatief en een percentage van -410% zegt niets. Klemmen gebeurt dus in de
 * WEERGAVE, nooit in de som.
 */
export function budgetFillRatio(spent: number, limit: number): number {
  if (!(limit > 0)) return 0
  return Math.max(0, Math.min(spent / limit, 1))
}

/** Weergave-percentage van een budget, geklemd op [0, 100]. */
export function budgetSpentPct(spent: number, limit: number): number {
  return Math.round(budgetFillRatio(spent, limit) * 100)
}

/**
 * Percentage voor BALK- en KLEUR-berekeningen: onderaan geklemd op 0, bovenaan
 * bewust NIET.
 *
 * Onmisbaar onderscheid met `budgetSpentPct`: de over-budget-staart moet
 * zichtbaar blijven. `computeBarSegments` heeft >100 nodig voor het
 * extensie-segment en de 105%-schaling, en `getHeatmapColor` kleurt pas rood
 * boven de 100. Zou je hier op 100 klemmen, dan verdwijnt élke
 * overschrijdings-signalering — een tweede bug in plaats van een fix. Alleen de
 * negatieve kant wordt weggenomen, want die produceert ongeldige CSS
 * (`width: -410%`) en een grijs-negatieve kleurstap.
 */
export function budgetBarPct(spent: number, limit: number): number {
  if (!(limit > 0)) return 0
  return Math.max(0, (spent / limit) * 100)
}

/**
 * Mag er vrijheidstijd bij dit bestedingsbedrag getoond worden?
 *
 * Vrijheidstijd drukt in deze app KOSTEN uit in levenstijd ("dit kostte je 14,5
 * dagen"). Bij een negatieve besteding is er netto geld binnengekomen; "-14,5
 * dagen" is dan betekenisloos, dus onderdrukken we de regel.
 */
export function showsFreedomTime(spent: number): boolean {
  return spent >= 0
}
