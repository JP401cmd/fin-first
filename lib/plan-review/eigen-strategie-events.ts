/**
 * De EIGEN beheerde strategie-gebeurtenissen (AOW, werk, pensioenpotten) voor de plan-review
 * (TPR-15 stap 3). Eén home voor de lezing die de voortgang, stap 3 en de inline editor delen.
 *
 * Waarom een eigen lezing: de SELECT-policy op `life_events` is huishoud-gedeeld
 * (`ownership = 'shared'`), en de horizon-bundel selecteert geen `user_id`. Een gedeeld
 * AOW-event van de partner zou dan `hasAowEvent` waar maken en in de wizard als "jouw AOW"
 * te bewerken lijken, terwijl de schrijfroute (`/api/life-events/strategie`) alleen eigen
 * rijen wijzigt. Daarom hier een expliciete `.eq('user_id', …)` en een expliciete
 * kolomlijst (datapad-conventie). De kernel-run zelf blijft de canonieke Tijdas-run.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { LifeEvent } from '@/lib/horizon-data'
import { STRATEGIE_EVENT_TYPES } from '@/lib/life-events/strategie-write'

export const STRATEGIE_EVENT_KOLOMMEN =
  'id, name, event_type, target_age, target_date, one_time_cost, monthly_cost_change, monthly_income_change, duration_months, icon, is_active, sort_order, is_indexed, metadata'

export async function loadEigenStrategieEvents(supabase: SupabaseClient, userId: string): Promise<LifeEvent[]> {
  const { data, error } = await supabase
    .from('life_events')
    .select(STRATEGIE_EVENT_KOLOMMEN)
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('event_type', [...STRATEGIE_EVENT_TYPES])
    .order('sort_order', { ascending: true })
    // Zelfde tiebreaker als de schrijfroute: bij een dubbele rij tonen en schrijven ze dezelfde.
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as LifeEvent[]
}
