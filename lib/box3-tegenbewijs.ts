/**
 * Box 3 tegenbewijsregeling — pure vergelijking forfaitair vs. werkelijk rendement.
 *
 * Sinds het Kerst-arrest (Hoge Raad, 2024/2025) mag een belastingplichtige
 * tegenbewijs leveren: als het WERKELIJKE rendement op het Box 3-vermogen
 * lager is dan het forfaitaire (fictieve) rendement, wordt geheven over het
 * werkelijke rendement. Deze module rekent beide varianten door en kiest
 * automatisch de gunstigste (laagste heffing).
 *
 * Model voor het werkelijke rendement (conform de tegenbewijsregeling en
 * toekomstvast richting het stelsel-2028, dat eveneens werkelijk rendement
 * inclusief ongerealiseerde waardeontwikkeling belast):
 *   - Grondslag = box3-bezittingen (spaargeld + beleggingen), GEEN heffingsvrij
 *     vermogen.
 *   - werkelijkRendementEur = bezittingen × (pct / 100), inclusief
 *     ongerealiseerde waardeontwikkeling.
 *   - Enige aftrekbare kostenpost = de werkelijke rente op Box 3-schulden.
 *     Geen overige kostenaftrek.
 *   - werkelijkeHeffing = max(0, werkelijkRendementEur − werkelijkeRenteSchuld)
 *     × tarief.
 *
 * No Supabase / React dependency. Geld-formattering hoort hier NIET — geeft
 * getallen terug (de UI formatteert via lib/format.ts). Volgt het pure-engine-
 * patroon van box3-data.ts.
 */

import type { Box3Result, TaxYear, Box3Params } from './box3-data'
import { BOX3_PARAMS } from './box3-data'

// Hou TaxYear / Box3Params in de module-API zonder ongebruikte-import-warnings.
export type { TaxYear, Box3Params }
export { BOX3_PARAMS }

// ── Types ────────────────────────────────────────────────────

export interface TegenbewijsInput {
  /** Volledig forfaitair Box 3-resultaat (bron van bezittingen, schulden, tarief, heffing, dailyExpenses). */
  box3Result: Box3Result
  /** Door de gebruiker ingevoerd werkelijk rendement in procenten, bv. 3.0 = 3%. */
  werkelijkRendementPct: number
  /** Optioneel: werkelijke rente op Box 3-schulden — de enige aftrekbare kostenpost onder de tegenbewijsregeling. */
  werkelijkeRenteSchuld?: number
}

export interface TegenbewijsResult {
  /** Forfaitaire (fictieve) heffing = box3Result.tax. */
  forfaitaireHeffing: number
  /** Het ingevoerde werkelijke rendement in procenten. */
  werkelijkRendementPct: number
  /** Werkelijk rendement in euro: bezittingen × pct (incl. ongerealiseerd). */
  werkelijkRendementEur: number
  /** Heffing op werkelijk rendement: max(0, rendement − rente) × tarief. Geen heffingsvrij vermogen, geen kostenaftrek behalve rente. */
  werkelijkeHeffing: number
  /** Welke variant het gunstigst (laagst) is — de app kiest deze automatisch. */
  gunstigste: 'forfaitair' | 'werkelijk'
  /** Besparing door tegenbewijs: max(0, forfaitair − werkelijk). */
  besparing: number
  /** Besparing uitgedrukt in vrijheidsdagen: besparing / dailyExpenses. */
  freedomDays: number
  /** Het rendement-% waarbij de werkelijke heffing exact gelijk is aan de forfaitaire heffing. */
  omslagRendementPct: number
}

// ── Core ─────────────────────────────────────────────────────

/**
 * Vergelijk de forfaitaire heffing met de heffing op werkelijk rendement
 * (tegenbewijsregeling) en bepaal de gunstigste variant.
 */
export function compareForfaitairVsWerkelijk(input: TegenbewijsInput): TegenbewijsResult {
  const { box3Result, werkelijkRendementPct } = input
  const renteSchuld = input.werkelijkeRenteSchuld ?? 0

  const tarief = box3Result.params.tarief
  const bezittingen = box3Result.totaalSpaargeld + box3Result.totaalBeleggingen

  const forfaitaireHeffing = box3Result.tax

  // Werkelijk rendement in euro (incl. ongerealiseerde waardeontwikkeling).
  const werkelijkRendementEur = bezittingen * (werkelijkRendementPct / 100)

  // Belastbaar werkelijk rendement: rendement minus werkelijke renteschuld,
  // geen verdere kostenaftrek, geen heffingsvrij vermogen.
  const belastbaarWerkelijk = Math.max(0, werkelijkRendementEur - renteSchuld)
  const werkelijkeHeffing = belastbaarWerkelijk * tarief

  const gunstigste: 'forfaitair' | 'werkelijk' =
    werkelijkeHeffing < forfaitaireHeffing ? 'werkelijk' : 'forfaitair'

  const besparing = Math.max(0, forfaitaireHeffing - werkelijkeHeffing)

  const dailyExpenses = box3Result.dailyExpenses
  const freedomDays = dailyExpenses > 0 ? besparing / dailyExpenses : 0

  // Omslagpunt: rendement-% waarbij werkelijke heffing == forfaitaire heffing.
  //   forfaitaireHeffing = max(0, bezittingen·(p/100) − rente) · tarief
  //   → bezittingen·(p/100) = forfaitaireHeffing/tarief + rente
  //   → p = (forfaitaireHeffing/tarief + rente) / bezittingen · 100
  const omslagRendementPct =
    bezittingen > 0 && tarief > 0
      ? ((forfaitaireHeffing / tarief + renteSchuld) / bezittingen) * 100
      : 0

  return {
    forfaitaireHeffing,
    werkelijkRendementPct,
    werkelijkRendementEur,
    werkelijkeHeffing,
    gunstigste,
    besparing,
    freedomDays,
    omslagRendementPct,
  }
}
