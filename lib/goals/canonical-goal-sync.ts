/**
 * DE ENE BEDRADING rond `syncActiveGoalValues` — koppelrijen, de lazy FIRE-thunk,
 * de gedeelde metric-bronnen en `computeGoalProgress` in één aanroep.
 *
 * Waarom een eigen module: het doelen-scherm (`lib/fin-data-loader.ts`) en de
 * Fin-chatcontext (`lib/ai/context/wil-context.ts`) moeten per constructie
 * hetzelfde getal per doel zien. Tot 14 sep 2026 las de chatcontext de RUWE
 * `goals.current_value`, en die staat voor lab-parameterdoelen, auto-sync-
 * metricdoelen, gekoppelde doelen en het vrijheidsgetal-doel bewust op 0 of op
 * een oude waarde: de echte stand wordt pas bij het lezen geïnjecteerd. Fin kreeg
 * dus "Plan gedekt tot 90 jaar: 0%/100%" terwijl het scherm 78% toonde. Twee
 * loaders die elk zelf `loadGoalLinks` + `syncActiveGoalValues` +
 * `buildGoalMetricSources` + `loadVrijheidsgetalSnapshot` aan elkaar knopen is
 * exact de drift die de gedeelde sync-laag moest uitsluiten — dus de knoop zelf
 * woont nu hier.
 *
 * Deze module rekent niets uit. Alles wat telt, staat in `syncActiveGoalValues`
 * (lib/goal-current-value.ts) en `computeGoalProgress` (lib/goal-data.ts).
 *
 * De dashboard-widget (`lib/dashboard-data-loader.ts`) knoopt dezelfde aanroep nog
 * zelf; die hoort bij een volgende gelegenheid ook hierop over te gaan.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { syncActiveGoalValues, type GoalLinkRow, type SyncableGoal } from '@/lib/goal-current-value'
import { computeGoalProgress, type GoalProgress } from '@/lib/goal-data'
import { isVrijheidsgetalGoal } from '@/lib/goals/vrijheidsgetal-goal'
import { loadVrijheidsgetalSnapshot } from '@/lib/goals/vrijheidsgetal-source'
import { buildGoalMetricSources, loadGoalLinks } from '@/lib/goals/metric-sources'

export type GoalSyncAssetRow = { id: string; current_value: number | string | null }
export type GoalSyncDebtRow = { id: string; current_balance: number | string | null }
export type GoalSyncRows = {
  assets: readonly GoalSyncAssetRow[]
  debts: readonly GoalSyncDebtRow[]
}

/** Wat de voortgangsberekening naast de sync-velden van een doel leest. */
export type CanonicalSyncGoal = SyncableGoal & {
  target_date: string | null
  created_at?: string
  user_id?: string | null
}

/**
 * Synchroniseer actieve doelen op de canonieke bronnen en bereken hun voortgang.
 *
 * `rows` is óf de al geladen bezittingen/schulden (het doelen-scherm heeft ze
 * toch al), óf een THUNK. De thunk draait alleen wanneer er iets te koppelen
 * valt: ≥1 `goal_links`-rij of een doel met een legacy-koppelkolom. Zonder
 * koppelingen leest `autolinkGoalCurrentValues` de rijen niet, dus een oppervlak
 * dat ze niet al in handen heeft (de chatcontext) betaalt dan geen query.
 *
 * De FIRE-snapshot blijft LAZY (`syncActiveGoalValues` roept de thunk alleen bij
 * een vrijheidsgetal-, fire_age-, end_balance- of plan_coverage-doel aan), net als
 * elke metric-bron.
 *
 * `goalProgresses` is index-gekoppeld aan `goals`; de geprojecteerde FIRE-datum
 * vervangt alleen bij het vrijheidsgetal-doel de `eta`, en alleen als de sync
 * daadwerkelijk sloeg — identiek aan het doelen-scherm vóór deze extractie.
 */
export async function syncGoalsFromCanonicalSources<T extends CanonicalSyncGoal>(
  supabase: SupabaseClient,
  allGoals: T[],
  userId: string | null,
  rows: GoalSyncRows | (() => Promise<GoalSyncRows>),
): Promise<
  Awaited<ReturnType<typeof syncActiveGoalValues<T>>> & {
    goalLinks: GoalLinkRow[]
    goalProgresses: GoalProgress[]
  }
> {
  const goalLinks = await loadGoalLinks(
    supabase,
    allGoals.map(g => g.id).filter((id): id is string => !!id),
  )

  let resolved: GoalSyncRows
  if (typeof rows === 'function') {
    const needsRows =
      goalLinks.length > 0 || allGoals.some(g => !!g.linked_asset_id || !!g.linked_debt_id)
    resolved = needsRows ? await rows() : { assets: [], debts: [] }
  } else {
    resolved = rows
  }

  const result = await syncActiveGoalValues(
    supabase,
    allGoals,
    resolved.assets,
    resolved.debts,
    userId,
    () => loadVrijheidsgetalSnapshot(supabase),
    goalLinks,
    buildGoalMetricSources(supabase),
  )

  const fireEta = result.vrijheidsgetalSynced > 0 ? (result.fireSnapshot?.eta ?? null) : null
  const goalProgresses = result.goals.map(g =>
    computeGoalProgress(g, isVrijheidsgetalGoal(g) ? { etaOverride: fireEta } : undefined),
  )

  return { ...result, goalLinks, goalProgresses }
}
