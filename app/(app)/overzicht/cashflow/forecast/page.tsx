import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { loadCashflowData } from '@/lib/cashflow-data-loader'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { CashflowSection } from '@/components/will/cashflow-section'
import { CashflowForecast } from '@/components/overview/cashflow-forecast'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PageStatusDot } from '@/components/app/page-status-dot'
import { PAGE_INFO } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Forecast — TriFinity',
  description: 'Spaarquote, maandelijks netto, uitgaventrend en 6-maands-vooruitblik.',
}

/**
 * /overzicht/cashflow/forecast — losse Forecast-pagina (was de "Forecast"-tab).
 * Toont eerst de cashflow-samenvatting (spaarquote 6m, maandelijks netto,
 * uitgaventrend — verhuisd vanaf de cashflow-landing) en daaronder de
 * 6-maands-projectietabel.
 */
export default async function OverzichtCashflowForecastPage() {
  const supabase = await createClient()
  const perspective = await getServerPerspective()
  const [dashboardResult, cashflow] = await Promise.all([
    loadDashboardData(supabase),
    loadCashflowData(supabase, perspective),
  ])
  const { dashboardData } = dashboardResult

  return (
    <>
      <NavStackMeta title="Forecast" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <PageStatusDot className="absolute right-[52px] top-4 sm:right-[60px]" />
        <PageInfoButton
          description={PAGE_INFO['/overzicht/cashflow/forecast'] ?? ''}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>
      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-4 sm:px-6">
        <CashflowSection data={dashboardData} />
        <CashflowForecast
          recurrings={cashflow.recurrings}
          baselineIncome={cashflow.baselineIncome}
          baselineExpenses={cashflow.baselineExpenses}
          startingBalance={cashflow.startingBalance}
        />
      </div>
    </>
  )
}
