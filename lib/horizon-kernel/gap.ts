/**
 * Horizon-kernel — **gedeelde doelblok-/gap-kern** (P!B35–B38).
 *
 * Eén bron voor de Excel-cellen die zowel de solver als de onzekerheids-
 * wrappers nodig hebben:
 *  - **B35 eindleeftijd** = IFS per eindstrategie (deplete→B51, legacy→B52,
 *    perpetual/pensioen→100);
 *  - **B36 doelbedrag**   = legacy: B53·(1+B14)^(B35−B7); perpetual:
 *    Prognose!J@FIRE·(1+B14)^(B35−B16); anders 0;
 *  - **B37 modelwaarde**  = INDEX(legacy ∧ B54="Ja" ? Prognose!I : Prognose!J,
 *    (B35−B7)·12+1) — Excel-INDEX trunceert de rij-index;
 *  - **B38 gap**          = B37 − B36.
 *
 * `solver.ts#computeStatusBlok` (statussen B93/B96/B99) en de wrappers
 * (`wrappers/band.ts` — RunScenarioBand leest B38 per bisectie-iteratie;
 * `wrappers/mc.ts` — MC!B8 is exact dezelfde model≥doel-toets) consumeren
 * deze module, zodat de formule op precies één plek leeft.
 *
 * Pure functies: geen fs/Supabase/Date.now/Math.random.
 */

import type { KernelProjection } from './engine'
import type { EsRow } from './tables/es'
import type { KernelInput } from './types'

/**
 * VBA `CLng`: afronden met round-half-to-even (banker's rounding). Gedeeld door
 * solver én band (identieke horizon-maand-berekening; calc-review: dedupe).
 */
export function clng(x: number): number {
  const floor = Math.floor(x)
  const frac = x - floor
  if (frac === 0.5) return floor % 2 === 0 ? floor : floor + 1
  return Math.round(x)
}

/** Prognose!J (netto-liquide) op maand m; voorbij-horizon ("" in Excel) → null. */
export function prognoseJ(proj: KernelProjection, m: number): number | null {
  const row = proj.prognose[m]
  if (row === undefined || !('nettoLiquide' in row)) return null
  return row.nettoLiquide
}

/** Prognose!I (netto-vermogen) op maand m; voorbij-horizon → null. */
export function prognoseI(proj: KernelProjection, m: number): number | null {
  const row = proj.prognose[m]
  if (row === undefined || !('nettoVermogen' in row)) return null
  return row.nettoVermogen
}

/**
 * P!B35 — eindleeftijd per eindstrategie (IFS): deplete→B51, legacy→B52,
 * perpetual/pensioen→100.
 */
export function eindleeftijdVan(es: EsRow): number {
  return es.interneCode === 'deplete'
    ? es.eindleeftijdOpeten
    : es.interneCode === 'legacy'
      ? es.eindleeftijdNalatenschap
      : 100 // perpetual én pensioen
}

/**
 * De 0-gebaseerde maandindex van de eindleeftijd, zoals `INDEX(Prognose!…,
 * (B35−B7)·12+1)` de rij bepaalt (Excel-INDEX trunceert de rij-index). Voor
 * hele leeftijden is dit gewoon `(eindleeftijd − start)·12`.
 */
export function eindMaandVan(eindleeftijd: number, startLeeftijd: number): number {
  return Math.trunc((eindleeftijd - startLeeftijd) * 12 + 1) - 1
}

/** Het volledige doelblok P!B35–B38 van één doorgerekende stand. */
export interface Doelblok {
  /** P!B35 — eindleeftijd. */
  readonly eindleeftijd: number
  /** P!B36 — doelbedrag (nominaal op de eindleeftijd). */
  readonly doelbedrag: number
  /** P!B37 — modelwaarde (Prognose I of J) op de eindleeftijd. */
  readonly modelwaarde: number
  /** P!B38 — gap = B37 − B36. */
  readonly gap: number
}

/**
 * P!B35–B38 op een doorgerekende stand bij een gegeven FIRE-leeftijd
 * (perpetual-doel hangt aan Prognose!J op de FIRE-maand van déze run).
 */
export function computeDoelblok(
  input: KernelInput,
  es: EsRow,
  proj: KernelProjection,
  fireAge: number,
): Doelblok {
  const code = es.interneCode
  const start = input.startLeeftijd
  const inflatie = input.inflatie
  const eindleeftijd = eindleeftijdVan(es)

  let doelbedrag = 0
  if (code === 'legacy') {
    doelbedrag = es.nalatenschapBedrag * (1 + inflatie) ** (eindleeftijd - start)
  } else if (code === 'perpetual') {
    const fireMonth = Math.round((fireAge - start) * 12)
    const jBijFire = prognoseJ(proj, fireMonth) ?? 0
    doelbedrag = jBijFire * (1 + inflatie) ** (eindleeftijd - fireAge)
  }

  const useI = code === 'legacy' && es.nietLiquideMeetellen === 'Ja'
  const eindMaand = eindMaandVan(eindleeftijd, start)
  const modelwaarde = (useI ? prognoseI(proj, eindMaand) : prognoseJ(proj, eindMaand)) ?? 0

  return { eindleeftijd, doelbedrag, modelwaarde, gap: modelwaarde - doelbedrag }
}

/** P!B38 — alleen de gap (convenience voor de wrappers). */
export function computeGap(
  input: KernelInput,
  es: EsRow,
  proj: KernelProjection,
  fireAge: number,
): number {
  return computeDoelblok(input, es, proj, fireAge).gap
}
