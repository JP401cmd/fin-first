// ── Tijdlijn-run: één verversing van de tijdlijn-bèta voor één lezer ────────
//
// Krant 1C (B31, B32, B37, B38; U11, U12). De keten, per lezer met
// `nieuwsprofiel.krant_variant = 'tijdlijn'`:
//
//   afleidNieuwsprofiel  →  tijdlijnArtikelIds  →  matchEditie(tijdlijn)  →  schrijfEditie('tijdlijn')
//
//   · GEZIEN = wat al in de EIGEN tijdlijn staat — niet `news_read` (dat is de
//     leesstatus van de AI-Krant). Zo komt een artikel hoogstens één keer in
//     iemands tijdlijn; de partiële unieke index lezer + artikel (migratie
//     20261004120000) is het vangnet daaronder.
//   · MOMENTOPNAME (U12): elke verversing leidt het profiel opnieuw af; een
//     bestaand bericht wordt nooit herschreven.
//   · Een verversing zonder nieuwe berichten wordt ÓÓK vastgelegd (leeg): dat
//     geeft "laatst vernieuwd" en de meting "hoe vaak voegt een verversing
//     niets toe" (K1-poort). Hoogstens EDITIE_MAX nieuwe berichten per
//     verversing — ook de eerste, zodat een nieuwe bèta-lezer de beste van de
//     afgelopen week krijgt en geen vloed.
//   · BEWAREN (B32): 120 dagen, gelijk aan ARTICLE_RETENTION_DAYS van de
//     artikelen (ADR 0171); `ruimTijdlijnOp` handhaaft dat — de
//     retentie-cron kent deze tabellen bewust niet (zoals bij de schaduw).
//   · UITZETTEN (besluit eigenaar 28-09): de bèta uit = de tijdlijn direct
//     gewist (`wisTijdlijn`). Het nieuwsprofiel blijft: de schaduwrun gebruikt
//     het onder gerechtvaardigd belang, tenzij de lezer bezwaar maakte.
//
// Alleen de service-role schrijft (cron en, in fase 2, de vernieuwknop voor
// de EIGEN id). Elke query draagt een eigen `.eq('user_id', …)`.
//
// euro-only (B2, ADR 0172): dit bestand rekent niets.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { amsterdamWeekKey } from '@/lib/briefing/snapshot'
import { standaardImpactContext } from './impact'
import { matchEditie, type EditieUitkomst, type KandidaatArtikel } from './matcher'
import { renderSjabloon } from './sjablonen'
import { afleidNieuwsprofiel } from './profiel-afleiding'
import { laadLezerContext } from './editie-loader'
import { schrijfEditie } from './editie-schrijver'

/** Hoe lang een tijdlijnbericht bewaard blijft (B32) — gelijk aan ARTICLE_RETENTION_DAYS (tijdlijn-run.test.ts bewaakt dat). */
export const TIJDLIJN_BEWAAR_DAGEN = 120

const DAG_MS = 24 * 60 * 60 * 1000

export interface VerversInvoer {
  userId: string
  now: Date
  aowRows: AowLeeftijdRow[]
  kandidaten: readonly KandidaatArtikel[]
  /**
   * Alleen de cron: vlak vóór het schrijven opnieuw toetsen of de lezer
   * intussen de AI-Krant koos of bezwaar maakte (security G1, 29-09). De
   * cron kiest zijn lezers vooraf en loopt tot vier minuten; zonder deze
   * hertoets kwam er ná het wissen alsnog een verversing bij. De knop laat
   * hem uit: een bezwaar geldt voor de achtergrond, niet voor het eigen verzoek.
   */
  hertoetsVoorSchrijven?: boolean
}

export interface VerversUitkomst {
  editieId: string
  profielType: string
  leeg: boolean
  /** Aantal nieuwe berichten in deze verversing. */
  items: number
  /** true: niets geschreven, de lezer koos intussen de AI-Krant of maakte bezwaar. */
  overgeslagen?: boolean
}

/** Portiegrootte voor de "al in de tijdlijn?"-vraag: ruim onder PostgREST max_rows en de URL-lengte. */
export const GEZIEN_PORTIE = 100

/**
 * Welke van deze KANDIDATEN staan al in de tijdlijn van deze lezer (meta-kolom,
 * geen inhoud)? Bewust niet "de hele tijdlijn": die kan boven PostgREST
 * max_rows (1000) uitkomen — 120 dagen × tot 8 per verversing plus de knop —
 * en een stil afgekapte set laat de matcher een bericht opnieuw kiezen, waarna
 * de unieke index de hele verversing weigert. Gevraagd per portie kandidaten,
 * dus elk antwoord is ≤ GEZIEN_PORTIE rijen.
 */
export async function tijdlijnArtikelIds(service: SupabaseClient, userId: string, kandidaatIds: readonly string[]): Promise<Set<string>> {
  const gezien = new Set<string>()
  for (let i = 0; i < kandidaatIds.length; i += GEZIEN_PORTIE) {
    const portie = kandidaatIds.slice(i, i + GEZIEN_PORTIE)
    const { data, error } = await service
      .from('krant_editie_items')
      .select('article_id')
      .eq('user_id', userId)
      .eq('tijdlijn', true)
      .in('article_id', portie)
    if (error) throw new Error(`[krant/tijdlijn-run] tijdlijn lezen mislukt: ${error.message}`)
    for (const r of (data ?? []) as Array<{ article_id: string }>) gezien.add(r.article_id)
  }
  return gezien
}

/** Eén verversing: nieuwe relevante berichten bovenaan, niets eraf (B31). */
export async function ververs(service: SupabaseClient, invoer: VerversInvoer): Promise<VerversUitkomst> {
  const { userId, now } = invoer
  const { profiel } = await afleidNieuwsprofiel(service, userId, { now, aowRows: invoer.aowRows })
  const [gezien, lezer] = await Promise.all([
    tijdlijnArtikelIds(
      service,
      userId,
      invoer.kandidaten.map((k) => k.id),
    ),
    laadLezerContext(service, userId, now),
  ])

  const uitkomst = matchEditie(profiel, invoer.kandidaten, {
    now,
    gezienArtikelIds: gezien,
    gedemptRubrieken: lezer.gedemptRubrieken,
    impact: standaardImpactContext(invoer.aowRows, now.getUTCFullYear()),
    modus: 'tijdlijn',
  })

  const actueel = await alleenNogGeduid(service, uitkomst)
  if (invoer.hertoetsVoorSchrijven && !(await nogTijdlijnlezer(service, userId))) {
    return { editieId: '', profielType: actueel.profielType, leeg: true, items: 0, overgeslagen: true }
  }
  const geschreven = await schrijfEditie(service, { userId, weekKey: amsterdamWeekKey(now), bron: 'tijdlijn', profiel, uitkomst: actueel, now })
  return { editieId: geschreven.id, profielType: actueel.profielType, leeg: actueel.leeg, items: geschreven.items }
}

/**
 * Is deze lezer nog steeds iemand voor de automatische verversing? Nee als hij
 * intussen de AI-Krant koos (krant_variant 'ai') of bezwaar maakte
 * (profiles.krant_schaduw_bezwaar_at). Twee meta-lezingen; een leesfout gooit
 * (de cron telt de lezer dan als fout, er wordt niets geschreven).
 */
export async function nogTijdlijnlezer(service: SupabaseClient, userId: string): Promise<boolean> {
  const [np, pr] = await Promise.all([
    service.from('nieuwsprofiel').select('krant_variant').eq('user_id', userId).maybeSingle(),
    service.from('profiles').select('krant_schaduw_bezwaar_at').eq('id', userId).maybeSingle(),
  ])
  if (np.error) throw new Error(`[krant/tijdlijn-run] variant hertoetsen mislukt: ${np.error.message}`)
  if (pr.error) throw new Error(`[krant/tijdlijn-run] bezwaar hertoetsen mislukt: ${pr.error.message}`)
  return np.data?.krant_variant !== 'ai' && pr.data?.krant_schaduw_bezwaar_at == null
}

/**
 * De kandidaten worden één keer per cronrun geladen; een run duurt tot vier
 * minuten. Trekt beheer in die tijd een duiding terug (B4), dan zou een lezer
 * die later aan de beurt is het artikel alsnog krijgen — en omdat
 * `verwijderUitTijdlijnen` dan al gedraaid heeft, blijft het staan
 * (security Y3 / eindreview M1). Daarom vlak vóór het schrijven: wat niet meer
 * 'geduid' is, valt eruit — berichten, katern en Achtergrond. Hoogstens ~16
 * id's, één query.
 */
export async function alleenNogGeduid(service: SupabaseClient, uitkomst: EditieUitkomst): Promise<EditieUitkomst> {
  const ids = [
    ...uitkomst.items.map((i) => i.artikelId),
    ...uitkomst.algemeen.items.map((i) => i.artikelId),
    ...(uitkomst.algemeen.achtergrond?.items.map((i) => i.artikelId) ?? []),
  ]
  if (ids.length === 0) return uitkomst
  const { data, error } = await service.from('news_articles').select('id').in('id', [...new Set(ids)]).eq('duiding_status', 'geduid')
  if (error) throw new Error(`[krant/tijdlijn-run] hertoets duiding mislukt: ${error.message}`)
  const geduid = new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id))
  if (ids.every((id) => geduid.has(id))) return uitkomst

  const items = uitkomst.items.filter((i) => geduid.has(i.artikelId))
  const leeg = items.length === 0
  const achtergrond = uitkomst.algemeen.achtergrond
  return {
    ...uitkomst,
    items,
    algemeen: {
      ...uitkomst.algemeen,
      items: uitkomst.algemeen.items.filter((i) => geduid.has(i.artikelId)),
      ...(achtergrond ? { achtergrond: { ...achtergrond, items: achtergrond.items.filter((i) => geduid.has(i.artikelId)) } } : {}),
    },
    leeg,
    legeTekst: leeg ? renderSjabloon('editie-leeg', 0) : null,
  }
}

/** Ruimt verversingen ouder dan TIJDLIJN_BEWAAR_DAGEN op (items cascaden mee). Geeft het aantal verversingen terug. */
export async function ruimTijdlijnOp(service: SupabaseClient, userId: string, now: Date): Promise<number> {
  const grens = new Date(now.getTime() - TIJDLIJN_BEWAAR_DAGEN * DAG_MS).toISOString()
  const { count, error } = await service
    .from('krant_edities')
    .delete({ count: 'exact' })
    .eq('user_id', userId)
    .eq('bron', 'tijdlijn')
    .lt('created_at', grens)
  if (error) throw new Error(`[krant/tijdlijn-run] opruimen mislukt: ${error.message}`)
  return count ?? 0
}

/** De bèta uit: de hele tijdlijn van deze lezer weg (items cascaden mee). */
export async function wisTijdlijn(service: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await service.from('krant_edities').delete({ count: 'exact' }).eq('user_id', userId).eq('bron', 'tijdlijn')
  if (error) throw new Error(`[krant/tijdlijn-run] wissen mislukt: ${error.message}`)
  return count ?? 0
}

/**
 * De 120 dagen voor IEDEREEN, niet alleen voor wie deze run ververst wordt:
 * een lezer met bezwaar, een AI-lezer of iemand zonder module nieuws slaat de
 * cron over, maar zijn oude verversingen moeten toch weg (de belofte in
 * /privacy sectie 6 is een bewaartermijn, geen bijwerking van verversen).
 * Alleen meta-filters (bron + created_at); items cascaden mee.
 */
export async function ruimAlleTijdlijnenOp(service: SupabaseClient, now: Date): Promise<number> {
  const grens = new Date(now.getTime() - TIJDLIJN_BEWAAR_DAGEN * DAG_MS).toISOString()
  const { count, error } = await service.from('krant_edities').delete({ count: 'exact' }).eq('bron', 'tijdlijn').lt('created_at', grens)
  if (error) throw new Error(`[krant/tijdlijn-run] opruimen (alle lezers) mislukt: ${error.message}`)
  return count ?? 0
}
