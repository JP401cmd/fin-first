// lib/household/perspective-loader-server.ts
//
// SERVER-ONLY wrapper rond de dual-use perspective-loader. Doel: binnen één
// server-render de `household_members`-/`households`-/profielen-queries van
// `loadPerspectiveContext` MAAR ÉÉN keer uitvoeren, ook als meerdere
// data-loaders (core, assets, cashflow, horizon, belasting) in dezelfde render
// elk een perspectief opvragen.
//
// Waarom hier en niet in perspective-loader.ts?
//   • `perspective-loader.ts` is bewust dual-use (server + browser) en mag
//     daarom GEEN React `cache()` importeren (server-only API).
//   • Server-componenten maken per render één Supabase-server-client en geven
//     diezelfde instantie door aan al hun loaders. React `cache()` dedupt op
//     argument-identiteit; omdat de client-instantie binnen de render constant
//     is, collapseren alle context-loads naar één — exact het patroon van
//     `getCachedUser` (lib/supabase/cached-user.ts).
//
// Client-gebruik (in-sessie perspectief-wissel) blijft de ONGEWIJZIGDE
// `loadPerspectiveData` / `loadPerspectiveTransactions` uit perspective-loader.ts
// gebruiken — die laden hun context zelf en zijn byte-identiek aan voorheen.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Perspective } from '@/lib/household-data'
import {
  loadPerspectiveContext,
  loadPerspectiveData,
  loadPerspectiveTransactions,
  type PerspectiveContext,
  type PerspectiveData,
  type PerspectiveTransactions,
} from './perspective-loader'

/**
 * Request-gecachte context. React `cache()` dedupt op de doorgegeven
 * client-instantie: binnen één render levert elke aanroep met dezelfde
 * server-client de eerste (en enige) `loadPerspectiveContext`-uitvoering.
 * Het resultaat is identiek aan een directe `loadPerspectiveContext`-call.
 */
export const getCachedPerspectiveContext = cache(
  (supabase: SupabaseClient): Promise<PerspectiveContext> =>
    loadPerspectiveContext(supabase),
)

/**
 * Server-variant van `loadPerspectiveData`: lost de context via de
 * request-cache op en injecteert 'm, zodat een tweede domein binnen dezelfde
 * render geen extra `household_members`-query meer doet. Het samengestelde
 * resultaat is byte-identiek aan `loadPerspectiveData(supabase, perspective)`.
 */
export async function loadPerspectiveDataServer(
  supabase: SupabaseClient,
  perspective: Perspective,
): Promise<PerspectiveData> {
  const context = await getCachedPerspectiveContext(supabase)
  return loadPerspectiveData(supabase, perspective, context)
}

/**
 * Server-variant van `loadPerspectiveTransactions` — zie
 * `loadPerspectiveDataServer`. Byte-identiek aan
 * `loadPerspectiveTransactions(supabase, perspective, opts)`.
 */
export async function loadPerspectiveTransactionsServer(
  supabase: SupabaseClient,
  perspective: Perspective,
  opts?: { since?: string; until?: string },
): Promise<PerspectiveTransactions> {
  const context = await getCachedPerspectiveContext(supabase)
  return loadPerspectiveTransactions(supabase, perspective, opts, context)
}
