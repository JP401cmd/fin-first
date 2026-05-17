'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { APP_SETUP_SLUGS, type AppSetupKey } from '@/lib/app-setup-status'

/**
 * Client-side check of een AppSetupGate moet verschijnen voor één app.
 *
 * Retourneert:
 *  - `null` — nog aan het laden (toon skeleton)
 *  - `true` — setup voltooid (toon de echte content)
 *  - `false` — setup-gate moet getoond worden
 *
 * Implementatie spiegelt `lib/app-setup-status.ts` maar dan vanuit de
 * browser. Voor SSR-vrije server-side gates kan in toekomst dezelfde
 * helper via de server-pagina worden voorberekend en als prop ingegeven —
 * voor nu kiezen we voor autonomie van de tab-componenten zodat het
 * pattern stand-alone werkt.
 *
 * Backfill: als de marker ontbreekt maar de canonical content-tabel al
 * data heeft (bestaande gebruikers), beschouwen we de setup als voltooid
 * én schrijven we lazy de marker, zodat de volgende mount meteen `true`
 * retourneert zonder backfill-query.
 */
export function useIsAppSetupCompleted(appKey: AppSetupKey): boolean | null {
  const [completed, setCompleted] = useState<boolean | null>(null)

  useEffect(() => {
    let aborted = false
    void (async () => {
      const supabase = createClient()
      const slug = APP_SETUP_SLUGS[appKey]
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (aborted) return
      if (!user) {
        // Niet ingelogd — gate niet relevant, geef true zodat parent niets blokkeert.
        setCompleted(true)
        return
      }

      // Marker-check
      try {
        const { data, error } = await supabase
          .from('user_feature_visits')
          .select('feature_slug')
          .eq('user_id', user.id)
          .eq('feature_slug', slug)
          .maybeSingle()
        if (aborted) return
        if (!error && data) {
          setCompleted(true)
          return
        }
      } catch {
        // Tabel ontbreekt — verder met backfill-check
      }

      // Backfill — bestaande gebruikers met data maar geen marker
      const hasData = await hasExistingDataFor(appKey, supabase, user.id)
      if (aborted) return
      if (hasData) {
        // Lazy marker-write zodat volgende mount sneller is
        await supabase
          .from('user_feature_visits')
          .upsert(
            { user_id: user.id, feature_slug: slug },
            { onConflict: 'user_id,feature_slug', ignoreDuplicates: true },
          )
          .then(
            () => undefined,
            () => undefined,
          )
        if (!aborted) setCompleted(true)
      } else {
        if (!aborted) setCompleted(false)
      }
    })()
    return () => {
      aborted = true
    }
  }, [appKey])

  return completed
}

// ── Backfill check ──────────────────────────────────────────

async function hasExistingDataFor(
  appKey: AppSetupKey,
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  try {
    if (appKey === 'budgetteren') {
      const { count } = await supabase
        .from('budgets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('parent_id', null)
      return (count ?? 0) > 0
    }
    if (appKey === 'aandelen_holdings') {
      const { count } = await supabase
        .from('assets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('asset_type', 'investment')
        .eq('has_holdings_tracking', true)
      return (count ?? 0) > 0
    }
    if (appKey === 'crypto_holdings') {
      const { count } = await supabase
        .from('assets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('asset_type', 'crypto')
        .eq('has_holdings_tracking', true)
      return (count ?? 0) > 0
    }
    if (appKey === 'hypotheekplanner') {
      const { count } = await supabase
        .from('debts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('debt_type', 'mortgage')
        .eq('has_hypotheekplanner_tracking', true)
      return (count ?? 0) > 0
    }
    if (appKey === 'verhuurrendement') {
      const { count } = await supabase
        .from('assets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('asset_type', 'real_estate')
        .eq('has_rental_tracking', true)
      return (count ?? 0) > 0
    }
    return false
  } catch {
    return false
  }
}
