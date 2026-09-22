// ── Herberekening na terugtrekken (B4) ───────────────────────────────────────
//
// Trekt beheer een duiding terug (1A fase 2: POST /api/admin/news-duiding/
// terugtrekken), dan worden de edities waarin dat artikel stond opnieuw
// berekend — alleen die van de LOPENDE week en alleen de geldende (niet al
// vervangen) editie. Oudere weken blijven staan als momentopname: het
// artikel is dan al gelezen, en het archief liegt niet achteraf.
//
// De route loopt over de meta-kolommen (artikel-id → krant_editie_items →
// editie → user_id; ADR 0171 contract 7) en leest vanuit beheer nooit
// editie-inhoud (ADR 0146): de herberekening draait per gebruiker de volledige
// keten van editie-run.ts opnieuw, met dezelfde kandidaten minus dit artikel,
// schrijft een nieuwe editie en zet `vervangen_door` op de oude.
//
// Robuust voor de volgorde waarin 1A de status wijzigt: `uitsluitArtikelId`
// weert het artikel ook als de rij nog op 'geduid' staat.

import type { SupabaseClient } from '@supabase/supabase-js'
import { amsterdamWeekKey } from '@/lib/briefing/snapshot'
import { getAowLeeftijden } from '@/lib/reference-cache'
import { laadKandidaten } from './editie-loader'
import { runEditieVoor } from './editie-run'
import { markeerVervangen, type EditieBron } from './editie-schrijver'

export interface HerberekeningResultaat {
  /** Aantal edities dat opnieuw is berekend. */
  edities: number
}

interface GeraakteEditie {
  id: string
  user_id: string
  bron: EditieBron
}

/** De geldende edities van de lopende week waarin dit artikel staat (meta-kolommen, geen inhoud). */
export async function vindGeraakteEdities(service: SupabaseClient, articleId: string, weekKey: string): Promise<GeraakteEditie[]> {
  const { data: items, error: itemsFout } = await service.from('krant_editie_items').select('editie_id').eq('article_id', articleId)
  if (itemsFout) throw new Error(`[krant/herberekening] items lezen mislukt: ${itemsFout.message}`)
  const editieIds = [...new Set(((items ?? []) as Array<{ editie_id: string }>).map((i) => i.editie_id))]
  if (editieIds.length === 0) return []

  const { data, error } = await service
    .from('krant_edities')
    .select('id, user_id, bron')
    .in('id', editieIds)
    .eq('week_key', weekKey)
    .is('vervangen_door', null)
  if (error) throw new Error(`[krant/herberekening] edities lezen mislukt: ${error.message}`)
  return (data ?? []) as GeraakteEditie[]
}

export async function herberekenNaTerugtrekking(
  service: SupabaseClient,
  articleId: string,
  opts: { now?: Date } = {},
): Promise<HerberekeningResultaat> {
  const now = opts.now ?? new Date()
  const weekKey = amsterdamWeekKey(now)
  const geraakt = await vindGeraakteEdities(service, articleId, weekKey)
  if (geraakt.length === 0) return { edities: 0 }

  const [{ artikelen }, aowRows] = await Promise.all([laadKandidaten(service, now), getAowLeeftijden(service)])

  let edities = 0
  for (const oud of geraakt) {
    const nieuw = await runEditieVoor(service, {
      userId: oud.user_id,
      weekKey,
      bron: oud.bron,
      now,
      aowRows,
      kandidaten: artikelen,
      uitsluitArtikelId: articleId,
    })
    await markeerVervangen(service, oud.id, oud.user_id, nieuw.editieId)
    edities++
  }
  return { edities }
}
