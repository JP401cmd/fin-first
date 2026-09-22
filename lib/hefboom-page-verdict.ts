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
//
// Sinds ADR 0174 D6 (F3) draagt de kop van bezittingen, schulden en belasting de
// ZIN ("Je bezittingen zijn *goed gespreid*.", `sentence`). De korte vorm
// ("Naam | Goed gespreid", het oude `label`) had daarna geen lezer meer en is
// weg; de tegels lezen hun woord rechtstreeks uit `hefboomVerdict`.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Perspective } from '@/lib/household-data'
import { loadLeverScores } from '@/lib/lever-scores-loader'
import { leverToLeverageStatus } from '@/lib/page-status/resolve'
import { hefboomOordeelzin, type Oordeelzin } from '@/lib/hefboom-oordeelzin'
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
  /** De kop als zin, bij dezelfde `status` (lib/hefboom-oordeelzin.ts). */
  sentence: Oordeelzin
}

/**
 * Status + kop-zin voor de titel van een hefboompagina.
 *
 * Ook bij `neutral` is er een zin ("Je bezittingen zijn *nog niet in beeld*.")
 * — niet het app-jargon "Geen score", dat een beginner leest als een storing in
 * plaats van als iets dat hij zelf kan aanvullen.
 */
export async function loadHefboomPageVerdict(
  supabase: SupabaseClient,
  perspective: Perspective,
  hefboom: Hefboom,
): Promise<HefboomPageVerdict> {
  const { scores } = await loadLeverScores(supabase, perspective)
  const status = leverToLeverageStatus(scores[SCORE_KEY[hefboom]].status)
  return { status, sentence: hefboomOordeelzin(hefboom, status) }
}
