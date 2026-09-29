// ── Staat de AI-laag stil, en waarom? (Krant 1E, ADR 0190) ───────────────────
//
// Twee vragen, één module zonder model (geen getModel-import, dus veilig voor
// de server-page én de AI-stap):
//
//   telAiAanroepen   hoeveel modelcalls deed deze lezer in het venster (K5)?
//   aiLaagStand      staat de laag nu stil, met welke reden? (eindreview Y3)
//
// TELLEN IN TWEE TABELLEN (security-run Y1, 29-09). `krant_edities` heeft een
// eigen-rij DELETE-policy: een lezer die zijn verversingen wist, zou daarmee zijn
// quotum resetten. `ai_token_usage` (feature `krant_ai`) kan hij niet wissen
// (alleen een eigen-SELECT-policy). Het quotum is het MAXIMUM van beide
// tellingen: de ene mist een call die niets schreef (race), de andere een call
// waarvan de token-logging faalde — samen dekken ze elkaar.
//
// DE REDEN WORDT NIET OPGESLAGEN. De page kent het bezwaar al, kan de
// privacy-poort toetsen en het quotum en het tegoed tellen; alleen "de vorige
// verversing viel terug" komt uit de rij (`ai_uitkomst`). Zo is de tekst op het
// scherm altijd de huidige waarheid, niet die van de laatste verversing.
//
// euro-only (B2, ADR 0172): dit bestand rekent niets.

import type { SupabaseClient } from '@supabase/supabase-js'
import { checkCreditBudget } from '@/lib/ai/credit-gate'
import { isCloudAllowed } from '@/lib/ai/privacy-gate'
import { AI_LAAG_MAX_PER_WEEK, AI_LAAG_QUOTUM_DAGEN } from './ai-laag-grenzen'

/** De feature-string van de laag in ai_token_usage (gelijk aan KRANT_AI_FEATURE in tijdlijn-ai.ts). */
export const KRANT_AI_TOKEN_FEATURE = 'krant_ai' as const

const DAG_MS = 24 * 60 * 60 * 1000

/** De uitkomsten waarbij het model écht is aangeroepen (gelijk aan AI_AANROEP_UITKOMSTEN). */
const AANROEP_UITKOMSTEN = ['met-ai', 'teruggevallen'] as const

/**
 * Hoeveel modelcalls deed deze lezer in de laatste AI_LAAG_QUOTUM_DAGEN dagen?
 * Het maximum van de verversingen met een call (`krant_edities.ai_uitkomst`) en
 * de token-logging (`ai_token_usage`, feature krant_ai). Een leesfout op één van
 * beide gooit: de aanroeper behandelt dat fail-closed (zonder AI).
 */
export async function telAiAanroepen(client: SupabaseClient, userId: string, now: Date): Promise<number> {
  const sinds = new Date(now.getTime() - AI_LAAG_QUOTUM_DAGEN * DAG_MS).toISOString()
  const [edities, tokens] = await Promise.all([
    client
      .from('krant_edities')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('bron', 'tijdlijn')
      .in('ai_uitkomst', [...AANROEP_UITKOMSTEN])
      .gte('created_at', sinds),
    client
      .from('ai_token_usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('feature', KRANT_AI_TOKEN_FEATURE)
      .gte('created_at', sinds),
  ])
  if (edities.error) throw new Error(`[krant/ai-laag-stand] quotum (verversingen) lezen mislukt: ${edities.error.message}`)
  if (tokens.error) throw new Error(`[krant/ai-laag-stand] quotum (tokenlog) lezen mislukt: ${tokens.error.message}`)
  return Math.max(edities.count ?? 0, tokens.count ?? 0)
}

/** Waarom de laag nu stilstaat. `null` = hij draait bij de volgende verversing. */
export type AiStilstand = 'bezwaar' | 'lokaal' | 'quotum' | 'tegoed' | null

/**
 * De huidige stand voor het scherm, in volgorde van de poorten in de AI-stap.
 * Een leesfout op het quotum of het tegoed zegt niets (null): dan belooft het
 * scherm niets extra, maar verzint het ook geen reden.
 */
export async function aiLaagStand(
  client: SupabaseClient,
  userId: string,
  opts: { bezwaar: boolean; now?: Date },
): Promise<AiStilstand> {
  const now = opts.now ?? new Date()
  if (opts.bezwaar) return 'bezwaar'
  const cloud = await isCloudAllowed(client, userId, 'nieuws').catch(() => false)
  if (!cloud) return 'lokaal'
  const aanroepen = await telAiAanroepen(client, userId, now).catch(() => null)
  if (aanroepen != null && aanroepen >= AI_LAAG_MAX_PER_WEEK) return 'quotum'
  const tegoed = await checkCreditBudget(client, userId, 'news', now).catch(() => null)
  if (tegoed && !tegoed.allowed) return 'tegoed'
  return null
}
