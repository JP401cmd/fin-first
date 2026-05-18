import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadBudgetsData } from '@/lib/budgets-data-loader'
import BudgetsClient from '@/components/app/budgets-client'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { getAppSetupStatus } from '@/lib/app-setup-status'
import { AppSetupGate } from '@/components/app/app-setup/app-setup-gate'
import { CashflowViewSwitcher } from '@/components/overview/cashflow-view-switcher'
import { TransactiesFeed, type TransactionRow } from '@/components/app/transacties-feed'

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

  // Laad ~3 maanden recente transacties voor de Transacties-view.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let transactions: TransactionRow[] = []
  let monthLabel: string | undefined
  if (user) {
    const since = new Date()
    since.setMonth(since.getMonth() - 3)
    const { data: txs } = await supabase
      .from('transactions')
      .select('id, date, description, category, amount, accounts(name)')
      .eq('user_id', user.id)
      .gte('date', since.toISOString().split('T')[0])
      .order('date', { ascending: false })
      .limit(500)
    transactions = (txs ?? []).map((t) => {
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
          <TransactiesFeed transactions={transactions} monthLabel={monthLabel} />
        }
        vasteLastenView={
          <section className="rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-6 text-center">
            <p className="text-sm text-[var(--ink-2)]">
              Vaste lasten-analyse komt binnenkort hier — voor nu zie je je
              vaste kosten in Will.
            </p>
          </section>
        }
      />
    </>
  )
}
