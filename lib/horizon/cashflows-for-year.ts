/**
 * cashflowsForYear — pure helper voor de "Gebeurtenissen"-sectie van de
 * jaar-detail-kassabon (`HorizonYearDetailsSheet`).
 *
 * Filtert de simulatie-cashflows op het venster `[yearStartAge, yearStartAge+1)`
 * en levert per stroom de netto jaar-delta (nominaal), plus of het een AOW-stroom
 * is (die wordt in de sheet apart getoond).
 *
 * ── Inflatie-indexatie (bug-fix 4 juli 2026) ──────────────────────────────
 * Een `SimCashflow` met `indexed: true` (o.a. AOW) draagt een VLAK REËEL
 * maandbedrag; in de nominale jaarweergave groeit dat mee met inflatie. De
 * kernel-rij van dat jaar draagt de factor al: `UnifiedProjectionRow.inflationFactor`
 * = `(1 + inflatie)^k` (V14, zie lib/horizon-kernel/bridge.ts). We vermenigvuldigen
 * geïndexeerde stromen daarom met díe factor — GEEN eigen `(1+inflatie)^t`-som
 * (consume, don't recompute). Niet-geïndexeerde stromen blijven vlak.
 *
 * Symmetrie met de "≈ € X vandaag"-regel: die deelt het nominale bedrag weer
 * door dezelfde `(1+inflatie)^(age−currentAge)`; voor een geïndexeerde stroom
 * valt dat terug op het vlakke reële bedrag — mits `inflationFactor` en de
 * PV-deflatie op dezelfde grondslag (zelfde inflatie, `k = age − currentAge`)
 * rusten, wat het geval is (beide uit `fireParams.inflationRate`).
 *
 * Pure functie — geen React/Supabase/Date.now.
 */

import type { SimCashflow } from '@/lib/fire-simulation'

export interface YearCashflow {
  /** Cashflow-id (voor terugkoppeling naar het life-event). */
  id: string
  /** Netto jaar-delta, nominaal (income = +, expense = −). */
  amount: number
  /** Of dit een AOW-stroom is (apart getoond in de sheet). */
  isAow: boolean
}

/**
 * @param cashflows       Alle simulatie-cashflows.
 * @param yearStartAge    Leeftijd aan het begin van het weergavejaar.
 * @param inflationFactor Kernel-inflatiefactor van dat jaar
 *                        (`UnifiedProjectionRow.inflationFactor`). Niet-eindig of
 *                        ≤ 0 ⇒ behandeld als 1 (geen indexatie).
 */
export function cashflowsForYear(
  cashflows: readonly SimCashflow[],
  yearStartAge: number,
  inflationFactor: number,
): YearCashflow[] {
  const yearEndAge = yearStartAge + 1
  // Geïndexeerde stromen groeien mee met inflatie: schaal met de kernel-factor
  // van dit jaar. Niet-eindig of ≤ 0 ⇒ geen indexatie (factor 1).
  const factor = Number.isFinite(inflationFactor) && inflationFactor > 0 ? inflationFactor : 1
  const out: YearCashflow[] = []

  for (const cf of cashflows) {
    let delta = 0
    if (cf.type === 'one_time') {
      if (cf.fromAge >= yearStartAge && cf.fromAge < yearEndAge) {
        delta = cf.amount * (cf.direction === 'income' ? 1 : -1)
      }
    } else {
      const cfEnd = cf.toAge ?? Number.POSITIVE_INFINITY
      const overlapStart = Math.max(cf.fromAge, yearStartAge)
      const overlapEnd = Math.min(cfEnd, yearEndAge)
      if (overlapStart < overlapEnd) {
        const months = Math.round((overlapEnd - overlapStart) * 12)
        delta = cf.amount * months * (cf.direction === 'income' ? 1 : -1)
      }
    }
    if (delta !== 0) {
      if (cf.indexed) delta *= factor
      const isAow =
        cf.id.startsWith('le-aow-') ||
        cf.id === '__aow' ||
        (cf.name?.toLowerCase().includes('aow') ?? false)
      out.push({ id: cf.id, amount: delta, isAow })
    }
  }
  return out
}
