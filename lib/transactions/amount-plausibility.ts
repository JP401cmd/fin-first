/**
 * Plausibiliteitsgrens voor het bedrag van ÉÉN transactie (UR2-18).
 *
 * ## Waarom dit bestaat
 *
 * Een tikfout in een bedragveld is geen crash en geen validatiefout — hij wordt
 * stil geaccepteerd en vergiftigt daarna élk afgeleid cijfer. `999,99` dat als
 * `99999999` binnenkomt, verschijnt als "je gaf €99.999.999 meer uit dan er
 * binnenkwam" en trekt spaarquote, gezondheidsgetal, dagtarief en de briefing
 * mee. De gebruiker ziet geen fout; hij ziet een verkeerd verhaal.
 *
 * Dezelfde afweging als bij de bezittingen (`lib/asset-parameter-bands.ts`,
 * H8/optie B) geldt hier één-op-één, dus dezelfde vorm: **geen harde cap** — die
 * zou een legitieme boeking (een woning, een afkoopsom, een overboeking naar de
 * eigen beleggingsrekening) blokkeren — maar een **zachte wedervraag** vóór
 * opslaan. Wie doorzet, komt gewoon door.
 *
 * ## De grens
 *
 * Bewust een VAST bedrag en niet "10× het maandinkomen": het formulier kent het
 * inkomen niet, en een grens die van een asynchroon geladen getal afhangt zou
 * stil verdwijnen zolang dat getal nog 0 is (nieuwe gebruiker, lege historie).
 * Een drempel die soms niet bestaat is erger dan een grove die er altijd is.
 *
 * €100.000 is voor één losse boeking op een betaal-/spaarrekening uitzonderlijk,
 * maar niet onmogelijk — precies de zone waar een vraag past en een blokkade
 * niet. Hij ligt bewust twee ordes lager dan `ASSET_AMOUNT_CONFIRM_THRESHOLD`
 * (€10 mln): dat veld draagt een vermogenswaarde, dit veld één mutatie.
 *
 * De grens is ABSOLUUT: hij geldt voor uitgaven én inkomsten, want een tikfout
 * kent het teken niet.
 */

/**
 * Vanaf dit bedrag (in euro, absoluut) stelt de CLIENT een wedervraag. Geen
 * servergrens — bevestigt de gebruiker, dan wordt het bedrag gewoon opgeslagen.
 */
export const TRANSACTION_AMOUNT_CONFIRM_THRESHOLD = 100_000

/** true wanneer dit transactiebedrag om een bevestiging vraagt. NaN → false. */
export function needsTransactionAmountConfirmation(amount: number): boolean {
  return Number.isFinite(amount) && Math.abs(amount) >= TRANSACTION_AMOUNT_CONFIRM_THRESHOLD
}

/** Minimale rijvorm waaruit de import-samenvatting is af te leiden. */
export type PlausibilityRow = {
  amount: number
  /** `false` = wordt geïmporteerd (checkbox aangevinkt). */
  skipImport: boolean
}

export type ImplausibleAmountSummary = {
  /** Aantal AANGEVINKTE rijen op of boven de drempel. */
  count: number
  /** Het grootste absolute bedrag binnen die rijen; 0 wanneer `count === 0`. */
  largest: number
}

/**
 * Telt de aangevinkte rijen met een uitzonderlijk bedrag, voor de zachte
 * waarschuwing in de import-wizard.
 *
 * Waarom de import dezelfde grens deelt met het formulier: bij een bestand is de
 * bron van de fout een andere (een verkeerd gelezen decimaalteken maakt van
 * "1.234,56" stil €123.456) maar het gevolg is identiek — één rij die alle
 * aggregaten meesleurt. Uitgevinkte rijen tellen niet mee: die worden niet
 * weggeschreven, en meetellen zou een waarschuwing opleveren die de gebruiker
 * niet kan wegnemen.
 */
export function summarizeImplausibleAmounts(
  rows: readonly PlausibilityRow[],
): ImplausibleAmountSummary {
  let count = 0
  let largest = 0
  for (const row of rows) {
    if (row.skipImport) continue
    if (!needsTransactionAmountConfirmation(row.amount)) continue
    count++
    const abs = Math.abs(row.amount)
    if (abs > largest) largest = abs
  }
  return { count, largest }
}
