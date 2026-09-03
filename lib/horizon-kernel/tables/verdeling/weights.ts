/**
 * Horizon-kernel · tabel **Verdeling** — categorie-gewichten (½^(prio−1)).
 *
 * De waterval verdeelt elk maandbudget over de categorieën naar rato van de
 * **halverings-gewichten** `½^(prio−1)`, genormaliseerd over de *in aanmerking
 * komende* categorieën (gevuld, liquide, prio 1–4). Deze gewichten zijn een
 * PURE, deterministische functie van de statische TS-invoer (prio / gevuld /
 * niet-liquide) — ze veranderen niet per maand.
 *
 * **Waarom niet uit de fixture-`Toename en afname`/`TS`-cellen gelezen?**
 * Het Excel-model bewaart deze gewichten óók in `Toename en afname` rij 3 (en
 * TS!H:L), maar de fixture-extractor rondt elke cel op 6 decimalen af (bv. ⅔ →
 * `0,666667`). Bij grote budgetten (tot ~€48k) geeft die 3·10⁻⁷-afronding een
 * allocatie-afwijking tot ~€0,014 — net boven de €0,01-paritytolerantie. Excel
 * rekent intern op volle precisie; wij reproduceren die door de gewichten zelf
 * op volle precisie uit de TS-prio's te herleiden (identiek aan Excels interne
 * waarde, alleen de celdump is afgerond). De gewichten zijn daarmee een functie
 * van de statische `KernelInput`, geen per-maand inter-tabel-waarde.
 *
 * Pure functie; geen fs/Supabase/Date.now/Math.random.
 */

import type { KernelInput } from '../../types'

/** Aantal prioriteiten dat gelijktijdig gewogen meedoet (1–4); prio ≥ 5 = 0. */
const MAX_WEIGHTED_PRIO = 4

/**
 * Ongenormaliseerd basisgewicht `½^(prio−1)` als de categorie **gevuld** is,
 * **niet niet-liquide** en een prio in 1..4 heeft; anders 0. (`null`/leeg → 0.)
 */
function baseWeight(prio: number | null, gevuld: boolean, nietLiquide: boolean): number {
  return gevuld &&
    !nietLiquide &&
    typeof prio === 'number' &&
    prio >= 1 &&
    prio <= MAX_WEIGHTED_PRIO
    ? Math.pow(0.5, prio - 1)
    : 0
}

/**
 * Basisgewicht `½^(prio−1)` ZONDER de `gevuld`-eis (prio 1..4 + liquide) — voor de
 * degenerate-CAPACITEITS-fallback van de uitstroom-waterval (afname/onttrekking). Een
 * categorie die STATISCH ongevuld (startwaarde 0) was maar inmiddels een positief
 * saldo(m−1) heeft, is een geldig uitstroom-doel; de waterval-cap (= saldo m−1)
 * begrenst alsnog of ze werkelijk geld krijgt (cap 0 → Σw-poort 0). Spiegel van
 * `ruwGewichtInstroom` (toename-afname.ts), maar dan voor UITstroom. Zie
 * `runBezitWaterfallMetDegeneratie` (verdeling/index.ts) voor de exacte poort.
 */
function baseWeightZonderGevuld(prio: number | null, nietLiquide: boolean): number {
  return !nietLiquide && typeof prio === 'number' && prio >= 1 && prio <= MAX_WEIGHTED_PRIO
    ? Math.pow(0.5, prio - 1)
    : 0
}

/**
 * Genormaliseerde `½^(prio−1)`-uitstroom-gewichten ZONDER de statische gevuld-eis
 * (prio 1..4 + liquide). Uitsluitend gebruikt in de degenerate-capaciteits-fallback
 * van `runBezitWaterfallMetDegeneratie` (verdeling/index.ts) — nóóit op het reguliere
 * pad, waar `halveningWeights` (mét gevuld-eis) de oracle-getrouwe bron blijft.
 */
export function halveningWeightsZonderGevuld(
  prio: readonly (number | null)[],
  nietLiquide: readonly boolean[],
): number[] {
  const n = prio.length
  const base = new Array<number>(n).fill(0)
  let sum = 0
  for (let c = 0; c < n; c++) {
    base[c] = baseWeightZonderGevuld(prio[c], nietLiquide[c])
    sum += base[c]
  }
  return sum > 0 ? base.map((b) => b / sum) : base
}

/**
 * Per bezit-categorie: kan positief geld hier daadwerkelijk LANDEN? (kernel-extensie,
 * buiten het Excel-oracle — voedt uitsluitend de instroom-fallback-ladder hieronder.)
 *
 * Een categorie is instroom-doel als ze ≥ 1 pot heeft die géén eigen woning is:
 *  - **≥ 1 pot**: Bez verdeelt de categorie-toename "per stuk" (`(toename€ + overloop)
 *    / aantal`, 0 bij aantal 0 — `tables/bez.ts`). Gewicht naar een pot-loze categorie
 *    verdampt dus alsnog, alleen één tabel later. Een €0-pot telt WEL (voor instroom is
 *    een lege pot een geldige bestemming — het V17-principe).
 *  - **geen eigen woning** (`rol === 'eigenHuis'`): bij "Meerekenen" is die categorie
 *    liquide in de TS-zin (telt mee als FIRE-kapitaal, laatste-redmiddel-buffer voor
 *    UITstroom), maar een woning is geen spaarpot voor een kasoverschot.
 *
 * Indexering = `input.ts.bezitCategorien` (de vaste bezit-volgorde).
 */
export function bezitInstroomDoelMask(input: KernelInput): boolean[] {
  return input.ts.bezitCategorien.map((cat) =>
    input.assetPotten.some((p) => p.categorie === cat.categorie && p.rol !== 'eigenHuis'),
  )
}

/**
 * Instroom-fallback-gewichten voor bezit — de ENE ladder voor "positief geld dat volgens
 * de reguliere ½^(prio−1)-toename-gewichten nergens heen kan" (Σw = 0). Kernel-extensie,
 * buiten het Excel-oracle; inert-by-construction op het oracle-pad (de fixtures hebben
 * altijd een gevulde prio-1..4-bestemming, dus de reguliere Σw > 0 en de ladder wordt
 * nooit aangeroepen). Gedeeld door precies twee consumenten — één formule, één plek:
 *  - `toenameGewichten` (tables/toename-afname.ts): de degenerate toename-verdeling
 *    (gap-besluit V17 — lege surplus-doelpot);
 *  - `computeVerdeling` (verdeling/index.ts): de schuld→bezit-overloop HC:HH wanneer
 *    `wBezitToename` all-zero is (gap-besluit V24 — surplus "Schulden aflossen" nadat de
 *    aanwijsbare schuld is afgelost).
 *
 * Ladder (eerste tree met Σ > 0 wint; genormaliseerd tot Σ = 1):
 *  A) prio 1..4 + liquide + instroom-doel — de `gevuld`-eis losgelaten, de ½^(prio−1)-
 *     ordening intact (de lege surplus-doelpot vult zich, conform de gebruikersintentie);
 *  B) prio 5 (reserve) + liquide + instroom-doel — gelijk gewogen (alle reserve-prio's zijn
 *     5, dus ½^(prio−1) is daar per definitie uniform);
 *  C) géén liquide instroom-doel — all-nul (het geld heeft werkelijk geen bestemming;
 *     byte-identiek aan het gedrag vóór de extensie).
 *
 * @param prio         Per bezit-categorie: TS-prioToename (1..5).
 * @param nietLiquide  Per bezit-categorie: TS!H.
 * @param instroomDoel Per bezit-categorie: `bezitInstroomDoelMask` (≥ 1 niet-woning-pot).
 */
export function bezitInstroomFallbackWeights(
  prio: readonly (number | null)[],
  nietLiquide: readonly boolean[],
  instroomDoel: readonly boolean[],
): number[] {
  const n = prio.length
  // A) prio 1..4, liquide, instroom-doel — gevuld-eis losgelaten.
  const a = new Array<number>(n).fill(0)
  let somA = 0
  for (let c = 0; c < n; c++) {
    a[c] = instroomDoel[c] ? baseWeightZonderGevuld(prio[c], nietLiquide[c]) : 0
    somA += a[c]
  }
  if (somA > 0) return a.map((w) => w / somA)
  // B) prio-5-reserve, liquide, instroom-doel — gelijk gewogen.
  const b = new Array<number>(n).fill(0)
  let somB = 0
  for (let c = 0; c < n; c++) {
    b[c] = instroomDoel[c] && !nietLiquide[c] && prio[c] === 5 ? 1 : 0
    somB += b[c]
  }
  if (somB > 0) return b.map((w) => w / somB)
  // C) geen liquide instroom-doel — all-nul.
  return b
}

/**
 * Bereken de genormaliseerde halverings-gewichten per categorie voor één
 * onderwerp (afname / onttrekking / schuld-aflossing).
 *
 * Basisgewicht `½^(prio−1)` als de categorie **gevuld** is, **niet niet-liquide**
 * en een prio in 1..4 heeft; anders 0. Vervolgens genormaliseerd zodat de som
 * over de in aanmerking komende categorieën 1 is (som 0 → alle gewichten 0).
 *
 * @param prio         Per categorie: de onderwerp-prio (TS); `null`/leeg telt niet mee.
 * @param gevuld       Per categorie: TS!G (categorie heeft startwaarde > 0).
 * @param nietLiquide  Per categorie: TS!H (niet-liquide → gewicht 0).
 */
export function halveningWeights(
  prio: readonly (number | null)[],
  gevuld: readonly boolean[],
  nietLiquide: readonly boolean[],
): number[] {
  const n = prio.length
  const base = new Array<number>(n).fill(0)
  let sum = 0
  for (let c = 0; c < n; c++) {
    base[c] = baseWeight(prio[c], gevuld[c], nietLiquide[c])
    sum += base[c]
  }
  return sum > 0 ? base.map((b) => b / sum) : base
}

/**
 * Schuld-aflossing-gewichten genormaliseerd over de **GECOMBINEERDE** toename-
 * noemer (bezit-toename + schuld-aflossing) — Excel-oracle, tab TS (ADR 0032).
 *
 * De "toename" (extra geld, CF!I) verdeelt zich over ZOWEL het opbouwen van
 * bezittingen (bezit-toename-prio's) ALS het aflossen van schuld (schuld-aflos-
 * prio's). Excel bewaart daarom de schuld-aflos-gewichten als `½^(prio−1)/totaal`
 * waarbij `totaal` de SUMPRODUCT over de **volledige** gecombineerde set is (TS
 * mapping-matrix toename C32:G37 bezit + C40:G44 schulden). Zo somt de schuld-
 * kant tot de fractie van de toename die naar aflossing gaat (bv. 0,3), niet tot 1.
 *
 * Het waterval-mechanisme is scale-invariant in de gewichten (het deelt per pass
 * door Σ actieve gewichten), dus dit verandert de eind-toewijzing NIET — maar de
 * gerapporteerde Σw-kolom (passSumW) matcht nu Excel (bv. 0,3 i.p.v. 1,0).
 *
 * @returns Gewichten per schuld-categorie (zelfde lengte/volgorde als de schuld-
 *          invoer); som = de gecombineerde schuld-fractie (≤ 1), 0 als de noemer 0 is.
 */
export function aflossingWeightsCombined(
  bezitPrioToename: readonly number[],
  bezitGevuld: readonly boolean[],
  bezitNietLiquide: readonly boolean[],
  schuldPrio: readonly (number | null)[],
  schuldGevuld: readonly boolean[],
  schuldNietLiquide: readonly boolean[],
): number[] {
  // Gecombineerde noemer: Σ bezit-toename-basisgewichten + Σ schuld-aflos-basisgewichten.
  let totaal = 0
  for (let i = 0; i < bezitPrioToename.length; i++) {
    totaal += baseWeight(bezitPrioToename[i], bezitGevuld[i], bezitNietLiquide[i])
  }
  const schuldBase = schuldPrio.map((p, i) =>
    baseWeight(p, schuldGevuld[i], schuldNietLiquide[i]),
  )
  for (const b of schuldBase) totaal += b
  return totaal > 0 ? schuldBase.map((b) => b / totaal) : schuldBase.map(() => 0)
}

/**
 * Reserve-lidmaatschap per categorie: prio **exact 5** = reserve (krijgt pas
 * budget als prio 1–4 de capaciteit niet volledig opnam). Prio ≥ 6 of leeg = nooit
 * (het ongedekte restant wordt tekort-lening, buiten deze tabel).
 */
export function reserveMask(prio: readonly (number | null)[]): boolean[] {
  return prio.map((p) => p === 5)
}
