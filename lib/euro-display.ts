/**
 * Euro-weergave — "toekomstige euro's" (nominaal) ⇄ "huidige euro's" (koopkracht).
 *
 * WAT DIT WEL IS: een pure PRESENTATIE-laag. De horizon-kernel rekent
 * nominaal-throughout (ADR 0032, Excel-oracle op maandbasis) en draagt per
 * projectierij de canonieke deflator mee:
 *
 *   UnifiedProjectionRow.inflationFactor = (1 + inflatie)^k     (k = jaarindex)
 *
 * met jaar 0 → exact 1.0. Deflateren is dus `bedrag / row.inflationFactor`.
 *
 * WAT DIT NIET IS: een engine-knop. "Inflatie op 0 zetten" is expliciet NIET
 * dezelfde vraag — `inflationRate` werkt door in uitgaven-/salaris-/AOW-
 * indexering, Box 3-drempels, de solver en het doelbedrag. Dat is een ándere
 * simulatie, geen weergavekeuze. Engine, solver en de parity-fixtures blijven
 * bij een view-switch volledig onaangeraakt.
 *
 * CONSUME, DON'T RECOMPUTE (CLAUDE.md, hard): de factor komt ALTIJD uit de
 * kernelrijen. Schrijf nergens een eigen `Math.pow(1 + i, n)` om te deflateren —
 * dat is precies de drift (en, bovenop een globale deflator, de DUBBELE
 * DEFLATIE) die deze module opheft.
 */

/** Profiel-brede euro-weergave. `'nominal'` = exact het huidige beeld. */
export type EuroView = 'nominal' | 'real'

/**
 * Minimale rij-vorm waaruit een deflator te lezen valt. Structureel getypeerd,
 * zodat zowel `UnifiedProjectionRow` als elke andere factor-dragende rij past
 * zonder import-koppeling aan de kernel.
 */
export interface FactorRow {
  age: number
  inflationFactor: number
}

/**
 * Is deze factor bruikbaar als deler? Alles wat niet eindig-positief is
 * (0, negatief, NaN, Infinity) is geen geldige deflator — dan tonen we liever
 * het nominale bedrag dan een oneindig/negatief bedrag.
 */
function isUsableFactor(factor: number): boolean {
  return Number.isFinite(factor) && factor > 0
}

/**
 * Deflateer één bedrag naar de koopkracht van vandaag.
 *
 * In `'nominal'` is dit de identiteit — byte-identiek aan het huidige beeld.
 * In `'real'` wordt gedeeld door de kernel-factor van de bijbehorende rij.
 * Een onbruikbare factor (<= 0, NaN, Infinity) laat het bedrag ongemoeid.
 */
export function deflate(value: number, factor: number, view: EuroView): number {
  if (view === 'nominal') return value
  if (!isUsableFactor(factor)) return value
  return value / factor
}

/**
 * Bouw een leeftijd → deflator-map uit kernelrijen. Bedoeld voor oppervlakken
 * die per leeftijd meerdere bedragen deflateren (fase-tabellen, modals) en
 * niet telkens de rijen willen doorzoeken.
 *
 * Onbruikbare factoren worden overgeslagen; `factorAtAge` valt dan terug op 1.
 */
export function buildFactorByAge(rows: readonly FactorRow[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const row of rows) {
    if (isUsableFactor(row.inflationFactor)) map.set(row.age, row.inflationFactor)
  }
  return map
}

/**
 * Deflator bij een specifieke leeftijd (bv. FIRE-jaar voor het doelbedrag, of
 * het AOW-jaar voor "vermogen op AOW").
 *
 * Exacte leeftijd wint; anders de dichtstbijzijnde rij — puntbedragen hangen
 * aan een leeftijd die niet altijd exact op een rij-leeftijd valt (afronding,
 * halve jaren). Geen rijen of geen leeftijd → 1.0 (= geen deflatie), zodat een
 * ontbrekende factor nooit stilletjes een verkeerd bedrag oplevert.
 */
export function factorAtAge(rows: readonly FactorRow[], age: number | null | undefined): number {
  if (rows.length === 0) return 1
  if (age == null || !Number.isFinite(age)) return 1

  let nearest: FactorRow | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const row of rows) {
    if (!isUsableFactor(row.inflationFactor)) continue
    if (row.age === age) return row.inflationFactor
    const distance = Math.abs(row.age - age)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = row
    }
  }

  return nearest?.inflationFactor ?? 1
}

/** Label voor de actieve weergave — gedeeld door badge en command-palette. */
export function euroViewLabel(view: EuroView): string {
  return view === 'real' ? "Huidige euro's" : "Toekomstige euro's"
}

/* ───────────────────────────────────────────────────────────────────────────
 * FEED-DEFLATOREN — het choke point
 *
 * Alles hierboven werkt op één bedrag. Hieronder staan de drie helpers die een
 * hele feed omzetten. Ze bestaan om één reden: zodat er precies ÉÉN plek is
 * waar een reeks bedragen de euro-weergave in gaat. Handgerolde deflatie op een
 * callsite (`x / row.inflationFactor`) omzeilt het merk hieronder en daarmee de
 * enige bescherming tegen DUBBELE DEFLATIE die het typesysteem kan bieden.
 *
 * Er zijn er drie en niet één, omdat de feeds drie verschillende vormen hebben
 * en één helper er onvermijdelijk twee verkeerd zou sleutelen:
 *   1. rijen met `{ age }`            → `deflateRowsByAge`      (sleutel: leeftijd)
 *   2. `[x, value]`-tupels            → `deflatePoints`         (sleutel: expliciet via `keyOf`)
 *   3. reeksen op jaar-offset-index   → `deflateSeriesByOffset`  (sleutel: positie)
 *
 * De sleutelkeuze is geen detail: een partner-/huishoudlijn draagt de leeftijden
 * van de PARTNER, dus age-keyed deflatie pakt daar de verkeerde jaarfactor en
 * levert een bedrag dat er plausibel uitziet. Zulke feeds lopen op offset.
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Merk-symbool: "deze waarde is al naar de actieve weergave omgezet".
 *
 * BEWUST NIET GEËXPORTEERD. Doordat het symbool module-lokaal is, kan geen
 * enkel ander bestand het merk zelf zetten of afpellen — omzetten kan alleen
 * door hier langs te gaan.
 */
declare const EURO_VIEW_APPLIED: unique symbol

/**
 * Bedragen zijn al naar de actieve weergave omgezet. **Nooit nogmaals
 * deflateren.**
 *
 * Waarom een merk-type: een gedeflateerde rij is *typegelijk* aan een nominale.
 * Zonder merk kan het typesysteem een tweede omzetting niet zien, en een dubbel
 * gedeeld bedrag ziet er op het scherm nog steeds plausibel uit. Het merk is
 * optioneel (`?: true`) zodat een omgezette waarde nog steeds als de gewone `T`
 * doorgegeven kan worden — de tekenmachine hoeft niet te weten wat euro-weergave
 * is — maar wél botst met de parameter-gard van de helpers hieronder.
 *
 * **`InEuroView<UnifiedProjectionRow>` bestaat niet en mag niet ontstaan.**
 * Rekenrijen kruisen de rendergrens nominaal en onveranderd: ze dragen
 * kruis-jaar-identiteiten (een kassabon die moet blijven sluiten) én hun eigen
 * factor, dus het ontvangende component deflateert zelf per klasse. Die twee
 * regimes — gemerkte chart-feeds naast nominale rekenrijen — mogen niet mengen;
 * dit merk-type op een rekenrij zetten is de enige constructie waarmee dat zou
 * kunnen.
 */
export type InEuroView<T> = T & { readonly [EURO_VIEW_APPLIED]?: true }

/**
 * De compile-gard tegen dubbele deflatie.
 *
 * Elke helper eist dat zijn invoer dit merk-veld *niet* draagt: `undefined` is
 * onverenigbaar met de `true` uit `InEuroView<T>`. Een ongemerkte waarde heeft
 * het veld niet en past dus; een al omgezette waarde botst en levert een
 * compile-fout op. Dat is de hele mechaniek — er is bewust géén runtime-check,
 * want een fout die pas op het scherm zichtbaar wordt is de fout die dit werk
 * juist moet uitsluiten.
 */
type NotYetInEuroView = { readonly [EURO_VIEW_APPLIED]?: undefined }

/**
 * Deflateer de opgegeven geldvelden van rijen die op **leeftijd** sleutelen
 * (`SimRow[]` en alles met een `age`).
 *
 * In `'nominal'` komt exact dezelfde array-REFERENTIE terug (`===`). Dat is geen
 * micro-optimalisatie maar een harde eis: `horizon-client.tsx` hangt vol memo's
 * die op referentiegelijkheid vertrouwen, en een kopie-per-render zou daar een
 * re-render-cascade openen op een bestand van 8000+ regels.
 *
 * `moneyFields` is expliciet en nooit "alles wat een number is": `age`, `phase`,
 * tellers en ratio's (dekkingsgraad, spaarquote, SWR) zijn geen euro's en mogen
 * nooit meegedeeld worden.
 *
 * Ontbreekt de leeftijd in `factorByAge`, of is de factor onbruikbaar, dan
 * blijft het bedrag ongemoeid (factor 1) — een ontbrekende factor levert nooit
 * stilletjes een verkeerd bedrag op.
 */
export function deflateRowsByAge<
  T extends { age: number } & NotYetInEuroView,
  K extends keyof T,
>(
  rows: readonly T[],
  factorByAge: ReadonlyMap<number, number>,
  moneyFields: readonly K[],
  view: EuroView,
): InEuroView<T>[] {
  // Identiteit in 'nominal': dezelfde referentie, geen allocatie.
  if (view === 'nominal') return rows as InEuroView<T>[]

  return rows.map((row) => {
    // Kopiëren gebeurt in 'real' ALTIJD — ook bij een ontbrekende factor en bij
    // een lege `moneyFields`. Zou de helper daar de invoer teruggeven, dan was
    // het merk betekenisloos: gemerkt en ongemerkt zouden dezelfde waarde zijn.
    const next = { ...row }
    const factor = factorByAge.get(row.age)
    if (factor === undefined || !isUsableFactor(factor)) return next as InEuroView<T>

    for (const field of moneyFields) {
      const value = next[field]
      // De typeof-check bewijst dat dit veld een getal is; de cast is nodig
      // omdat `T[K]` generiek is en de compiler die brug niet zelf legt.
      if (typeof value === 'number') next[field] = (value / factor) as T[K]
    }
    return next as InEuroView<T>
  })
}

/**
 * Deflateer `[x, value]`-tupels (overlay-reeksen, de liquide-vermogenslijn).
 *
 * `keyOf` maakt de x→factor-sleutel **expliciet op de callsite**. Dat is opzet:
 * een lijn die zijn waarde bij leeftijd `a` op `a + 1` plot, moet met de factor
 * van het BRONJAAR gedeflateerd worden (`keyOf: x => x - 1`). Zonder zichtbare
 * sleutel verdwijnt zo'n verschuiving in de helper en deflateert de lijn stil
 * een jaar te ver. Zonder `keyOf` is de sleutel `x` zelf.
 */
export function deflatePoints(
  points: readonly ([number, number] & NotYetInEuroView)[],
  factorByAge: ReadonlyMap<number, number>,
  view: EuroView,
  keyOf?: (x: number) => number,
): InEuroView<[number, number]>[] {
  if (view === 'nominal') return points as InEuroView<[number, number]>[]

  return points.map(([x, value]) => {
    const factor = factorByAge.get(keyOf ? keyOf(x) : x)
    const deflated = factor === undefined || !isUsableFactor(factor) ? value : value / factor
    // De x-as (leeftijd) blijft onaangeroerd; alleen de waarde is een euro.
    return [x, deflated] as InEuroView<[number, number]>
  })
}

/**
 * Deflateer een reeks die op **jaar-offset** is geïndexeerd: index 0 = vandaag,
 * index k = k jaar verder (Monte-Carlo-banden, partner-/huishoudlijnen).
 *
 * Gebruik deze helper zodra de positie in de reeks de tijd draagt en de x-as
 * NIET de leeftijd van de gebruiker is. Ontbreekt de factor op die index, of is
 * hij onbruikbaar, dan blijft het bedrag ongemoeid.
 */
export function deflateSeriesByOffset(
  series: readonly (number & NotYetInEuroView)[],
  factorByOffset: readonly number[],
  view: EuroView,
): InEuroView<number>[] {
  if (view === 'nominal') return series as InEuroView<number>[]

  return series.map((value, index) => {
    const factor = factorByOffset[index]
    if (factor === undefined || !isUsableFactor(factor)) return value as InEuroView<number>
    return (value / factor) as InEuroView<number>
  })
}

/**
 * Bouw een deflator-lijst per **jaar-offset** uit dezelfde kernelrijen als
 * `buildFactorByAge`: index 0 = vandaag (factor 1.0), op volgorde van de rijen.
 *
 * Dit is de tweede sleutelvorm van één en dezelfde bron, niet een tweede bron —
 * en zeker geen tweede berekening: de factoren worden gelezen, nooit opnieuw
 * uitgerekend. Een onbruikbare factor wordt 1 (= geen deflatie), zodat de index
 * op zijn plaats blijft; wegfilteren zou alle latere jaren opschuiven en de hele
 * reeks stil een jaar verkeerd deflateren.
 */
export function buildFactorByOffset(rows: readonly FactorRow[]): number[] {
  return rows.map((row) => (isUsableFactor(row.inflationFactor) ? row.inflationFactor : 1))
}
