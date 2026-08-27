/**
 * Toegankelijke naam voor de rij-checkbox in de duplicaten-stap van de
 * import-wizard (stap 2). Pure helper naast het grote client-component
 * `page.tsx` — zelfde patroon als `select-all.ts` en `import-counters.ts`.
 *
 * **Waarom (M34).** Alleen de kop-checkbox had een `aria-label`; elke rij-
 * checkbox was voor een schermlezer een naamloos, inwisselbaar bedieningselement
 * ("1 gelabeld, 7 naamloos"). Juist hier bepaalt dat vakje of een herkend
 * duplicaat alsnog dubbel wordt ingeboekt, dus wie niet hoort wélke regel hij
 * aanvinkt, kan de keuze niet maken.
 *
 * **Privacy-conditionering (harde eis van de kaart).** De bedragen in deze
 * tabel gaan door `<MaskedAmount>` en verdwijnen achter bullets zodra de
 * gebruiker bedragmaskering aanzet (`useMaskedAmounts`). Een `aria-label` die
 * het bedrag altijd interpoleert, spreekt het dus alsnog voluit uit — dan zou
 * de a11y-fix een privacylek worden. Bij `masked` noemt het label daarom
 * "bedrag verborgen" in plaats van het getal; datum en omschrijving blijven
 * staan, want die zijn op het scherm óók zichtbaar.
 */

import { formatCurrencyDecimals } from '@/lib/format'

/** Minimale rijvorm waaruit de toegankelijke naam wordt opgebouwd. */
export type LabelableRow = {
  /** ISO-datum (`YYYY-MM-DD`) zoals de parsers 'm opleveren. */
  date: string
  description?: string | null
  counterparty_name?: string | null
  amount: number
}

/** Tekst wanneer de rij geen bruikbare omschrijving heeft. */
const NO_DESCRIPTION = 'zonder omschrijving'
/** Tekst die het bedrag vervangt zodra bedragmaskering aanstaat. */
const MASKED_AMOUNT_TEXT = 'bedrag verborgen'

/**
 * Datum voluit ("12 maart") in plaats van de afgekorte celweergave ("12 mrt"):
 * een schermlezer spreekt de afkorting onbetrouwbaar uit. Onparseerbare datums
 * vallen terug op de rauwe waarde — een label met rommel is nog altijd beter
 * dan `Invalid Date` of géén naam.
 */
function spokenDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })
}

/**
 * Bedrag in de app-eigen "bij/af"-woordenschat (zelfde termen als de
 * totalen-regel onderaan de wizard), zodat een schermlezer geen losse min-teken
 * hoeft te interpreteren.
 */
function spokenAmount(amount: number, masked: boolean): string {
  if (masked) return MASKED_AMOUNT_TEXT
  return `${formatCurrencyDecimals(Math.abs(amount))} ${amount < 0 ? 'af' : 'bij'}`
}

/**
 * Bouwt de `aria-label` voor één rij-checkbox: wat het vakje doet + welke regel
 * het betreft (datum, omschrijving, bedrag — de drie velden uit de aanbeveling).
 */
export function rowCheckboxLabel(row: LabelableRow, opts: { masked: boolean }): string {
  const description = row.description?.trim() || NO_DESCRIPTION
  const counterparty = row.counterparty_name?.trim()
  const subject = counterparty && counterparty !== description
    ? `${description} (${counterparty})`
    : description
  return `Importeren: ${spokenDate(row.date)}, ${subject}, ${spokenAmount(row.amount, opts.masked)}`
}
