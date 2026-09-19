// lib/budget-uncategorized.ts
//
// DE ENE definitie van "transactie zonder categorie" — voor de Budget-hub
// (server-loader + client-herlaad), de losse rekeningweergave en elke andere
// plek die de AICategorizeSheet of een "X transacties zonder categorie"-tekst
// voedt.
//
// AANLEIDING (B-055, 19-09-2026): het predikaat stond drie keer letterlijk in
// de code, en twee van de drie (lib/budgets-data-loader.ts en de gespiegelde
// kopie in components/app/budgets-client.tsx) sloten bovendien élke
// `transaction_type = 'income'` én elk bedrag ≥ 0 uit — bedoeld als
// "ongecategoriseerde UITGAVEN"-teller, maar hergebruikt voor de generieke
// "zonder categorie"-copy en voor de "Deze maand"-scope van de sheet. Een
// inkomsten-transactie zonder budget was daardoor in "Deze maand" onzichtbaar
// en in "Alle tijden" (dezelfde sheet) wél te zien. Eigenaarsbesluit: optie A
// (de uitsluiting vervalt) + één gedeelde functie, zodat er geen vierde kopie
// kan ontstaan.
//
// WAT TELT ALS "ZONDER CATEGORIE":
//  - geen `budget_id`;
//  - geen split-ouder (`is_split`): die is gecategoriseerd via zijn splitsingen;
//  - geen overboeking tussen eigen rekeningen (`transaction_type = 'transfer'`).
//    Bewust alléén 'transfer' en niet ook 'joint_transfer': de all-time telling
//    op de hub en de "Alle tijden"-fetch in de sheet draaien in SQL op precies
//    `transaction_type.is.null,transaction_type.neq.transfer`, en de twee
//    scopes moeten dezelfde populatie beschrijven. Wie 'joint_transfer' hier
//    wil uitsluiten, verbreedt éérst die twee SQL-filters.
//  - Teken en `transaction_type = 'income'` spelen GEEN rol: inkomsten zonder
//    budget horen net zo goed gekoppeld te worden (inkomstenbudgetten,
//    spaarquote) als uitgaven.
//
// De eurosom wordt GESPLITST opgeleverd (uitgaven en inkomsten apart), zoals
// de Sankey in cash-account-view dat al deed: één ongetekende som van beide
// door elkaar zegt niets.

export type UncategorizedCandidate = {
  budget_id: string | null
  is_split?: boolean | null
  transaction_type?: string | null
  amount: number | string | null
}

export function isUncategorizedTransaction(t: UncategorizedCandidate): boolean {
  return !t.budget_id && !t.is_split && t.transaction_type !== 'transfer'
}

export interface UncategorizedSummary {
  count: number
  /** Som van de ongecategoriseerde uitgaven (absoluut, €). */
  expenseTotal: number
  /** Som van de ongecategoriseerde inkomsten (absoluut, €). */
  incomeTotal: number
}

/**
 * Telt en sommeert de ongecategoriseerde rijen uit `rows`. Filtert zelf met
 * `isUncategorizedTransaction`, dus de aanroeper geeft de volledige periode-set
 * door en hoeft het predikaat niet te herhalen.
 */
export function summarizeUncategorized<T extends UncategorizedCandidate>(
  rows: T[],
): UncategorizedSummary & { rows: T[] } {
  const matched = rows.filter(isUncategorizedTransaction)
  let expenseTotal = 0
  let incomeTotal = 0
  for (const t of matched) {
    const amount = Number(t.amount)
    if (amount < 0) expenseTotal += Math.abs(amount)
    else incomeTotal += amount
  }
  return { count: matched.length, expenseTotal, incomeTotal, rows: matched }
}
