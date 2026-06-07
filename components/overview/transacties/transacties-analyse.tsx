'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePerspective } from '@/components/app/perspective-provider'
import {
  resolvePeriodWindow,
  summarizeFlow,
  newCounterparties,
  counterpartyKey,
  type AnalysisTransaction,
  type PeriodKind,
} from '@/lib/transaction-insights'
import {
  loadPerspectiveTransactions,
  type PerspectiveItem,
} from '@/lib/household/perspective-loader'
import type { Perspective } from '@/lib/household-data'
import type { Budget } from '@/lib/budget-data'
import { TransactiesFeed } from '@/components/app/transacties-feed'
import { TransactionForm } from '@/components/app/transaction-form'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { CounterpartyAnalysisPanel } from '@/components/app/counterparty-analysis-panel'
import { PeriodeSelector } from './periode-selector'
import { GeldstroomGauge } from './geldstroom-gauge'
import { TopTegenpartijen } from './top-tegenpartijen'
import { GrootsteUitgaven } from './grootste-uitgaven'
import { NieuweTegenpartijen } from './nieuwe-tegenpartijen'
import { WeekdagPatroon } from './weekdag-patroon'
import { PeriodeTrend } from './periode-trend'

/**
 * TransactiesAnalyse — periode-gestuurde transactie-analyse op
 * /overzicht/cashflow/transacties.
 *
 * Client-component (zoals cash-account-view): haalt zélf de transacties op per
 * gekozen periode, zodat door de historie bladeren mogelijk is. Perspectief +
 * privacy lopen via de dual-use `loadPerspectiveTransactions` (de enige bron
 * van waarheid voor ownership/privacy). De pure rekenfuncties uit
 * `lib/transaction-insights` voeden alle inzichten.
 *
 * Fetcht het venster [prevSince, until] in één keer zodat de huidige én vorige
 * periode beschikbaar zijn (voor de trend), plus een lichte prior-query voor de
 * "nieuwe tegenpartijen". Klik op een transactie → bestaand TransactionForm;
 * klik op een tegenpartij → bestaande CounterpartyAnalysisPanel.
 */

type FullTransaction = {
  id: string
  account_id: string
  budget_id: string | null
  date: string
  amount: number
  description: string
  counterparty_name: string | null
  counterparty_iban: string | null
  is_income: boolean
  notes: string | null
  category_source: string
  is_split?: boolean
}

type BudgetGroup = { parent: Budget; children: Budget[] }

/** Aandeel (0-1) waarmee een item in dit perspectief telt — spiegelt cashflow-data-loader. */
function shareOf(item: PerspectiveItem, perspective: Perspective): number {
  if (item.ownership === 'shared' && perspective !== 'household') {
    return item._myShareFraction
  }
  return 1
}

function mapRow(
  item: PerspectiveItem,
  perspective: Perspective,
  budgetMap: Map<string, string>,
  accountMap: Map<string, string>,
): AnalysisTransaction | null {
  if (item._aggregated) return null // privacy-'totalen' → geen regel-detail
  const id = item.id != null ? String(item.id) : null
  if (!id) return null
  const budget_id = (item.budget_id as string | null) ?? null
  const account_id = (item.account_id as string | null) ?? null
  const frac = shareOf(item, perspective)
  return {
    id,
    date: String(item.date ?? ''),
    amount: Number(item.amount) * frac,
    description: String(item.description ?? ''),
    counterparty_name: (item.counterparty_name as string | null) ?? null,
    counterparty_iban: (item.counterparty_iban as string | null) ?? null,
    budget_id,
    category: budget_id ? budgetMap.get(budget_id) ?? null : null,
    account_id,
    account_name: account_id ? accountMap.get(account_id) ?? null : null,
    is_income: Boolean(item.is_income),
    transaction_type: (item.transaction_type as string | null) ?? null,
  }
}

function monthsBefore(iso: string, months: number): string {
  // Lokaal rekenen (geen UTC-round-trip) — consistent met transaction-insights.
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1 - months, d)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function TransactiesAnalyse() {
  const { perspective } = usePerspective()

  const [period, setPeriod] = useState<PeriodKind>('30d')
  const [offset, setOffset] = useState(0)

  const [rawTxns, setRawTxns] = useState<PerspectiveItem[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [accountMap, setAccountMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editTx, setEditTx] = useState<FullTransaction | null>(null)
  const [drillCp, setDrillCp] = useState<{ name: string; iban: string | null } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Venster voor de gekozen periode + kalender-offset.
  const periodWindow = useMemo(() => resolvePeriodWindow(period, offset, new Date()), [period, offset])

  // ── Data laden bij periode-/perspectief-wissel ──────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      const supabase = createClient()
      // Eén perspectief-correct venster: 12 maanden vóór de periode t/m het
      // periode-einde. Dekt de huidige periode (gauge/feed), de vorige periode
      // (trend) én de prior-historie (nieuwe-tegenpartij-detectie) in één keer,
      // zónder een losse RLS-query die het perspectief zou omzeilen.
      const fetchSince = monthsBefore(periodWindow.since, 12)
      try {
        const [txResult, budgetsResult, accountsResult] = await Promise.all([
          loadPerspectiveTransactions(supabase, perspective, {
            since: fetchSince,
            until: periodWindow.until,
          }),
          supabase.from('budgets').select('*').order('sort_order', { ascending: true }),
          supabase.from('bank_accounts').select('id, name'),
        ])
        if (cancelled) return

        const accMap = new Map<string, string>()
        for (const a of (accountsResult.data ?? []) as Array<{ id: string; name: string }>) {
          accMap.set(a.id, a.name)
        }

        setRawTxns(txResult.transactions)
        setBudgets((budgetsResult.data ?? []) as Budget[])
        setAccountMap(accMap)
        setHasLoadedOnce(true)
      } catch {
        if (!cancelled) setError('Kon transacties niet laden. Probeer het opnieuw.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [perspective, periodWindow.since, periodWindow.until, reloadKey])

  // ── Afgeleide data ──────────────────────────────────────────────────────
  const budgetMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of budgets) m.set(b.id, b.name)
    return m
  }, [budgets])

  const budgetGroups = useMemo<BudgetGroup[]>(() => {
    const parents = budgets.filter((b) => !b.parent_id && b.budget_type !== 'archive')
    const children = budgets.filter((b) => b.parent_id && b.budget_type !== 'archive')
    return parents.map((parent) => ({
      parent,
      children: children.filter((c) => c.parent_id === parent.id),
    }))
  }, [budgets])

  const allMapped = useMemo(
    () =>
      rawTxns
        .map((t) => mapRow(t, perspective, budgetMap, accountMap))
        .filter((t): t is AnalysisTransaction => t !== null),
    [rawTxns, perspective, budgetMap, accountMap],
  )

  // Tegenpartijen die vóór de periode al voorkwamen (zelfde perspectief-lens) —
  // voor "nieuwe tegenpartijen". Afgeleid uit hetzelfde gevenster i.p.v. een
  // losse RLS-query die het perspectief zou omzeilen.
  const priorKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const t of allMapped) {
      if (t.date < periodWindow.since) {
        const k = counterpartyKey(t.counterparty_name, t.counterparty_iban)
        if (k !== '__unknown__') keys.add(k)
      }
    }
    return keys
  }, [allMapped, periodWindow.since])

  // Deelt de partner enkel totalen (privacy='totals')? Dan levert de RPC één
  // aggregaatrij zonder regel-detail én zonder periode-window — die kunnen we
  // niet eerlijk in dit periodeoverzicht verrekenen. We melden het i.p.v. de
  // huishoud-cijfers stilzwijgend te onderrapporteren.
  const hasPartnerTotals = useMemo(
    () => perspective === 'household' && rawTxns.some((t) => t._aggregated === true),
    [perspective, rawTxns],
  )

  const currentTxns = useMemo(
    () => allMapped.filter((t) => t.date >= periodWindow.since && t.date <= periodWindow.until),
    [allMapped, periodWindow.since, periodWindow.until],
  )
  const prevTxns = useMemo(
    () => allMapped.filter((t) => t.date >= periodWindow.prevSince && t.date <= periodWindow.prevUntil),
    [allMapped, periodWindow.prevSince, periodWindow.prevUntil],
  )

  const currentSummary = useMemo(() => summarizeFlow(currentTxns), [currentTxns])
  const prevSummary = useMemo(() => summarizeFlow(prevTxns), [prevTxns])
  const newCps = useMemo(() => newCounterparties(currentTxns, priorKeys), [currentTxns, priorKeys])

  // Budget-opties voor de feed-filter: budgetten die in de periode voorkomen.
  const budgetOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const t of currentTxns) if (t.budget_id) ids.add(t.budget_id)
    return Array.from(ids)
      .map((id) => ({ id, name: budgetMap.get(id) ?? 'Onbekend' }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [currentTxns, budgetMap])

  // ── Handlers ─────────────────────────────────────────────────────────────
  const onPeriodChange = useCallback((p: PeriodKind) => {
    setPeriod(p)
    setOffset(0)
  }, [])
  const onOffsetChange = useCallback((delta: number) => {
    setOffset((o) => Math.min(0, o + delta))
  }, [])

  const openEdit = useCallback(async (tx: AnalysisTransaction) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('transactions')
      .select(
        'id, account_id, budget_id, date, amount, description, counterparty_name, counterparty_iban, is_income, notes, category_source, is_split',
      )
      .eq('id', tx.id)
      .single()
    if (data) setEditTx(data as FullTransaction)
  }, [])

  const refetch = useCallback(() => {
    setEditTx(null)
    setReloadKey((k) => k + 1) // her-trigger het laad-effect
  }, [])

  const initialLoading = loading && !hasLoadedOnce

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <Card>
        <PeriodeSelector
          period={period}
          offset={offset}
          label={periodWindow.label}
          canGoForward={offset < 0}
          onPeriodChange={onPeriodChange}
          onOffsetChange={onOffsetChange}
        />
      </Card>

      {error ? (
        <Card>
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      ) : initialLoading ? (
        <Card>
          <div className="flex items-center justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--ink-3)] border-t-transparent" />
          </div>
        </Card>
      ) : (
        <>
          <Card>
            {hasPartnerTotals && (
              <p className="mb-3 border-l-2 border-[var(--border-md)] pl-3 text-xs italic text-[var(--ink-3)]">
                Je partner deelt alleen totalen. Diens persoonlijke transacties tellen niet mee in
                dit periodeoverzicht.
              </p>
            )}
            <GeldstroomGauge summary={currentSummary} />
            {currentSummary.income === 0 && currentSummary.expense === 0 && (
              <p className="text-sm text-[var(--ink-3)]">Geen transacties in deze periode.</p>
            )}
          </Card>

          <div className="grid gap-5 sm:grid-cols-2">
            <Card>
              <PeriodeTrend current={currentSummary} previous={prevSummary} />
            </Card>
            <Card>
              <WeekdagPatroon transactions={currentTxns} />
            </Card>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Card>
              <TopTegenpartijen transactions={currentTxns} onSelect={setDrillCp} />
            </Card>
            <Card>
              <GrootsteUitgaven transactions={currentTxns} onSelect={openEdit} />
            </Card>
          </div>

          <Card>
            <NieuweTegenpartijen items={newCps} onSelect={setDrillCp} />
          </Card>

          <TransactiesFeed
            transactions={currentTxns}
            periodLabel={periodWindow.label}
            budgetOptions={budgetOptions}
            onSelect={openEdit}
          />

          <p className="text-[11px] italic text-[var(--ink-3)]">
            Op zoek naar de vooruitblik?{' '}
            <Link
              href="/overzicht/cashflow/forecast"
              className="inline-flex items-center gap-0.5 not-italic font-medium text-[var(--ink-2)] underline hover:text-[var(--ink)]"
            >
              Cashflow-prognose <ArrowRight className="h-3 w-3" />
            </Link>
          </p>
        </>
      )}

      {/* Bewerk-paneel (eigen bottom-sheet in TransactionForm) */}
      {editTx && (
        <TransactionForm
          transaction={editTx}
          accountId={editTx.account_id ?? ''}
          budgetGroups={budgetGroups}
          onClose={() => setEditTx(null)}
          onSaved={refetch}
        />
      )}

      {/* Tegenpartij-analyse */}
      {drillCp && (
        <BottomSheet open onClose={() => setDrillCp(null)} title={drillCp.name} size="lg">
          <CounterpartyAnalysisPanel
            counterpartyName={drillCp.name}
            counterpartyIban={drillCp.iban}
            budgetGroups={budgetGroups}
            onBack={() => setDrillCp(null)}
          />
        </BottomSheet>
      )}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
      {children}
    </section>
  )
}
