/**
 * Tax overview — pure, perspectief-onafhankelijke aggregator.
 *
 * Vat al-berekende box-resultaten (Box 1/2/3) samen tot één overzicht voor de
 * belasting-hub (C1/C2/C4) én Will. Doet GEEN Supabase-calls en GEEN eigen
 * box-berekeningen: hij krijgt reeds berekende cijfers binnen en aggregeert.
 *
 * Geen Supabase/React-imports. Volgt het pure-engine-patroon van box3-data.ts.
 * Geld-formattering hoort hier NIET — alle bedragen komen als getallen terug.
 */

// ── Types ────────────────────────────────────────────────────

export interface TaxOpportunity {
  id: string
  title: string
  box: 1 | 2 | 3
  savings: number
  freedomDays: number
  deadline?: string
  href: string
}

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
  jaarruimte?: { amount: number; savings: number } | null
  tegenbewijs?: { savings: number } | null
  partnerAllocatie?: { savings: number } | null
  /** Bedrag boven EUR 500k DGA-leengrens; >0 → leengrens-kans/waarschuwing. */
  dgaLeningExcess?: number | null
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
  /** Gesorteerd op savings desc. */
  opportunities: TaxOpportunity[]
}

// ── Helpers ──────────────────────────────────────────────────

function freedomDaysFor(savings: number, dailyExpenses: number): number {
  return dailyExpenses > 0 ? Math.round(savings / dailyExpenses) : 0
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
  const freedomDays = freedomDaysFor(total, dailyExpenses)

  // Build opportunities from the provided signals.
  const opportunities: TaxOpportunity[] = []

  // Jaarruimte — Box 1 (lijfrente-aftrek), deadline 31 dec.
  if (input.jaarruimte && input.jaarruimte.savings > 0) {
    const savings = input.jaarruimte.savings
    opportunities.push({
      id: 'jaarruimte',
      title: 'Benut je jaarruimte',
      box: 1,
      savings,
      freedomDays: freedomDaysFor(savings, dailyExpenses),
      deadline: '31 dec',
      href: '/overzicht/belasting/box1#jaarruimte-uitleg',
    })
  }

  // Tegenbewijs werkelijk rendement — Box 3.
  if (input.tegenbewijs && input.tegenbewijs.savings > 0) {
    const savings = input.tegenbewijs.savings
    opportunities.push({
      id: 'tegenbewijs',
      title: 'Tegenbewijs werkelijk rendement',
      box: 3,
      savings,
      freedomDays: freedomDaysFor(savings, dailyExpenses),
      href: '/overzicht/belasting/box3',
    })
  }

  // Partner-allocatie — Box 3 (optimale verdeling vermogen).
  if (input.partnerAllocatie && input.partnerAllocatie.savings > 0) {
    const savings = input.partnerAllocatie.savings
    opportunities.push({
      id: 'partner-allocatie',
      title: 'Verdeel vermogen optimaal met je partner',
      box: 3,
      savings,
      freedomDays: freedomDaysFor(savings, dailyExpenses),
      href: '/overzicht/belasting/box3',
    })
  }

  // DGA-leengrens — Box 2 (waarschuwing/kans). savings = 0 maar wel tonen.
  if (input.dgaLeningExcess != null && input.dgaLeningExcess > 0) {
    opportunities.push({
      id: 'dga-leengrens',
      title: 'Lening boven de DGA-leengrens',
      box: 2,
      savings: 0,
      freedomDays: 0,
      deadline: '31 dec',
      href: '/overzicht/belasting/box2',
    })
  }

  // Sort by savings desc (DGA-waarschuwing met savings 0 zakt naar onder).
  opportunities.sort((a, b) => b.savings - a.savings)

  return {
    box1Tax,
    box2Tax,
    box3Tax,
    total,
    distribution,
    effectiveRate,
    marginalRate,
    freedomDays,
    opportunities,
  }
}
