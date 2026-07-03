/**
 * WhatIf-beslishulp — reken-model (pure, testbaar).
 *
 * Bevat de modelkeuzes die de UI-kaart "Wat doe je met €X/maand extra?"
 * aandrijven en die los van React getest worden:
 *
 *   • weightedDebtRate(debts)        → saldo-gewogen schuldrente (decimaal)
 *   • fireAgeFromSim(sim)            → fractionele FIRE-leeftijd uit de
 *                                      ENGINE-rijen (kruispunt opgebouwd
 *                                      vermogen × benodigd vermogen)
 *   • aflossenFireAge(base, …)       → fractionele FIRE-leeftijd als €X/mnd op
 *                                      het GEGARANDEERDE schuldrente-tarief
 *                                      (Box-3-vrij) bovenop het ENGINE-basispad
 *                                      groeit
 *
 * ── Eén motor voor BEIDE opties (consume, don't recompute) ───────────────────
 * Zowel Beleggen als Aflossen worden tegen DEZELFDE motor (de horizon-kernel)
 * gemeten, zodat ze allebei het motor-basispad reproduceren bij €0 extra en
 * alléén in de toegepaste groeivoet verschillen:
 *
 *   • BELEGGEN  — een extra `extra_inleg`-cashflow in de ECHTE motor. De extra
 *                 inleg compoundt op het VERWACHTE rendement, mét Box 3-drag (de
 *                 motor belast élke beleggings-instroom forfaitair). De FIRE-
 *                 leeftijd komt uit `fireAgeFromSim` op die motor-run.
 *
 *   • AFLOSSEN  — schuld aflossen levert het GEGARANDEERDE schuldrente-tarief
 *                 (`r_debt`, saldo-gewogen) op, en is BOX-3-VRIJ (een schuld
 *                 terugbetalen wordt niet belast). We raken de motor niet aan voor
 *                 een tweede definitie; in plaats daarvan groeit een aparte
 *                 "aflossen-pot" van €X/mnd op `r_debt` (onbelast) bovenop het
 *                 netto-vermogenspad dat de motor zélf voor het basisscenario
 *                 teruggeeft. FIRE = het eerste (fractionele) jaar waarin
 *                 basispad(n) + pot(n) ≥ het motor-doelvermogen
 *                 (`requiredFirePortfolio`). Eén inflatie-epoche en hetzelfde doel
 *                 als de motor → géén gemengde-inflatie-bug, en bij €0 extra
 *                 identiek aan `fireAgeFromSim(base)`.
 *
 * Daarom wint beleggen bij een lage schuldrente (de onzekere markt na Box 3
 * verslaat een lage gegarandeerde rente) en wint aflossen pas wanneer de
 * gegarandeerde schuldrente hoog genoeg is om het motor-beleggingspad te
 * verslaan. De eerdere `aflossenFireAgeAtRate` liep NIET door de motor (zijpot op
 * de rauwe schuldrente, vergeleken tegen een FIRE-jaar-geïnflateerd doel terwijl
 * het pad per-jaar-geïnflateerd was — gemengde inflatie-epoches) en kon het
 * basispad niet eens reproduceren; daardoor "won" aflossen op élk rentetarief.
 */

import type { SimResult, SimRow } from '@/lib/fire-simulation'
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
 * Eindwaarde van het opbouwjaar dat op leeftijd `age` eindigt (motor-rijen).
 * Vóór de eerste rij geldt het startvermogen op `currentAge`; voorbij het laatste
 * opbouwjaar het laatst bekende eindvermogen.
 */
function accumulationPath(sim: SimResult): {
  startNetWorth: number
  endByAge: Map<number, number>
  lastAge: number
  lastValue: number
  firstAge: number
} {
  const acc: SimRow[] = sim.rows.filter((r) => r.phase === 'accumulation')
  const startNetWorth = sim.rows[0]?.startPortfolio ?? 0
  const endByAge = new Map<number, number>()
  for (const r of acc) endByAge.set(r.age + 1, r.endPortfolio)
  const last = acc[acc.length - 1]
  return {
    startNetWorth,
    endByAge,
    lastAge: last ? last.age + 1 : (sim.rows[0]?.age ?? 0),
    lastValue: last ? last.endPortfolio : startNetWorth,
    firstAge: sim.rows[0]?.age ?? 0,
  }
}

/**
 * Lineair interpoleer het (fractionele) jaar waarin een MONOTOON STIJGEND pad het
 * doel bereikt. `valueAt(age)` is het gecombineerde vermogen aan het EIND van het
 * jaar dat op `age` eindigt; de loop start op `firstAge` (vermogen = `startValue`).
 */
function crossingAge(
  startAge: number,
  startValue: number,
  target: number,
  lastAge: number,
  valueAt: (age: number) => number,
): number | null {
  if (startValue >= target) return startAge
  let prevAge = startAge
  let prevValue = startValue
  for (let age = startAge + 1; age <= lastAge; age++) {
    const value = valueAt(age)
    if (value >= target) {
      const span = value - prevValue
      const t = span > 0 ? (target - prevValue) / span : 0
      return prevAge + Math.max(0, Math.min(1, t)) * (age - prevAge)
    }
    prevAge = age
    prevValue = value
  }
  return null
}

/**
 * Fractionele FIRE-leeftijd uit de MOTOR-rijen: het (geïnterpoleerde) jaar waarin
 * het opgebouwde netto vermogen het door de motor berekende doelvermogen
 * (`requiredFirePortfolio`) bereikt. Eén inflatie-epoche (de nominale motor-rijen),
 * één Box 3-behandeling (die van de motor). Valt terug op `fireAgeFractional` als
 * er geen bruikbaar doel/pad is.
 *
 * Gebruikt voor de Beleggen-kaart: meet de motor-run (basis + extra inleg) op
 * exact dezelfde grondslag als de Aflossen-kaart, zodat de twee vergelijkbaar zijn.
 */
export function fireAgeFromSim(sim: SimResult): number | null {
  const target = sim.requiredFirePortfolio
  if (!(target > 0) || sim.rows.length === 0) return sim.fireAgeFractional
  const { startNetWorth, endByAge, lastAge, lastValue, firstAge } = accumulationPath(sim)
  const crossing = crossingAge(firstAge, startNetWorth, target, lastAge, (age) =>
    endByAge.get(age) ?? lastValue,
  )
  return crossing ?? sim.fireAgeFractional
}

/**
 * Fractionele FIRE-leeftijd wanneer €`monthly`/maand op het GEGARANDEERDE
 * schuldrente-tarief (`annualDebtRate`) BOX-3-VRIJ compoundt bovenop het
 * motor-basispad.
 *
 * Model (motor-consistent — zelfde doel en pad als `fireAgeFromSim`):
 *   • basispad: het netto-vermogenspad uit de motor-rijen van het BASISSCENARIO.
 *   • pot_n: een aparte pot die op `currentAge` op 0 staat en jaarlijks groeit:
 *       pot_{n+1} = pot_n · (1 + r_debt) + 12·monthly
 *     (groei op de bestaande pot, dan de jaarbijdrage — consistent met de
 *     accumulatie van de motor). r_debt is ONBELAST: een schuld aflossen wordt
 *     niet in Box 3 betrokken, dus geen drag op deze pot.
 *   • FIRE = eerste jaar waarin basispad(n) + pot(n) ≥ requiredFirePortfolio,
 *     met lineaire interpolatie voor sub-jaar precisie.
 *
 * Bij `monthly = 0` is de pot 0 en valt dit per constructie samen met
 * `fireAgeFromSim(base)` — beide kaarten reproduceren de motor-baseline.
 *
 * @param base            SimResult van het BASISSCENARIO (rows + target uit de motor).
 * @param currentAge      Huidige leeftijd (potstart).
 * @param monthly         Extra aflossing per maand (EUR, positief).
 * @param annualDebtRate  Saldo-gewogen schuldrente in DECIMAAL (r_debt).
 * @returns fractionele FIRE-leeftijd, of `null` als onbereikbaar binnen het pad
 *   óf als het basisscenario zelf geen bruikbaar FIRE-doel heeft.
 */
export function aflossenFireAge(
  base: SimResult,
  currentAge: number,
  monthly: number,
  annualDebtRate: number,
): number | null {
  const target = base.requiredFirePortfolio
  // Geen bruikbaar doel (bijv. FIRE onbereikbaar of niet-deplete edge) → laat de
  // aanroeper terugvallen op de motor-uitkomst i.p.v. hier iets te verzinnen.
  if (!(target > 0) || base.rows.length === 0) return null

  const annualContribution = Math.max(0, monthly) * 12
  const { startNetWorth, endByAge, lastAge, lastValue, firstAge } = accumulationPath(base)

  // Pot per leeftijd, opgebouwd vanaf currentAge (onbelast op r_debt).
  let pot = 0
  const potByAge = new Map<number, number>()
  potByAge.set(currentAge, 0)
  for (let age = currentAge + 1; age <= lastAge; age++) {
    pot = pot * (1 + annualDebtRate) + annualContribution
    potByAge.set(age, pot)
  }
  const potAt = (age: number): number => {
    if (age <= currentAge) return 0
    const v = potByAge.get(age)
    if (v !== undefined) return v
    return pot // voorbij het laatste pad-jaar: laatst bekende pot
  }

  const netWorthAt = (age: number): number => {
    if (age <= firstAge) return startNetWorth
    return endByAge.get(age) ?? lastValue
  }

  return crossingAge(firstAge, startNetWorth, target, lastAge, (age) => netWorthAt(age) + potAt(age))
}
