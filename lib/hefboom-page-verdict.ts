// lib/hefboom-page-verdict.ts
//
// Het oordeel van één hefboom als paginatitel-materiaal — status én zin.
//
// Sinds de kop-herziening (sep 2026) dragen de hefboompagina's hun oordeel in de
// titel ("Bezittingen | Goed gespreid"). Dat oordeel moet per constructie gelijk
// zijn aan het statuspunt naast de `i` op diezelfde pagina, en dat punt komt uit
// `resolvePageStatusMap` → `leverInfo(route, scores.<hefboom>)`. Deze helper
// leest daarom exact die bron: `loadLeverScores`, dezelfde `cache()`-gewrapte
// loader, met dezelfde vocabulaire-omzetting (`leverToLeverageStatus`).
//
// Consume, don't recompute: hier wordt geen drempel herhaald en geen score
// afgeleid — alleen opgezocht en van een zin voorzien.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Perspective } from '@/lib/household-data'
import { loadLeverScores } from '@/lib/lever-scores-loader'
import { leverToLeverageStatus } from '@/lib/page-status/resolve'
import { hefboomVerdict, HEFBOOM_VERDICT_NEUTRAL } from '@/lib/hefboom-status-copy'
import type { Hefboom } from '@/lib/hefboom-config'
import type { LeverageStatus } from '@/lib/leverage-status'

/**
 * Hefboom → de sleutel waaronder `loadLeverScores` zijn score publiceert.
 *
 * Bewust expliciet en niet "de naam is de sleutel": de hefbomen heten in de UI
 * Nederlands (`bezittingen`, `schulden`) en in de scores Engels (`assets`,
 * `debts`). Eén tabel, zodat een hernoeming aan één kant een compile-fout geeft
 * in plaats van een stil verkeerd oordeel.
 */
const SCORE_KEY = {
  bezittingen: 'assets',
  schulden: 'debts',
  cashflow: 'cashflow',
  belasting: 'tax',
} as const satisfies Record<Hefboom, 'assets' | 'debts' | 'cashflow' | 'tax'>

export interface HefboomPageVerdict {
  status: LeverageStatus
  label: string
}

/**
 * Status + oordeelszin voor de titel van een hefboompagina.
 *
 * Bij `neutral` valt de zin terug op "Nog geen gegevens" — niet op het
 * app-jargon "Geen score", dat een beginner leest als een storing in plaats van
 * als iets dat hij zelf kan aanvullen.
 */
export async function loadHefboomPageVerdict(
  supabase: SupabaseClient,
  perspective: Perspective,
  hefboom: Hefboom,
): Promise<HefboomPageVerdict> {
  const { scores } = await loadLeverScores(supabase, perspective)
  const status = leverToLeverageStatus(scores[SCORE_KEY[hefboom]].status)
  return { status, label: hefboomVerdict(hefboom, status) ?? HEFBOOM_VERDICT_NEUTRAL }
}
