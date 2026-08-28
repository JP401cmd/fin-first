import type { SupabaseClient } from '@supabase/supabase-js'
import { hasSubscription, type ActiveSubscriptions } from '@/lib/feature-registry'
import { ADDON_PLANS } from '@/lib/subscription-catalog'

/**
 * SERVER-LOADER voor de rapportage-hub (`/rapportages`).
 *
 * ## Waarom dit een loader is en geen client-read
 *
 * De hub las het archief tot nu toe zelf uit de browser
 * (`.from('report_configs').select('*')`) — een weergave-read in een
 * `'use client'`-bestand, precies wat de datapad-conventie (ADR 0058) verbiedt
 * en waarvoor de hub een grandfather-entry in `check-client-data-reads.mjs`
 * had. Die entry vervalt met deze loader.
 *
 * Twee dingen komen er bovenop, en die zijn niet cosmetisch:
 *
 * 1. **`cached_data` gaat niet meer mee.** De oude `select('*')` sleepte de
 *    volledige JSONB-cache van maximaal twintig rapporten naar de browser om er
 *    een naam en twee datums uit te tonen. Hier staat een expliciete
 *    kolomlijst; de cache blijft server-side waar hij hoort.
 * 2. **De abonnementsstand is server-bepaald.** De hub moet een vergrendelde
 *    vorm vóór de klik kunnen tonen (S9). Dat kan alleen als de server vertelt
 *    of de AI-add-on er is — de client kan dat niet zelf vaststellen zonder een
 *    extra roundtrip, en zou het bij een mislukte lezing verkeerd raden.
 *
 * ## Scope
 *
 * `report_configs` is own-row (RLS op `auth.uid() = user_id`). `.eq('user_id')`
 * staat er bovenop als tweede slot, net als in `app/api/report/route.ts`.
 * Er komt hier géén service-role aan te pas.
 */

/** Zelfde bovengrens als de oude client-read; de hub nummert Romeins i–xx. */
const MAX_CONFIGS = 20

/** De hub toont naam, periode en de AI-markering — verder niets. */
const CONFIG_COLUMNS = 'id,name,period_type,date_from,date_to,use_ai,created_at' as const

/** Eén archiefregel zoals de hub 'm toont. Bewust smaller dan `ReportConfig`. */
export interface RapportageArchiveItem {
  id: string
  name: string
  period_type: 'month' | 'quarter' | 'year' | 'custom'
  date_from: string
  date_to: string
  use_ai: boolean
}

export interface RapportagesData {
  /** "Eerder verschenen", nieuwste eerst, max. 20. */
  archive: RapportageArchiveItem[]
  /** Heeft deze gebruiker de AI-add-on? Bepaalt of de AI-inleiding beschikbaar is. */
  hasAiSubscription: boolean
  /**
   * Is de AI-add-on daadwerkelijk af te rekenen (Polar live)?
   *
   * Zolang dit `false` is, toont de hub GEEN slotje bij de AI-inleiding: een
   * vergrendeling tonen voor iets dat niemand kan kopen levert een muur op
   * zonder deur. Gelezen uit `lib/subscription-catalog.ts` — nooit gehardcodeerd,
   * zodat het slot vanzelf verschijnt zodra de checkout live gaat.
   */
  aiAddonAvailable: boolean
}

export async function loadRapportagesData(
  supabase: SupabaseClient,
  userId: string,
): Promise<RapportagesData> {
  const [configsResult, profileResult] = await Promise.all([
    supabase
      .from('report_configs')
      .select(CONFIG_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_CONFIGS),
    supabase
      .from('profiles')
      .select('active_subscriptions')
      .eq('id', userId)
      .single(),
  ])

  // Een mislukte archieflezing is geen reden om de hele hub te laten vallen:
  // de zeven rapportvormen werken los van het archief. De lijst blijft dan leeg
  // (de bestaande empty-state dekt dat) — hetzelfde gedrag als de oude
  // client-read, die z'n fout eveneens stil opving.
  const archive = ((configsResult.data ?? []) as RapportageArchiveItem[]).map((row) => ({
    id: row.id,
    name: row.name,
    period_type: row.period_type,
    date_from: row.date_from,
    date_to: row.date_to,
    use_ai: row.use_ai,
  }))

  const subs: ActiveSubscriptions =
    (profileResult.data?.active_subscriptions as string[] | null) ?? []

  return {
    archive,
    hasAiSubscription: hasSubscription(subs, 'ai'),
    aiAddonAvailable: ADDON_PLANS.find((plan) => plan.tier === 'ai')?.available ?? false,
  }
}
