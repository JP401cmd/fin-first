/**
 * Onderdrukking van kleine groepen voor /beheer/gebruik (ADR 0153).
 *
 * TWEE LAGEN. De database (`admin_gebruik_analyse`) past de eerste laag al toe:
 * elke telling van 1 t/m k-1 gebruikers verlaat de database als `null`. Deze
 * module herhaalt die laag defensief (een getal onder k dat tóch binnenkomt
 * wordt alsnog "klein") en voegt de tweede laag toe voor VERDELINGEN: cellen die
 * samen een totaal vormen.
 *
 * HET TOTAAL GELDT ALS PUBLIEK. Hetzelfde totaal staat vaak op meer plekken (het
 * segmenttotaal als kerncijfer én onder vier profielverdelingen). Een totaal
 * "verbergen" beschermt dan niets (eindreview 17-09-2026, R1); deze functie
 * verbergt het nooit.
 *
 * DE REGEL (alles-of-niets per verdeling):
 *  - totaal 0 → alles 0;
 *  - totaal onder k → élke cel "klein", ook de nullen (anders verraadt
 *    [1,1,1,1] met een klein totaal dat elke cel precies 1 is);
 *  - geen enkele kleine cel → alles zichtbaar;
 *  - minstens één kleine cel → élke niet-nul cel "verborgen". Nullen blijven
 *    zichtbaar zolang het totaal groter is dan het aantal cellen; anders gaan
 *    ook de nullen dicht (bij 5 cellen met totaal 5 zou "geen nullen" betekenen
 *    dat elke cel 1 is).
 *
 * WAAROM NIET "VERBERG DE KLEINSTE ANDERE CEL". Die klassieke aanvullende
 * onderdrukking is met intervallen dicht te redeneren, maar niet tegen een
 * lezer die het algoritme kent: het PATROON van wat verborgen is verraadt dan
 * de waarden ([0, 4, 4] met totaal 8 gaf een uniek patroon). De eigenschapstest
 * in onderdrukking.test.ts speelt precies die lezer: voor elke invoer tot 7 cellen
 * (13 cellen voor de cohortkolom in de losse toets) is geen kleine cel exact te
 * bepalen uit wat zichtbaar is.
 *
 * GRENS, bewust benoemd: dit beschermt elke verdeling tegen haar eigen publieke
 * totaal. Verschillen tussen tellingen die niet als verdeling op elkaar
 * aansluiten (bv. gebruikers per stroom tegenover de overlapverdeling) zijn een
 * benoemd restrisico in ADR 0153.
 */

/** Minimale groepsgrootte. Moet gelijk zijn aan `c_k` in `admin_gebruik_analyse`. */
export const GEBRUIK_K = 5

/** Onder dit aantal krijgt een percentage een waarschuwing. */
export const GEBRUIK_PERCENTAGE_MIN_N = 40

export type Cel =
  | { soort: 'waarde'; n: number }
  /** 1 t/m k-1 gebruikers (primair onderdrukt). */
  | { soort: 'klein' }
  /** Extra verborgen om terugrekenen te voorkomen (aanvullend onderdrukt). */
  | { soort: 'verborgen' }

/** Eén telling uit de database (`null` = al onderdrukt) → een cel. */
export function onderdrukCel(n: number | null | undefined, k: number = GEBRUIK_K): Cel {
  if (n == null) return { soort: 'klein' }
  if (!Number.isFinite(n) || n < 0) return { soort: 'klein' }
  if (n > 0 && n < k) return { soort: 'klein' }
  return { soort: 'waarde', n }
}

const VERBORGEN: Cel = { soort: 'verborgen' }
const KLEIN: Cel = { soort: 'klein' }

export interface Verdeling {
  cellen: Cel[]
  totaal: Cel
}

/**
 * Een verdeling (cellen die samen het totaal vormen) met primaire én
 * aanvullende onderdrukking volgens de alles-of-niets-regel (zie kop). Het
 * totaal wordt nooit verborgen. Pure functie; de invoer wordt niet gewijzigd.
 */
export function onderdrukVerdeling(
  cellen: ReadonlyArray<number | null | undefined>,
  totaal: number | null | undefined,
  k: number = GEBRUIK_K,
): Verdeling {
  const uit: Cel[] = cellen.map((c) => onderdrukCel(c, k))
  const tot = onderdrukCel(totaal, k)
  if (tot.soort !== 'waarde') return { cellen: uit.map(() => KLEIN), totaal: tot }
  if (tot.n === 0 || !uit.some((c) => c.soort !== 'waarde')) return { cellen: uit, totaal: tot }
  const nullenZichtbaar = tot.n > uit.length
  return {
    cellen: uit.map((c) => (c.soort === 'waarde' && c.n === 0 && nullenZichtbaar ? c : VERBORGEN)),
    totaal: tot,
  }
}

export interface Aandeel {
  /** 0..1 */
  fractie: number
  noemer: number
  /** true = noemer onder {@link GEBRUIK_PERCENTAGE_MIN_N}: lees als richting, niet als maat. */
  waarschuwing: boolean
}

/** Een percentage alleen als teller én noemer zichtbaar zijn — altijd met n erbij. */
export function aandeel(teller: Cel, noemer: Cel): Aandeel | null {
  if (teller.soort !== 'waarde' || noemer.soort !== 'waarde' || noemer.n === 0) return null
  return {
    fractie: teller.n / noemer.n,
    noemer: noemer.n,
    waarschuwing: noemer.n < GEBRUIK_PERCENTAGE_MIN_N,
  }
}

/** Tekst voor een cel: "12", "< 5" of "verborgen". */
export function celTekst(cel: Cel, k: number = GEBRUIK_K): string {
  if (cel.soort === 'waarde') return cel.n.toLocaleString('nl-NL')
  if (cel.soort === 'klein') return `< ${k}`
  return 'verborgen'
}
