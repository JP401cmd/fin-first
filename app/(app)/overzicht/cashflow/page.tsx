import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadBudgetsData } from '@/lib/budgets-data-loader'
import BudgetsClient from '@/components/app/budgets-client'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { getAppSetupStatus } from '@/lib/app-setup-status'
import { AppSetupGate } from '@/components/app/app-setup/app-setup-gate'
import { CashflowViewSwitcher } from '@/components/overview/cashflow-view-switcher'
import { TransactiesFeed, type TransactionRow } from '@/components/app/transacties-feed'
import { TransactiesGeldstroom } from '@/components/overview/transacties-geldstroom'
import { VasteLastenLoader } from '@/components/overview/vaste-lasten-loader'
import { CashflowKalender } from '@/components/overview/cashflow-kalender'
import type { RecurringTransaction } from '@/lib/recurring-data'

export const metadata: Metadata = {
  title: 'Cashflow — TriFinity',
  description: 'Budget, transacties en vaste lasten — de hefboom cashflow.',
}

/**
 * /overzicht/cashflow — derde hefboom-verdieping. Drie views via
 * CashflowViewSwitcher: Budget (default), Transacties, Vaste lasten.
 * View-state via `?view=`-URL-param. Bookmarkable.
 *
 * Toekomst:
 *  - Vaste-lasten view echt vullen (nu placeholder met "binnenkort"-CTA)
 *  - VasteKostenAnalyse component hergebruiken zodra recurring-data loader
 */
export default async function OverzichtCashflowPage() {
  const supabase = await createClient()

  // Setup-gate: nieuwe gebruikers zonder budgetten zien een eenvoudige
  // intro-pagina. Bestaande gebruikers met budgetten worden direct doorgelaten.
  const setupStatus = await getAppSetupStatus(supabase, ['budgetteren'])
  if (!setupStatus.budgetteren) {
    return (
      <>
        <NavStackMeta title="Cashflow" bottomBar={{ kind: 'tabs' }} />
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <AppSetupGate appKey="budgetteren" />
        </div>
      </>
    )
  }

  const data = await loadBudgetsData(supabase)

  // Laad recente transacties + vaste lasten parallel voor de twee
  // niet-budget views. Beide queries draaien naast loadBudgetsData.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let transactions: TransactionRow[] = []
  let monthLabel: string | undefined
  let fullName: string | null = null
  let recurrings: RecurringTransaction[] = []
  if (user) {
    const since = new Date()
    since.setMonth(since.getMonth() - 3)
    const [txResult, profileResult, recurResult] = await Promise.all([
      supabase
        .from('transactions')
        .select('id, date, description, category, amount, accounts(name)')
        .eq('user_id', user.id)
        .gte('date', since.toISOString().split('T')[0])
        .order('date', { ascending: false })
        .limit(500),
      supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
      supabase
        .from('recurring_transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true),
    ])
    recurrings = (recurResult.data ?? []) as RecurringTransaction[]
    transactions = (txResult.data ?? []).map((t) => {
      const accountField = (t as { accounts?: { name?: string } | { name?: string }[] | null }).accounts
      const accountName = Array.isArray(accountField)
        ? accountField[0]?.name
        : accountField?.name
      return {
        id: String(t.id),
        date: String(t.date),
        description: String(t.description ?? ''),
        category: (t as { category?: string | null }).category ?? null,
        amount: Number(t.amount),
        account_name: accountName ?? null,
      }
    })
    fullName = (profileResult.data as { full_name?: string | null } | null)?.full_name ?? null
    monthLabel = new Intl.DateTimeFormat('nl-NL', {
      month: 'long',
      year: 'numeric',
    }).format(new Date())
  }

  return (
    <>
      <NavStackMeta title="Cashflow" bottomBar={{ kind: 'tabs' }} />
      <CashflowViewSwitcher
        budgetView={<BudgetsClient initialData={data} />}
        transactiesView={
          <>
            <TransactiesGeldstroom transactions={transactions} monthLabel={monthLabel} />
            <TransactiesFeed transactions={transactions} monthLabel={monthLabel} />
          </>
        }
        vasteLastenView={<VasteLastenLoader fullName={fullName} />}
        kalenderView={<CashflowKalender recurrings={recurrings} />}
      />
    </>
  )
}
