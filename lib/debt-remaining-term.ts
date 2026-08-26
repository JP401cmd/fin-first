/**
 * Resterende looptijd van een schuld — één bron voor de "resterend"-KPI.
 *
 * Zowel de KPI-strip per schuld (`lib/debt-kpi.ts`, o.a. /overzicht/schulden)
 * als de categorie-koppen (`lib/category-kpi.ts`, o.a. /overzicht/schulden/
 * [type]) consumeren deze functie. Beide droegen hiervóór een eigen kopie van
 * dezelfde logica — het commentaar in category-kpi.ts erkende dat letterlijk
 * ("identieke logica") — inclusief dezelfde rekenfout op het lineaire pad, die
 * daardoor op twee plekken los gerepareerd had moeten worden.
 *
 * Server-safe en puur: geen 'use client', geen DOM, geen hooks.
 */
import { type Debt, amortizationSchedule } from './debt-data'

/**
 * Bovengrens voor een zinnige looptijd: 600 maanden (50 jaar). Gelijk aan de
 * lus-limiet in `amortizationSchedule` (lib/debt-data.ts), zodat beide
 * aflospaden dezelfde horizon hanteren. Loopt een schuld daaroverheen, dan is
 * de uitkomst niet plausibel genoeg om als hard getal te tonen en vervalt de
 * KPI — beter geen getal dan "600 mnd resterend" op een kleine schuld.
 */
const MAX_TERM_MONTHS = 600

function diffMonths(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  return Math.max(0, months)
}

/**
 * Resterende looptijd in maanden, of `null` als er geen zinnig einde te
 * berekenen is (de caller laat de KPI dan vervallen).
 *
 * Volgorde:
 * 1. `end_date` is leidend — dat heeft de gebruiker zelf ingevuld.
 * 2. Aflossingsvrij kent uit zichzelf geen einde.
 * 3. Lineair: de aflossing per maand is bij lineair constant en volgt uit het
 *    maandbedrag minus de rente over het huidige saldo; de looptijd is dan het
 *    saldo gedeeld door die aflossing. Dit is dezelfde afleiding als
 *    `computeRenteAflossingsSplit` in lib/debt-data.ts hanteert, zodat de KPI
 *    en de rente/aflossing-uitsplitsing niet uiteen kunnen lopen.
 * 4. Annuïteit (default): projectie via `amortizationSchedule` met het
 *    werkelijke maandbedrag.
 */
export function debtRemainingMonths(debt: Debt, now: Date): number | null {
  if (debt.end_date) {
    const end = new Date(debt.end_date)
    const m = diffMonths(now, end)
    return m > 0 ? m : null
  }

  const balance = Number(debt.current_balance)
  const payment = Number(debt.monthly_payment)
  const rawRate = Number(debt.interest_rate)
  // De kolom is als `number` getypeerd, maar een DB-rij kan in de praktijk
  // null/leeg dragen; een NaN-rente zou het hele schema NaN maken.
  const rate = Number.isFinite(rawRate) ? rawRate : 0
  if (!Number.isFinite(balance) || !Number.isFinite(payment)) return null
  if (balance <= 0 || payment <= 0) return null

  const rt = debt.repayment_type ?? 'annuiteit'
  if (rt === 'aflossingsvrij') return null

  if (rt === 'lineair') {
    // Het opgeslagen maandbedrag is de HUIDIGE termijn: vaste aflossing plus
    // rente over het huidige (dus hoogste) saldo. Omdat de aflossing bij
    // lineair constant blijft, is die af te leiden door de rentecomponent
    // eraf te halen.
    const monthlyInterest = balance * (rate / 100 / 12)
    const principalPerMonth = payment - monthlyInterest
    // Dekt het maandbedrag de rente niet, dan lost de schuld nooit af.
    if (!Number.isFinite(principalPerMonth) || principalPerMonth <= 0) return null
    const months = Math.ceil(balance / principalPerMonth)
    if (months <= 0 || months > MAX_TERM_MONTHS) return null
    return months
  }

  // Annuïteit / default — projectie met het werkelijke maandbedrag.
  // `amortizationSchedule` kapt zelf op MAX_TERM_MONTHS af; een schema dat
  // daar niet binnen op 0 uitkomt levert bewust geen getal op.
  const sched = amortizationSchedule(balance, rate, payment, now)
  if (sched.length === 0) return null
  const last = sched[sched.length - 1]
  return last.balance <= 0.01 ? sched.length : null
}
