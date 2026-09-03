import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildErrorGroups,
  type ErrorGroup,
  type ErrorLogRow,
  type ErrorResolutionRow,
} from './error-groups'

/**
 * Leesvenster + groepering van `error_logs` × `error_log_resolutions` (ADR 0113).
 *
 * Eén home voor het venster, gedeeld door `/api/admin/error-groups` (de
 * werkvoorraad achter `/beheer/errors`) en de inbak-teller op de `/beheer`-hub
 * (`lib/beheer-inbox-counts.ts`). Twee plekken die elk hun eigen venster lezen
 * zouden vroeg of laat twee verschillende "open"-getallen tonen.
 *
 * Toegang loopt via de MEEGEGEVEN client — bewust géén service-role: RLS op
 * beide tabellen (`is_superadmin()`) is het tweede slot naast de rolcheck van
 * de aanroeper. Valt die rolcheck ooit weg, dan levert dit nul rijen in plaats
 * van de hele foutenstapel.
 */

/**
 * Leesvenster. Groeperen heeft alleen betekenis over een ruime stapel, maar een
 * onbegrensde query zou met de jaren stilletjes traag worden.
 *
 * 1000 is GEEN vrije keuze: het is de PostgREST-cap uit `supabase/config.toml`
 * (`max_rows = 1000`). Een client-`.limit()` bóven die grens is een **no-op** —
 * zet je hier 2000, dan krijg je nog steeds 1000 rijen terug en zou een
 * afgeleide `rows.length >= MAX_ROWS` structureel `false` blijven. Precies de
 * stille leugen die `truncated` hoort te voorkomen. Zie het gelijkluidende
 * commentaar in `lib/budgets-data-loader.ts` — en de geleden schade in
 * `lib/architecture/calculations.ts`, waar een stille afkap op deze cap ooit
 * twee verschillende spaarquotes op twee schermen opleverde.
 *
 * Bewuste afwijking van de `truncationSuspected`-kanarie elders in de repo: die
 * leidt "afgekapt" af uit `rows.length >= cap` en meldt dus een vals alarm bij
 * exact `cap` rijen. Hier kost een `head: true`-count niets extra's aan
 * dataverkeer en geeft hij het antwoord zéker in plaats van vermoedelijk.
 */
export const ERROR_GROUPS_MAX_ROWS = 1000

export const ERROR_LOG_COLUMNS = 'id, context, message, level, url, stack, created_at'
/** Telling + laatst-gezien volstaan voor afvinken en tellen — `stack` is tot 8 kB/rij. */
export const ERROR_LOG_COLUMNS_LEAN = 'id, context, message, level, url, created_at'
const RESOLUTION_COLUMNS = 'signature, resolved_at, resolved_by, note, resolved_count, last_seen_at'

export interface ErrorGroupsWindow {
  groups: ErrorGroup[]
  /** Er staan méér rijen in de tabel dan het venster bevat. */
  truncated: boolean
}

/**
 * Haalt het leesvenster op en groepeert het.
 *
 * `truncated` komt uit een APARTE head-count, niet uit `rows.length >= MAX_ROWS`:
 * die vergelijking kan de PostgREST-cap niet overschrijden en zou dus nooit
 * kunnen zeggen dat er meer ís.
 */
export async function loadErrorGroups(
  supabase: SupabaseClient,
  columns: string = ERROR_LOG_COLUMNS,
): Promise<ErrorGroupsWindow | { error: unknown }> {
  const [logs, resolutions, total] = await Promise.all([
    supabase
      .from('error_logs')
      .select(columns)
      .order('created_at', { ascending: false })
      .limit(ERROR_GROUPS_MAX_ROWS),
    supabase.from('error_log_resolutions').select(RESOLUTION_COLUMNS),
    supabase.from('error_logs').select('id', { count: 'exact', head: true }),
  ])

  if (logs.error) return { error: logs.error }
  if (resolutions.error) return { error: resolutions.error }

  const rows = (logs.data ?? []) as unknown as ErrorLogRow[]
  return {
    groups: buildErrorGroups(rows, (resolutions.data ?? []) as ErrorResolutionRow[]),
    truncated: (total.count ?? rows.length) > rows.length,
  }
}
