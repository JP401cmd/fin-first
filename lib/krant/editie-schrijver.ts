// ── Editie-schrijver: één editie + items naar krant_edities/krant_editie_items ─
//
// Alleen de service-role schrijft hier (weekcron, herberekening); de tabellen
// hebben bewust geen INSERT-policy voor sessies (migratie 20260922120000).
// Twee inserts, geen RPC: faalt de items-insert, dan wordt de net geschreven
// editie weer verwijderd zodat er nooit een "gevulde" editie zonder regels
// staat (compensatie i.p.v. transactie — een lege editie schrijft geen items
// en heeft die compensatie niet nodig).
//
// De cap (SCHADUW_CAP_WEKEN) is de bewaarregel voor schaduwedities: de
// retentie-cron werkt op logtabellen en kent deze tabel bewust niet.
//
// euro-only (B2, ADR 0172): slots en impact dragen alleen banden en euro's,
// zoals de matcher ze levert; dit bestand rekent niets.

import type { SupabaseClient } from '@supabase/supabase-js'
import { PROFIEL_VERSIE, type NieuwsprofielV1 } from './profiel'
import type { EditieItem, EditieUitkomst } from './matcher'

/** Hoeveel weken schaduwedities per gebruiker bewaard blijven. */
export const SCHADUW_CAP_WEKEN = 26

export type EditieBron = 'schaduw' | 'live'

export interface SchrijfEditieInvoer {
  userId: string
  weekKey: string
  bron: EditieBron
  profiel: NieuwsprofielV1
  uitkomst: EditieUitkomst
  now: Date
}

export interface GeschrevenEditie {
  id: string
  items: number
}

/** De rij-vorm van één item, zoals hij in krant_editie_items landt. */
export function itemNaarRij(item: EditieItem, editieId: string, userId: string, positie: number) {
  return {
    editie_id: editieId,
    user_id: userId,
    article_id: item.artikelId,
    positie,
    vorm: item.vorm,
    score: item.score,
    mechanisme: item.mechanisme,
    sjabloon_id: item.sjabloonId,
    variant: item.variant,
    slots: item.slots,
    tekst: item.tekst,
    impact: item.impact,
    deadline: item.deadline,
    wat_mist: item.watMist,
    waarom: item.waarom,
    snapshot: {
      titel: item.titel,
      rubriek: item.rubriek,
      bron: item.bron,
      url: item.url,
      gepubliceerd: item.gepubliceerd,
      samenvatting: item.samenvatting,
    },
  }
}

export async function schrijfEditie(service: SupabaseClient, invoer: SchrijfEditieInvoer): Promise<GeschrevenEditie> {
  const { userId, weekKey, bron, profiel, uitkomst, now } = invoer
  const { data, error } = await service
    .from('krant_edities')
    .insert({
      user_id: userId,
      week_key: weekKey,
      bron,
      met_ai: false,
      matcher_versie: uitkomst.matcherVersie,
      sjabloon_versie: uitkomst.sjabloonVersie,
      profiel_versie: PROFIEL_VERSIE,
      profiel_type: uitkomst.profielType,
      profiel_snapshot: profiel,
      leeg: uitkomst.leeg,
      lege_tekst: uitkomst.legeTekst,
      item_count: uitkomst.items.length,
      algemeen: uitkomst.algemeen,
      created_at: now.toISOString(),
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`[krant/editie-schrijver] editie schrijven mislukt voor ${userId}: ${error?.message ?? 'geen id'}`)
  const editieId = data.id as string

  if (uitkomst.items.length === 0) return { id: editieId, items: 0 }

  const rijen = uitkomst.items.map((item, i) => itemNaarRij(item, editieId, userId, i))
  const { error: itemsFout } = await service.from('krant_editie_items').insert(rijen)
  if (itemsFout) {
    // Compensatie: geen editie zonder haar regels. Faalt ook die, dan staat er
    // een editie met item_count > 0 en nul regels — luid loggen, want de run
    // telt de gebruiker als fout en niets anders ziet 'm.
    const { error: compensatieFout } = await service.from('krant_edities').delete().eq('id', editieId).eq('user_id', userId)
    if (compensatieFout) {
      console.error(`[krant/editie-schrijver] compensatie mislukt: editie ${editieId} staat zonder regels`, compensatieFout.message)
    }
    throw new Error(`[krant/editie-schrijver] items schrijven mislukt voor ${userId}: ${itemsFout.message}`)
  }
  return { id: editieId, items: rijen.length }
}

/** B4: de oude editie wijst naar haar opvolger; de rij zelf blijft staan. */
export async function markeerVervangen(service: SupabaseClient, oudeEditieId: string, userId: string, nieuweEditieId: string): Promise<void> {
  const { error } = await service
    .from('krant_edities')
    .update({ vervangen_door: nieuweEditieId })
    .eq('id', oudeEditieId)
    .eq('user_id', userId)
  if (error) throw new Error(`[krant/editie-schrijver] vervangen markeren mislukt: ${error.message}`)
}

/** De geldende (niet-vervangen) editie van een gebruiker voor een week en bron, of null. */
export async function geldendeEditieId(service: SupabaseClient, userId: string, weekKey: string, bron: EditieBron): Promise<string | null> {
  const { data, error } = await service
    .from('krant_edities')
    .select('id')
    .eq('user_id', userId)
    .eq('bron', bron)
    .eq('week_key', weekKey)
    .is('vervangen_door', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`[krant/editie-schrijver] geldende editie lezen mislukt: ${error.message}`)
  return (data?.id as string | undefined) ?? null
}

/** Ruimt schaduwedities van deze gebruiker ouder dan de cap op (items cascaden mee). Geeft het aantal terug. */
export async function ruimSchaduwOp(service: SupabaseClient, userId: string, now: Date): Promise<number> {
  const grens = new Date(now.getTime() - SCHADUW_CAP_WEKEN * 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await service
    .from('krant_edities')
    .delete({ count: 'exact' })
    .eq('user_id', userId)
    .eq('bron', 'schaduw')
    .lt('created_at', grens)
  if (error) throw new Error(`[krant/editie-schrijver] opruimen mislukt: ${error.message}`)
  return count ?? 0
}
