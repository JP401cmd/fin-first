// lib/server-data/actions-aggregate.ts
//
// ACTIE-KPI-AGGREGAAT (FASE 3 · Task 2.6)
// ───────────────────────────────────────────────────────────────────────────
// Consumeer de SQL-functie `public.actions_kpi_aggregate` (migratie
// 20260719172130) i.p.v. tot 1000 actie-rijen op te halen en er in JS de
// headline-KPI's op te sommen. Dat lost een STILLE REKENFOUT op: de loader-fetch
// heeft `.limit(1000)` == de PostgREST `max_rows`-cap (config.toml = 1000) —
// byte-identiek aan onbegrensd — waardoor `totalFreedomDaysWon` (Σ
// freedom_days_impact over completed) en `completionRatio` (completed/totaal)
// voor gebruikers met >1000 acties STIL te laag werden. Een aggregaat levert per
// definitie één rij en kan niet afkappen. Spiegel van `tx-aggregates.ts` (T2.2).
//
// PARITY-CONTRACT
//   • De functie geeft één rij: total_freedom_days_won (Σ over completed),
//     completed_count, total_count (open+postponed+completed — 'rejected' telt
//     niet mee, exact de noemer die de loader gebruikte).
//   • `computeActionsKpiFromRows` reproduceert de SQL in TS zodat de parity-test
//     kan bewijzen: oude JS-reductie(≤1000 rijen) wijkt af van de volle waarheid
//     bij >1000 acties, terwijl de aggregaat-consumptie exact de volle waarheid
//     geeft; en dat beide identiek zijn bij ≤1000 acties (geen gedragswijziging
//     voor de meerderheid).
//
// RLS/BEVEILIGING: de functie is SECURITY INVOKER; ze MOET met de anon/
// authenticated RLS-client (createClient uit lib/supabase/server.ts) worden
// aangeroepen — nooit met getServiceClient(). De actieve SELECT-policy op
// `actions` is user_id-only, dus `ownOnly` is vandaag een no-op maar blijft
// beschikbaar voor toekomstige (partner-)policies.

import type { SupabaseClient } from '@supabase/supabase-js'

/** De drie afkap-vrije KPI-getallen zoals `actions_kpi_aggregate` teruggeeft. */
export interface ActionsKpiAggregate {
  /** Σ freedom_days_impact over completed acties. */
  totalFreedomDaysWon: number
  /** Aantal completed acties. */
  completedCount: number
  /** Aantal acties met status open+postponed+completed (excl. rejected). */
  totalCount: number
}

/** Rauwe PostgREST-rijvorm van de RPC (numeric → number|string, bigint → number|string). */
interface ActionsKpiAggregateRow {
  total_freedom_days_won: number | string
  completed_count: number | string
  total_count: number | string
}

const EMPTY_KPI: ActionsKpiAggregate = {
  totalFreedomDaysWon: 0,
  completedCount: 0,
  totalCount: 0,
}

/**
 * Haal het actie-KPI-aggregaat op via de RLS-veilige RPC. Retourneert de
 * genormaliseerde vorm plus de rauwe `error` zodat de loader zijn bestaande
 * error-logging/fallback kan behouden.
 *
 * MOET met de authenticated/anon RLS-client worden aangeroepen (nooit
 * getServiceClient): de functie is SECURITY INVOKER en leunt op de RLS van
 * `actions`.
 */
export async function fetchActionsKpiAggregate(
  supabase: SupabaseClient,
  args: { ownOnly?: boolean } = {},
): Promise<{ data: ActionsKpiAggregate; error: unknown }> {
  const { data, error } = await supabase.rpc('actions_kpi_aggregate', {
    p_own_only: args.ownOnly ?? false,
  })
  // Een table-returning RPC geeft een array; pak de enige rij (of leeg → nullen).
  const row = (Array.isArray(data) ? data[0] : data) as ActionsKpiAggregateRow | null | undefined
  if (!row) return { data: EMPTY_KPI, error }
  return {
    data: {
      totalFreedomDaysWon: Number(row.total_freedom_days_won) || 0,
      completedCount: Number(row.completed_count) || 0,
      totalCount: Number(row.total_count) || 0,
    },
    error,
  }
}

// ── Test-hulp: reproduceer de SQL in TS ─────────────────────────────────────
/** Statussen die de loader (en de RPC) meetellen in `totalCount`. */
const COUNTED_STATUSES = new Set(['open', 'postponed', 'completed'])

/**
 * Bereken hetzelfde KPI-aggregaat als de SQL-functie uit ruwe actie-rijen.
 * Uitsluitend voor de parity-test: bewijst dat de oude JS-reductie byte-identiek
 * gereproduceerd wordt door het aggregaat — inclusief een >1000-rijen-getuige.
 */
export function computeActionsKpiFromRows(
  rows: { status?: string | null; freedom_days_impact?: number | string | null }[],
): ActionsKpiAggregate {
  let totalFreedomDaysWon = 0
  let completedCount = 0
  let totalCount = 0
  for (const r of rows) {
    const status = r.status ?? ''
    if (!COUNTED_STATUSES.has(status)) continue
    totalCount += 1
    if (status === 'completed') {
      completedCount += 1
      totalFreedomDaysWon += Number(r.freedom_days_impact) || 0
    }
  }
  return { totalFreedomDaysWon, completedCount, totalCount }
}
