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
import { type Debt, deriveRemainingMonths } from './debt-data'

/**
 * De afleiding zelf woont in `lib/debt-data.ts` — `computeRenteAflossingsSplit`
 * en `debtProjection` hebben hem daar óók nodig, en dít bestand importeert uit
 * dat bestand, dus andersom zou een importcyclus opleveren. Hier
 * her-geëxporteerd zodat bestaande callers (`buildDebtDraft`) ongewijzigd
 * blijven en er één functiebody bestaat.
 */
export { deriveRemainingMonths }


function diffMonths(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  return Math.max(0, months)
}

/**
 * Resterende looptijd in maanden, of `null` als er geen zinnig einde te
 * berekenen is (de caller laat de KPI dan vervallen).
 *
 * Het MAANDBEDRAG is leidend: dat is wat er werkelijk betaald wordt, en het
 * legt bij een gegeven saldo en rente de looptijd vast. De `end_date` op de rij
 * is een voornemen dat daar niet bij hoeft te passen en dient als terugval —
 * voor rijen zonder bruikbaar maandbedrag, en voor aflossingsvrij (dat uit
 * zichzelf geen einde kent). Zie `lib/debt-maandbedrag-bron.test.ts`.
 */
export function debtRemainingMonths(debt: Debt, now: Date): number | null {
  // Het maandbedrag gaat vóór de einddatum. Die volgorde stond hiervoor
  // andersom ("`end_date` is leidend"), waardoor deze KPI en de rente/
  // aflossing-split samen één antwoord gaven en `debtProjection` een ander —
  // 119 tegen 85 maanden op dezelfde schuld. Het maandbedrag is wat er
  // werkelijk betaald wordt; de einddatum is een voornemen dat er niet bij
  // hoeft te passen. De einddatum blijft de terugval voor rijen zonder
  // bruikbaar maandbedrag (en voor aflossingsvrij, dat uit zichzelf geen
  // einde kent).
  const fromPayment = deriveRemainingMonths(
    Number(debt.current_balance),
    Number(debt.monthly_payment),
    Number(debt.interest_rate),
    debt.repayment_type,
    now,
  )
  if (fromPayment != null) return fromPayment

  if (debt.end_date) {
    const end = new Date(debt.end_date)
    const m = diffMonths(now, end)
    return m > 0 ? m : null
  }
  return null
}
