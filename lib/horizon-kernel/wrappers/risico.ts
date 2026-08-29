/**
 * Horizon-kernel · wrappers — **markt-risicofactor per pot** (ADR 0117, snede 1).
 *
 * Eén plek die de vraag beantwoordt "hoe hard volgt deze pot de markt?", gedeeld
 * door de drie onzekerheids-oppervlakken van de kern:
 *  - `wrappers/band.ts` — de scenarioband (P!B43, ±2 procentpunt);
 *  - `wrappers/mc.ts` — de Monte-Carlo-ruis (MC!B10 gedeeld + MC!<col>12 per pot);
 *  - `rendement-marge.ts` — de rendement-verschuiving Δr van de marktcheck.
 *
 * Vóór ADR 0117 stelden alle drie dezelfde binaire vraag: `pot.investering`
 * (bens!F = 1) → volle shift/σ, anders niets. Dat had twee gevolgen die het plan
 * systematisch te zeker maakten:
 *   1. een 100%-obligatiepot kreeg exact dezelfde band als een 100%-aandelenpot;
 *   2. de `investering`-vlag is in de app-adapter een whitelist van alleen
 *      Beleggingen + Vastgoed, waardoor een **premieregeling-pensioenpot** — in
 *      Nederland vaak de grootste aandelenblootstelling van een huishouden —
 *      deterministisch doorgroeide en in het geheel niet in de band of de MC zat.
 *
 * ## Het contract
 * `AssetPot.risicoFactor` is een OPTIONELE beta. Aanwezig → die factor; afwezig →
 * exact het oude binaire gedrag (`investering ? 1 : 0`). Het oracle-fixture-pad
 * (`input-from-fixture.ts`) vult het veld nooit, de app-adapter altijd — dus de
 * Excel-pariteit (ADR 0032) blijft byte-identiek en het app-pad krijgt de correctie.
 * Zelfde overlay-truc als `tekortAflossingUitLiquide` (V19) en
 * `echteAnnuiteitAflossing` (V22).
 *
 * ## Waarom een factor en geen tweede σ per pot
 * De drie consumenten bakken hun verstoring in `pot.rendement` van de INVOER; de
 * tabellen blijven onaangeraakt. Een schaal op de trekking is exact hetzelfde als
 * een schaal op de standaarddeviatie — `normInv(u, 0, σ)·f === normInv(u, 0, σ·f)`,
 * want `normInv` is `mean + sd·x` — dus de factor levert een per-pot σ zonder de
 * seed-reeks, de correlatiestructuur of `wrappers/noise.ts` aan te raken. De
 * gedeelde marktschok blijft gedeeld: alle potten bewegen dezelfde kant op, alleen
 * verschillend hard. Dat ís de beta-lezing.
 *
 * ## Byte-identiteit (waarom de vermenigvuldiging veilig is)
 * De consumenten schrijven bewust `x + shock * f + ruis * f` en NIET
 * `x + (shock + ruis) * f`: bij `f === 1` is `y * 1 === y` exact, zodat de
 * optelvolgorde — en daarmee de laatste bit — gelijk blijft aan vóór deze wijziging.
 * Optelling is niet associatief in drijvende komma; vermenigvuldiging met 1 wel
 * exact. Bij `f === 0` geven de consumenten de pot ONGEWIJZIGD door (identiteit),
 * i.p.v. `+ 0` op te tellen.
 *
 * Pure module: geen fs/Supabase/Date.now/Math.random.
 */

import type { AssetPot } from '../types'

/**
 * De markt-risicofactor van één pot. Aanwezig en geldig (eindig, ≥ 0) → die waarde;
 * anders de terugval op de binaire `investering`-vlag = het Excel-oracle-gedrag.
 *
 * Een negatieve of niet-eindige factor wordt bewust genegeerd i.p.v. doorgegeven:
 * een NaN zou via `pot.rendement` de hele projectie vergiftigen (elke maandwaarde
 * NaN, gap NaN, solver-bisectie stuurloos), en een negatieve beta zou betekenen dat
 * de pot tegen de markt in beweegt — dat modelleert deze laag niet.
 */
export function potRisicoFactor(pot: AssetPot): number {
  const f = pot.risicoFactor
  if (typeof f === 'number' && Number.isFinite(f) && f >= 0) return f
  return pot.investering ? 1 : 0
}
