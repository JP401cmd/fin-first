/**
 * WhatIf-beslishulp — reken-model (pure, testbaar).
 *
 * Bevat de twee modelkeuzes die de UI-kaart "Wat doe je met €X/maand extra?"
 * aandrijven en die los van React getest worden:
 *
 *   • weightedDebtRate(debts)            → saldo-gewogen schuldrente (decimaal)
 *   • aflossenFireAgeAtRate(...)         → FIRE-leeftijd als €X/mnd op het
 *                                          GEGARANDEERDE schuldrente-tarief
 *                                          compoundt bovenop het basispad.
 *
 * ── Waarom Aflossen een EIGEN model heeft (en niet "≈ beleggen") ─────────────
 * De gedeelde motor (`runUnifiedProjection`) routeert élke terugkerende income-
 * cashflow naar beleggingsbuckets op het VERWACHTE rendement. Daardoor zou
 * extra aflossen, als `extra_inleg`-event, exact samenvallen met beleggen —
 * terwijl aflossen in werkelijkheid het GEGARANDEERDE rentetarief van je schuld
 * oplevert (r_debt), doorgaans lager dan het onzekere marktrendement.
 *
 * We raken de gedeelde motor BEWUST niet aan (74 projectie-tests = vangnet).
 * In plaats daarvan leunen we op wat de motor al per scenario teruggeeft:
 *   1. het netto-vermogenspad van het BASISSCENARIO (rows: start/eind per jaar);
 *   2. het FIRE-doelvermogen dat de motor zelf hanteert (requiredFirePortfolio).
 * Bovenop dat pad groeit een aparte "aflossen-pot" van €X/mnd op r_debt. De
 * aflossen-FIRE-leeftijd is het eerste (fractionele) jaar waarin
 * basispad + pot ≥ het doelvermogen. Box 3, schuldaflossing, onttrekkings-
 * strategie en partnervrijstelling zitten al in zowel het pad als het doel —
 * we voegen enkel een gegarandeerd-rente zijpotje toe. Self-consistent met de
 * Beleggen-berekening (zelfde doel, zelfde basispad).
 */

import type { SimResult } from '@/lib/fire-simulation'
import type { Debt } from '@/lib/debt-data'

/**
 * Saldo-gewogen gemiddelde rente over actieve schulden mét saldo.
 *
 * Weegt elke schuld op `current_balance` × `interest_rate` en deelt door het
 * totale saldo. Schulden zonder positief saldo of inactief tellen niet mee.
 *
 * @returns rente in DECIMAAL (bijv. 0.045 voor 4,5%), of `null` als er geen
 *   actieve schuld met saldo is (dan heeft "aflossen" geen betekenis).
 */
export function weightedDebtRate(debts: Debt[]): number | null {
  let totalBalance = 0
  let weightedRateSum = 0
  for (const d of debts) {
    if (!d.is_active) continue
    const bal = Number(d.current_balance)
    if (!(bal > 0)) continue
    const rate = Number(d.interest_rate)
    if (!Number.isFinite(rate)) continue
    totalBalance += bal
    weightedRateSum += bal * rate
  }
  if (totalBalance <= 0) return null
  // interest_rate staat in PROCENT (bijv. 4.5) → naar decimaal.
  return weightedRateSum / totalBalance / 100
}

/**
 * Bereken de FIRE-leeftijd wanneer €`monthly`/maand op het GEGARANDEERDE
 * schuldrente-tarief (`annualDebtRate`) compoundt bovenop het basispad.
 *
 * Model:
 *   • basePath: het netto-vermogenspad van het basisscenario (de motor-rows).
 *     Per jaar `n` gebruiken we het EINDvermogen (endPortfolio) op leeftijd
 *     `currentAge + n`, plus een impliciet startpunt op `currentAge`.
 *   • pot_n: een aparte pot die op `currentAge` op 0 staat en jaarlijks groeit:
 *       pot_{n+1} = pot_n · (1 + r_debt) + 12·monthly
 *     (eerst groei op de bestaande pot, dan de jaarbijdrage erbij — consistent
 *     met de accumulatie van de motor: end = start + start·rendement + inleg).
 *   • FIRE wordt bereikt op het eerste jaar waarin
 *       basePath(n) + pot(n) ≥ requiredFirePortfolio.
 *     Tussen twee jaren wordt lineair geïnterpoleerd voor sub-jaar precisie.
 *
 * @param base               SimResult van het BASISSCENARIO (rows + target).
 * @param currentAge         Huidige leeftijd (potstart).
 * @param monthly            Extra inleg per maand (EUR, positief).
 * @param annualDebtRate     Saldo-gewogen schuldrente in DECIMAAL (r_debt).
 * @returns fractionele FIRE-leeftijd, of `null` als onbereikbaar binnen het pad
 *   óf als het basisscenario zelf geen bereikbaar FIRE-doel heeft.
 */
export function aflossenFireAgeAtRate(
  base: SimResult,
  currentAge: number,
  monthly: number,
  annualDebtRate: number,
): number | null {
  const target = base.requiredFirePortfolio
  // Geen bruikbaar doel (bijv. FIRE onbereikbaar of niet-deplete edge) → laat
  // de aanroeper terugvallen op de motor-uitkomst i.p.v. hier iets te verzinnen.
  if (!(target > 0) || base.rows.length === 0) return null

  const annualContribution = Math.max(0, monthly) * 12

  // Netto-vermogen op leeftijd `age` uit het basispad. Vóór de eerste rij
  // gebruiken we het startPortfolio van rij 0 (vermogen op currentAge); daarna
  // het endPortfolio van het jaar dat eindigt op die leeftijd.
  const accumulationRows = base.rows.filter(r => r.phase === 'accumulation')
  // Map leeftijd → eindvermogen van dat accumulatiejaar.
  const endByAge = new Map<number, number>()
  for (const r of accumulationRows) endByAge.set(r.age + 1, r.endPortfolio)
  const startNetWorth = base.rows[0]?.startPortfolio ?? 0

  const netWorthAt = (age: number): number => {
    if (age <= currentAge) return startNetWorth
    const v = endByAge.get(age)
    if (v !== undefined) return v
    // Voorbij het laatste accumulatiejaar: gebruik het laatst bekende eindpunt.
    return accumulationRows.length > 0
      ? accumulationRows[accumulationRows.length - 1].endPortfolio
      : startNetWorth
  }

  // Pot per leeftijd, opgebouwd vanaf currentAge.
  // potAt(currentAge) = 0; potAt(currentAge + k) = pot na k jaargroei+inleg.
  const potByAge = new Map<number, number>()
  potByAge.set(currentAge, 0)
  let pot = 0

  // Gecombineerd vermogen op currentAge (pot = 0).
  let prevAge = currentAge
  let prevCombined = startNetWorth // + pot(0) = + 0

  // Als we op currentAge al boven het doel zitten, is FIRE nu.
  if (prevCombined >= target) return currentAge

  // Loop over de accumulatiejaren; bepaal het eerste jaar dat het doel haalt.
  const maxAge = accumulationRows.length > 0
    ? accumulationRows[accumulationRows.length - 1].age + 1
    : currentAge
  for (let age = currentAge + 1; age <= maxAge; age++) {
    pot = pot * (1 + annualDebtRate) + annualContribution
    potByAge.set(age, pot)
    const combined = netWorthAt(age) + pot

    if (combined >= target) {
      // Lineaire interpolatie tussen prevAge (onder doel) en age (op/boven doel).
      const span = combined - prevCombined
      const t = span > 0 ? (target - prevCombined) / span : 0
      return prevAge + Math.max(0, Math.min(1, t))
    }

    prevAge = age
    prevCombined = combined
  }

  // Doel niet gehaald binnen het basispad.
  return null
}
