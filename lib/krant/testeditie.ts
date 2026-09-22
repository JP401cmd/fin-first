// ── Testsectie: de eigen schaduweditie teruglezen ────────────────────────────
//
// Keuze 12 op kaart 1B: de items van de schaduweditie moeten na te lopen zijn
// ("klopt dit getal?") vóórdat 1C hem aan echte lezers toont. Dat gebeurt op
// /nieuws, voor SUPERADMIN — bewust GEEN uitzondering op ADR 0146. (22 sep:
// oorspronkelijk ook voor testaccounts; `is_demo_user` bleek zelf te zetten
// door elke gebruiker, zie lib/krant/testeditie-toegang.ts.)
//
// DE GRENS, letterlijk: alles hier leest de EIGEN rij van de aanroeper via de
// SESSIE-client, onder de own-row-RLS van migratie 20260922120000
// (`user_id = (select auth.uid())`). Er komt geen service-role aan te pas, en
// er is geen parameter waarmee je een andere gebruiker kiest. Een superadmin
// ziet hier dus zijn eigen editie en nooit die van een ander — precies wat
// ADR 0146 beschermt. De `.eq('user_id', userId)` erbovenop is dubbel op de
// RLS en staat er expres: hij maakt de scoping leesbaar in de bron.
//
// Waarom deze lezing hier staat en niet in de route: de route draagt de
// eligibility-check (`isSuperAdmin`) en valt daarmee onder de bronscan van
// lib/beheer/geen-inhoud.test.ts, die elke inhoudskolom in een beheer-bron
// afkeurt. Dat is de juiste regel voor beheer dat ándermans data leest, en de
// verkeerde toets voor een lezer die zijn eigen editie opvraagt. De scheiding
// is dus niet bedoeld om de gate te ontlopen: de bescherming is hier sterker
// (RLS) dan wat de gate kan zien. lib/krant/testeditie.gate.test.ts bewaakt
// dat het zo blijft — geen service-client, geen user-id uit het verzoek.
//
// euro-only (B2, ADR 0172): dit bestand rekent niets; het geeft terug wat de
// matcher in de rij heeft gezet.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EditieBron } from './editie-schrijver'

/** Kolommen van `krant_edities` die de testsectie toont — de eigen rij. */
export const TESTEDITIE_KOLOMMEN =
  'id, week_key, bron, met_ai, matcher_versie, sjabloon_versie, profiel_versie, profiel_type, profiel_snapshot, leeg, lege_tekst, item_count, algemeen, created_at'

/** Kolommen van `krant_editie_items` — alles wat één regel herleidbaar maakt. */
export const TESTEDITIE_ITEM_KOLOMMEN =
  'positie, vorm, score, mechanisme, sjabloon_id, variant, slots, tekst, impact, deadline, wat_mist, waarom, snapshot, article_id'

export interface TesteditieItem {
  positie: number
  vorm: string
  score: number
  mechanisme: string | null
  sjabloonId: string
  variant: number
  slots: unknown
  tekst: string
  /** Het ruwe bereik {lo, hi, …} waarop de regel is gebaseerd; null bij 'relevant'. */
  impact: unknown
  deadline: unknown
  watMist: string[]
  waarom: string[]
  titel: string | null
  rubriek: string | null
  bronnaam: string | null
  url: string | null
  gepubliceerd: string | null
  /** De door 1A gecontroleerde samenvatting; null als de matcher hem liet vallen. */
  samenvatting: string | null
  /** null zodra het bronartikel is opgeruimd (on delete set null). */
  artikelId: string | null
}

export interface Testeditie {
  id: string
  weekKey: string
  bron: EditieBron
  metAi: boolean
  matcherVersie: number
  sjabloonVersie: number
  profielVersie: number
  profielType: string
  profielSnapshot: unknown
  leeg: boolean
  legeTekst: string | null
  itemCount: number
  algemeen: unknown
  createdAt: string | null
  items: TesteditieItem[]
}

function tekstLijst(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function tekstOfNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

function itemUitRij(rij: Record<string, unknown>): TesteditieItem {
  const snapshot = (rij.snapshot ?? {}) as Record<string, unknown>
  return {
    positie: typeof rij.positie === 'number' ? rij.positie : 0,
    vorm: typeof rij.vorm === 'string' ? rij.vorm : '',
    score: typeof rij.score === 'number' ? rij.score : 0,
    mechanisme: tekstOfNull(rij.mechanisme),
    sjabloonId: typeof rij.sjabloon_id === 'string' ? rij.sjabloon_id : '',
    variant: typeof rij.variant === 'number' ? rij.variant : 0,
    slots: rij.slots ?? null,
    tekst: typeof rij.tekst === 'string' ? rij.tekst : '',
    impact: rij.impact ?? null,
    deadline: rij.deadline ?? null,
    watMist: tekstLijst(rij.wat_mist),
    waarom: tekstLijst(rij.waarom),
    titel: tekstOfNull(snapshot.titel),
    rubriek: tekstOfNull(snapshot.rubriek),
    bronnaam: tekstOfNull(snapshot.bron),
    url: tekstOfNull(snapshot.url),
    gepubliceerd: tekstOfNull(snapshot.gepubliceerd),
    samenvatting: tekstOfNull(snapshot.samenvatting),
    artikelId: tekstOfNull(rij.article_id),
  }
}

/**
 * De geldende (niet-vervangen) schaduweditie van de aanroeper zelf, met haar
 * regels op positie. `null` als de weekcron nog nooit een editie voor deze
 * gebruiker schreef.
 *
 * `supabase` is de SESSIE-client van de ingelogde gebruiker; `userId` is diens
 * eigen id uit `auth.getUser()` — nooit een id uit het verzoek.
 */
export async function laadTesteditie(supabase: SupabaseClient, userId: string): Promise<Testeditie | null> {
  const { data, error } = await supabase
    .from('krant_edities')
    .select(TESTEDITIE_KOLOMMEN)
    .eq('user_id', userId)
    .eq('bron', 'schaduw')
    .is('vervangen_door', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`[krant/testeditie] editie lezen mislukt: ${error.message}`)
  if (!data) return null

  const rij = data as unknown as Record<string, unknown>
  const editieId = String(rij.id)

  const { data: itemRijen, error: itemsFout } = await supabase
    .from('krant_editie_items')
    .select(TESTEDITIE_ITEM_KOLOMMEN)
    .eq('user_id', userId)
    .eq('editie_id', editieId)
    .order('positie', { ascending: true })
  if (itemsFout) throw new Error(`[krant/testeditie] regels lezen mislukt: ${itemsFout.message}`)

  return {
    id: editieId,
    weekKey: typeof rij.week_key === 'string' ? rij.week_key : '',
    bron: rij.bron === 'live' ? 'live' : 'schaduw',
    metAi: rij.met_ai === true,
    matcherVersie: typeof rij.matcher_versie === 'number' ? rij.matcher_versie : 0,
    sjabloonVersie: typeof rij.sjabloon_versie === 'number' ? rij.sjabloon_versie : 0,
    profielVersie: typeof rij.profiel_versie === 'number' ? rij.profiel_versie : 0,
    profielType: typeof rij.profiel_type === 'string' ? rij.profiel_type : '',
    profielSnapshot: rij.profiel_snapshot ?? null,
    leeg: rij.leeg === true,
    legeTekst: tekstOfNull(rij.lege_tekst),
    itemCount: typeof rij.item_count === 'number' ? rij.item_count : 0,
    algemeen: rij.algemeen ?? null,
    createdAt: tekstOfNull(rij.created_at),
    items: ((itemRijen ?? []) as unknown as Record<string, unknown>[]).map(itemUitRij),
  }
}
