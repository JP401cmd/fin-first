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
//
// DE TIJDLIJN (Krant 1C, B31) wordt NIET herberekend: een tijdlijn is een
// momentopname. Het teruggetrokken bericht verdwijnt uit élke tijdlijn (ook
// oudere weken), de rest blijft staan, en de verversing waarin het stond
// krijgt een kloppende `item_count`/`leeg` (opnieuw geteld, niet afgetrokken).
// De berichtregel met de foute tekst verdwijnt daarmee; een kopie van de
// samenvatting kan nog in `algemeen` (katern/Achtergrond) van oudere
// verversingen staan — de leesloader van fase 2 filtert die blokken daarom op
// de ACTUELE duiding_status (eindreview M2), en een nieuwe verversing neemt een
// teruggetrokken artikel niet meer op (alleenNogGeduid, tijdlijn-run.ts). Wordt het artikel later opnieuw geduid, dan mag het
// bij een volgende verversing als nieuw bericht terugkomen: de rij voor de
// unieke index lezer + artikel is weg.

import type { SupabaseClient } from '@supabase/supabase-js'
import { amsterdamWeekKey } from '@/lib/briefing/snapshot'
import { getAowLeeftijden } from '@/lib/reference-cache'
import { laadKandidaten } from './editie-loader'
import { runEditieVoor } from './editie-run'
import { markeerVervangen, type EditieBron } from './editie-schrijver'

export interface HerberekeningResultaat {
  /** Aantal edities dat opnieuw is berekend. */
  edities: number
  /** Aantal tijdlijnberichten dat is verwijderd (over alle lezers). */
  tijdlijnBerichten: number
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
    // De tijdlijn wordt niet herberekend (verwijderUitTijdlijnen).
    .neq('bron', 'tijdlijn')
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
  const tijdlijnBerichten = await verwijderUitTijdlijnen(service, articleId)
  const geraakt = await vindGeraakteEdities(service, articleId, weekKey)
  if (geraakt.length === 0) return { edities: 0, tijdlijnBerichten }

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
  return { edities, tijdlijnBerichten }
}

/**
 * B4 in de tijdlijn: verwijder het bericht uit elke tijdlijn en zet de teller
 * van de geraakte verversingen gelijk (CHECK leeg_consistent: 0 items ⇔ leeg).
 * Loopt over meta-kolommen (artikel-id → item-id/editie-id); leest geen
 * inhoud (ADR 0146). Geeft het aantal verwijderde berichten terug.
 */
export async function verwijderUitTijdlijnen(service: SupabaseClient, articleId: string): Promise<number> {
  const { data, error } = await service.from('krant_editie_items').select('id, editie_id').eq('article_id', articleId).eq('tijdlijn', true)
  if (error) throw new Error(`[krant/herberekening] tijdlijnitems lezen mislukt: ${error.message}`)
  const rijen = (data ?? []) as Array<{ id: string; editie_id: string }>
  if (rijen.length === 0) return 0

  const { error: delFout } = await service.from('krant_editie_items').delete().in('id', rijen.map((r) => r.id))
  if (delFout) throw new Error(`[krant/herberekening] tijdlijnitems verwijderen mislukt: ${delFout.message}`)

  // Herleiden, niet aftrekken (eindreview M4): tel per geraakte verversing de
  // items die er nog staan. Twee gelijktijdige terugtrekkingen op dezelfde
  // verversing kunnen zo geen scheve teller achterlaten.
  const editieIds = [...new Set(rijen.map((r) => r.editie_id))]
  const { data: rest, error: restFout } = await service.from('krant_editie_items').select('editie_id').in('editie_id', editieIds)
  if (restFout) throw new Error(`[krant/herberekening] resterende items lezen mislukt: ${restFout.message}`)
  const telling = new Map<string, number>()
  for (const r of (rest ?? []) as Array<{ editie_id: string }>) telling.set(r.editie_id, (telling.get(r.editie_id) ?? 0) + 1)
  for (const id of editieIds) {
    const n = telling.get(id) ?? 0
    const { error: upFout } = await service.from('krant_edities').update({ item_count: n, leeg: n === 0 }).eq('id', id)
    if (upFout) throw new Error(`[krant/herberekening] teller bijwerken mislukt: ${upFout.message}`)
  }
  return rijen.length
}
