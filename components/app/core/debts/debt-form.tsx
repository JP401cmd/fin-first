'use client'

import { useState } from 'react'
import { X, AlertTriangle, Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/components/app/budget-shared'
import {
  type Debt,
  type DebtType,
  DEBT_TYPE_LABELS,
  DEBT_SUBTYPE_LABELS,
  DEBT_SUBTYPE_DEFAULTS,
  DEBT_TYPE_FIELDS,
  REPAYMENT_TYPE_LABELS,
} from '@/lib/debt-data'
import type { Asset } from '@/lib/asset-data'
import { OwnershipToggle, useHouseholdStatus, type OwnershipType } from '@/components/app/ownership-toggle'

export function DebtForm({
  debt,
  userAssets,
  allDebts,
  onClose,
  onSaved,
}: {
  debt?: Debt
  userAssets: Asset[]
  allDebts?: Debt[]
  onClose: () => void
  onSaved: () => void
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
  const [validationError, setValidationError] = useState<string | null>(null)
  // Household ownership
  const [ownership, setOwnership] = useState<OwnershipType>(debt?.ownership ?? 'personal')
  const { hasHousehold, householdId } = useHouseholdStatus()
  // Per-debt partner split override
  const [useCustomSplit, setUseCustomSplit] = useState(debt?.partner_split_pct != null)
  const [partnerSplitPct, setPartnerSplitPct] = useState(debt?.partner_split_pct ?? 50)

  const subtypeOptions = DEBT_SUBTYPE_LABELS[debtType]
  const visibleFields = DEBT_TYPE_FIELDS[debtType]

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
      current_balance: Number(currentBalance) || 0,
      interest_rate: Number(interestRate) || 0,
      minimum_payment: Number(minimumPayment) || 0,
      monthly_payment: Number(monthlyPayment) || 0,
      start_date: startDate,
      end_date: endDate || null,
      creditor: creditor || null,
      notes: notes || null,
      // Type-specific fields
      subtype: subtype || null,
      repayment_type: repaymentType || null,
      is_tax_deductible: visibleFields.includes('is_tax_deductible') ? isTaxDeductible : null,
      fixed_rate_end_date: fixedRateEndDate || null,
      nhg: visibleFields.includes('nhg') ? nhg : null,
      linked_asset_id: linkedAssetId || null,
      credit_limit: creditLimit ? Number(creditLimit) : null,
      draagkrachtmeting_date: draagkrachtmetingDate || null,
      // Belastingschuld fields
      tax_year: taxYear ? Number(taxYear) : null,
      has_payment_plan: debtType === 'belastingschuld' ? hasPaymentPlan : false,
      // Household fields
      ownership: ownership,
      household_id: ownership === 'shared' ? householdId : null,
      partner_split_pct: ownership === 'shared' && useCustomSplit ? partnerSplitPct : null,
      // Net worth inclusion
      net_worth_inclusion_pct: netWorthInclusionPct,
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
        await supabase.from('valuations').upsert({
          user_id: user.id,
          entity_type: 'debt',
          entity_id: debt.id,
          valuation_date: new Date().toISOString().split('T')[0],
          value: newBalance,
          notes: valuationNotes,
        }, { onConflict: 'entity_id,valuation_date' })
      }
    } else {
      await supabase.from('debts').insert(row)
    }

    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-[var(--ink)]">
            {isEdit ? 'Schuld bewerken' : 'Nieuwe schuld'}
          </h3>
          <button onClick={onClose} className="rounded-[var(--r)] p-1 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]">
            <X className="h-5 w-5" />
          </button>
        </div>

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
              <input
                type="number"
                value={currentBalance}
                onChange={(e) => setCurrentBalance(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Rente (% per jaar)</label>
              <input
                type="number"
                step="0.1"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              />
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
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Werkelijke betaling p/m</label>
              <input
                type="number"
                value={monthlyPayment}
                onChange={(e) => setMonthlyPayment(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              />
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
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Kredietverstrekker</label>
            <input
              value={creditor}
              onChange={(e) => setCreditor(e.target.value)}
              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              placeholder="ABN AMRO, ING, DUO..."
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
                        Voeg eerst een deelneming toe bij <a href="/core/assets" className="underline text-teal-600">Bezittingen</a>.
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

          {/* Wet excessief lenen warning for DGA-schuld */}
          {debtType === 'dga_schuld' && (() => {
            const otherDgaTotal = (allDebts ?? [])
              .filter((d) => d.debt_type === 'dga_schuld' && d.is_active && d.id !== debt?.id)
              .reduce((sum, d) => sum + Number(d.current_balance), 0)
            const thisDgaBalance = Number(currentBalance) || 0
            const totalDga = otherDgaTotal + thisDgaBalance
            const drempel = 500_000
            const bovenmatig = totalDga - drempel

            if (totalDga >= drempel) {
              return (
                <div className="rounded-[var(--r)] border border-red-300 bg-red-50 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Wet excessief lenen drempel overschreden
                  </div>
                  <p className="text-xs text-red-600">
                    Totaal DGA-schulden: {formatCurrency(totalDga)} — bovenmatig deel: {formatCurrency(bovenmatig)}.
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
                    Totaal DGA-schulden: {formatCurrency(totalDga)} (drempel: {formatCurrency(drempel)}).
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

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
              Opnemen in netto vermogen
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
              Stel in welk percentage van deze schuld in het netto vermogen wordt meegeteld.
            </p>
            {netWorthInclusionPct < 100 && Number(currentBalance) > 0 && (
              <p className="mt-1 font-mono text-[11px] tabular-nums text-kern-600">
                Effectief saldo: {formatCurrency(Number(currentBalance) * netWorthInclusionPct / 100)}
              </p>
            )}
          </div>

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
            {saving ? 'Opslaan...' : isEdit ? 'Bijwerken' : 'Toevoegen'}
          </button>
        </div>
      </div>
    </div>
  )
}
