import type { SupabaseClient } from '@supabase/supabase-js'
import type { Perspective } from '@/lib/household-data'
import { loadPlanStatus } from '@/lib/horizon/plan-status-loader'
import { PlanStatusSeed } from '@/components/app/plan-status-provider'

/**
 * Server-component die het plan-stoplicht nastreamt naar het menu. Hoort in de
 * app-layout binnen `<Suspense fallback={null}>` en binnen `PlanStatusProvider`:
 * de shell en de pagina renderen dan meteen, het punt naast "De toekomst" komt
 * erbij zodra de (gecachte) canonieke run klaar is. Een fout geeft `neutral` —
 * geen punt, geen kapotte shell.
 */
export async function PlanStatusSignal({
  supabase,
  perspective,
}: {
  supabase: SupabaseClient
  perspective: Perspective
}) {
  const status = await loadPlanStatus(supabase, perspective).catch(() => 'neutral' as const)
  return <PlanStatusSeed status={status} />
}
