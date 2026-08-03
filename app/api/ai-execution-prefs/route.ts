import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { checkTierGate } from '@/lib/require-tier'
import { parseBody } from '@/lib/api/parse-body'
import { serverError, unauthorized, forbidden } from '@/lib/api/respond'
import {
  AI_EXECUTION_GROUP_IDS,
  resolveAllExecutionModes,
  type AiExecutionGroup,
  type AiExecutionMode,
  type AiExecutionPrefsRow,
} from '@/lib/ai/execution-groups'

/**
 * /api/ai-execution-prefs — de per-groep keuze "waar draait de AI?".
 *
 * GET  → `{ privacyMode, prefs, modes, hasAiSubscription }`
 *          prefs = de rauwe overrides (alleen wat expliciet is gezet)
 *          modes = de OPGELOSTE keuze per groep (override ?? hoofdschakelaar) —
 *                  dat is wat de UI toont en wat de gates hanteren.
 *          hasAiSubscription = staat het 'ai'-abonnement NU nog open? De lokale
 *                  paden doen tijdens het genereren geen server-calls, dus dit
 *                  antwoord is de enige plek waar een verlopen abonnement het
 *                  on-device genereren nog kan stoppen (zie de GET-handler).
 * POST → body `{ group, mode }` of `{ group, mode: null }` om de override te
 *        wissen (die groep volgt dan weer de hoofdschakelaar).
 *
 * SINGLE SOURCE / SECURITY: own-row read-modify-write via de anon RLS-client
 * (`.eq('id', user.id)`), NOOIT service-role — spiegelt app/api/privacy-mode en
 * app/api/appearance. De bestaande eigen-rij policy op `profiles`
 * (`USING (auth.uid() = id)`) dekt de nieuwe kolom automatisch.
 *
 * TIER-GATE, zelfde asymmetrie als privacy-mode: een groep op 'lokaal' zetten
 * vereist het 'ai'-abonnement; terug naar 'cloud' (of de override wissen) mag
 * altijd, zodat een verlopen abonnement niemand in privé-modus opsluit.
 *
 * READ-MODIFY-WRITE, niet blind overschrijven: twee tabbladen die elk een andere
 * groep zetten mogen elkaars keuze niet wissen. We lezen de huidige map, passen
 * één sleutel aan en schrijven het geheel terug.
 */

const GROUP_VALUES = AI_EXECUTION_GROUP_IDS as [AiExecutionGroup, ...AiExecutionGroup[]]

const PrefBodySchema = z.object({
  group: z.enum(GROUP_VALUES),
  /** null wist de override — die groep volgt daarna weer de hoofdschakelaar. */
  mode: z.union([z.literal('lokaal'), z.literal('cloud'), z.null()]),
})

/**
 * Houdt uitsluitend geldige groep/modus-paren over. Beschermt tegen een map die
 * ooit met de hand of door een oudere versie is gevuld: onbekende sleutels en
 * onzinnige waarden verdwijnen bij de eerste schrijfactie in plaats van mee te
 * reizen.
 */
function sanitizePrefs(raw: unknown): Partial<Record<AiExecutionGroup, AiExecutionMode>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Partial<Record<AiExecutionGroup, AiExecutionMode>> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(AI_EXECUTION_GROUP_IDS as string[]).includes(key)) continue
    if (value !== 'lokaal' && value !== 'cloud') continue
    out[key as AiExecutionGroup] = value
  }
  return out
}

/** PostgREST-code voor "kolom bestaat niet" (Postgres `undefined_column`). */
const UNDEFINED_COLUMN = '42703'

/**
 * Defensief bij een ONTBREKENDE KOLOM — spiegelt `readPrefsRow` in
 * `lib/ai/privacy-gate.ts`, de tweede lezer van precies deze kolom.
 *
 * WAAROM DIT MOET: de twee lezers liepen uit de pas. `privacy-gate.ts` ving een
 * 42703 al netjes op en viel terug op de hoofdschakelaar; deze route gooide door
 * naar een 500. Dat is niet alleen inconsistent, het is fail-closed op de
 * verkeerde plek: `useExecutionMode` (lib/ai/local/use-execution-mode.ts) leest
 * deze route en blijft bij een niet-ok antwoord bewust in 'resolving' hangen —
 * er vertrekt dan NIETS, ook het cloudpad niet. Elk oppervlak dat op die hook
 * gate't (chat, categorisatie, en sinds de on-device editie ook /nieuws) valt
 * daarmee stil zolang de migratie in een omgeving nog niet is toegepast. Eén
 * ontbrekende kolom legde zo een hele pagina plat.
 *
 * Terugvallen op alléén `privacy_mode` is verantwoord: een kolom die niet
 * bestaat kan per definitie ook niemands voorkeur bevatten, dus we negeren geen
 * bestaande keuze — elke groep volgt dan gewoon de hoofdschakelaar. Elke ÁNDERE
 * leesfout gooit bewust door (500), zodat een tijdelijke DB-storing nooit
 * stilzwijgend een privé-modus opent.
 */
async function readRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<AiExecutionPrefsRow> {
  const { data, error } = await supabase
    .from('profiles')
    .select('privacy_mode, ai_execution_prefs')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    if (error.code === UNDEFINED_COLUMN) {
      const fallback = await supabase
        .from('profiles')
        .select('privacy_mode')
        .eq('id', userId)
        .maybeSingle()
      if (fallback.error) {
        if (fallback.error.code === UNDEFINED_COLUMN) {
          return { privacy_mode: false, ai_execution_prefs: {} }
        }
        throw fallback.error
      }
      const row = fallback.data as { privacy_mode?: boolean | null } | null
      return { privacy_mode: row?.privacy_mode ?? false, ai_execution_prefs: {} }
    }
    throw error
  }

  const row = data as { privacy_mode?: boolean | null; ai_execution_prefs?: unknown } | null
  return {
    privacy_mode: row?.privacy_mode ?? false,
    ai_execution_prefs: sanitizePrefs(row?.ai_execution_prefs),
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) return unauthorized()

    const row = await readRow(supabase, user.id)

    // REVOCATIE — waarom het abonnement in dit antwoord hoort.
    //
    // De zuiver lokale paden (pensioen-PDF, aangifte-PDF, rekenhulp, vaste
    // lasten, categorisatie) doen tijdens het genereren NUL server-calls: het
    // model draait on-device. Er is dus geen enkele route waar een tier-gate
    // alsnog aanslaat. Deze GET was daarmee de laatste server-aanraking vóór het
    // genereren — en hij zei niets over het abonnement. Wie ooit met een geldig
    // abonnement een groep op 'lokaal' zette, bleef daarna onbeperkt on-device
    // genereren, ook lang nadat het abonnement was verlopen.
    //
    // We geven de stand hier dus mee en laten `useExecutionMode`
    // (lib/ai/local/use-execution-mode.ts) erop gate'en. Via `checkTierGate`,
    // dezelfde helper die de POST hieronder gebruikt: één bron voor "heeft deze
    // gebruiker 'ai'?", geen tweede eigen lezing van `active_subscriptions` die
    // uit de pas kan lopen.
    //
    // DE GET ZELF BLIJFT ONGEGATED, en dat is essentieel voor het
    // niemand-opgesloten-principe (spiegel van /api/privacy-mode r70-81): wie
    // geen geldig abonnement meer heeft, moet zijn keuze nog kúnnen lezen en
    // terugzetten naar cloud. Een 403 op deze GET zou hem opsluiten in een
    // privé-modus die hij niet meer kan verlaten.
    const tierGate = await checkTierGate(supabase, user.id, 'ai')

    return NextResponse.json({
      privacyMode: row.privacy_mode ?? false,
      prefs: row.ai_execution_prefs ?? {},
      modes: resolveAllExecutionModes(row),
      hasAiSubscription: tierGate === null,
    })
  } catch (err) {
    return serverError(err, 'ai-execution-prefs:GET')
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) return unauthorized()

    const parsed = await parseBody(PrefBodySchema, request)
    if (!parsed.ok) return parsed.response
    const { group, mode } = parsed.data

    // Alleen NAAR lokaal is gated — terug naar cloud of de override wissen mag
    // altijd (niemand-opgesloten-principe, spiegelt /api/privacy-mode).
    if (mode === 'lokaal') {
      const tierGate = await checkTierGate(supabase, user.id, 'ai')
      if (tierGate) return forbidden(tierGate.error)
    }

    const row = await readRow(supabase, user.id)
    const next = { ...(row.ai_execution_prefs ?? {}) }
    if (mode === null) {
      delete next[group]
    } else {
      next[group] = mode
    }

    const { error } = await supabase
      .from('profiles')
      .update({ ai_execution_prefs: next })
      .eq('id', user.id)

    if (error) throw error

    const updated: AiExecutionPrefsRow = { privacy_mode: row.privacy_mode, ai_execution_prefs: next }
    return NextResponse.json({
      ok: true,
      prefs: next,
      modes: resolveAllExecutionModes(updated),
    })
  } catch (err) {
    return serverError(err, 'ai-execution-prefs:POST')
  }
}
