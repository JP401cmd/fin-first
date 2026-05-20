import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import DebtsPage from '../../core/debts/page'
import { SchuldenFilter } from '@/components/overview/schulden-filter'
import {
  SchuldenOverzichtStrip,
  type DebtForStrip,
} from '@/components/overview/schulden-overzicht-strip'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PAGE_INFO } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Schulden — TriFinity',
  description: 'Hypotheek, leningen en studieschuld — de hefboom schulden.',
}

/**
 * /overzicht/schulden — tweede hefboom-verdieping.
 *
 * Layout:
 *  1. SchuldenOverzichtStrip — 4 groep-tegels (hypotheek/leningen/
 *     studie/overig) met bedrag + percentage
 *  2. SchuldenFilter — dropdown naar debt-type sub-routes
 *  3. DebtsPage — bestaande detail-rendering uit /core/debts
 */
export default async function OverzichtSchuldenPage() {
  const supabase = await createClient()
  const { data: debtsRaw } = await supabase
    .from('debts')
    .select('debt_type, current_balance')
    .eq('is_active', true)
  const debts: DebtForStrip[] = (debtsRaw ?? []).map((d) => ({
    debt_type: d.debt_type,
    current_balance: Number(d.current_balance ?? 0),
  }))

  return (
    <>
      <NavStackMeta title="Schulden" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <PageInfoButton
          description={PAGE_INFO['/overzicht/schulden'] ?? ''}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>
      <SchuldenOverzichtStrip debts={debts} />
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <SchuldenFilter />
      </div>
      <DebtsPage />
    </>
  )
}
