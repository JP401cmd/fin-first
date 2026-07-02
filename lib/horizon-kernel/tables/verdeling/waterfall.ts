/**
 * Horizon-kernel · tabel **Verdeling** — de capaciteit-waterval per onderwerp.
 *
 * Eén onderwerp (afname / onttrekking / schuld-aflossing) verdeelt zijn
 * maandbudget over de categorieën met een **strikte capaciteit-waterval**:
 *
 * 1. **Prio 1–4 (6 passes, doorstroom).** Per pass wordt het resterende budget
 *    naar rato van de gewichten verdeeld over de nog niet volgelopen categorieën;
 *    een categorie wordt gecapt op zijn capaciteit (`MIN(cap, vorige + rest·w/Σw)`).
 *    Loopt een categorie vol (raw > cap), dan valt ze in de volgende passes weg en
 *    stroomt haar aandeel door naar de overige categorieën. Zo convergeert de
 *    verdeling in ≤ 6 passes (evenveel als er categorieën zijn).
 * 2. **Reserve-pass (prio 5).** Wat na de 6 passes overblijft (`leftover`) gaat
 *    naar rato van hun capaciteit naar de prio-5-reservecategorieën.
 * 3. **Eindtoewijzing** = pass-toewijzing + reserve-toewijzing; **onbenut** =
 *    budget − Σ eindtoewijzing. Onbenut afname/onttrekking wordt elders (S!AB)
 *    tot tekort-lening; onbenut aflossing stroomt terug naar bezitting-toename.
 *
 * **Drie empirisch bewezen fijnpunten (Excel-oracle, ADR 0032):**
 * - **Σw-poort (`sumW`).** De gewichtensom van een pass is 0 zodra de *actieve*
 *   categorieën samen géén restcapaciteit meer hebben (`Σ(cap−alloc) ≈ 0`). Dit
 *   onderscheidt "budget 0 maar capaciteit aanwezig" (Σw = som van de gewichten,
 *   niets loopt vol) van "alle capaciteit 0" (Σw = 0, bv. maand 0 en voorbij de
 *   horizon) — anders zou een categorie met cap 0 vanaf de start ten onrechte
 *   uit-/ingesloten worden.
 * - **Strikte cap-markering (`raw > cap`).** Een categorie geldt pas als "vol"
 *   als een POSITIEVE toewijzing tegen de cap geknepen wordt (`raw > cap`), niet
 *   bij `raw = cap`. Zo blijft een categorie met cap 0 én budget 0 (geen echte
 *   toewijzing) in latere passes gewoon meetellen, exact zoals Excel.
 * - **Geërfde `capped`-status (`initialCapped`).** Afname en onttrekking delen
 *   één bezit-'pot': de ONTTREKKING-waterval gaat verder waar AFNAME stopte. Een
 *   categorie die afname vól trok (raw > cap, dus `capped`) heeft géén ruimte meer
 *   voor onttrekking en valt uit de onttrekking-Σw — ook al is haar cap 0 (Excel:
 *   `gezin` onttrekking maand 24, Σw 0,667). Een categorie die afname NIET raakte
 *   (bv. afname-budget 0) blijft, óók met cap 0, gewoon meetellen tot budget haar
 *   tegen de cap knijpt (`partner-aan` onttrekking maand 27, Σw 1,0). De
 *   onttrekking-waterval krijgt daarom afname's eind-`capped` als startstatus
 *   binnen (caps al verminderd met de afname-toewijzing); de gerapporteerde
 *   toewijzing blijft incrementeel (vanaf 0), exact zoals de Excel-kolommen.
 *
 * Pure functie; geen fs/Supabase/Date.now/Math.random.
 */

/** Aantal doorstroom-passes voor prio 1–4 (= max. aantal categorieën). */
export const PASS_COUNT = 6

/** Numerieke drempel voor "geen restcapaciteit meer" (euro-schaal, ver onder €0,01). */
const CAP_EPS = 1e-9

/** Uitkomst van één onderwerp-waterval (alle tussenkolommen + eindwaarden). */
export interface WaterfallResult {
  /** Het te verdelen budget (echo; = de budget-kolom D/BX/EQ). */
  readonly budget: number
  /** Restcapaciteit per categorie (echo; = de cap-kolommen E:J/BY:CD/ER:EV). */
  readonly caps: readonly number[]
  /** Per pass (6): restbudget vóór de pass (= budget − Σ vorige toewijzing). */
  readonly passRest: readonly number[]
  /** Per pass (6): Σ gewichten van de actieve categorieën (0 = geen restcapaciteit). */
  readonly passSumW: readonly number[]
  /** Per pass (6): de cumulatieve toewijzing per categorie ná die pass. */
  readonly passAlloc: readonly (readonly number[])[]
  /** Restbudget na de 6 passes (voedt de reserve-pass). */
  readonly leftover: number
  /** Σ capaciteit van de reserve-categorieën (noemer "naar rato saldo"). */
  readonly reserveDenom: number
  /** Reserve-toewijzing per categorie (alleen prio-5; overige 0). */
  readonly reserveAlloc: readonly number[]
  /** Eindtoewijzing per categorie = pass-toewijzing + reserve-toewijzing. */
  readonly eind: readonly number[]
  /** Onbenut budget = budget − Σ eindtoewijzing. */
  readonly onbenut: number
  /** Eind-`capped`-status per categorie (volgelopen); voedt de onttrekking-waterval. */
  readonly capped: readonly boolean[]
}

/**
 * Voer de capaciteit-waterval uit voor één onderwerp.
 *
 * @param budget        Te verdelen maandbudget (Af!D / Ont!D / aflos-deel CF!I).
 * @param caps          Restcapaciteit per categorie (categoriesaldo m−1, 0 bij niet-liquide).
 * @param weights       Genormaliseerde ½^(prio−1)-gewichten per categorie (prio 1–4).
 * @param reserveMask   Per categorie: is dit een prio-5-reservecategorie?
 * @param initialCapped Optioneel: startstatus "volgelopen" per categorie. De
 *                      onttrekking-waterval erft hiermee afname's eind-`capped`
 *                      (afname en onttrekking delen één bezit-pot); default niets.
 */
export function runWaterfall(
  budget: number,
  caps: readonly number[],
  weights: readonly number[],
  reserveMask: readonly boolean[],
  initialCapped?: readonly boolean[],
): WaterfallResult {
  const n = caps.length
  const alloc = new Array<number>(n).fill(0)
  const capped = initialCapped ? initialCapped.slice() : new Array<boolean>(n).fill(false)
  const passRest: number[] = []
  const passSumW: number[] = []
  const passAlloc: number[][] = []

  for (let p = 0; p < PASS_COUNT; p++) {
    let rest = budget
    for (let c = 0; c < n; c++) rest -= alloc[c]

    // Actieve set: gewogen categorieën die nog niet zijn volgelopen (`capped`).
    let remainingCap = 0
    let activeW = 0
    for (let c = 0; c < n; c++) {
      if (weights[c] > 0 && !capped[c]) {
        remainingCap += caps[c] - alloc[c]
        activeW += weights[c]
      }
    }
    // Σw-poort: geen restcapaciteit in de actieve set → 0 (niets te verdelen).
    const sumW = remainingCap > CAP_EPS ? activeW : 0

    if (sumW > 0) {
      for (let c = 0; c < n; c++) {
        if (weights[c] > 0 && !capped[c]) {
          const raw = alloc[c] + (rest * weights[c]) / sumW
          if (raw > caps[c]) {
            // Strikt: alleen bij een positieve overschrijding loopt de categorie vol.
            alloc[c] = caps[c]
            capped[c] = true
          } else {
            alloc[c] = raw
          }
        }
      }
    }

    passRest.push(rest)
    passSumW.push(sumW)
    passAlloc.push(alloc.slice())
  }

  let leftover = budget
  for (let c = 0; c < n; c++) leftover -= alloc[c]

  // Reserve-pass (prio 5): verdeel het restant naar rato van de reserve-capaciteit.
  let reserveDenom = 0
  for (let c = 0; c < n; c++) if (reserveMask[c]) reserveDenom += caps[c]

  const reserveAlloc = new Array<number>(n).fill(0)
  if (reserveDenom > CAP_EPS) {
    for (let c = 0; c < n; c++) {
      if (reserveMask[c]) {
        // Reserve-categorieën kregen in de passes niets (gewicht 0) → volle cap resteert.
        const want = (leftover * caps[c]) / reserveDenom
        reserveAlloc[c] = Math.min(caps[c] - alloc[c], want)
      }
    }
  }

  const eind = new Array<number>(n)
  let onbenut = budget
  for (let c = 0; c < n; c++) {
    eind[c] = alloc[c] + reserveAlloc[c]
    onbenut -= eind[c]
  }

  return {
    budget,
    caps,
    passRest,
    passSumW,
    passAlloc,
    leftover,
    reserveDenom,
    reserveAlloc,
    eind,
    onbenut,
    capped,
  }
}
