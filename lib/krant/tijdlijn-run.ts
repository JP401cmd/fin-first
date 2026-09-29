// ── Tijdlijn-run: één verversing van de tijdlijn-bèta voor één lezer ────────
//
// Krant 1C (B31, B32, B37, B38; U11, U12). De keten, per lezer wiens /nieuws
// de tijdlijn is (bepaalKrantBron → 'tijdlijn' of, sinds 1E, 'ai'):
//
//   afleidNieuwsprofiel  →  tijdlijnArtikelIds  →  matchEditie(tijdlijn)  →  [AI-stap]  →  schrijfEditie('tijdlijn')
//
//   · [AI-STAP] (Krant 1E, ADR 0190): alleen als de route een `aiStap`
//     meegeeft (bron 'ai'). Hij krijgt de matcherberichten + de kandidaten die
//     de matcher níet koos, en geeft altijd berichten terug — met of zonder
//     AI-tekst. Een fout in de stap maakt nooit een lege verversing.
//
//   · GEZIEN = wat al in de EIGEN tijdlijn staat — niet `news_read` (dat is de
//     leesstatus van de oude Krant, bron 'oud'). Zo komt een artikel hoogstens één keer in
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
//   · UITZETTEN: sinds Krant 1E wist geen enkele keuze van de lezer de tijdlijn
//     (K1); de helper `wisTijdlijn` had daarna geen aanroeper meer en is weg
//     (eindreview G8). Het nieuwsprofiel blijft: de schaduwrun gebruikt het
//     onder gerechtvaardigd belang, tenzij de lezer bezwaar maakte.
//
// Alleen de service-role schrijft (cron en, in fase 2, de vernieuwknop voor
// de EIGEN id). Elke query draagt een eigen `.eq('user_id', …)`.
//
// euro-only (B2, ADR 0172): dit bestand rekent niets.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { amsterdamWeekKey } from '@/lib/briefing/snapshot'
import { standaardImpactContext } from './impact'
import { matchEditie, type EditieUitkomst, type KandidaatArtikel, type MatchContext } from './matcher'
import { renderSjabloon } from './sjablonen'
import { afleidNieuwsprofiel } from './profiel-afleiding'
import { laadLezerContext } from './editie-loader'
import { schrijfEditie, type SchrijfItem } from './editie-schrijver'
import { kiesAiKandidaten, legeTellers, type AiLaagTellers, type AiUitkomst } from './ai-laag'
// Alleen het TYPE: de stap zelf (met getModel) geeft de route mee — zo blijft
// deze module modelvrij en ziet de statische privacy-scan de gate in de route.
import type { AiStap, AiStapReden, AiStapUitkomst } from './tijdlijn-ai'

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
  /**
   * De AI-laag (Krant 1E, ADR 0190) — alleen voor een lezer met bron 'ai'. De
   * route maakt hem (`maakAiStap`) ná de privacy-poort. Afwezig of null =
   * geen AI-laag: de verversing is exact die van vóór 1E.
   */
  aiStap?: AiStap | null
}

export interface VerversUitkomst {
  editieId: string
  profielType: string
  leeg: boolean
  /** Aantal nieuwe berichten in deze verversing. */
  items: number
  /** true: niets geschreven, de lezer maakte intussen bezwaar. */
  overgeslagen?: boolean
  /** Wat de AI-laag deed; afwezig als er geen laag was. Alleen tellingen. */
  ai?: { uitkomst: AiUitkomst; reden: AiStapReden | null; tellers: AiLaagTellers }
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

  const ctx: MatchContext = {
    now,
    gezienArtikelIds: gezien,
    gedemptRubrieken: lezer.gedemptRubrieken,
    impact: standaardImpactContext(invoer.aowRows, now.getUTCFullYear()),
    modus: 'tijdlijn',
  }
  const uitkomst = matchEditie(profiel, invoer.kandidaten, ctx)

  const actueel = await alleenNogGeduid(service, uitkomst)
  let aiGekozen = true
  if (invoer.hertoetsVoorSchrijven) {
    const nu = await hertoetsLezer(service, userId)
    if (!nu.lezer) return { editieId: '', profielType: actueel.profielType, leeg: true, items: 0, overgeslagen: true }
    // Koos de lezer intussen weer "zonder AI", dan ook geen AI-laag meer.
    aiGekozen = nu.aiGekozen
  }

  // ── De AI-laag (Krant 1E): tussen de matcher en het schrijven ──────────────
  let items: readonly SchrijfItem[] = actueel.items
  let ai: VerversUitkomst['ai']
  let naSchrijven: AiStapUitkomst['naSchrijven'] = null
  if (invoer.aiStap && aiGekozen) {
    const stap = await draaiAiStap(service, invoer.aiStap, {
      userId,
      now,
      profiel,
      actueel,
      kandidaten: invoer.kandidaten,
      ctx,
    })
    items = stap.items
    ai = { uitkomst: stap.uitkomst, reden: stap.reden, tellers: stap.tellers }
    naSchrijven = stap.naSchrijven
  }

  // Y6: een toegevoegd artikel dat intussen (knop/cron-race) al in de tijdlijn
  // staat, laat anders de partiële unieke index de HELE verversing weigeren.
  // Vlak vóór het schrijven eruit; de matcherberichten blijven zoals ze waren.
  const toegevoegdIds = items.filter((i) => i.aiToegevoegd).map((i) => i.artikelId)
  if (toegevoegdIds.length > 0) {
    const alInTijdlijn = await tijdlijnArtikelIds(service, userId, toegevoegdIds)
    if (alInTijdlijn.size > 0) {
      items = items.filter((i) => !(i.aiToegevoegd && alInTijdlijn.has(i.artikelId)))
      if (ai) ai = { ...ai, tellers: { ...ai.tellers, toevoegingen: Math.max(0, ai.tellers.toevoegingen - alInTijdlijn.size) } }
    }
  }

  // Het model voegt nooit iets weg: `items` is de matcherset (+ hoogstens drie
  // toevoegingen). Leeg alleen als de matcher leeg was én er niets bijkwam.
  const leeg = items.length === 0
  const teSchrijven = {
    ...actueel,
    items,
    leeg,
    legeTekst: leeg ? (actueel.legeTekst ?? renderSjabloon('editie-leeg', 0)) : null,
  }
  let geschreven: Awaited<ReturnType<typeof schrijfEditie>>
  try {
    geschreven = await schrijfEditie(service, {
      userId,
      weekKey: amsterdamWeekKey(now),
      bron: 'tijdlijn',
      profiel,
      uitkomst: teSchrijven,
      now,
      ...(ai ? { ai: { uitkomst: ai.uitkomst } } : {}),
    })
  } finally {
    // De credit-metering van een BETAALDE call — ook als het schrijven faalt
    // (eindreview Y6). Het quotum telt die call via ai_token_usage.
    if (naSchrijven) await naSchrijven().catch(() => {})
  }
  return { editieId: geschreven.id, profielType: actueel.profielType, leeg, items: geschreven.items, ...(ai ? { ai } : {}) }
}

/**
 * De AI-stap, met de kandidaten die de matcher níet koos en een vangnet: de
 * stap belooft niet te gooien, maar doet hij het toch, dan wordt het deze keer
 * een verversing zonder AI — nooit een lege of mislukte verversing (K4/K5).
 */
async function draaiAiStap(
  service: SupabaseClient,
  stap: AiStap,
  args: { userId: string; now: Date; profiel: Awaited<ReturnType<typeof afleidNieuwsprofiel>>['profiel']; actueel: EditieUitkomst; kandidaten: readonly KandidaatArtikel[]; ctx: MatchContext },
): Promise<AiStapUitkomst> {
  const { actueel } = args
  try {
    // De kandidaten komen uit dezelfde (mogelijk minuten oude) lading als de
    // matcher: vlak vóór de call opnieuw toetsen of ze nog 'geduid' zijn (Y3).
    const voorlopig = kiesAiKandidaten(args.kandidaten, actueel, args.ctx)
    const nogGeduidIds = await nogGeduid(service, voorlopig.map((k) => k.id))
    const kandidaten = voorlopig.filter((k) => nogGeduidIds.has(k.id))
    const duidingen = new Map(args.kandidaten.map((k) => [k.id, k.duiding]))
    return await stap(service, {
      userId: args.userId,
      now: args.now,
      profiel: args.profiel,
      items: actueel.items,
      kandidaten,
      duidingVan: (id) => duidingen.get(id) ?? null,
    })
  } catch (err) {
    console.error('[krant/tijdlijn-run] AI-stap gooide, deze keer zonder AI:', err instanceof Error ? err.message : err)
    const tellers = legeTellers()
    tellers.terugvalLaag = 1
    tellers.terugvalBericht = actueel.items.length
    return { items: [...actueel.items], uitkomst: 'geweigerd', reden: 'fout', tellers, naSchrijven: null }
  }
}

/**
 * Is er sinds de vorige verversing van deze lezer iets nieuws geduid? Dezelfde
 * toets als de vernieuwknop (tijdlijn-vernieuwen.ts). Zonder vorige verversing:
 * ja. De dagcron geeft de AI-stap alleen mee als dit waar is (eindreview Y4):
 * anders verbruikt hij het quotum op ongewijzigde invoer.
 */
export async function ietsNieuwsSindsVorige(service: SupabaseClient, userId: string): Promise<boolean> {
  const { data: laatste, error } = await service
    .from('krant_edities')
    .select('created_at')
    .eq('user_id', userId)
    .eq('bron', 'tijdlijn')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`[krant/tijdlijn-run] laatste verversing lezen mislukt: ${error.message}`)
  const vorige = (laatste?.created_at as string | undefined) ?? null
  if (!vorige) return true
  const { count, error: telFout } = await service
    .from('news_articles')
    .select('id', { count: 'exact', head: true })
    .eq('duiding_status', 'geduid')
    .gt('geduid_at', vorige)
  if (telFout) throw new Error(`[krant/tijdlijn-run] nieuw-geduid tellen mislukt: ${telFout.message}`)
  return (count ?? 0) > 0
}

/** De id's uit deze set die NU 'geduid' zijn (service-role, één query). Leeg in → leeg uit. */
export async function nogGeduid(service: SupabaseClient, ids: readonly string[]): Promise<Set<string>> {
  const uniek = [...new Set(ids)]
  if (uniek.length === 0) return new Set()
  const { data, error } = await service.from('news_articles').select('id').in('id', uniek).eq('duiding_status', 'geduid')
  if (error) throw new Error(`[krant/tijdlijn-run] hertoets duiding mislukt: ${error.message}`)
  return new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id))
}

/**
 * Hertoets vlak vóór het schrijven (security G1, 29-09): is deze lezer nog iemand
 * voor de automatische verversing, en koos hij (nog) de Krant met AI? Sinds 1E
 * wist de AI-keuze niets meer en blijft een AI-lezer een tijdlijnlezer; alleen
 * een bezwaar (profiles.krant_schaduw_bezwaar_at) haalt hem uit de run. Twee
 * meta-lezingen; een leesfout gooit (de cron telt de lezer dan als fout, er
 * wordt niets geschreven).
 */
export async function hertoetsLezer(service: SupabaseClient, userId: string): Promise<{ lezer: boolean; aiGekozen: boolean }> {
  const [np, pr] = await Promise.all([
    service.from('nieuwsprofiel').select('krant_variant').eq('user_id', userId).maybeSingle(),
    service.from('profiles').select('krant_schaduw_bezwaar_at').eq('id', userId).maybeSingle(),
  ])
  if (np.error) throw new Error(`[krant/tijdlijn-run] variant hertoetsen mislukt: ${np.error.message}`)
  if (pr.error) throw new Error(`[krant/tijdlijn-run] bezwaar hertoetsen mislukt: ${pr.error.message}`)
  return { lezer: pr.data?.krant_schaduw_bezwaar_at == null, aiGekozen: np.data?.krant_variant === 'ai' }
}

/** Is deze lezer nog iemand voor de automatische verversing? (Alleen een bezwaar zegt nee — sinds 1E.) */
export async function nogTijdlijnlezer(service: SupabaseClient, userId: string): Promise<boolean> {
  return (await hertoetsLezer(service, userId)).lezer
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
