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

/** Aantal prioriteiten dat gelijktijdig gewogen meedoet (1–4); prio ≥ 5 = 0. */
const MAX_WEIGHTED_PRIO = 4

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
    const p = prio[c]
    if (
      gevuld[c] &&
      !nietLiquide[c] &&
      typeof p === 'number' &&
      p >= 1 &&
      p <= MAX_WEIGHTED_PRIO
    ) {
      base[c] = Math.pow(0.5, p - 1)
      sum += base[c]
    }
  }
  return sum > 0 ? base.map((b) => b / sum) : base
}

/**
 * Reserve-lidmaatschap per categorie: prio **exact 5** = reserve (krijgt pas
 * budget als prio 1–4 de capaciteit niet volledig opnam). Prio ≥ 6 of leeg = nooit
 * (het ongedekte restant wordt tekort-lening, buiten deze tabel).
 */
export function reserveMask(prio: readonly (number | null)[]): boolean[] {
  return prio.map((p) => p === 5)
}
