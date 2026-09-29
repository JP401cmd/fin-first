import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import archData from '@/docs/architecture/architecture.json'
import { isSuperAdmin } from '@/lib/admin'
import { selectIntegrations } from '@/lib/architecture/facts'
import { buildIntegrationsModel } from '@/lib/architecture/integrations-model'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { KOPPELING_TABELLEN, loadKoppelingTellingen } from '@/lib/beheer/koppelingen-tellingen'
import { IntegratiesShell } from './integraties-shell'

export const metadata: Metadata = { title: 'Integraties — Beheer' }
export const dynamic = 'force-dynamic'

type TableCounts = Record<string, { total: number; withError: number } | null>

// De tellingen zelf (welke tabellen, welke een sync-fout-kolom hebben) wonen in
// lib/beheer/koppelingen-tellingen.ts, gedeeld met het beheerdashboard.
async function loadTableCounts(): Promise<TableCounts> {
  try {
    return await loadKoppelingTellingen(getServiceClient())
  } catch {
    // service-role read mislukt (bv. ontbrekende env-var bij build) → alles null
    const result: TableCounts = {}
    for (const table of KOPPELING_TABELLEN) result[table] = null
    return result
  }
}

export default async function BeheerIntegratiesPage() {
  // Dit scherm leest via de service-role (platformbrede tellingen en de laatste
  // bereikbaarheidsmeting). De layout weert niet-beheerders al, maar een
  // pagina die de service-role gebruikt, controleert de rol zelf (ADR 0006,
  // zelfde patroon als /beheer/jobs): de layout hoort niet het enige slot te zijn.
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) redirect('/overzicht')

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
