/**
 * Horizon-kernel — **de jaar-blokrand**: één bron voor de maand-indexen waarop de
 * maandelijkse kernel-uitvoer (0–1199) tot JAAR-standen wordt bemonsterd, plus de
 * netto-vermogensreeks die daaruit volgt.
 *
 * ## Waarom een eigen module
 * De bridge (`bridge.ts#buildRow`) bemonstert Prognose!I op de blok-randen om de
 * `UnifiedProjectionRow`s te vullen die de Toekomst-grafiek als HOOFDLIJN tekent.
 * De Monte-Carlo-marktcheck (`wrappers/mc.ts`) moet per verstoorde run op EXACT
 * dezelfde randen bemonsteren, anders liggen band en hoofdlijn op een andere
 * leeftijdsas en vergelijkt de gebruiker appels met peren. Die bemonsteringsregel
 * heeft daarom één huis — hier — en wordt door beide geconsumeerd, nooit
 * gekopieerd.
 *
 * ## De as
 * Jaar-blok `k` beslaat de kernel-maanden [12k .. min(12k+11, lastInHorizonMonth)];
 * de blok-stand is Prognose!I op de laatste in-horizon-maand van dat blok. De
 * grafiek tekent `rows[0].startPortfolio` op `startAge` en `rows[k].endPortfolio`
 * op `startAge + k + 1`. `nettoVermogenPerLeeftijd` levert precies die reeks:
 * index 0 = de beginstand op `startAge`, index i ≥ 1 = de eindstand van blok i−1.
 *
 * Pure module: geen fs/Supabase/Date.now/Math.random.
 */

import type { KernelProjection } from './engine'
import type { KernelInput } from './types'

/**
 * Laatste in-horizon maand van jaar-blok `k` — de `monthEnd` die `bridge.ts#buildRow`
 * gebruikt voor alle blok-standen (Prognose!I/J/D/E, Bez-slotwaarden).
 */
export function jaarBlokEindMaand(k: number, lastInHorizonMonth: number): number {
  return Math.min(12 * k + 11, lastInHorizonMonth)
}

/** Index van het laatste jaar-blok dat nog binnen de horizon begint. */
export function laatsteJaarBlok(lastInHorizonMonth: number): number {
  return Math.floor(lastInHorizonMonth / 12)
}

/**
 * Netto vermogen op t = 0 (de beginstand die `buildRow` voor k = 0 als
 * `startNetWorth` neemt): som van de pot-startwaarden minus de schuld-startwaarden.
 * Bewust NIET Prognose!I(−1) — die maand bestaat niet.
 */
export function startNettoVermogen(input: KernelInput): number {
  return (
    input.assetPotten.reduce((s, p) => s + p.startwaarde, 0) -
    input.schuldPotten.reduce((s, p) => s + p.startwaarde, 0)
  )
}

/**
 * De netto-vermogensreeks (Prognose!I, nominaal) op de leeftijdsas van de
 * grafiek-hoofdlijn: index `i` hoort bij leeftijd `round(startLeeftijd) + i`.
 * Index 0 is de beginstand; index i ≥ 1 de eindstand van jaar-blok i−1.
 * Voorbij-horizon/ontbrekende maanden leveren 0 — dezelfde guard als
 * `bridge.ts#prognoseNetWorth`.
 */
export function nettoVermogenPerLeeftijd(
  input: KernelInput,
  proj: KernelProjection,
): number[] {
  const lastInHorizonMonth = proj.summary.lastInHorizonMonth
  const kLast = laatsteJaarBlok(lastInHorizonMonth)
  const reeks: number[] = [startNettoVermogen(input)]
  for (let k = 0; k <= kLast; k++) {
    const row = proj.prognose[jaarBlokEindMaand(k, lastInHorizonMonth)]
    reeks.push(row === undefined || row.beyondHorizon ? 0 : row.nettoVermogen)
  }
  return reeks
}

// ── De J-spiegel (netto LIQUIDE vermogen, Prognose!J) ────────────────────────

/**
 * De categorie-labels die TS als niet-liquide vlagt (TS!H) — één afleiding, uit
 * exact dezelfde vlag die `tables/prognose.ts#computePrognose` voor de L/M-kolommen
 * gebruikt. NOOIT een tweede afleiding uit de woning-selector of een eigen som
 * "totaal − overwaarde".
 *
 * Vergelijking op LABEL, want de twee unies overlappen alleen op de gedeelde
 * waarden: `DebtPot.categorie` kent 'Tekort', `TsSchuldCategorieLabel` kent
 * 'Tekort-lening'. Een pot zonder TS-tegenhanger telt daardoor nooit mee als
 * niet-liquide — identiek aan `engine.ts#schuldCatTotalsPerTs`, waar de
 * tekort-lening structureel géén categorie-kolom heeft en dus 0 blijft in M.
 */
function nietLiquideCategorien(
  cats: readonly { readonly categorie: string; readonly nietLiquide: boolean }[],
): ReadonlySet<string> {
  const set = new Set<string>()
  for (const c of cats) if (c.nietLiquide) set.add(c.categorie)
  return set
}

/**
 * Netto LIQUIDE vermogen op t = 0 — de J-spiegel van `startNettoVermogen`, dus de
 * beginstand die `buildRow` voor k = 0 als `startNettoLiquide` neemt: som van de
 * pot-startwaarden waarvan de categorie NIET als niet-liquide gevlagd staat, minus
 * idem voor de schuldpotten. Bewust NIET Prognose!J(−1) — die maand bestaat niet.
 *
 * Herleid uit `input.ts.bezitCategorien[].nietLiquide` / `input.ts.schuldCategorien[]
 * .nietLiquide` (TS!H) — dezelfde vlag als L/M in Prognose. Daarmee geldt per
 * constructie: is géén enkele categorie niet-liquide (woonstrategie `include_full`),
 * dan is dit EXACT `startNettoVermogen(input)` — net zoals J ≡ I op elke maandrij.
 *
 * GRONDSLAG-WAARSCHUWING: dit is de I−(L−M)-grootheid, niet I. Meng 'm nooit met
 * `startNettoVermogen` op één Y-as of marker (CLAUDE.md-conventie).
 */
export function startNettoLiquide(input: KernelInput): number {
  const bezitNietLiquide = nietLiquideCategorien(input.ts.bezitCategorien)
  const schuldNietLiquide = nietLiquideCategorien(input.ts.schuldCategorien)
  const bezit = input.assetPotten.reduce(
    (s, p) => (bezitNietLiquide.has(p.categorie) ? s : s + p.startwaarde),
    0,
  )
  const schuld = input.schuldPotten.reduce(
    (s, p) => (schuldNietLiquide.has(p.categorie) ? s : s + p.startwaarde),
    0,
  )
  return bezit - schuld
}

/**
 * De netto-LIQUIDE-reeks (Prognose!J, nominaal) op EXACT dezelfde leeftijdsas als
 * `nettoVermogenPerLeeftijd`: index `i` hoort bij leeftijd `round(startLeeftijd) + i`,
 * index 0 is de beginstand, index i ≥ 1 de eindstand van jaar-blok i−1. Zelfde
 * `jaarBlokEindMaand`/`laatsteJaarBlok`-bemonstering, zelfde
 * ontbrekend/beyondHorizon→0-guard — anders liggen band en hoofdlijn op verschillende
 * leeftijden.
 *
 * GRONDSLAG-WAARSCHUWING: de J-spiegel van `nettoVermogenPerLeeftijd`, niet dezelfde
 * grootheid. Een band op deze reeks hoort bij een hoofdlijn op deze reeks.
 */
export function nettoLiquidePerLeeftijd(
  input: KernelInput,
  proj: KernelProjection,
): number[] {
  const lastInHorizonMonth = proj.summary.lastInHorizonMonth
  const kLast = laatsteJaarBlok(lastInHorizonMonth)
  const reeks: number[] = [startNettoLiquide(input)]
  for (let k = 0; k <= kLast; k++) {
    const row = proj.prognose[jaarBlokEindMaand(k, lastInHorizonMonth)]
    reeks.push(row === undefined || row.beyondHorizon ? 0 : row.nettoLiquide)
  }
  return reeks
}
