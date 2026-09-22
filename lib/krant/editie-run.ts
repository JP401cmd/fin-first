// ── Editie-run: één schaduweditie voor één lezer, van profiel tot rij ────────
//
// De keten die de weekcron (app/api/krant/cron) per gebruiker draait en die
// de herberekening (B4, editie-herberekening.ts) hergebruikt:
//
//   afleidNieuwsprofiel  →  laadLezerContext  →  matchEditie  →  schrijfEditie
//
// Alles wat de uitkomst beïnvloedt gaat als argument mee (now, aowRows, de
// kandidaten van deze run), zodat dezelfde run reproduceerbaar is en de
// herberekening exact dezelfde kandidaten minus één artikel kan draaien.
//
// De OVERLAP-METING (K1-poort, "naast de LLM-editie gelegd") gebeurt alleen
// voor testaccounts en levert drie tellingen: berichten die beide edities
// brengen, alleen de matcher, alleen het model. Ze vergelijkt op de
// genormaliseerde bron-url (normalizeUrl) — de enige sleutel die beide paden
// letterlijk uit news_articles overnemen. Er verlaat geen inhoud de run: de
// tellingen landen in job_runs.summary (ADR 0146).
//
// euro-only (B2, ADR 0172): geen dagtarief, geen vrijheidstijd — dit bestand
// rekent zelf niets; de sommen zitten in impact.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { newsCacheKey } from '@/lib/news-edition-store'
import { normalizeUrl } from '@/lib/news-selection'
import { standaardImpactContext } from './impact'
import { matchEditie, type EditieUitkomst, type KandidaatArtikel } from './matcher'
import { afleidNieuwsprofiel } from './profiel-afleiding'
import { laadLezerContext } from './editie-loader'
import { schrijfEditie, type EditieBron } from './editie-schrijver'

export interface EditieRunInvoer {
  userId: string
  weekKey: string
  bron: EditieBron
  now: Date
  aowRows: AowLeeftijdRow[]
  kandidaten: readonly KandidaatArtikel[]
  /** Artikel dat is teruggetrokken (B4): telt in deze run niet mee. */
  uitsluitArtikelId?: string
  /** Testaccount: leg de uitkomst naast de LLM-editie in news_cache. */
  meetOverlap?: boolean
}

export interface OverlapMeting {
  beide: number
  alleenMatcher: number
  alleenModel: number
}

export interface EditieRunUitkomst {
  editieId: string
  profielType: string
  leeg: boolean
  items: number
  /** null als er geen LLM-editie in de cache stond (of niet gemeten). */
  overlap: OverlapMeting | null
}

export async function runEditieVoor(service: SupabaseClient, invoer: EditieRunInvoer): Promise<EditieRunUitkomst> {
  const { userId, now } = invoer
  const { profiel } = await afleidNieuwsprofiel(service, userId, { now, aowRows: invoer.aowRows })
  const lezer = await laadLezerContext(service, userId, now)
  const artikelen = invoer.uitsluitArtikelId ? invoer.kandidaten.filter((a) => a.id !== invoer.uitsluitArtikelId) : invoer.kandidaten

  const uitkomst = matchEditie(profiel, artikelen, {
    now,
    gezienArtikelIds: lezer.gezienArtikelIds,
    gedemptRubrieken: lezer.gedemptRubrieken,
    impact: standaardImpactContext(invoer.aowRows, now.getUTCFullYear()),
  })

  const geschreven = await schrijfEditie(service, { userId, weekKey: invoer.weekKey, bron: invoer.bron, profiel, uitkomst, now })
  const overlap = invoer.meetOverlap ? await meetOverlap(service, userId, uitkomst) : null

  return { editieId: geschreven.id, profielType: uitkomst.profielType, leeg: uitkomst.leeg, items: geschreven.items, overlap }
}

/** Vergelijkt de schaduw-items met de LLM-editie in `news_cache:<uid>` op genormaliseerde bron-url. */
export async function meetOverlap(service: SupabaseClient, userId: string, uitkomst: EditieUitkomst): Promise<OverlapMeting | null> {
  const { data } = await service.from('app_settings').select('value').eq('key', newsCacheKey(userId)).maybeSingle()
  if (!data?.value) return null
  let cache: { items?: Array<{ sourceUrl?: string }> } | null = null
  try {
    cache = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
  } catch {
    return null
  }
  if (!cache || !Array.isArray(cache.items)) return null

  const model = new Set(cache.items.map((i) => i.sourceUrl).filter((u): u is string => typeof u === 'string' && u.length > 0).map(normalizeUrl))
  const matcher = new Set(uitkomst.items.map((i) => normalizeUrl(i.url)))
  let beide = 0
  for (const u of matcher) if (model.has(u)) beide++
  return { beide, alleenMatcher: matcher.size - beide, alleenModel: model.size - beide }
}
