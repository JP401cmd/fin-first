import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { computeFreedomTotal } from '@/lib/briefing/overview-briefing'
import { touchLastSeen } from '@/lib/briefing/snapshot'
import type { Perspective } from '@/lib/household-data'
import { credibleMonthlyBasis } from '@/lib/format'
import { buildSindsVorigBezoek } from '@/lib/overview/sinds-vorig-bezoek'
import { SindsVorigBezoek } from './sinds-vorig-bezoek'

/**
 * SindsVorigBezoekLoader — server-child achter een eigen `<Suspense>` in blok 1
 * van /overzicht, direct onder de begroeting (H11).
 *
 * DEDUP: `loadDashboardData` is React-`cache()`-wrapped en wordt in hetzelfde
 * request al door `OverzichtSecondaryLoader`, `OverzichtNetWorthChartLoader` en
 * de page-status-seed aangeroepen → deze cel voegt GEEN query's toe, ze deelt de
 * bestaande query-set. Alleen de maanduitgaven komen hiervandaan; het netto
 * vermogen komt (perspectief-correct) als prop uit blok 1 mee.
 *
 * CONSUME, DON'T RECOMPUTE: het vrijheidstotaal loopt via `computeFreedomTotal`
 * — dezelfde canonieke dagbasis (jaaruitgaven/365) als de briefing-hero, de
 * kassabon en de snapshot. Hier wordt niets eigen uitgerekend.
 *
 * ALLEEN IN EIGEN WEERGAVE. In huishoud-/partnerperspectief schrijft /overzicht
 * bewust geen persoonlijke snapshot weg (zie `OverzichtSecondaryLoader`); een
 * bezoekmarker uit een ander perspectief zou de delta tegen een niet-bestaande
 * basis afzetten. Daar rendert deze cel dus niets.
 *
 * WRITE: `touchLastSeen` doet hoogstens één `.update()` per kalenderdag per
 * gebruiker (own-row jsonb, anon-RLS-client — geen service-role, geen migratie).
 * Dat is bewust geen write-per-pageview: de marker verschuift alleen bij een
 * dag-overgang.
 */
export async function SindsVorigBezoekLoader({
  supabase,
  perspective,
  userId,
  currentNetWorth,
}: {
  supabase: SupabaseClient
  perspective: Perspective
  userId: string | null
  /** Netto vermogen uit blok 1 (perspectief-correct) — teller van de vrijheidstijd. */
  currentNetWorth: number
}) {
  if (!userId || perspective !== 'personal') return null

  const { dashboardData } = await loadDashboardData(supabase)
  // Zelfde voorkeursvolgorde als de briefing-hero, met dezelfde
  // geloofwaardigheidsvloer (UR2-03): een rolling venster met één transactie van
  // €1 mag de effectieve maandbasis niet verdringen. Blijft er niets over, dan
  // levert `computeFreedomTotal` een oneindig totaal en toont deze regel niets.
  const monthlyExpenses =
    credibleMonthlyBasis(dashboardData.recentMonthlyExpenses) ||
    credibleMonthlyBasis(dashboardData.monthlyExpenses)
  const freedomTotal = computeFreedomTotal(currentNetWorth, monthlyExpenses)

  const { previous } = await touchLastSeen(supabase, userId, {
    totalFreedomDays: freedomTotal.totalFreedomDays,
  })

  return <SindsVorigBezoek view={buildSindsVorigBezoek(freedomTotal, previous)} />
}
