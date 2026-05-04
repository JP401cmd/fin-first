'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BudgetIcon } from '@/components/app/budget-shared'
import { MaskedAmount } from '@/components/app/masked-amount'
import {
  type Debt,
  type DebtType,
  DEBT_TYPE_LABELS,
  DEBT_TYPE_ICONS,
  DEBT_TYPE_COLORS,
} from '@/lib/debt-data'
import type { Asset } from '@/lib/asset-data'
import { OwnershipBadge } from '@/components/app/ownership-toggle'
import { usePerspective, usePerspectiveAbort } from '@/components/app/perspective-provider'
import { usePartnerPrivacy, PrivacyHiddenNotice } from '@/components/app/privacy-hidden-notice'

// Detail-modal flow blijft bestaan — registratie-overzicht is slechts de
// nieuwe schil. De volledige debt-detail/edit/revaluatie-pijplijn leeft nog
// steeds in dezelfde shared modal-componenten.
import type { Valuation } from '@/components/app/core/debts/debt-types'
import { DebtDetailModal } from '@/components/app/core/debts/debt-detail-modal'
import { DebtForm } from '@/components/app/core/debts/debt-form'
import { ValuationModal } from '@/components/app/core/debts/debt-valuation-modal'
import { QuickAddWizard } from '@/components/app/quick-add-wizard/quick-add-wizard'
import { EmptyState as QuickAddEmptyState } from '@/components/app/quick-add-wizard/empty-state'

// ── Types ───────────────────────────────────────────────────

type ModalStep = 'detail' | 'edit' | 'revalue'

// ── Component ───────────────────────────────────────────────

/**
 * `/core/debts` — registratie-overzicht van schulden.
 *
 * Dezelfde structuur als `/core/assets`: hero met totaal en aantal,
 * gegroepeerd per `debt_type` met klikbare type-headers die door-linken
 * naar `/core/debts/[type]`. Klikken op een individuele schuld opent het
 * bestaande detail-modal-patroon.
 *
 * Bewust géén aflossingsstrategie, freedom-time of Box 3-content meer in
 * dit overzicht — die noise is verhuisd naar dedicated pagina's. De Kern
 * is een registratie-fundament, niet een berekenings-tool.
 */
export default function DebtsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // De /core/debts/[type] pagina linkt detail-clicks via `?debt=<id>` terug
  // naar deze overzichtspagina. We respecteren die query-param en openen
  // direct het juiste modal — zo blijft de bestaande deep-link werkend.
  const initialDebtId = searchParams.get('debt') ?? undefined

  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [debts, setDebts] = useState<Debt[]>([])
  const [valuations, setValuations] = useState<Record<string, Valuation[]>>({})
  const [userAssets, setUserAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null)
  const [modalStep, setModalStep] = useState<ModalStep>('detail')

  const { perspective } = usePerspective()
  const perspectiveSignal = usePerspectiveAbort(perspective)
  const { hiddenCategories } = usePartnerPrivacy()

  // ── Data laden ─────────────────────────────────────────────

  const loadDebts = useCallback(async (signal?: AbortSignal) => {
    try {
      const supabase = createClient()
      let query = supabase
        .from('debts')
        .select('*')
      if (perspective === 'personal') {
        query = query.eq('ownership', 'personal')
      }
      const { data, error: fetchError } = await query.order('sort_order', { ascending: true })

      if (signal?.aborted) return
      if (fetchError) throw fetchError

      if (!data || data.length === 0) {
        setDebts([])
        setLoading(false)
        return
      }

      // Privacy-filter in household-modus (Feature #537) — partners die
      // hun schulden hebben verborgen blijven onzichtbaar voor de huidige
      // user-perspective.
      let filteredData = data as Debt[]
      if (perspective === 'household') {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (signal?.aborted) return
          if (user) {
            const ppRes = await fetch('/api/household/partner-privacy')
            if (ppRes.ok) {
              const ppData = await ppRes.json()
              if (ppData.partnerPrivacy?.debts === 'hidden') {
                filteredData = filteredData.filter(
                  d => d.user_id === user.id || d.ownership === 'shared'
                )
              }
            }
          }
        } catch { /* non-critical */ }
      }
      setDebts(filteredData)
    } catch (err) {
      console.error('Error loading debts:', err)
      if (!signal?.aborted) setError('Kon schulden niet laden. Probeer het opnieuw.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [perspective])

  const loadValuations = useCallback(async (debtId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('valuations')
      .select('*')
      .eq('entity_id', debtId)
      .eq('entity_type', 'debt')
      .order('valuation_date', { ascending: false })
      .limit(20)
    if (data) {
      setValuations((prev) => ({ ...prev, [debtId]: data as Valuation[] }))
    }
  }, [])

  const loadUserAssets = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('assets').select('id, name, asset_type').order('name')
    if (data) setUserAssets(data as Asset[])
  }, [])

  useEffect(() => {
    const signal = perspectiveSignal
    loadDebts(signal)
    loadUserAssets()
  }, [loadDebts, loadUserAssets, perspectiveSignal])

  // ── Detail-modal openen vanuit deep-link ───────────────────

  useEffect(() => {
    if (!initialDebtId || loading || debts.length === 0) return
    const found = debts.find(d => d.id === initialDebtId)
    if (found) {
      setSelectedDebt(found)
      setModalStep('detail')
      loadValuations(found.id)
    }
  }, [initialDebtId, loading, debts, loadValuations])

  // ── Acties ─────────────────────────────────────────────────

  function openDebtModal(debt: Debt) {
    setSelectedDebt(debt)
    setModalStep('detail')
    loadValuations(debt.id)
  }

  function closeDebtModal() {
    setSelectedDebt(null)
    setModalStep('detail')
    // Verwijder de `?debt=` query param zonder navigatie/page-reload zodat
    // browser-back niet onverwachts terug naar de modal-state springt.
    if (initialDebtId) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('debt')
      const qs = params.toString()
      router.replace(`/core/debts${qs ? `?${qs}` : ''}`, { scroll: false })
    }
  }

  async function deleteDebt(id: string) {
    const supabase = createClient()
    await supabase.from('debts').delete().eq('id', id)
    setDebts((prev) => prev.filter((d) => d.id !== id))
    closeDebtModal()
  }

  // ── Afgeleide waarden ──────────────────────────────────────

  const activeDebts = debts.filter((d) => d.is_active && Number(d.current_balance) > 0)
  const totalBalance = activeDebts.reduce((s, d) => s + Number(d.current_balance), 0)

  // Group by type — analoog aan `assets-client.tsx` (regel 250-261)
  const byType = (Object.keys(DEBT_TYPE_LABELS) as DebtType[]).reduce(
    (acc, type) => {
      const items = activeDebts.filter(d => d.debt_type === type)
      acc[type] = {
        debts: items,
        total: items.reduce((s, d) => s + Number(d.current_balance), 0),
      }
      return acc
    },
    {} as Record<DebtType, { debts: Debt[]; total: number }>,
  )

  // ── Rendering ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="rounded-[var(--r-lg)] border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button
            onClick={() => { setError(null); setLoading(true); loadDebts() }}
            className="mt-3 rounded-[var(--r)] bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Editorial header — blueprint Type 2 (List) */}
      <header className="mb-5 space-y-2">
        {/* Kicker met streep — debts in negative-rood voor semantische scheiding */}
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--negative)]">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--negative)' }}
          />
          Schulden · {activeDebts.length} item{activeDebts.length !== 1 ? 's' : ''}
        </div>
        {/* Headline met italic-em "vrijheid" */}
        <h1
          className="font-bold leading-tight tracking-[-0.02em] text-[28px] sm:text-[36px]"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          Vrijheid die je{' '}
          <em
            className="font-normal italic"
            style={{ color: 'var(--module-active-700)' }}
          >
            terugkoopt
          </em>
        </h1>
      </header>

      {/* ═══ Hero — pure registratie ═══════════════════════════ */}
      <section
        className="rounded-[var(--r-lg)] border border-kern-200 card-editorial p-4 sm:p-6"
        data-testid="debts-hero"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuickAddOpen(true)}
                aria-label="Schuld toevoegen"
                title="Schuld toevoegen"
                className="inline-flex min-h-[32px] items-center gap-1.5 border border-[var(--color-debt-200)] bg-[var(--color-debt-50)] px-2.5 py-1 text-xs font-medium text-[var(--color-debt-700)] transition-colors hover:bg-[var(--color-debt-100)] hover:text-[var(--color-debt-800)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-debt-500)]"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
                Schuld toevoegen
              </button>
            </div>
            <p
              className="mt-1 italic text-[12px] text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              {activeDebts.length} schuld{activeDebts.length !== 1 ? 'en' : ''} — vrijheid die je terugkoopt
            </p>
            {perspective === 'household' && hiddenCategories.includes('debts') && (
              <PrivacyHiddenNotice hiddenCategories={hiddenCategories} forCategories={['debts']} />
            )}
          </div>
        </div>

        <div className="mt-3 sm:mt-6 grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-[var(--ink-3)] uppercase">Totale schuld</p>
            <p className="mt-1 text-[var(--ink)]">
              <MaskedAmount value={totalBalance} tone="kern" className="text-xl font-bold" />
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--ink-3)] uppercase">Aantal</p>
            <p className="mt-1 text-xl font-bold text-[var(--ink)] tabular-nums">
              {activeDebts.length}
            </p>
          </div>
        </div>
      </section>

      {/* ═══ Lijst per debt-categorie ════════════════════════════ */}
      <section className="mt-3 sm:mt-6 space-y-1" data-testid="debt-list-section">
        {activeDebts.length === 0 && (
          <QuickAddEmptyState intent="debt" onAdd={() => setQuickAddOpen(true)} />
        )}

        {(Object.keys(DEBT_TYPE_LABELS) as DebtType[]).map((type) => {
          const group = byType[type]
          if (!group || group.debts.length === 0) return null

          const groupColor = DEBT_TYPE_COLORS[type]
          const groupIcon = DEBT_TYPE_ICONS[type] ?? 'CircleDot'

          return (
            <div key={type}>
              {/* Group header — klikbaar door naar /core/debts/[type] zodat
                  toekomstige verdiepings-tabs (bv. Aflossingsstrategie bij
                  mortgage) automatisch beschikbaar worden. */}
              <div className="flex items-center gap-2 pt-4 pb-1.5">
                <span style={{ color: groupColor }}>
                  <BudgetIcon name={groupIcon} className="h-4 w-4" />
                </span>
                <Link
                  href={`/core/debts/${type}`}
                  className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] hover:text-kern-600 transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kern-500"
                >
                  {DEBT_TYPE_LABELS[type]}
                </Link>
                <span className="text-[var(--ink-3)]">
                  <MaskedAmount value={group.total} tone="kern" className="text-xs" />
                </span>
              </div>

              {/* Debt cards — minimaal, klik opent detail-modal */}
              <div className="space-y-2">
                {group.debts.map((debt) => {
                  const balance = Number(debt.current_balance)
                  const original = Number(debt.original_amount)
                  const pct = original > 0 ? ((original - balance) / original) * 100 : 0

                  return (
                    <div
                      key={debt.id}
                      className="flex cursor-pointer items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-3 transition-colors hover:border-kern-200 hover:bg-kern-50/30"
                      onClick={() => openDebtModal(debt)}
                      data-testid={`debt-card-${debt.id}`}
                    >
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r)]"
                        style={{ backgroundColor: groupColor + '15' }}
                      >
                        <span style={{ color: groupColor }}>
                          <BudgetIcon name={groupIcon} className="h-4 w-4" />
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--ink)] flex items-center gap-1.5">
                          {debt.name}
                          <OwnershipBadge ownership={debt.ownership ?? 'personal'} />
                        </p>
                        <p className="truncate text-xs text-[var(--ink-3)]">
                          {DEBT_TYPE_LABELS[debt.debt_type]}
                          {debt.creditor ? ` • ${debt.creditor}` : ''}
                        </p>
                        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className="h-full rounded-full bg-kern-500 transition-all duration-500"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[var(--ink)]">
                          <MaskedAmount value={balance} tone="kern" className="text-sm font-semibold" />
                        </p>
                        <p className="text-[var(--ink-3)]">
                          van <MaskedAmount value={original} tone="kern" className="text-xs" />
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </section>

      {/* ═══ Modals — bestaand detail-modal patroon blijft ═══════ */}

      {selectedDebt && modalStep === 'detail' && (
        <DebtDetailModal
          debt={selectedDebt}
          valuations={valuations[selectedDebt.id]}
          userAssets={userAssets}
          dailyExpenses={0}
          onClose={closeDebtModal}
          onEdit={() => setModalStep('edit')}
          onRevalue={() => setModalStep('revalue')}
          onDelete={() => deleteDebt(selectedDebt.id)}
        />
      )}

      {selectedDebt && modalStep === 'edit' && (
        <DebtForm
          debt={selectedDebt}
          userAssets={userAssets}
          allDebts={debts}
          onClose={() => setModalStep('detail')}
          onSaved={() => {
            setModalStep('detail')
            loadDebts().then(() => {
              const supabase = createClient()
              supabase
                .from('debts')
                .select('*')
                .eq('id', selectedDebt.id)
                .single()
                .then(({ data }) => {
                  if (data) setSelectedDebt(data as Debt)
                })
            })
          }}
        />
      )}

      {selectedDebt && modalStep === 'revalue' && (
        <ValuationModal
          entityId={selectedDebt.id}
          entityType="debt"
          entityName={selectedDebt.name}
          currentValue={Number(selectedDebt.current_balance)}
          onClose={() => setModalStep('detail')}
          onSaved={() => {
            setModalStep('detail')
            loadDebts().then(() => {
              const supabase = createClient()
              supabase
                .from('debts')
                .select('*')
                .eq('id', selectedDebt.id)
                .single()
                .then(({ data }) => {
                  if (data) setSelectedDebt(data as Debt)
                })
            })
            loadValuations(selectedDebt.id)
          }}
        />
      )}

      <QuickAddWizard
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        initialIntent="debt"
        onSaved={() => router.refresh()}
      />
    </div>
  )
}
