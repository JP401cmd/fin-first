/**
 * Tax overview — pure, perspectief-onafhankelijke aggregator van de DRUK.
 *
 * Vat al-berekende box-resultaten (Box 1/2/3) samen tot één overzicht voor de
 * belasting-hub (C1/C2) én Fin. Doet GEEN Supabase-calls en GEEN eigen
 * box-berekeningen: hij krijgt reeds berekende cijfers binnen en aggregeert.
 *
 * SCOPE — ALLEEN DRUK, GEEN KANSEN (ADR 0086). Deze aggregator bouwde tot
 * voor kort óók een tweede, armere kansen-lijst uit losse signalen
 * (jaarruimte/tegenbewijs/partner-allocatie/DGA-leengrens). Die tak is
 * verwijderd: een savings-only lijst kan niet zien dat een scenario per saldo
 * rendement kóst, en er stonden twee producenten van hetzelfde begrip naast
 * elkaar. De enige producent van fiscale kansen is nu
 * `lib/tax-optimizer/opportunities.ts`, geladen via
 * `lib/tax-opportunities-loader.ts` — daar wonen ook het type `TaxOpportunity`
 * en de €→vrijheidsdagen-vertaling van een kans.
 *
 * Geen Supabase/React-imports. Volgt het pure-engine-patroon van box3-data.ts.
 * Geld-formattering hoort hier NIET — alle bedragen komen als getallen terug.
 */

// ── Types ────────────────────────────────────────────────────

/** Aandeel per box als percentage 0-100 (som ~100). */
export interface TaxDistribution {
  box1: number
  box2: number
  box3: number
}

export interface TaxOverviewInput {
  box1Tax: number | null
  box2Tax: number | null
  box3Tax: number | null
  grossYearlyIncome?: number | null
  marginalRate?: number | null
  dailyExpenses?: number
}

export interface TaxOverviewResult {
  box1Tax: number
  box2Tax: number
  box3Tax: number
  total: number
  distribution: TaxDistribution
  /** total / grossYearlyIncome (indien bekend), anders null. */
  effectiveRate: number | null
  marginalRate: number | null
  /** total / dailyExpenses, afgerond (0 als dailyExpenses ontbreekt). */
  freedomDays: number
}

// ── Aggregator ───────────────────────────────────────────────

export function buildTaxOverview(input: TaxOverviewInput): TaxOverviewResult {
  const box1Tax = input.box1Tax ?? 0
  const box2Tax = input.box2Tax ?? 0
  const box3Tax = input.box3Tax ?? 0
  const total = box1Tax + box2Tax + box3Tax

  // Distribution — elk box-aandeel als % van total (0 als total = 0).
  const distribution: TaxDistribution = total > 0
    ? {
        box1: (box1Tax / total) * 100,
        box2: (box2Tax / total) * 100,
        box3: (box3Tax / total) * 100,
      }
    : { box1: 0, box2: 0, box3: 0 }

  const grossYearlyIncome = input.grossYearlyIncome ?? null
  const effectiveRate =
    grossYearlyIncome != null && grossYearlyIncome > 0
      ? total / grossYearlyIncome
      : null

  const marginalRate = input.marginalRate ?? null

  const dailyExpenses = input.dailyExpenses ?? 0
  const freedomDays = dailyExpenses > 0 ? Math.round(total / dailyExpenses) : 0

  return {
    box1Tax,
    box2Tax,
    box3Tax,
    total,
    distribution,
    effectiveRate,
    marginalRate,
    freedomDays,
  }
}
