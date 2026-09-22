// ── Editie-loader: de kandidaten en de lezerscontext voor de matcher ─────────
//
// Eén loader voor de weekcron en de herberekening (B4), later ook native. Hij
// leest twee dingen:
//   laadKandidaten(service, now)         de geduide artikelen in het venster —
//                                        platformbreed, geen gebruikersinput
//   laadLezerContext(client, uid, now)   wat de LEZER al zag (news_read) en
//                                        waarvan hij "minder" zei (news_feedback)
//
// Het leescontract van 1A (ADR 0171) staat in de matcher
// (`voldoetAanLeescontract`); de query hier is alleen een voorselectie zodat
// niet 120 dagen aan artikelen over de lijn gaan. Een rij waarvan de duiding
// het gesloten schema niet haalt telt niet mee (en wordt geteld).
//
// EIGENAARSCHAP: de lezerscontext draait op een service-role-client, dus elke
// query draagt `.eq('user_id', …)` c.q. de uid-gebonden app_settings-sleutel —
// bewaakt door profiel-afleiding.test.ts (bron-scan over dit bestand).
//
// euro-only (B2, ADR 0172): dit bestand rekent niets.

import type { SupabaseClient } from '@supabase/supabase-js'
import { demotedCategories, demotionWindowStartIso } from '@/lib/news-feedback-summary'
import { duidingV1Schema } from './duiding-schema'
import { WEEK_VENSTER_DAGEN, type KandidaatArtikel } from './matcher'

/** De kolommen van `news_articles` die de matcher leest — bewust zonder `summary`, `is_used`, `potential_impact`. */
export const KANDIDAAT_KOLOMMEN = 'id, title, source_url, source_name, category, published_at, fetched_at, duiding_status, duiding'

/** Sleutel van de leesstatus in app_settings (app/api/news/read/route.ts). */
export function newsReadKey(userId: string): string {
  return `news_read:${userId}`
}

/** Prefix waarmee het lokale nieuwspad een item-id op het artikel-id zet (lib/ai/local/local-news-source.ts). */
const LOKAAL_ITEM_PREFIX = 'news-local-'

/** Het PostgREST-`or`-filter van de voorselectie; apart zodat een test 'm kan toetsen. */
export function kandidatenVensterFilter(grensIso: string, vandaag: string): string {
  return `fetched_at.gte."${grensIso}",duiding->deadline->>datum.gte."${vandaag}"`
}

export interface Kandidaten {
  artikelen: KandidaatArtikel[]
  /** Rijen met status geduid waarvan de jsonb het schema niet haalde — hoort 0 te zijn. */
  ongeldig: number
}

/**
 * Geduide artikelen die het venster kunnen halen: opgehaald in de laatste
 * WEEK_VENSTER_DAGEN, óf met een deadline op of na vandaag. De pure toets in
 * de matcher beslist definitief.
 */
export async function laadKandidaten(service: SupabaseClient, now: Date): Promise<Kandidaten> {
  // Beide waarden komen uit `Date` (nooit uit invoer) en staan gequoot, zoals
  // het `.or()`-precedent in app/api/notifications/route.ts: de PostgREST-
  // filtergrammatica is komma-gescheiden en een timestamp draagt ':' en '.'.
  const grens = new Date(now.getTime() - WEEK_VENSTER_DAGEN * 24 * 60 * 60 * 1000).toISOString()
  const vandaag = now.toISOString().slice(0, 10)
  const { data, error } = await service
    .from('news_articles')
    .select(KANDIDAAT_KOLOMMEN)
    .eq('duiding_status', 'geduid')
    .or(kandidatenVensterFilter(grens, vandaag))
    .order('id', { ascending: true })
  if (error) throw new Error(`[krant/editie-loader] kandidaten lezen mislukt: ${error.message}`)

  const artikelen: KandidaatArtikel[] = []
  let ongeldig = 0
  for (const rij of (data ?? []) as Array<Omit<KandidaatArtikel, 'duiding'> & { duiding: unknown }>) {
    const parsed = duidingV1Schema.safeParse(rij.duiding)
    if (!parsed.success) {
      ongeldig++
      continue
    }
    artikelen.push({ ...rij, duiding: parsed.data })
  }
  return { artikelen, ongeldig }
}

export interface LezerContext {
  gezienArtikelIds: Set<string>
  gedemptRubrieken: Set<string>
}

/**
 * Wat de lezer al zag en minder wil zien. De leesstatus draagt NewsItem-id's;
 * op het lokale pad is dat `news-local-<artikel-id>`, op het cloudpad een
 * model-id zonder koppeling — die telt hier dus niet (K1: de lezer ziet de
 * schaduweditie niet, dus dat kost niets; 1C zet de item-id op het artikel-id).
 */
export async function laadLezerContext(client: SupabaseClient, userId: string, now: Date): Promise<LezerContext> {
  const [gezienRes, feedbackRes] = await Promise.all([
    client.from('app_settings').select('value').eq('key', newsReadKey(userId)).maybeSingle(),
    client.from('news_feedback').select('category').eq('user_id', userId).eq('verdict', 'less').gte('created_at', demotionWindowStartIso(now)),
  ])

  const gezienArtikelIds = new Set<string>()
  const raw = gezienRes.data?.value as { ids?: unknown } | string | null | undefined
  const value = typeof raw === 'string' ? veiligJson(raw) : raw
  const ids = Array.isArray((value as { ids?: unknown } | null)?.ids) ? ((value as { ids: unknown[] }).ids as unknown[]) : []
  for (const id of ids) {
    if (typeof id !== 'string') continue
    gezienArtikelIds.add(id.startsWith(LOKAAL_ITEM_PREFIX) ? id.slice(LOKAAL_ITEM_PREFIX.length) : id)
  }

  const feedback = (feedbackRes.data ?? []) as Array<{ category: string | null }>
  return { gezienArtikelIds, gedemptRubrieken: new Set(demotedCategories(feedback)) }
}

function veiligJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}
