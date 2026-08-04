import { createClient } from '@/lib/supabase/server'
import { loadCashBankLinks } from '@/lib/bank-link-loader'
import { CashOverviewLazy } from './cashflow-below-fold'

/**
 * CashOverviewLoader — async server-child achter een EIGEN `<Suspense>` op
 * /overzicht/cashflow (perf Task 2.2, stap 4).
 *
 * `loadCashBankLinks` voedt uitsluitend `CashOverview`, en dat blok is
 * `ssr:false` (zie cashflow-below-fold.tsx) én staat onder de vouw. Er is dus
 * niets dat op deze query hoeft te wachten: hij stond in de vijf-loader-
 * `Promise.all` van de pagina en hield daarmee de héle pagina — inclusief de
 * titel — tegen.
 *
 * Eigen boundary, niet meeliften op het kaartenblok: de kaarten staan boven de
 * vouw en mogen niet wachten op een load die alleen onder de vouw telt.
 *
 * De Suspense-fallback is dezelfde `CashOverviewSkeleton` die `next/dynamic`
 * daarna als chunk-loading-state toont — de overgang server→client is daardoor
 * visueel naadloos en kost geen extra layout-shift.
 */
export async function CashOverviewLoader() {
  // `createClient()` is React-`cache()`-gewrapt → dezelfde instantie als elders
  // in deze render; page.tsx houdt zo nul zware awaits boven zijn return.
  const supabase = await createClient()
  const bankLinks = await loadCashBankLinks(supabase)

  return <CashOverviewLazy embedded showAllCashAccounts showMonthLinks bankLinks={bankLinks} />
}
