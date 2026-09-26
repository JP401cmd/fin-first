// Verplaatst uit components/app/horizon/horizon-client.tsx (ADR 0179 fase 1, stap 4).
//
// De veldclassificatie van de euro-render-grens (ADR 0090/0093): welke velden van
// `SimRow`/`StackedRow` euro's zijn en dus meedeflateren, plus de compile-gard die
// élk `SimRow`-veld laat classificeren, en de sleutel-helper `factorMapByPosition`
// voor feeds met een eigen leeftijd-as (K4). De grens zelf (de `deflate*`-aanroepen)
// staat sinds stap 12 als geheel in `use-euro-view-feeds.ts`.
// Hier wordt niets gedeeld en niets uitgerekend.

import type { SimRow } from '@/lib/fire-simulation'
import type { StackedRow } from '@/lib/wealth-composition'

/**
 * De euro-velden van `SimRow` — expliciet, nooit "alles wat een getal is".
 * `age` en `phase` zijn geen euro's en mogen dus nooit meegedeeld worden
 * (klasse R resp. metadata, zie ADR 0090 / het deflatieklasse-besluit D1).
 */
export const SIM_ROW_MONEY_FIELDS = [
  'startPortfolio',
  'growth',
  'savings',
  'withdrawal',
  'cashflowNet',
  'oneTimeNet',
  'endPortfolio',
  'grossIncome',
  'grossExpenses',
  'flowIn',
  'flowOut',
] as const satisfies readonly (keyof SimRow)[]

/**
 * De overige velden van `SimRow`, met per veld de reden dat ze NIET meedeflateren.
 * Deze lijst bestaat alleen om de gard hieronder te laten werken.
 *
 *  - `age`   — klasse R (een leeftijd, geen euro; ADR 0090).
 *  - `phase` — metadata (opbouw/opname).
 *  - `incomeBreakdown` / `expenseBreakdown` — dragen WÉL bedragen, maar zijn geen
 *    getalvelden: `deflateRowsByAge` deflateert alleen `typeof === 'number'` en
 *    laat de items dus ongemoeid passeren. Vandaag inert (`toSimRow` vult ze niet,
 *    de inkomsten/uitgaven-strook loopt via een eigen pad); `lib/unified-projection.test.ts`
 *    grendelt dat vast, zodat het moment waarop de kernel ze wél gaat vullen als
 *    falende test opvalt in plaats van als ongedeflateerd bedrag op het scherm.
 */
const SIM_ROW_NON_MONEY_FIELDS = [
  'age',
  'phase',
  'incomeBreakdown',
  'expenseBreakdown',
] as const satisfies readonly (keyof SimRow)[]

/**
 * De gard die de ANDERE kant op werkt.
 *
 * `satisfies readonly (keyof SimRow)[]` controleert alleen dat de genoemde
 * sleutels BESTAAN — niet dat alle geldvelden genoemd zijn. Een nieuw euro-veld
 * op `SimRow` zou dus stil ongedeflateerd de rendergrens kruisen binnen een
 * `InEuroView<SimRow>`, zónder compile-fout. Daarom eisen we hier dat beide
 * lijsten SAMEN élk veld van `SimRow` dekken: een nieuw veld valt in geen van
 * beide en laat `never` klappen, wat de auteur dwingt te kiezen tussen "dit is
 * een euro" (meedeflateren) en "dit is het niet" (met reden hierboven).
 */
type OngeclassificeerdSimRowVeld = Exclude<
  keyof SimRow,
  (typeof SIM_ROW_MONEY_FIELDS)[number] | (typeof SIM_ROW_NON_MONEY_FIELDS)[number]
>
type AlleSimRowVeldenGeclassificeerd<T extends never> = T
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- puur een compile-gard; het type dráágt de controle
type _SimRowDekking = AlleSimRowVeldenGeclassificeerd<OngeclassificeerdSimRowVeld>

/**
 * De euro-velden van `StackedRow` (vermogensopbouw-staven) — jaarstanden per
 * vermogensgroep, klasse S op de eigen leeftijd-as. `age` is klasse R en blijft
 * er bewust buiten. Bewaakt door use-euro-view-feeds.euro-view.test.ts.
 */
export const STACKED_ROW_MONEY_FIELDS = [
  'spaargeld',
  'beleggingen',
  'pensioen',
  'vastgoed',
  'overig',
  'vastgoedEigenHuis',
  'schulden',
  'schuldHypotheek',
  'schuldEigenHuisHypotheek',
  'schuldOverig',
  'schuldOpeethypotheek',
  'schuldTekortLening',
  'opeetOpname',
] as const satisfies readonly (keyof StackedRow)[]

/**
 * Deflator-map voor een feed die zijn EIGEN leeftijd-as draagt (partner- en
 * huishoudlijn). Positie `k` in zo'n reeks is jaar `k` vanaf vandaag, maar
 * `rows[k].age` is de leeftijd van de PARTNER. Een `factorByAge`-lookup op die
 * leeftijd pakt daarom de verkeerde jaarfactor zodra de partner niet even oud
 * is — en het resultaat oogt plausibel, dus je ziet het niet.
 *
 * Deze helper hangt daarom de jaarfactor van jaar `k` (uit de EIGEN kernelrijen)
 * aan de leeftijd die dezelfde positie in de vreemde reeks draagt, zodat
 * `deflateRowsByAge` er alsnog op sleutelt. Er wordt hier niets gedeeld en niets
 * uitgerekend — alleen omgesleuteld.
 *
 * Geëxporteerd omdat dit de enige plek is waar een verkeerde sleutelkeuze
 * ONZICHTBAAR fout gaat: het bedrag blijft plausibel. Zo'n fout moet in een test
 * vast te pinnen zijn, niet alleen in een review op te merken.
 */
export function factorMapByPosition(
  rows: readonly { age: number }[],
  factorByOffset: readonly number[],
): Map<number, number> {
  const map = new Map<number, number>()
  rows.forEach((row, index) => {
    const factor = factorByOffset[index]
    if (factor !== undefined) map.set(row.age, factor)
  })
  return map
}
