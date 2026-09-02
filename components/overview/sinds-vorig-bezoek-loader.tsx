import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { touchLastSeen } from '@/lib/briefing/snapshot'
import type { Perspective } from '@/lib/household-data'
import { credibleDailyExpense } from '@/lib/format'
import { buildSindsVorigBezoek } from '@/lib/overview/sinds-vorig-bezoek'
import { SindsVorigBezoek } from './sinds-vorig-bezoek'

/**
 * SindsVorigBezoekLoader — server-child achter een eigen `<Suspense>` in blok 1
 * van /overzicht, direct onder de begroeting (H11).
 *
 * DEDUP: `loadDashboardData` is React-`cache()`-wrapped en wordt in hetzelfde
 * request al door `OverzichtSecondaryLoader`, `OverzichtNetWorthChartLoader` en
 * de page-status-seed aangeroepen → deze cel voegt GEEN query's toe, ze deelt de
 * bestaande query-set. Alleen het dagtarief komt hiervandaan; het netto vermogen
 * komt (perspectief-correct) als prop uit blok 1 mee.
 *
 * MARGINAAL, NIET TOTAAL (ADR 0126 D1 + PR C). Deze regel is een DELTA en rekent
 * daarom met het canonieke dagtarief uit de bundel — niet met de runway die de
 * kop van deze pagina toont. De bezoekmarker bewaart het netto vermogen (zie
 * `touchLastSeen`); het omrekenen naar dagen gebeurt met het tarief van vandaag,
 * op één plek (`buildSindsVorigBezoek`).
 *
 * CONSUME, DON'T RECOMPUTE: `dashboardData.dailyExpenseRate` is het app-brede
 * 12-mnd rolling tarief op gezuiverde consumptie (ADR 0126 D2) — hier wordt geen
 * eigen dagbasis gemaakt, alleen de geloofwaardigheidsvloer toegepast.
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
  // Geloofwaardigheidsvloer (UR2-03/ADR 0126 D2b): één losse transactie van €1 in
  // het rolling venster gaf ooit €0,03/dag en daarmee absurde dagentellingen.
  // Onder de vloer is er geen wisselkoers €→tijd en zwijgt deze regel.
  const dailyExpense = credibleDailyExpense(dashboardData.dailyExpenseRate)

  // De marker bewaart het VERMOGENSPEIL, niet een dagenaantal (ADR 0126 PR C):
  // zo wordt de delta altijd tegen één tarief — dat van vandaag — omgerekend.
  const { previous } = await touchLastSeen(supabase, userId, {
    netWorth: currentNetWorth,
  })

  return (
    <SindsVorigBezoek
      view={buildSindsVorigBezoek({ netWorth: currentNetWorth }, previous, dailyExpense)}
    />
  )
}
