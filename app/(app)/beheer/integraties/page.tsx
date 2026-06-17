import type { Metadata } from 'next'
import archData from '@/docs/architecture/architecture.json'
import { selectIntegrations } from '@/lib/architecture/facts'
import { buildIntegrationsModel } from '@/lib/architecture/integrations-model'
import { getServiceClient } from '@/lib/supabase/service'
import { IntegratiesShell } from './integraties-shell'

export const metadata: Metadata = { title: 'Integraties — Beheer' }
export const dynamic = 'force-dynamic'

type TableCounts = Record<string, { total: number; withError: number } | null>

// Tabellen waarvoor we platform-brede telemetrie tonen. Operator-telemetrie op
// een al-superadmin-gated pagina: alleen COUNT (head: true), nooit rij-payloads.
const COUNT_TABLES = [
  'exchange_connections',
  'broker_connections',
  'wallet_addresses',
  'bank_connections',
] as const

// Niet alle telemetrie-tabellen hebben een last_sync_error-kolom.
// Verificatie via migraties (supabase/migrations/):
//   exchange_connections  → 20260501000001: heeft last_sync_error ✓
//   wallet_addresses      → 20260501000001: heeft last_sync_error ✓
//   broker_connections    → 20260616010000: heeft last_sync_error ✓
//   bank_connections      → enkel ALTER TABLE in 20260408000001, geen last_sync_error ✗
//
// Voor tabellen zonder de kolom slaan we de error-count-query over (withError = 0).
const TABLES_WITH_SYNC_ERROR_COL = new Set([
  'exchange_connections',
  'broker_connections',
  'wallet_addresses',
])

async function loadTableCounts(): Promise<TableCounts> {
  const result: TableCounts = {}
  let supabase: ReturnType<typeof getServiceClient>
  try {
    supabase = getServiceClient()
  } catch {
    // service-role read mislukt (bv. ontbrekende env-var bij build) → alles null
    for (const table of COUNT_TABLES) result[table] = null
    return result
  }

  await Promise.all(
    COUNT_TABLES.map(async (table) => {
      try {
        const hasErrorCol = TABLES_WITH_SYNC_ERROR_COL.has(table)
        const [totalRes, errorRes] = await Promise.all([
          supabase.from(table).select('*', { count: 'exact', head: true }),
          // Alleen queriën als de kolom bestaat — anders geeft Supabase een 400
          hasErrorCol
            ? supabase
                .from(table)
                .select('*', { count: 'exact', head: true })
                .not('last_sync_error', 'is', null)
            : Promise.resolve({ count: 0, error: null }),
        ])
        if (totalRes.error) {
          result[table] = null
          return
        }
        result[table] = {
          total: totalRes.count ?? 0,
          withError: errorRes.error ? 0 : errorRes.count ?? 0,
        }
      } catch {
        result[table] = null
      }
    }),
  )

  return result
}

export default async function BeheerIntegratiesPage() {
  const facts = selectIntegrations(archData)
  const model = buildIntegrationsModel(facts)

  const tableCounts = await loadTableCounts()

  // job_runs is operator-telemetrie (superadmin-only SELECT policy via service-role);
  // de sessieclient werkt alleen als de RLS-policy dit toelaat, maar de service-client
  // is hier de veiligere en consistentere keuze — zelfde patroon als loadTableCounts().
  const serviceClient = getServiceClient()
  const { data: lastHealthRun } = await serviceClient
    .from('job_runs')
    .select('id, job, status, started_at, finished_at, duration_ms, summary, error, created_at')
    .eq('job', 'integraties-health')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--ink)]">Integraties</h1>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Externe koppelingen en bestandsimports — inventaris, liveness en contractbewaking.
          Feiten gescand, betekenis gecureerd, zelf-actualiserend.
        </p>
      </div>
      <IntegratiesShell model={model} tableCounts={tableCounts} lastHealthRun={lastHealthRun} />
    </div>
  )
}
