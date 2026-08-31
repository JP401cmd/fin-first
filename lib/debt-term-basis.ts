/**
 * Grondslag van de looptijd van een schuld — "waarop is dit getal gebaseerd?".
 *
 * `debts.end_date` is de enige bron voor élk afgeleid looptijd-getal
 * (resterende looptijd, aflostijd, schuldenvrij-jaar, en via
 * `computeDefaultMonthlyPayment` ook de geschatte maandlast). Die datum kan
 * op drie manieren tot stand komen:
 *
 *  1. de gebruiker vulde hem zelf in (wizard-veld "Resterende looptijd" of
 *     het einddatum-veld in het volledige schuldformulier), of `buildDebtDraft`
 *     leidde hem af uit een door de gebruiker opgegeven maandbedrag — dat
 *     bedrag legt bij een gegeven saldo en rente de looptijd vast, dus het
 *     getal rust op eigen invoer en niet op een aanname van ons;
 *  2. `buildDebtDraft` leidde hem stil af uit `DEFAULT_TERM_YEARS_PER_TYPE`
 *     (hypotheek = 30 jaar) — de gebruiker is dit nooit gevraagd;
 *  3. hij ontbreekt, waarna elk oppervlak zijn eigen terugval hanteert.
 *
 * Alleen geval 1 mag als hard feit op het scherm staan. Voor 2 en 3 hoort er
 * een "waarop gebaseerd?"-regel bij het getal (zie
 * `components/editorial/aanname-hint.tsx`). Deze module is de énige plek waar
 * die grondslag wordt bepaald — surfaces consumeren, ze redeneren niet zelf
 * over `DEFAULT_TERM_YEARS_PER_TYPE`.
 */

import { DEFAULT_TERM_YEARS_PER_TYPE, type DebtType } from '@/lib/debt-data'

/** `end_date` als ISO-datum op basis van een startdatum + looptijd in jaren. */
export function addYearsIso(startIso: string, years: number): string {
  const d = new Date(startIso)
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().split('T')[0]
}

/**
 * `end_date` als ISO-datum op basis van een startdatum + looptijd in maanden.
 * Nodig omdat een uit een maandbedrag afgeleide looptijd (zie
 * `deriveRemainingMonths` in lib/debt-remaining-term.ts) zelden op hele jaren
 * uitkomt. Rekent met dezelfde `setMonth`-overloop als `amortizationSchedule`
 * in lib/debt-data.ts, zodat de einddatum en het aflosschema op dezelfde
 * maand landen.
 */
export function addMonthsIso(startIso: string, months: number): string {
  const d = new Date(startIso)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

/**
 * Grondslag van `end_date`. `user_set` betekent letterlijk "wijkt af van de
 * stille type-default" — er is (bewust) geen kolom die de herkomst vastlegt,
 * dus dit is een afleiding, geen registratie. Zie `resolveDebtTermBasis`.
 */
export type DebtTermBasis =
  | { kind: 'user_set' }
  | { kind: 'default_term'; termYears: number }
  | { kind: 'no_end_date' }

/** Minimale vorm die nodig is om de grondslag te bepalen. */
export interface DebtTermBasisInput {
  debt_type: DebtType
  start_date: string
  end_date: string | null
}

/**
 * Bepaal de grondslag van de einddatum.
 *
 * Detectie van de stille default gebeurt op een **exacte** datumvergelijking
 * met `start_date + DEFAULT_TERM_YEARS_PER_TYPE[type]`. Dat is bewust strenger
 * dan een vergelijking op jaartal: het wizard-veld ankert een door de
 * gebruiker opgegeven resterende looptijd op *vandaag*, dus een zelf
 * ingevulde looptijd valt alleen samen met de default wanneer de ingangsdatum
 * toevallig dezelfde dag-en-maand heeft als vandaag (~1 op 365). Andersom is
 * een fout-negatief onmogelijk: de default-keten produceert per definitie
 * exact deze datum.
 */
export function resolveDebtTermBasis(debt: DebtTermBasisInput): DebtTermBasis {
  if (!debt.end_date) return { kind: 'no_end_date' }

  const defaultYears = DEFAULT_TERM_YEARS_PER_TYPE[debt.debt_type]
  if (defaultYears == null || defaultYears <= 0) return { kind: 'user_set' }

  // Ongeldige/ontbrekende start_date ⇒ geen betrouwbare afleiding mogelijk
  // (en `addYearsIso` zou op een Invalid Date een RangeError gooien). Behandel
  // de einddatum dan als gegeven i.p.v. een aanname te suggereren die we niet
  // kunnen onderbouwen.
  if (!debt.start_date || Number.isNaN(new Date(debt.start_date).getTime())) {
    return { kind: 'user_set' }
  }

  const derived = addYearsIso(debt.start_date, defaultYears)
  return derived === debt.end_date
    ? { kind: 'default_term', termYears: defaultYears }
    : { kind: 'user_set' }
}

/**
 * Uitlegtekst bij een niet door de gebruiker gezette einddatum.
 * `null` ⇒ het getal staat op eigen invoer en heeft géén hint nodig.
 *
 * @param fallbackYears looptijd waarmee het oppervlak zelf terugvalt wanneer
 *   `end_date` ontbreekt (bv. de 30-jaar-terugval van de hypotheekplanner).
 *   Weglaten wanneer het oppervlak in dat geval niets toont.
 */
export function describeDebtTermBasis(
  basis: DebtTermBasis,
  fallbackYears?: number,
): string | null {
  if (basis.kind === 'user_set') return null

  if (basis.kind === 'default_term') {
    return (
      `Je hebt zelf geen einddatum ingevuld. We rekenen daarom met een ` +
      `standaard looptijd van ${basis.termYears} jaar vanaf de ingangsdatum. ` +
      `Klopt dat niet, pas dan de einddatum aan — de looptijd, de aflostijd ` +
      `én de geschatte maandlast rekenen meteen mee.`
    )
  }

  const tail =
    fallbackYears != null && fallbackYears > 0
      ? ` We rekenen zolang met ${fallbackYears} jaar.`
      : ''
  return (
    `Bij deze schuld staat geen einddatum.${tail} Vul de einddatum in voor ` +
    `een kloppende looptijd en maandlast.`
  )
}
