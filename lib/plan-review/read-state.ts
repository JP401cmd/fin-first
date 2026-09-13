// lib/plan-review/read-state.ts
//
// Lichte server-lezing van `profiles.plan_review_state` (own-row JSONB-pref).
// Spiegel van `lib/page-status/minimized-prefs.ts`: single-row select op de EIGEN
// profielrij via de anon-RLS-client (nooit service-role), React-`cache()`'d per
// request.
//
// Drie uitkomsten:
//  - de geparste map (ook `{}` = niets bevestigd);
//  - `null` wanneer de kolom nog niet bestaat (42703: migratie 20260913160000 nog niet
//    uitgerold). De review kan dan niets opslaan, dus de ingang blijft de gewone
//    Voorkeuren-kaart — nooit een voortgang aanbieden die niet te bewaren is;
//  - `{}` bij elke andere leesfout (de veilige kant: de kaart toont dan de review),
//    server-side grep-baar gelogd.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parsePlanReviewState, type PlanReviewState } from './types'

export const readPlanReviewState = cache(async function readPlanReviewState(
  supabase: SupabaseClient,
  userId: string,
): Promise<PlanReviewState | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('plan_review_state')
    .eq('id', userId)
    .single()

  if (error) {
    if (error.code === '42703') return null
    console.error('[plan-review:readPlanReviewState]', error)
    return {}
  }
  return parsePlanReviewState(data?.plan_review_state)
})
