import type { SupabaseClient } from '@supabase/supabase-js'
import { isSuperAdmin } from './admin'
import type { BeheerInboxKey } from './beheer-sections'
import { summarizeErrorGroups } from './error-groups'
import { ERROR_LOG_COLUMNS_LEAN, loadErrorGroups } from './error-groups-loader'

/**
 * Werkvoorraad-tellers voor de inbakken op de `/beheer`-hub.
 *
 * Server-loader (datapad-conventie ADR 0058): de hub-page haalt de tellers
 * hier op en geeft ze als props door — geen client-fetch, geen API-route.
 *
 * Contract "klopt of ontbreekt eerlijk": elke teller is `number | null`.
 * `null` = de bron was niet bereikbaar (query-fout, geen rechten, exception)
 * en de hub toont dan géén badge — nooit een nep-0 die "alles afgehandeld"
 * suggereert terwijl er niets geteld is. Een echte 0 blijft een 0.
 *
 * Toegang — twee sloten, zoals `/api/admin/error-groups`: (1) `isSuperAdmin()`
 * hier, (2) RLS op de bronnen (`is_superadmin()`-select); bewust géén
 * service-role. Zonder slot 1 komen alle tellers als `null` terug.
 *
 * Telbare bronnen (werkvoorraad-notie aanwezig):
 *  - errors: open foutsóórten uit hetzelfde leesvenster als `/beheer/errors`
 *    (`lib/error-groups-loader.ts`), dus hub en pagina tonen hetzelfde getal;
 *  - feedback: `feedback.status = 'new'`;
 *  - calculator_reports: `calculator_reports.status = 'open'`.
 * Bewust NIET geteld: news_feedback (alleen-lezen, ADR 0113), job_runs (geen
 * afvink-notie), vragenlijsten (geen status).
 */
export type BeheerInboxCounts = Record<BeheerInboxKey, number | null>

export const EMPTY_BEHEER_INBOX_COUNTS: BeheerInboxCounts = {
  errors: null,
  feedback: null,
  calculator_reports: null,
}

/** Exacte head-count op één statuswaarde; `null` bij elke fout. */
async function countByStatus(
  supabase: SupabaseClient,
  table: 'feedback' | 'calculator_reports',
  status: string,
): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('status', status)
    if (error || count == null) return null
    return count
  } catch {
    return null
  }
}

async function countOpenErrorGroups(supabase: SupabaseClient): Promise<number | null> {
  try {
    const loaded = await loadErrorGroups(supabase, ERROR_LOG_COLUMNS_LEAN)
    if ('error' in loaded) return null
    return summarizeErrorGroups(loaded.groups).openGroups
  } catch {
    return null
  }
}

export async function loadBeheerInboxCounts(supabase: SupabaseClient): Promise<BeheerInboxCounts> {
  let admin = false
  try {
    admin = await isSuperAdmin(supabase)
  } catch {
    admin = false
  }
  if (!admin) return { ...EMPTY_BEHEER_INBOX_COUNTS }

  const [errors, feedback, calculator_reports] = await Promise.all([
    countOpenErrorGroups(supabase),
    countByStatus(supabase, 'feedback', 'new'),
    countByStatus(supabase, 'calculator_reports', 'open'),
  ])

  return { errors, feedback, calculator_reports }
}
