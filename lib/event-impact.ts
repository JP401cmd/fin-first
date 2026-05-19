/**
 * Impact-berekening voor levensgebeurtenissen op vrijheidsleeftijd.
 * Plan F-5 (vergelijk-modus MVP): per event een snelle schatting van
 * hoeveel maanden/jaren extra (of minder) werk een event kost t.o.v.
 * de baseline.
 *
 * Bereking is BENADERING — geen vol unifiedProjection-rerun per event.
 * Voor exacte impact zie /toekomst Tijdas met de Risk Lab. Voor de
 * MVP-impact-badge in GebeurtenissenView is deze schatting voldoende
 * om de gebruiker te helpen prioriteren ("welk event kost mij het
 * meest?").
 *
 * Formule:
 *   netCostEUR = one_time_cost
 *              + (monthly_cost_change × duration_months)
 *              − (monthly_income_change × duration_months)
 *
 *   yearsImpact = netCostEUR / annualSavings
 *
 * - Positieve yearsImpact → event kost vrijheid (langer werken)
 * - Negatieve yearsImpact → event geeft vrijheid (kortere weg, bv. erfenis)
 *
 * Wanneer duration_months = 0 (permanent), gebruiken we 60 maanden als
 * proxy zodat permanente delta's niet "oneindig" worden. Dit is een
 * heuristic — de horizon-engine berekent het exact.
 */

const PERMANENT_PROXY_MONTHS = 60

export type EventImpact = {
  /** Netto kosten van het event in EUR (positief = uitgave). */
  netCostEUR: number
  /** Geschatte impact in jaren — positief = later vrij, negatief = eerder vrij. */
  yearsImpact: number
  /** Display-string: "+6 mnd" / "−1.2 jaar" / "Geen impact". */
  displayLabel: string
  /** Tone voor styling: 'cost' / 'gain' / 'neutral'. */
  tone: 'cost' | 'gain' | 'neutral'
}

export function computeEventImpact(
  event: {
    one_time_cost: number
    monthly_cost_change: number
    monthly_income_change: number
    duration_months: number
  },
  annualSavings: number,
): EventImpact {
  const months = event.duration_months > 0 ? event.duration_months : PERMANENT_PROXY_MONTHS
  const monthlyDelta = event.monthly_cost_change - event.monthly_income_change
  const netCostEUR = event.one_time_cost + monthlyDelta * months

  if (annualSavings <= 0) {
    return {
      netCostEUR,
      yearsImpact: 0,
      displayLabel: 'Impact onbekend',
      tone: 'neutral',
    }
  }

  const yearsImpact = netCostEUR / annualSavings

  // Display: bij <1 jaar tonen we maanden, bij ≥1 jaar tonen we
  // jaren met 1 decimaal. Onder ~1 week wegfilteren als "Geen impact".
  const absYears = Math.abs(yearsImpact)
  if (absYears < 0.02) {
    return { netCostEUR, yearsImpact, displayLabel: 'Geen impact', tone: 'neutral' }
  }
  const sign = yearsImpact > 0 ? '+' : '−'
  let displayLabel: string
  if (absYears < 1) {
    const monthsLabel = Math.round(absYears * 12)
    displayLabel = `${sign}${monthsLabel} mnd vrijheid`
  } else {
    displayLabel = `${sign}${absYears.toFixed(1)} jaar vrijheid`
  }
  return {
    netCostEUR,
    yearsImpact,
    displayLabel,
    tone: yearsImpact > 0 ? 'cost' : 'gain',
  }
}
