'use client'

/**
 * Fase 1.2 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §5.1 (pane) + §5.2 (sheet)
 * DebtDetailModal → pane; DebtForm + ValuationModal → sheet (via ShellOverlay).
 *
 * DebtForm is een single-form bewerk/aanmaak-flow — past in §5.2 als sheet:
 * "even snel" iets doen, terugkeer-context op de debt-pagina blijft zichtbaar.
 * ShellOverlay kind="sheet" rendert intern een BottomSheet, dus zelfde
 * visuele behaviour als voorheen — alle overlay-mechanica gaat nu door één
 * centrale wrapper.
 *
 * Werkt onafhankelijk van de feature-flag — bij flag UIT zien gebruikers
 * dezelfde behaviour, alleen via één centrale wrapper.
 */

import { useState, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import { AlertTriangle, Building2 } from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { createClient } from '@/lib/supabase/client'
import { upsertSingleBalanceSnapshot } from '@/lib/balance-snapshot'
import { DGA_LENING_DREMPEL } from '@/lib/box2-data'
import {
  type Debt,
  type DebtType,
  DEBT_TYPE_LABELS,
  DEBT_SUBTYPE_LABELS,
  DEBT_SUBTYPE_DEFAULTS,
  DEBT_TYPE_FIELDS,
  REPAYMENT_TYPE_LABELS,
  computeExpectedBalance,
} from '@/lib/debt-data'
import type { Asset } from '@/lib/asset-data'
import { OwnershipToggle, useHouseholdStatus, type OwnershipType } from '@/components/app/ownership-toggle'
import { MaskedAmount } from '@/components/app/masked-amount'
import { VALUATIONS_CONFLICT_KEY } from '@/lib/valuations'

/**
 * Shape die `DebtForm` (in `embedded`-mode) publiceert naar de pane-wrapper.
 * Volgt hetzelfde ref-gebaseerde save-handler patroon als
 * `EventEditActionsState` (event-pane-edit.tsx).
 */
export type DebtEditActionsState = {
  canSave: boolean
  saving: boolean
  isEditing: boolean
  /** Roept de meest recente save-handler aan (via ref). */
  save: () => void
}

export function DebtForm({
  debt,
  userAssets,
  allDebts,
  onClose,
  onSaved,
  embedded = false,
  onActionsChange,
}: {
  debt?: Debt
  userAssets: Asset[]
  allDebts?: Debt[]
  onClose: () => void
  onSaved: () => void
  /**
   * Wanneer true rendert deze component alleen de body (geen ShellOverlay,
   * geen interne Annuleren/Opslaan-knoppen). De pane-wrapper levert beide.
   */
  embedded?: boolean
  /**
   * Publiceert save-state naar de pane-wrapper zodat die de primary CTA
   * (Opslaan/Bijwerken) in de pane-footer kan renderen.
   */
  onActionsChange?: (state: DebtEditActionsState) => void
}) {
  const isEdit = !!debt

  const [name, setName] = useState(debt?.name ?? '')
  const [debtType, setDebtType] = useState<DebtType>(debt?.debt_type ?? 'personal_loan')
  const [originalAmount, setOriginalAmount] = useState(String(debt?.original_amount ?? ''))
  const [currentBalance, setCurrentBalance] = useState(String(debt?.current_balance ?? ''))
  const [interestRate, setInterestRate] = useState(String(debt?.interest_rate ?? ''))
  const [minimumPayment, setMinimumPayment] = useState(String(debt?.minimum_payment ?? ''))
  const [monthlyPayment, setMonthlyPayment] = useState(String(debt?.monthly_payment ?? ''))
  const [startDate, setStartDate] = useState(debt?.start_date ?? new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(debt?.end_date ?? '')
  const [creditor, setCreditor] = useState(debt?.creditor ?? '')
  const [notes, setNotes] = useState(debt?.notes ?? '')
  const [netWorthInclusionPct, setNetWorthInclusionPct] = useState(debt?.net_worth_inclusion_pct ?? 100)
  const [includeAflossingInSavings, setIncludeAflossingInSavings] = useState(debt?.include_aflossing_in_savings ?? false)
  const [useCustomAflossing, setUseCustomAflossing] = useState(debt?.custom_aflossing_amount != null)
  const [customAflossingAmount, setCustomAflossingAmount] = useState(String(debt?.custom_aflossing_amount ?? ''))
  const [saving, setSaving] = useState(false)
  // Type-specific state
  const [subtype, setSubtype] = useState(debt?.subtype ?? '')
  const [repaymentType, setRepaymentType] = useState<string>(debt?.repayment_type ?? '')
  const [isTaxDeductible, setIsTaxDeductible] = useState(debt?.is_tax_deductible ?? false)
  const [fixedRateEndDate, setFixedRateEndDate] = useState(debt?.fixed_rate_end_date ?? '')
  const [nhg, setNhg] = useState(debt?.nhg ?? false)
  const [linkedAssetId, setLinkedAssetId] = useState(debt?.linked_asset_id ?? '')
  const [creditLimit, setCreditLimit] = useState(String(debt?.credit_limit ?? ''))
  const [draagkrachtmetingDate, setDraagkrachtmetingDate] = useState(debt?.draagkrachtmeting_date ?? '')
  // Belastingschuld fields
  const [taxYear, setTaxYear] = useState(String(debt?.tax_year ?? ''))
  const [hasPaymentPlan, setHasPaymentPlan] = useState(debt?.has_payment_plan ?? false)
  // Familielening fields
  const [hasWrittenAgreement, setHasWrittenAgreement] = useState(debt?.has_written_agreement ?? false)
  // App-koppeling: Hypotheekplanner — alleen relevant voor mortgages. De vlag
  // schakelt equity-opbouw, oversluit-scenario's en hypotheek-vs-beleggen aan.
  // Aflosstrategie is sinds de v2-refactor globaal en kent geen per-debt
  // tracking-vlag meer (zie `/core/debts` "Schuldenprofiel & Aflosroute").
  const [hasHypotheekplannerTracking, setHasHypotheekplannerTracking] = useState(
    debt?.has_hypotheekplanner_tracking ?? false,
  )
  const [validationError, setValidationError] = useState<string | null>(null)
  // Household ownership
  const [ownership, setOwnership] = useState<OwnershipType>(debt?.ownership ?? 'personal')
  const { hasHousehold, householdId } = useHouseholdStatus()
  // Per-debt partner split override
  const [useCustomSplit, setUseCustomSplit] = useState(debt?.partner_split_pct != null)
  const [partnerSplitPct, setPartnerSplitPct] = useState(debt?.partner_split_pct ?? 50)
  // Berekend vs eigen maandbedrag — standaard altijd berekend
  const [useCalculatedPayment, setUseCalculatedPayment] = useState(true)
  // Berekend vs eigen saldo
  const [useCalculatedBalance, setUseCalculatedBalance] = useState(true)
  // Stabiele "nu" voor de remaining-months-berekening in `calculatedPayment`.
  // Eenmaal gevangen bij mount zodat render-purity (react-hooks/purity)
  // gerespecteerd wordt; sub-seconde precisie is niet relevant voor een
  // formuliers-context die binnen seconden tot minuten geopend blijft.
  const [nowMs] = useState(() => Date.now())

  const subtypeOptions = DEBT_SUBTYPE_LABELS[debtType]
  const visibleFields = DEBT_TYPE_FIELDS[debtType]

  // Type-specifieke velden blijven bij het bewerken van een bestaande schuld
  // in state staan als je het debt_type wisselt (`handleTypeChange` reset
  // alleen bij !isEdit), zodat terugswitchen de ingevulde waarde niet wist.
  // Wat het huidige type níét toont, mag echter nooit meetellen — niet in de
  // opslag en niet in de live-preview. Anders houdt bv. een familielening die
  // je omzet naar "persoonlijke lening" onzichtbaar repayment_type='lineair',
  // en rekent de looptijd-KPI daarop door. Zelfde gating als
  // `is_tax_deductible`/`nhg` hieronder.
  const effectiveRepaymentType = visibleFields.includes('repayment_type') ? repaymentType : ''

  // Bereken de verwachte restschuld op basis van origineel bedrag + aflossingsschema
  const calculatedBalance = useMemo(() => {
    const orig = Number(originalAmount)
    const rate = Number(interestRate)
    if (orig <= 0 || !startDate || !endDate) return null

    const rt = effectiveRepaymentType || 'annuiteit'
    const result = computeExpectedBalance({
      original_amount: orig,
      interest_rate: rate,
      start_date: startDate,
      end_date: endDate,
      repayment_type: rt,
    } as Debt)
    return result ? result.expectedBalance : null
  }, [originalAmount, interestRate, startDate, endDate, effectiveRepaymentType])

  // Bereken het verwachte maandbedrag op basis van saldo, rente, looptijd en type
  const calculatedPayment = useMemo(() => {
    const bal = useCalculatedBalance && calculatedBalance != null ? calculatedBalance : Number(currentBalance)
    const rate = Number(interestRate)
    if (bal <= 0) return null

    const monthlyRate = rate / 100 / 12

    // Bereken resterende maanden uit einddatum
    let months: number | null = null
    if (endDate) {
      months = Math.max(1, Math.round(
        (new Date(endDate).getTime() - nowMs) / (1000 * 60 * 60 * 24 * 30.44),
      ))
    }

    const rt = effectiveRepaymentType || 'annuiteit'

    if (rt === 'aflossingsvrij') {
      return Math.round(bal * monthlyRate * 100) / 100
    }

    if (!months) return null

    if (rt === 'lineair') {
      const principal = bal / months
      const interest = bal * monthlyRate
      return Math.round((principal + interest) * 100) / 100
    }

    // Annuïteit (default)
    if (rate === 0) return Math.round((bal / months) * 100) / 100
    const factor = Math.pow(1 + monthlyRate, months)
    return Math.round(bal * (monthlyRate * factor) / (factor - 1) * 100) / 100
  }, [currentBalance, interestRate, endDate, effectiveRepaymentType, useCalculatedBalance, calculatedBalance, nowMs])

  function handleTypeChange(type: DebtType) {
    setDebtType(type)
    setSubtype('')
    if (!isEdit) {
      setRepaymentType('')
      setIsTaxDeductible(false)
      setNhg(false)
      // Default creditor for belastingschuld
      if (type === 'belastingschuld') {
        setCreditor('Belastingdienst')
        setInterestRate('4')
        setHasPaymentPlan(false)
        setTaxYear('')
      }
      // Default for dga_schuld
      if (type === 'dga_schuld') {
        setCreditor('Eigen BV')
        setLinkedAssetId('')
      }
      // Default for familielening
      if (type === 'familielening') {
        setCreditor('')
        setInterestRate('2')
        setRepaymentType('lineair')
        setHasWrittenAgreement(false)
      }
    }
  }

  function handleSubtypeChange(st: string) {
    setSubtype(st)
    if (!isEdit && st) {
      const defaults = DEBT_SUBTYPE_DEFAULTS[st]
      if (defaults) {
        if (defaults.repayment_type) setRepaymentType(defaults.repayment_type)
        if (defaults.is_tax_deductible !== undefined) setIsTaxDeductible(defaults.is_tax_deductible)
      }
    }
  }

  async function handleSave() {
    if (!name || !currentBalance) return
    setValidationError(null)

    // Validate no negative monetary values or rates
    const numCurrentBalance = Number(currentBalance)
    const numOriginalAmount = Number(originalAmount)
    const numInterestRate = Number(interestRate)
    const numMinimumPayment = Number(minimumPayment)
    const numMonthlyPayment = Number(monthlyPayment)

    if (numCurrentBalance < 0) {
      setValidationError('Huidig saldo mag niet negatief zijn. Voer een positief bedrag in.')
      return
    }
    if (originalAmount && numOriginalAmount < 0) {
      setValidationError('Oorspronkelijk bedrag mag niet negatief zijn. Voer een positief bedrag in.')
      return
    }
    if (interestRate && numInterestRate < 0) {
      setValidationError('Rentepercentage mag niet negatief zijn. Voer een positief percentage in.')
      return
    }
    if (minimumPayment && numMinimumPayment < 0) {
      setValidationError('Minimale betaling mag niet negatief zijn.')
      return
    }
    if (monthlyPayment && numMonthlyPayment < 0) {
      setValidationError('Werkelijke betaling mag niet negatief zijn.')
      return
    }

    // DGA-schuld requires linked deelneming
    if (debtType === 'dga_schuld' && !linkedAssetId) {
      setValidationError('Selecteer de deelneming waaraan deze DGA-schuld gekoppeld is.')
      return
    }

    setSaving(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const row = {
      user_id: user.id,
      name,
      debt_type: debtType,
      original_amount: Number(originalAmount) || 0,
      current_balance: useCalculatedBalance && calculatedBalance != null ? calculatedBalance : (Number(currentBalance) || 0),
      interest_rate: Number(interestRate) || 0,
      minimum_payment: Number(minimumPayment) || 0,
      monthly_payment: useCalculatedPayment && calculatedPayment != null ? calculatedPayment : (Number(monthlyPayment) || 0),
      start_date: startDate,
      end_date: endDate || null,
      creditor: creditor || null,
      notes: notes || null,
      // Type-specific fields
      subtype: subtype || null,
      repayment_type: effectiveRepaymentType || null,
      is_tax_deductible: visibleFields.includes('is_tax_deductible') ? isTaxDeductible : null,
      fixed_rate_end_date: fixedRateEndDate || null,
      nhg: visibleFields.includes('nhg') ? nhg : null,
      linked_asset_id: linkedAssetId || null,
      credit_limit: creditLimit ? Number(creditLimit) : null,
      draagkrachtmeting_date: draagkrachtmetingDate || null,
      // Belastingschuld fields
      tax_year: taxYear ? Number(taxYear) : null,
      has_payment_plan: debtType === 'belastingschuld' ? hasPaymentPlan : false,
      has_written_agreement: debtType === 'familielening' ? hasWrittenAgreement : false,
      // App-koppeling: Hypotheekplanner-tracking alleen voor mortgages. Voor
      // andere types altijd `false` zodat een type-wissel de vlag schoonveegt.
      has_hypotheekplanner_tracking: debtType === 'mortgage' ? hasHypotheekplannerTracking : false,
      // Household fields
      ownership: ownership,
      household_id: ownership === 'shared' ? householdId : null,
      partner_split_pct: ownership === 'shared' && useCustomSplit ? partnerSplitPct : null,
      // Net worth inclusion
      net_worth_inclusion_pct: netWorthInclusionPct,
      include_aflossing_in_savings: includeAflossingInSavings,
      custom_aflossing_amount: includeAflossingInSavings && useCustomAflossing ? (Number(customAflossingAmount) || null) : null,
    }

    if (isEdit && debt) {
      // When balance reaches 0, mark debt as paid off
      const editRow = { ...row } as Record<string, unknown>
      if ((Number(currentBalance) || 0) <= 0) {
        editRow.is_active = false
      }
      await supabase.from('debts').update(editRow).eq('id', debt.id)

      // Auto-track valuation when current_balance changes
      const newBalance = Number(currentBalance) || 0
      const oldBalance = Number(debt.current_balance)
      if (newBalance !== oldBalance) {
        const valuationNotes = newBalance <= 0
          ? `Schuld afgelost! Saldo bijgewerkt van ${oldBalance} naar ${newBalance}`
          : `Saldo bijgewerkt van ${oldBalance} naar ${newBalance}`
        const today = new Date().toISOString().split('T')[0]
        await supabase.from('valuations').upsert({
          user_id: user.id,
          entity_type: 'debt',
          entity_id: debt.id,
          valuation_date: today,
          value: newBalance,
          notes: valuationNotes,
        }, { onConflict: VALUATIONS_CONFLICT_KEY })
        // Mirror naar balance_snapshots zodat de categorie-sparkline meebeweegt.
        await upsertSingleBalanceSnapshot(supabase, user.id, today, {
          type: 'debt',
          id: debt.id,
          name,
          subtype: debtType,
          balance: newBalance,
          netWorthInclusionPct,
        })
      }
    } else {
      await supabase.from('debts').insert(row)
    }

    setSaving(false)
    onSaved()
  }

  // Publiceer save-state naar pane-wrapper (zelfde ref-pattern als
  // EventPaneEdit). Save-handler-ref voorkomt stale closures op de form-
  // state; de wrapper-effect heeft alleen de primitives nodig om de juiste
  // CTA-state te tonen.
  const saveHandlerRef = useRef<() => void>(() => {})
  useEffect(() => {
    saveHandlerRef.current = () => { void handleSave() }
  })
  const canSave = !saving && Boolean(name) && Boolean(currentBalance)
  useEffect(() => {
    if (!onActionsChange) return
    onActionsChange({
      canSave,
      saving,
      isEditing: isEdit,
      save: () => saveHandlerRef.current(),
    })
  }, [onActionsChange, canSave, saving, isEdit])

  const formContent = (
      <div className="p-6">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Naam</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                placeholder="Hypotheek"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Type</label>
              <select
                value={debtType}
                onChange={(e) => handleTypeChange(e.target.value as DebtType)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              >
                {Object.entries(DEBT_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Ownership toggle */}
          <OwnershipToggle
            value={ownership}
            onChange={setOwnership}
            hasHousehold={hasHousehold}
          />

          {/* Per-debt partner split override (only for shared debts) */}
          {ownership === 'shared' && hasHousehold && (
            <div className="space-y-2 rounded-[var(--r)] border border-kern-100 bg-kern-50/30 p-3">
              <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
                <input
                  type="checkbox"
                  checked={useCustomSplit}
                  onChange={(e) => setUseCustomSplit(e.target.checked)}
                  className="rounded border-[var(--border-md)]"
                />
                Eigen verdeling (afwijkend van huishouden)
              </label>
              {useCustomSplit && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Jouw aandeel</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range" min={0} max={100} step={5}
                      value={partnerSplitPct}
                      onChange={(e) => setPartnerSplitPct(Number(e.target.value))}
                      className="flex-1 accent-kern-600"
                    />
                    <input
                      type="number" min={0} max={100}
                      value={partnerSplitPct}
                      onChange={(e) => setPartnerSplitPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                      className="w-16 rounded-[var(--r)] border border-[var(--border-ed)] px-2 py-1.5 text-sm text-center tabular-nums"
                    />
                    <span className="text-sm text-[var(--ink-3)]">%</span>
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--ink-3)]">
                    Jij: {partnerSplitPct}% · Partner: {100 - partnerSplitPct}%
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Netto vermogen inclusie — logisch onder huishouden */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
              Neem dit % mee in netto vermogen en berekeningen naar de horizon
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range" min={0} max={100} step={5}
                value={netWorthInclusionPct}
                onChange={(e) => setNetWorthInclusionPct(Number(e.target.value))}
                className="flex-1 accent-kern-600"
              />
              <input
                type="number" min={0} max={100}
                value={netWorthInclusionPct}
                onChange={(e) => setNetWorthInclusionPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                className="w-16 rounded-[var(--r)] border border-[var(--border-ed)] px-2 py-1.5 text-sm text-center tabular-nums"
              />
              <span className="text-sm text-[var(--ink-3)]">%</span>
            </div>
            <p className="mt-1 text-[10px] text-[var(--ink-3)]">
              Stel in welk percentage van deze schuld wordt meegeteld in je netto vermogen en vrijheidsberekeningen.
            </p>
            {netWorthInclusionPct < 100 && Number(currentBalance) > 0 && (
              <p className="mt-1 font-mono text-[11px] tabular-nums text-kern-600">
                Effectief saldo: {<MaskedAmount value={Number(currentBalance) * netWorthInclusionPct / 100} tone="kern" />}
              </p>
            )}
          </div>

          {/* Subtype dropdown (conditional) */}
          {subtypeOptions && (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Subtype</label>
              <select
                value={subtype}
                onChange={(e) => handleSubtypeChange(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              >
                <option value="">Selecteer subtype...</option>
                {Object.entries(subtypeOptions).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Oorspronkelijk bedrag</label>
              <input
                type="number"
                value={originalAmount}
                onChange={(e) => setOriginalAmount(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Huidig saldo</label>
              {/* Toggle: berekend vs eigen */}
              {calculatedBalance != null && (
                <div className="mb-1.5 flex rounded-full border border-[var(--border-ed)] p-0.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setUseCalculatedBalance(true)}
                    className={`flex-1 rounded-full px-2 py-0.5 font-medium transition-colors ${useCalculatedBalance ? 'bg-kern-500 text-white' : 'text-[var(--ink-3)]'}`}
                  >
                    Berekend
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseCalculatedBalance(false)}
                    className={`flex-1 rounded-full px-2 py-0.5 font-medium transition-colors ${!useCalculatedBalance ? 'bg-kern-500 text-white' : 'text-[var(--ink-3)]'}`}
                  >
                    Eigen invoer
                  </button>
                </div>
              )}
              {useCalculatedBalance && calculatedBalance != null ? (
                <div className="flex items-baseline gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2">
                  <span className="font-mono text-sm tabular-nums text-[var(--ink)]">{<MaskedAmount value={calculatedBalance} tone="kern" />}</span>
                </div>
              ) : (
                <input
                  type="number"
                  value={currentBalance}
                  onChange={(e) => setCurrentBalance(e.target.value)}
                  className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Rente (% per jaar)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              />
              {debtType === 'familielening' && interestRate === '0' && (
                <p className="mt-1 text-[11px] leading-tight text-amber-600">
                  ⚠ Bij 0% rente kan de Belastingdienst dit als schenking aanmerken.
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Min. betaling p/m</label>
              <input
                type="number"
                value={minimumPayment}
                onChange={(e) => setMinimumPayment(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Maandbedrag</label>
              {/* Toggle: berekend vs eigen */}
              {calculatedPayment != null && (
                <div className="mb-1.5 flex rounded-full border border-[var(--border-ed)] p-0.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setUseCalculatedPayment(true)}
                    className={`flex-1 rounded-full px-2 py-0.5 font-medium transition-colors ${useCalculatedPayment ? 'bg-kern-500 text-white' : 'text-[var(--ink-3)]'}`}
                  >
                    Berekend
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseCalculatedPayment(false)}
                    className={`flex-1 rounded-full px-2 py-0.5 font-medium transition-colors ${!useCalculatedPayment ? 'bg-kern-500 text-white' : 'text-[var(--ink-3)]'}`}
                  >
                    Eigen bedrag
                  </button>
                </div>
              )}
              {useCalculatedPayment && calculatedPayment != null ? (
                <div className="flex items-baseline gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2">
                  <span className="font-mono text-sm tabular-nums text-[var(--ink)]">{<MaskedAmount value={calculatedPayment} tone="kern" />}</span>
                  <span className="text-[10px] text-[var(--ink-4)]">p/m</span>
                </div>
              ) : (
                <input
                  type="number"
                  value={monthlyPayment}
                  onChange={(e) => setMonthlyPayment(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Startdatum</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Einddatum (optioneel)</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
              {debtType === 'familielening' ? 'Naam uitlener' : 'Kredietverstrekker'}
            </label>
            <input
              value={creditor}
              onChange={(e) => setCreditor(e.target.value)}
              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              placeholder={debtType === 'familielening' ? 'Bijv. ouders, oom Jan...' : 'ABN AMRO, ING, DUO...'}
            />
          </div>

          {/* Type-specific fields */}
          {visibleFields.length > 0 && visibleFields.some((f) => f !== 'subtype') && (
            <div className="space-y-3 rounded-[var(--r)] border border-kern-100 bg-kern-50/30 p-3">
              <p className="text-xs font-semibold text-kern-700/60 uppercase">Details</p>
              <div className="grid grid-cols-2 gap-3">
                {visibleFields.includes('repayment_type') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Aflossingstype</label>
                    <select
                      value={repaymentType}
                      onChange={(e) => setRepaymentType(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    >
                      <option value="">-</option>
                      {Object.entries(REPAYMENT_TYPE_LABELS).map(([k, l]) => (
                        <option key={k} value={k}>{l}</option>
                      ))}
                    </select>
                  </div>
                )}
                {visibleFields.includes('is_tax_deductible') && (
                  <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
                    <input
                      type="checkbox"
                      checked={isTaxDeductible}
                      onChange={(e) => setIsTaxDeductible(e.target.checked)}
                      className="rounded border-[var(--border-md)]"
                    />
                    Hypotheekrenteaftrek
                  </label>
                )}
                {visibleFields.includes('nhg') && (
                  <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
                    <input
                      type="checkbox"
                      checked={nhg}
                      onChange={(e) => setNhg(e.target.checked)}
                      className="rounded border-[var(--border-md)]"
                    />
                    NHG
                  </label>
                )}
                {visibleFields.includes('fixed_rate_end_date') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Rentevast tot</label>
                    <input
                      type="date"
                      value={fixedRateEndDate}
                      onChange={(e) => setFixedRateEndDate(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {visibleFields.includes('linked_asset_id') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                      {debtType === 'dga_schuld' ? 'Gekoppelde deelneming' : 'Gekoppelde woning'}
                      {debtType === 'dga_schuld' && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    <select
                      value={linkedAssetId}
                      onChange={(e) => setLinkedAssetId(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    >
                      <option value="">{debtType === 'dga_schuld' ? 'Selecteer deelneming...' : '-'}</option>
                      {userAssets
                        .filter((a) =>
                          debtType === 'dga_schuld'
                            ? a.asset_type === 'deelneming'
                            : a.asset_type === 'eigen_huis' || a.asset_type === 'real_estate'
                        )
                        .map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                    {debtType === 'dga_schuld' && userAssets.filter((a) => a.asset_type === 'deelneming').length === 0 && (
                      <p className="mt-1 text-[10px] text-[var(--ink-3)]">
                        Voeg eerst een deelneming toe bij <Link href="/core/assets" className="underline text-teal-600">Bezittingen</Link>.
                      </p>
                    )}
                  </div>
                )}
                {visibleFields.includes('credit_limit') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Kredietlimiet</label>
                    <input
                      type="number"
                      value={creditLimit}
                      onChange={(e) => setCreditLimit(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {visibleFields.includes('draagkrachtmeting_date') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Draagkrachtmeting</label>
                    <input
                      type="date"
                      value={draagkrachtmetingDate}
                      onChange={(e) => setDraagkrachtmetingDate(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {visibleFields.includes('tax_year') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Belastingjaar</label>
                    <input
                      type="number"
                      value={taxYear}
                      onChange={(e) => setTaxYear(e.target.value)}
                      placeholder={String(new Date().getFullYear())}
                      min={2000}
                      max={2099}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {visibleFields.includes('has_payment_plan') && (
                  <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
                    <input
                      type="checkbox"
                      checked={hasPaymentPlan}
                      onChange={(e) => setHasPaymentPlan(e.target.checked)}
                      className="rounded border-[var(--border-md)]"
                    />
                    Betalingsregeling
                  </label>
                )}
                {visibleFields.includes('has_written_agreement') && (
                  <div>
                    <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
                      <input
                        type="checkbox"
                        checked={hasWrittenAgreement}
                        onChange={(e) => setHasWrittenAgreement(e.target.checked)}
                        className="rounded border-[var(--border-md)]"
                      />
                      Schriftelijke overeenkomst
                    </label>
                    {!hasWrittenAgreement && (
                      <p className="mt-1 ml-6 text-[11px] leading-tight text-amber-600">
                        💡 Een schriftelijke overeenkomst is aan te raden voor fiscale zekerheid.
                      </p>
                    )}
                  </div>
                )}
              </div>
              {visibleFields.includes('has_payment_plan') && hasPaymentPlan && (
                <div className="mt-2 rounded-[var(--r)] border border-kern-200 bg-kern-50/50 p-3">
                  <p className="mb-2 text-[10px] font-medium uppercase text-kern-600/60">Betalingsregeling details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Maandelijks bedrag</label>
                      <input
                        type="number"
                        value={monthlyPayment}
                        onChange={(e) => setMonthlyPayment(e.target.value)}
                        className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Einddatum regeling</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Hypotheekplanner-app toggle — alleen voor `mortgage`. Aflosstrategie
              is sinds de v2-refactor globaal en kent geen per-debt opt-in meer
              (zie `/core/debts` "Schuldenprofiel & Aflosroute"). */}
          {debtType === 'mortgage' && (
            <label className="flex items-start gap-3 rounded-[var(--r)] border border-kern-200 bg-kern-50/30 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasHypotheekplannerTracking}
                onChange={(e) => setHasHypotheekplannerTracking(e.target.checked)}
                className="mt-0.5 rounded border-[var(--border-md)]"
              />
              <div>
                <span className="text-sm font-medium text-[var(--ink)]">
                  Hypotheekplanner
                </span>
                <p className="text-xs text-[var(--ink-3)]">
                  Schakel in om equity-opbouw, oversluit-scenario&apos;s en de
                  hypotheek-vs-beleggen vergelijking voor deze hypotheek te zien.
                </p>
              </div>
            </label>
          )}

          {/* Wet excessief lenen warning for DGA-schuld */}
          {debtType === 'dga_schuld' && (() => {
            const otherDgaTotal = (allDebts ?? [])
              .filter((d) => d.debt_type === 'dga_schuld' && d.is_active && d.id !== debt?.id)
              .reduce((sum, d) => sum + Number(d.current_balance), 0)
            const thisDgaBalance = Number(currentBalance) || 0
            const totalDga = otherDgaTotal + thisDgaBalance
            const drempel = DGA_LENING_DREMPEL
            const bovenmatig = totalDga - drempel

            if (totalDga >= drempel) {
              return (
                <div className="rounded-[var(--r)] border border-red-300 bg-red-50 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Wet excessief lenen drempel overschreden
                  </div>
                  <p className="text-xs text-red-600">
                    Totaal DGA-schulden: {<MaskedAmount value={totalDga} tone="kern" />} — bovenmatig deel: {<MaskedAmount value={bovenmatig} tone="kern" />}.
                    Dit bovenmatige deel wordt als fictief regulier voordeel belast in Box 2.
                  </p>
                  <a
                    href="https://www.belastingdienst.nl/wps/wcm/connect/nl/box-2/content/wet-excessief-lenen"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-[11px] text-red-600 underline hover:text-red-800"
                  >
                    Meer over Wet excessief lenen →
                  </a>
                </div>
              )
            }

            if (totalDga >= 400_000) {
              return (
                <div className="rounded-[var(--r)] border border-orange-300 bg-orange-50 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-orange-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Nadert Wet excessief lenen drempel
                  </div>
                  <p className="text-xs text-orange-600">
                    Totaal DGA-schulden: {<MaskedAmount value={totalDga} tone="kern" />} (drempel: {<MaskedAmount value={drempel} tone="kern" />}).
                    Houd rekening met Box 2-heffing bij overschrijding.
                  </p>
                  <a
                    href="https://www.belastingdienst.nl/wps/wcm/connect/nl/box-2/content/wet-excessief-lenen"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-[11px] text-orange-600 underline hover:text-orange-800"
                  >
                    Meer over Wet excessief lenen →
                  </a>
                </div>
              )
            }

            return null
          })()}

          {/* Aflossing in spaarquote */}
          {(() => {
            const bal = useCalculatedBalance && calculatedBalance != null ? calculatedBalance : Number(currentBalance)
            const rate = Number(interestRate)
            const payment = calculatedPayment ?? Number(monthlyPayment)
            const monthlyRente = bal * (rate / 100 / 12)
            const berekendAflossing = payment > monthlyRente ? Math.max(0, payment - monthlyRente) : 0
            if (bal <= 0 || (payment <= 0 && !useCustomAflossing)) return null
            const effectiefAflossing = useCustomAflossing ? (Number(customAflossingAmount) || 0) : berekendAflossing
            const gewogenAflossing = effectiefAflossing * netWorthInclusionPct / 100
            return (
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeAflossingInSavings}
                    onChange={(e) => setIncludeAflossingInSavings(e.target.checked)}
                    className="rounded border-[var(--border-md)] accent-kern-600"
                  />
                  <span className="text-xs font-medium text-[var(--ink-2)]">Aflossing meetellen in spaarquote</span>
                </label>
                <p className="mt-1 ml-6 text-[10px] text-[var(--ink-3)] leading-relaxed">
                  Het aflossing-deel van je betaling bouwt vermogen op. Vink aan om dit als besparing mee te tellen in je spaarquote.
                </p>
                {includeAflossingInSavings && (
                  <div className="mt-2 ml-6">
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Aflossing per maand</label>
                    {/* Toggle: berekend vs eigen */}
                    {berekendAflossing > 0 && (
                      <div className="mb-1.5 flex rounded-full border border-[var(--border-ed)] p-0.5 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setUseCustomAflossing(false)}
                          className={`flex-1 rounded-full px-2 py-0.5 font-medium transition-colors ${!useCustomAflossing ? 'bg-kern-500 text-white' : 'text-[var(--ink-3)]'}`}
                        >
                          Berekend
                        </button>
                        <button
                          type="button"
                          onClick={() => setUseCustomAflossing(true)}
                          className={`flex-1 rounded-full px-2 py-0.5 font-medium transition-colors ${useCustomAflossing ? 'bg-kern-500 text-white' : 'text-[var(--ink-3)]'}`}
                        >
                          Eigen bedrag
                        </button>
                      </div>
                    )}
                    {!useCustomAflossing && berekendAflossing > 0 ? (
                      <div className="flex items-baseline gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2">
                        <span className="font-mono text-sm tabular-nums text-[var(--ink)]">{<MaskedAmount value={berekendAflossing} tone="kern" />}</span>
                        <span className="text-[10px] text-[var(--ink-4)]">p/m</span>
                      </div>
                    ) : (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={customAflossingAmount}
                        onChange={(e) => { setCustomAflossingAmount(e.target.value); setUseCustomAflossing(true) }}
                        placeholder="0"
                        className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                      />
                    )}
                    {gewogenAflossing > 0 && (
                      <p className="mt-1.5 font-mono text-[11px] tabular-nums text-positive">
                        +{<MaskedAmount value={gewogenAflossing} tone="kern" />} p/m in spaarquote{netWorthInclusionPct < 100 ? <>{' '}({netWorthInclusionPct}% van <MaskedAmount value={effectiefAflossing} tone="kern" />)</> : null}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Notities (optioneel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
            />
          </div>
        </div>

        {validationError && (
          <div className="mt-3 rounded-[var(--r)] border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700" data-testid="debt-validation-error">
            {validationError}
          </div>
        )}

        {/* Inline Annuleren/Opslaan — alleen in standalone-mode. In
            embedded-mode levert de pane-wrapper deze knoppen via
            primaryAction/secondaryAction. */}
        {!embedded && (
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
            >
              Annuleren
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name || !currentBalance}
              className="rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
            >
              {saving ? 'Opslaan...' : isEdit ? 'Opslaan' : 'Toevoegen'}
            </button>
          </div>
        )}
      </div>
  )

  if (embedded) return formContent
  return (
    <ShellOverlay open={true} onClose={onClose} kind="sheet" size="lg" title={isEdit ? 'Schuld bewerken' : 'Nieuwe schuld'}>
      {formContent}
    </ShellOverlay>
  )
}
