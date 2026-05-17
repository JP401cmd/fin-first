// ── App setup-status ─────────────────────────────────────────
//
// Elke "app" binnen het Kern→Categorie→App-patroon (zie CLAUDE.md) heeft
// een verplicht setup-scherm dat de inhoud gates totdat de gebruiker
// bewust de eerste keuzes heeft gemaakt. De voltooid-marker leeft in
// `user_feature_visits` met één slug per app — symmetrisch met
// `HORIZON_SETUP_COMPLETED_SLUG` in `lib/horizon-data-loader.ts`.
//
// Backfill: bestaande gebruikers met al data in de canonical content-
// tabellen (budgets > 0, holdings > 0, …) worden lazy als-voltooid
// gemarkeerd zodat de gate alleen verschijnt voor écht nieuwe gebruikers.

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * App-keys voor de generieke `<AppSetupGate>`-framework.
 *
 * Toevoegen van een nieuwe app: één entry in deze map plus één config-file
 * in `components/app/app-setup/configs/`. De gate-mount in de bijbehorende
 * tab-component leest deze slug om de voltooid-status te checken.
 */
export const APP_SETUP_SLUGS = {
  budgetteren: 'budgetteren_setup_completed',
  aandelen_holdings: 'aandelen_holdings_setup_completed',
  crypto_holdings: 'crypto_holdings_setup_completed',
  hypotheekplanner: 'hypotheekplanner_setup_completed',
  verhuurrendement: 'verhuurrendement_setup_completed',
} as const

export type AppSetupKey = keyof typeof APP_SETUP_SLUGS

/**
 * Server-side helper: lees voor één of meer app-keys de voltooid-status.
 *
 * Retourneert een record `{ [key]: boolean }` waarbij `true` betekent
 * "setup-pane voltooid OF gebruiker had al data in de canonical tabel".
 *
 * Graceful: als `user_feature_visits` ontbreekt (legacy DB), valt elke
 * key terug op `false` zodat de gate verschijnt. Gebruiker kan dan de
 * setup voltooien en de tabel wordt op de eerste insert aangemaakt door
 * de bestaande migratie 20260215000001.
 */
export async function getAppSetupStatus(
  supabase: SupabaseClient,
  keys: AppSetupKey[],
): Promise<Record<AppSetupKey, boolean>> {
  const status = {} as Record<AppSetupKey, boolean>
  for (const key of keys) status[key] = false

  if (keys.length === 0) return status

  const slugs = keys.map((k) => APP_SETUP_SLUGS[k])

  // Auth-context — alle backfill-queries hieronder zijn user-scoped via RLS,
  // maar we hebben de user-id nodig voor de lazy-insert van markers.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return status

  try {
    const { data, error } = await supabase
      .from('user_feature_visits')
      .select('feature_slug')
      .in('feature_slug', slugs)

    if (error) {
      // Tabel ontbreekt of RLS-fout — alles als incompleet beschouwen.
      return status
    }

    const markers = new Set((data ?? []).map((r) => r.feature_slug as string))
    for (const key of keys) {
      status[key] = markers.has(APP_SETUP_SLUGS[key])
    }

    // ── Backfill ──────────────────────────────────────────────
    // Bestaande gebruikers hebben geen marker maar wel data. Voor elke
    // niet-gemarkeerde key checken we de canonical content-tabel. Bij
    // bestaande data: markeer als-voltooid + schrijf de marker lazy zodat
    // toekomstige checks meteen `true` retourneren zonder backfill-query.
    const backfillKeys = keys.filter((k) => !status[k])
    if (backfillKeys.length > 0) {
      const backfilled = await checkBackfill(supabase, backfillKeys)
      const lazyInserts: { user_id: string; feature_slug: string }[] = []
      for (const [key, hasData] of Object.entries(backfilled)) {
        if (hasData) {
          status[key as AppSetupKey] = true
          lazyInserts.push({
            user_id: user.id,
            feature_slug: APP_SETUP_SLUGS[key as AppSetupKey],
          })
        }
      }
      if (lazyInserts.length > 0) {
        // Best-effort. Faalt deze, dan checkt de volgende request opnieuw —
        // geen blocker voor de huidige render.
        await supabase
          .from('user_feature_visits')
          .upsert(lazyInserts, { onConflict: 'user_id,feature_slug', ignoreDuplicates: true })
          .then(
            () => undefined,
            () => undefined,
          )
      }
    }
  } catch {
    // Stille fallback — alles incompleet
  }

  return status
}

/**
 * Voor elke key: heeft de gebruiker al data in de canonical content-tabel?
 *
 * Bedoeld als one-shot backfill-check. We tellen alleen — de aantallen
 * zelf zijn niet relevant, alleen het feit dat er ≥ 1 rij bestaat.
 */
async function checkBackfill(
  supabase: SupabaseClient,
  keys: AppSetupKey[],
): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {}

  await Promise.all(
    keys.map(async (key) => {
      try {
        if (key === 'budgetteren') {
          const { count } = await supabase
            .from('budgets')
            .select('id', { count: 'exact', head: true })
            .is('parent_id', null)
          result[key] = (count ?? 0) > 0
        } else if (key === 'aandelen_holdings') {
          const { count } = await supabase
            .from('assets')
            .select('id', { count: 'exact', head: true })
            .eq('asset_type', 'investment')
            .eq('has_holdings_tracking', true)
          result[key] = (count ?? 0) > 0
        } else if (key === 'crypto_holdings') {
          const { count } = await supabase
            .from('assets')
            .select('id', { count: 'exact', head: true })
            .eq('asset_type', 'crypto')
            .eq('has_holdings_tracking', true)
          result[key] = (count ?? 0) > 0
        } else if (key === 'hypotheekplanner') {
          const { count } = await supabase
            .from('debts')
            .select('id', { count: 'exact', head: true })
            .eq('debt_type', 'mortgage')
            .eq('has_hypotheekplanner_tracking', true)
          result[key] = (count ?? 0) > 0
        } else if (key === 'verhuurrendement') {
          const { count } = await supabase
            .from('assets')
            .select('id', { count: 'exact', head: true })
            .eq('asset_type', 'real_estate')
            .eq('has_rental_tracking', true)
          result[key] = (count ?? 0) > 0
        }
      } catch {
        result[key] = false
      }
    }),
  )

  return result
}
