'use client'

/**
 * Fase 1.2 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §5.1 (pane) + §5.2 (sheet)
 * DebtDetailModal → pane; DebtForm + ValuationModal → sheet (via ShellOverlay).
 *
 * Deze modal is volledige debt-context (saldo, type, splits, herwaarder-knop,
 * acties) — past in §5.1 als pane: gebruiker "gaat ergens naartoe".
 * Op desktop (≥lg) glijdt deze van rechts in als SlideInPane; op mobile valt
 * ShellOverlay terug op een full-height BottomSheet (tot Fase 0.5 stack-push).
 *
 * Werkt onafhankelijk van de feature-flag — bij flag UIT zien gebruikers
 * dezelfde behaviour, alleen via één centrale wrapper.
 */

import { useState, useEffect } from 'react'
import { Edit3, RefreshCw, Trash2, AlertTriangle, Users, Scale } from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { BudgetIcon, formatCurrency } from '@/components/app/budget-shared'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import {
  type Debt,
  DEBT_TYPE_LABELS,
  DEBT_TYPE_ICONS,
  DEBT_SUBTYPE_LABELS,
  REPAYMENT_TYPE_LABELS,
  debtProjection,
  computeRenteAflossingsSplit,
} from '@/lib/debt-data'
import type { Asset } from '@/lib/asset-data'
import { computeSharePct, SPLIT_MODE_LABELS, type SplitMode } from '@/lib/household-data'
import { createClient } from '@/lib/supabase/client'
import { usePerspective } from '@/components/app/perspective-provider'
import type { Valuation } from './debt-types'
import { DebtTrajectoryChart } from './debt-trajectory-chart'
import HypotheekVsBeleggenModal from './hypotheek-vs-beleggen-modal'
import { MaskedAmount } from '@/components/app/masked-amount'
import { ChartTips } from '@/components/editorial/chart-tips'
import { getDebtTrajectoryTips } from '@/lib/chart-tips'

export function DebtDetailModal({
  debt,
  valuations,
  userAssets,
  dailyExpenses,
  onClose,
  onEdit,
  onRevalue,
  onDelete,
  embedded = false,
}: {
  debt: Debt
  valuations: Valuation[] | undefined
  userAssets: Asset[]
  dailyExpenses: number
  onClose: () => void
  onEdit: () => void
  onRevalue: () => void
  onDelete: () => void
  /**
   * Wanneer true rendert deze component alleen de body (geen interne
   * `<ShellOverlay kind="pane">` wrapper, geen interne actie-rij). De
   * pane-wrapper levert de overlay en footer-knoppen via `<ShellOverlay>`
   * met `primaryAction`/`secondaryAction`. Default false zodat bestaande
   * call-sites (bv. `/core/debts`) ongewijzigd blijven.
   */
  embedded?: boolean
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showHvB, setShowHvB] = useState(false)
  const { perspective } = usePerspective()
  const [partnerSplit, setPartnerSplit] = useState<{
    splitMode: SplitMode; mySharePct: number; myName: string; partnerName: string
  } | null>(null)

  // Load partner split for shared debts
  useEffect(() => {
    if (debt.ownership !== 'shared') { setPartnerSplit(null); return }
    async function loadSplit() {
      try {
        const [statusRes, settingsRes] = await Promise.all([
          fetch('/api/household/status'),
          fetch('/api/household/settings'),
        ])
        if (!statusRes.ok || !settingsRes.ok) return
        const status = await statusRes.json()
        const settings = await settingsRes.json()
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        // Use per-debt override if set, otherwise use household default
        let mySharePct: number
        let splitMode: SplitMode
        if (debt.partner_split_pct != null) {
          mySharePct = debt.partner_split_pct
          splitMode = 'custom'
        } else {
          splitMode = settings.split_mode || 'equal'
          mySharePct = computeSharePct(
            { splitMode, customSplitPct: settings.custom_split_pct ?? null, primaryPayerId: settings.primary_payer_id ?? null },
            user?.id ?? '',
          )
        }

        const myMember = (status.members ?? []).find((m: { is_current_user: boolean }) => m.is_current_user)
        const partnerMember = (status.members ?? []).find((m: { is_current_user: boolean }) => !m.is_current_user)
        setPartnerSplit({
          splitMode,
          mySharePct,
          myName: myMember?.full_name || 'Jij',
          partnerName: partnerMember?.full_name || 'Partner',
        })
      } catch {
        // Non-critical
      }
    }
    loadSplit()
  }, [debt.ownership, debt.partner_split_pct])

  const balance = Number(debt.current_balance)
  const original = Number(debt.original_amount)
  const pct = original > 0 ? ((original - balance) / original) * 100 : 0
  const proj = debtProjection(debt)
  const split = computeRenteAflossingsSplit(debt)
  const icon = DEBT_TYPE_ICONS[debt.debt_type] ?? 'CircleDot'
  const linkedAsset = debt.linked_asset_id ? userAssets.find((a) => a.id === debt.linked_asset_id) : null

  // Body — gedeeld tussen standalone (eigen `<ShellOverlay kind="pane">`)
  // en embedded (pane-wrapper levert de overlay + footer-knoppen).
  const body = (
    <>
        {/* Subheader with icon and type info */}
        <div className="flex items-center gap-3 border-b border-[var(--border-ed)] px-6 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] bg-kern-50">
            <BudgetIcon name={icon} className="h-5 w-5 text-kern-600" />
          </div>
          <p className="text-xs text-[var(--ink-3)]">
            {DEBT_TYPE_LABELS[debt.debt_type]}
            {debt.subtype && DEBT_SUBTYPE_LABELS[debt.debt_type]?.[debt.subtype]
              ? ` \u2022 ${DEBT_SUBTYPE_LABELS[debt.debt_type]![debt.subtype]}`
              : ''}
            {debt.creditor ? ` \u2022 ${debt.creditor}` : ''}
          </p>
        </div>

        {/* Balance highlight — editorial blueprint met HighlightMark */}
        <div className="border-b border-[var(--border-ed)] px-6 py-5 text-center">
          <div className="mb-2 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--negative,#dc2626)]">
            <span
              aria-hidden
              className="inline-block w-5 h-px"
              style={{ background: 'var(--negative, #dc2626)' }}
            />
            Restschuld
          </div>
          <p
            className="text-[32px] sm:text-[40px] font-black leading-none tracking-[-0.02em] tabular-nums"
            style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', color: 'var(--negative, #dc2626)' }}
            data-testid="modal-debt-balance"
          >
            <span
              className="inline px-1"
              style={{
                backgroundImage:
                  'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
              }}
            >
              {<MaskedAmount value={balance} tone="kern" />}
            </span>
          </p>
          {dailyExpenses > 0 && balance >= 100 && (
            <p
              className="mt-1.5 italic text-[12px] text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              data-testid="modal-debt-freedom-time"
            >
              je koopt deze tijd terug in {formatFreedomTimeString(calculateFreedomTime(balance, dailyExpenses), 'long')}
            </p>
          )}
          <p
            className="mt-1 italic text-[12px] text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            van {<MaskedAmount value={original} tone="kern" />} ({pct.toFixed(1)}% afgelost)
          </p>
          <div className="mx-auto mt-2 h-2 w-48 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-kern-500 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          {/* Badges */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
            {debt.repayment_type && (
              <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-[var(--ink-2)]">
                {REPAYMENT_TYPE_LABELS[debt.repayment_type]}
              </span>
            )}
            {debt.nhg && (
              <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">NHG</span>
            )}
            {debt.is_tax_deductible && (
              <span className="inline-block rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">Renteaftrek</span>
            )}
          </div>
        </div>

        {/* Per-partner split breakdown for shared debts */}
        {partnerSplit && (
          <div className="border-b border-[var(--border-ed)] px-6 py-3" data-testid="debt-partner-breakdown">
            <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Users className="h-3.5 w-3.5 text-kern-500" />
                <p className="text-xs font-semibold text-[var(--ink-2)]">Verdeling per partner</p>
                <span className="ml-auto text-[10px] text-[var(--ink-4)]">
                  {debt.partner_split_pct != null ? 'Eigen verdeling' : SPLIT_MODE_LABELS[partnerSplit.splitMode]}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div>
                  <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase truncate">{partnerSplit.myName}</p>
                  <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                    {<MaskedAmount value={balance * partnerSplit.mySharePct / 100} tone="kern" />}
                  </p>
                  {dailyExpenses > 0 && balance * partnerSplit.mySharePct / 100 >= 100 && (
                    <p className="text-[10px] text-kern-600/70">
                      {formatFreedomTimeString(calculateFreedomTime(balance * partnerSplit.mySharePct / 100, dailyExpenses), 'short')} terug te winnen
                    </p>
                  )}
                  <p className="text-[9px] text-[var(--ink-4)]">{partnerSplit.mySharePct}%</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase truncate">{partnerSplit.partnerName}</p>
                  <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                    {<MaskedAmount value={balance * (100 - partnerSplit.mySharePct) / 100} tone="kern" />}
                  </p>
                  {dailyExpenses > 0 && balance * (100 - partnerSplit.mySharePct) / 100 >= 100 && (
                    <p className="text-[10px] text-kern-600/70">
                      {formatFreedomTimeString(calculateFreedomTime(balance * (100 - partnerSplit.mySharePct) / 100, dailyExpenses), 'short')} terug te winnen
                    </p>
                  )}
                  <p className="text-[9px] text-[var(--ink-4)]">{100 - partnerSplit.mySharePct}%</p>
                </div>
              </div>
              {/* Monthly payment split */}
              {Number(debt.monthly_payment) > 0 && (
                <div className="mt-2 pt-2 border-t border-[var(--border-ed)]">
                  <p className="text-[10px] font-medium text-[var(--ink-3)] mb-1">Maandlast verdeling</p>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div>
                      <p className="font-mono text-xs font-semibold tabular-nums text-[var(--ink)]">
                        {<MaskedAmount value={Number(debt.monthly_payment) * partnerSplit.mySharePct / 100} tone="kern" />}
                      </p>
                      <p className="text-[9px] text-[var(--ink-4)]">p/m</p>
                    </div>
                    <div>
                      <p className="font-mono text-xs font-semibold tabular-nums text-[var(--ink)]">
                        {<MaskedAmount value={Number(debt.monthly_payment) * (100 - partnerSplit.mySharePct) / 100} tone="kern" />}
                      </p>
                      <p className="text-[9px] text-[var(--ink-4)]">p/m</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Details grid */}
        <div className="space-y-4 px-6 py-4">
          {/* Payoff timeline highlight */}
          {debt.repayment_type !== 'aflossingsvrij' && proj.isPayable && proj.monthsToPayoff > 0 && (
            <div className="rounded-[var(--r-lg)] border border-kern-200 bg-kern-50 p-3 text-center" data-testid="payoff-timeline">
              <p className="text-xs font-medium text-kern-700/60 uppercase">Aflostijd</p>
              <p className="mt-1 text-2xl font-bold text-kern-700" data-testid="months-to-payoff">
                {proj.monthsToPayoff} maanden
              </p>
              <p className="mt-0.5 text-xs text-kern-600" data-testid="payoff-freedom-message">
                {proj.payoffDate
                  ? `Schuldenvrij in ${new Date(proj.payoffDate).getFullYear()} — dan verdien je 100% voor jezelf`
                  : ''}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[var(--r)] bg-[var(--subtle)] p-3">
              <p className="text-xs text-[var(--ink-3)]">Rente</p>
              <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">{Number(debt.interest_rate)}% p.j.</p>
            </div>
            <div className="rounded-[var(--r)] bg-[var(--subtle)] p-3" data-testid="modal-monthly-payment">
              <p className="text-xs text-[var(--ink-3)]">Maandelijkse betaling</p>
              <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">
                {<MaskedAmount value={split ? split.monthlyPayment : Number(debt.monthly_payment)} tone="kern" />}
              </p>
              {split && split.monthlyPayment > 0 && (
                <>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
                    <span className="text-[var(--ink-3)]">Rente</span>
                    <span className="ml-auto font-mono tabular-nums text-[var(--ink-2)]">
                      {<MaskedAmount value={split.currentRente} tone="kern" />}
                    </span>
                    <span className="text-[var(--ink-4)]">({split.rentePercentage.toFixed(0)}%)</span>
                  </div>
                  {split.currentAflossing > 0 && (
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="text-[var(--ink-3)]">Aflossing</span>
                      <span className="ml-auto font-mono tabular-nums text-[var(--ink-2)]">
                        {<MaskedAmount value={split.currentAflossing} tone="kern" />}
                      </span>
                      <span className="text-[var(--ink-4)]">({(100 - split.rentePercentage).toFixed(0)}%)</span>
                    </div>
                  )}
                  {/* Stacked bar */}
                  <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full">
                    <div
                      className="h-full bg-zinc-300 transition-all"
                      style={{ width: `${split.rentePercentage}%` }}
                      title={`Rente: ${split.rentePercentage.toFixed(1)}%`}
                    />
                    <div
                      className="h-full bg-kern-500 transition-all"
                      style={{ width: `${100 - split.rentePercentage}%` }}
                      title={`Aflossing: ${(100 - split.rentePercentage).toFixed(1)}%`}
                    />
                  </div>
                </>
              )}
              {!split && dailyExpenses > 0 && Number(debt.monthly_payment) > 0 && (
                <p className="mt-0.5 text-[10px] text-kern-600/80" data-testid="modal-payment-freedom-days">
                  je wint {Math.round(Number(debt.monthly_payment) / dailyExpenses)} {Math.round(Number(debt.monthly_payment) / dailyExpenses) === 1 ? 'dag' : 'dagen'} per maand terug
                </p>
              )}
            </div>
            <div className="rounded-[var(--r)] bg-[var(--subtle)] p-3">
              <p className="text-xs text-[var(--ink-3)]">Aflossing op</p>
              <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">
                {debt.repayment_type === 'aflossingsvrij'
                  ? 'Aflossingsvrij'
                  : proj.isPayable && proj.payoffDate
                    ? new Date(proj.payoffDate).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
                    : 'Onbekend'}
              </p>
            </div>
            <div className="rounded-[var(--r)] bg-[var(--subtle)] p-3">
              <p className="text-xs text-[var(--ink-3)]">Resterende rente</p>
              <p className="mt-0.5 text-sm font-medium text-red-600">
                {proj.isPayable ? formatCurrency(proj.totalInterest) : 'Onbetaalbaar'}
              </p>
              {dailyExpenses > 0 && proj.isPayable && proj.totalInterest >= 100 && (
                <p className="mt-0.5 text-[10px] text-red-500/80">
                  {formatFreedomTimeString(calculateFreedomTime(proj.totalInterest, dailyExpenses), 'long')} verloren tijd
                </p>
              )}
            </div>
          </div>

          {/* Type-specific details */}
          {(() => {
            const details: { label: string; value: string }[] = []
            if (debt.fixed_rate_end_date) details.push({ label: 'Rentevast tot', value: new Date(debt.fixed_rate_end_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) })
            if (debt.credit_limit) details.push({ label: 'Kredietlimiet', value: formatCurrency(Number(debt.credit_limit)) })
            if (linkedAsset) details.push({ label: debt.debt_type === 'dga_schuld' ? 'Gekoppelde deelneming' : 'Gekoppelde woning', value: linkedAsset.name })
            if (debt.draagkrachtmeting_date) details.push({ label: 'Draagkrachtmeting', value: new Date(debt.draagkrachtmeting_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) })
            if (details.length === 0) return null
            return (
              <div className="grid grid-cols-2 gap-3">
                {details.map((d) => (
                  <div key={d.label} className="rounded-[var(--r)] bg-kern-50/50 p-3">
                    <p className="text-xs text-kern-700/60">{d.label}</p>
                    <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">{d.value}</p>
                  </div>
                ))}
              </div>
            )
          })()}

          {!proj.isPayable && debt.repayment_type !== 'aflossingsvrij' && (
            <div className="flex items-center gap-2 rounded-[var(--r)] border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
              <p className="text-xs text-red-700">
                De maandelijkse betaling dekt de rente niet. Verhoog de betaling om deze schuld af te lossen.
              </p>
            </div>
          )}

          {debt.notes && <p className="text-xs text-[var(--ink-3)]">{debt.notes}</p>}

          {/* Debt trajectory chart: actual vs projected */}
          <div className="flex justify-end">
            <ChartTips
              storageKey="debt_trajectory_chart"
              tips={getDebtTrajectoryTips({
                repaymentType: debt.repayment_type ?? 'other',
                hasValuations: !!(valuations && valuations.length > 0),
              })}
              align="right"
            />
          </div>
          <DebtTrajectoryChart debt={debt} valuations={valuations} />

          {/* Valuation history */}
          {valuations && valuations.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--ink-3)] uppercase">Saldohistorie</p>
              <div className="space-y-1">
                {valuations.slice(0, 5).map((v) => {
                  const prev = valuations.find((vv) => vv.valuation_date < v.valuation_date)
                  const diff = prev ? Number(v.value) - Number(prev.value) : null
                  return (
                    <div key={v.id} className="flex items-center gap-3 text-xs">
                      <span className="w-20 shrink-0 text-[var(--ink-3)]">
                        {new Date(v.valuation_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                      </span>
                      <span className="font-medium text-[var(--ink-2)]">{<MaskedAmount value={Number(v.value)} tone="kern" />}</span>
                      {diff !== null && (
                        <span className={`text-[10px] font-medium ${diff <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {diff >= 0 ? '+' : ''}{<MaskedAmount value={diff} tone="kern" />}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Hypotheek vs Beleggen button for mortgage debts */}
        {debt.debt_type === 'mortgage' && Number(debt.interest_rate) > 0 && (
          <div className="border-t border-[var(--border-ed)] px-6 py-3">
            <button
              onClick={() => setShowHvB(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--r)] border border-kern-200 bg-kern-50/50 px-4 py-2.5 text-sm font-medium text-kern-700 transition-colors hover:bg-kern-100"
              data-testid="hvb-compare-button"
            >
              <Scale className="h-4 w-4" />
              Vergelijk: Extra aflossen vs. Beleggen
            </button>
          </div>
        )}

        {/* Actions — alleen in standalone-mode. In embedded-mode levert
            de pane-wrapper Bewerken (primary) + Saldo bijwerken (secondary)
            in de pane-footer; verwijderen zit als header-action icon. */}
        {!embedded && (
          <div className="flex gap-2 border-t border-[var(--border-ed)] px-6 py-4">
            <button
              onClick={onRevalue}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--r)] border border-kern-200 px-3 py-2 text-xs font-medium text-kern-700 hover:bg-kern-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Saldo bijwerken
            </button>
            <button
              onClick={onEdit}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-3 py-2 text-xs font-medium text-white hover:bg-kern-700"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Bewerken
            </button>
            {/* Delete-trigger — opent een confirm-overlay (plan §5.3, driewegregel
                kind="confirm"). Vorige inline-toggle werd vervangen omdat een
                onomkeerbare actie hoort in een echte confirm-modal met focus-trap
                en duidelijke destructive-framing. */}
            <button
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-[var(--r)] border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
              aria-label="Schuld verwijderen"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
    </>
  )

  // Sibling-overlays die zowel in standalone als embedded mode beschikbaar
  // moeten zijn (delete-confirm, HvB-vergelijker). Worden naast de pane
  // gerenderd zodat ze los van de host-overlay sluiten/openen.
  const siblings = (
    <>
      {/* Delete-confirm-overlay — kind="confirm" volgens plan §5.3.
          Smal centered modal met focus-trap; primaire CTA destructive. */}
      <ShellOverlay
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        kind="confirm"
        title="Schuld verwijderen?"
        destructive
      >
        <div className="space-y-4 p-5">
          <p className="font-serif text-base leading-relaxed text-[var(--ink-2)]">
            <strong className="text-[var(--ink)]">{debt.name}</strong> en alle bijbehorende
            waardehistorie en koppelingen worden definitief verwijderd. Deze actie kan
            niet ongedaan worden gemaakt.
          </p>
          <div className="flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="border border-[var(--border-md)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink)] hover:bg-[var(--subtle)]"
              style={{ minHeight: 44 }}
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmDelete(false)
                onDelete()
              }}
              className="border border-red-600 bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700"
              style={{ minHeight: 44 }}
            >
              Definitief verwijderen
            </button>
          </div>
        </div>
      </ShellOverlay>

      {/* Hypotheek vs Beleggen comparison modal */}
      {showHvB && debt.debt_type === 'mortgage' && (() => {
        // Map Dutch repayment types to HvB engine types
        const hvbRepaymentType = debt.repayment_type === 'lineair' ? 'linear'
          : debt.repayment_type === 'aflossingsvrij' ? 'interest_only'
          : 'annuity' as const
        return (
          <HypotheekVsBeleggenModal
            open={showHvB}
            onClose={() => setShowHvB(false)}
            hypotheekBalance={balance}
            rente={Number(debt.interest_rate)}
            repaymentType={hvbRepaymentType}
            restLooptijd={proj.monthsToPayoff > 0 ? proj.monthsToPayoff : 360}
            isTaxDeductible={debt.is_tax_deductible ?? false}
            marginaalTarief={0.3697}
            inflatie={0.02}
            hasPartner={!!partnerSplit}
          />
        )
      })()}
    </>
  )

  if (embedded) {
    return (
      <>
        {body}
        {siblings}
      </>
    )
  }

  return (
    <>
      <ShellOverlay open={true} onClose={onClose} kind="pane" title={debt.name}>
        {body}
      </ShellOverlay>
      {siblings}
    </>
  )
}
