'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { X, Save, Trash2, Repeat, GitFork, Plus, History, ArrowRight, FileText, BarChart3, Sparkles, Users, ArrowLeftRight } from 'lucide-react'
import { CounterpartyAnalysisPanel } from '@/components/app/counterparty-analysis-panel'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { OwnershipToggle, useHouseholdStatus } from '@/components/app/ownership-toggle'
import { useDailyExpenseRate } from '@/components/app/freedom-time-label'
import { useOptionalToast } from '@/components/app/toast-provider'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { needsTransactionAmountConfirmation } from '@/lib/transactions/amount-plausibility'
import { buildBudgetSelectEntries, budgetOptionLabel, type Budget } from '@/lib/budget-data'
import {
  TRANSFER_TYPES,
  collectEigenRekeningBudgetIds,
  transferMarkingFor,
} from '@/lib/transactions/transfer-marking'
import { isRejected, planRuleTarget } from '@/lib/transactions/rule-target'
import { escapeLikePattern } from '@/lib/transactions/search-query'
import { FREQUENCY_LABELS } from '@/lib/recurring-data'

type Transaction = {
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
  ownership?: 'personal' | 'shared'
  /**
   * Huidige verschuivings-markering. Optioneel omdat niet elke aanroeper hem
   * meelaadt; ontbreekt hij, dan geldt "geen verschuiving" en wordt er nooit
   * stil een bestaande markering gewist.
   */
  transaction_type?: string | null
}

type BudgetGroup = {
  parent: Budget
  children: Budget[]
}

type Phase = 'form' | 'scope' | 'saving' | 'analyse'

type PendingRow = {
  user_id: string
  account_id: string
  date: string
  amount: number
  description: string
  counterparty_name: string | null
  budget_id: string | null
  is_income: boolean
  is_split: boolean
  category_source: string
  notes: string | null
  ownership: 'personal' | 'shared'
  /**
   * Alleen aanwezig wanneer de markering daadwerkelijk moet veranderen: naar
   * `'transfer'` bij een boeking op Eigen rekening, naar `null` wanneer een
   * bestaande verschuiving een gewoon budget krijgt. Blijft hij weg, dan laat de
   * UPDATE het veld ongemoeid — importherkomst als `'DEBIT'`/`'payment'` mag
   * niet sneuvelen op een budgetwijziging.
   */
  transaction_type?: string | null
}

function formatDateNL(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}-${m}-${y}`
}

export function TransactionForm({
  transaction,
  accountId,
  accountOwnership,
  budgetGroups,
  onClose,
  onSaved,
  disableAnalysis,
}: {
  transaction?: Transaction
  accountId: string
  /** Eigendom van de gekozen rekening — bepaalt het standaard-eigendom van een NIEUWE transactie. */
  accountOwnership?: 'personal' | 'shared'
  budgetGroups: BudgetGroup[]
  onClose: () => void
  onSaved: () => void
  disableAnalysis?: boolean
}) {
  const isEdit = !!transaction
  const { hasHousehold } = useHouseholdStatus()
  const { dailyExpenseRate } = useDailyExpenseRate()
  const { addToast } = useOptionalToast()
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [phase, setPhase] = useState<Phase>('form')
  const [pendingRow, setPendingRow] = useState<PendingRow | null>(null)

  /**
   * Openstaande plausibiliteitsvraag bij een uitzonderlijk bedrag (UR2-18).
   * Geen blokkade maar een vraag — spiegelt de wedervraag in de bezittingen-
   * formulieren (`components/core/assets-client.tsx`, `quick-add-wizard.tsx`).
   * `bedragBevestigdRef` houdt het exact bevestigde bedrag vast, zodat een
   * dáárna gewijzigde waarde opnieuw doorgevraagd wordt.
   */
  const [bedragBevestiging, setBedragBevestiging] = useState<number | null>(null)
  const bedragBevestigdRef = useRef<number | null>(null)
  const amountInputRef = useRef<HTMLInputElement>(null)

  type SplitRow = { id: string; budget_id: string; amount: string; description: string }
  const [isSplit, setIsSplit] = useState(!!transaction?.is_split)
  const [splitsLoading, setSplitsLoading] = useState(!!transaction?.is_split)
  const [splitRows, setSplitRows] = useState<SplitRow[]>([
    { id: crypto.randomUUID(), budget_id: '', amount: '', description: '' },
    { id: crypto.randomUUID(), budget_id: '', amount: '', description: '' },
  ])

  // Load existing splits when editing a split transaction
  useEffect(() => {
    if (!transaction?.is_split || !transaction.id) return
    const supabase = createClient()
    supabase
      .from('transaction_splits')
      .select('id, budget_id, amount, description')
      .eq('transaction_id', transaction.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data && data.length >= 2) {
          setSplitRows(
            data.map(r => ({
              id: r.id,
              budget_id: r.budget_id ?? '',
              amount: String(Math.abs(Number(r.amount))),
              description: r.description ?? '',
            }))
          )
        }
        setSplitsLoading(false)
      })
  }, [transaction?.id, transaction?.is_split])

  const [form, setForm] = useState({
    date: transaction?.date ?? new Date().toISOString().split('T')[0],
    amount: transaction ? String(Math.abs(transaction.amount)) : '',
    is_income: transaction?.is_income ?? false,
    description: transaction?.description ?? '',
    counterparty_name: transaction?.counterparty_name ?? '',
    budget_id: transaction?.budget_id ?? '',
    notes: transaction?.notes ?? '',
    // Nieuwe transactie erft het eigendom van de rekening; bij bewerken telt
    // het eigen eigendom van de transactie. Geen huishouden → altijd persoonlijk.
    ownership: transaction
      ? (transaction.ownership ?? 'personal')
      : (accountOwnership ?? 'personal'),
    is_recurring: false,
    frequency: 'monthly' as string,
    day_of_month: String(new Date().getDate()),
    day_of_week: '1',
    end_date: '',
  })

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  /**
   * De "Eigen rekening"-posten (archive-emmer): hoofdpost én subpost, want welke
   * van de twee selecteerbaar is hangt af van het budgetplan — `buildBudgetSelectEntries`
   * toont de subpost als die bestaat en valt anders terug op de hoofdpost.
   *
   * Waarom dit méér is dan een budget-keuze: `isRealAggRow` bepaalt of iets een
   * echte inkomst/uitgave is UITSLUITEND op `transaction_type` — niet op het
   * budget. Zou dit formulier alleen `budget_id` schrijven, dan staat de
   * transactie zichtbaar op "Eigen rekening" terwijl hij nog gewoon meetelt in
   * inkomsten, uitgaven, spaarquote en grenzenpotten. Vandaar het canonieke trio
   * (`transaction_type` + `category_source` + budget), gelijk aan wat de import,
   * de banksync, `own-accounts-reclassify` en de sleepmodus (`lib/category-rules.ts`)
   * al schrijven.
   *
   * De regel zelf woont sinds de bulkbewerk-oplevering in
   * `lib/transactions/transfer-marking.ts` — gedeeld met
   * `PATCH /api/transactions/bulk-budget`, met een paritytest erop. Twee kopieën
   * zouden betekenen dat het van het gebruikte scherm afhangt of een overboeking
   * als verschuiving of als uitgave telt (AC7/AC8).
   */
  const eigenRekeningBudgetIds = useMemo(
    () => collectEigenRekeningBudgetIds(budgetGroups.flatMap((g) => [g.parent, ...g.children])),
    [budgetGroups],
  )

  /** Boekt deze transactie op Eigen rekening? Een split kán dat niet (budget is dan null). */
  const isTransferBudget = !isSplit && eigenRekeningBudgetIds.has(form.budget_id)
  // "Stond hij al als verschuiving geboekt?" is geen losse afleiding meer: die
  // vraag zit in `transferMarkingFor` (zie de PendingRow-opbouw hieronder), zodat
  // het formulier en de bulkroute hem niet elk apart kunnen beantwoorden.

  // Eenmaal weggeklikte share-suggestie blijft weg tot de gekozen budget(ten) wijzigen.
  const [shareSuggestionDismissed, setShareSuggestionDismissed] = useState(false)

  // Snelle lookup: budget-id → eigendom, voor de "dit budget is gezamenlijk"-hint.
  const budgetOwnershipById = new Map<string, 'personal' | 'shared'>()
  for (const entry of buildBudgetSelectEntries(budgetGroups)) {
    if (entry.kind === 'group') {
      for (const opt of entry.options) {
        if (opt.ownership) budgetOwnershipById.set(opt.id, opt.ownership)
      }
    } else if (entry.ownership) {
      budgetOwnershipById.set(entry.id, entry.ownership)
    }
  }

  // Toon de suggestie als de transactie persoonlijk staat terwijl een gekozen
  // budget gezamenlijk is — voor de losse budget-keuze óf voor een split-regel.
  const selectedBudgetIsShared = !isSplit && budgetOwnershipById.get(form.budget_id) === 'shared'
  const anySplitBudgetIsShared =
    isSplit && splitRows.some((r) => budgetOwnershipById.get(r.budget_id) === 'shared')
  const showShareSuggestion =
    hasHousehold &&
    form.ownership === 'personal' &&
    !shareSuggestionDismissed &&
    (selectedBudgetIsShared || anySplitBudgetIsShared)

  const matchName = form.counterparty_name.trim() || form.description.trim()
  const matchField = form.counterparty_name.trim() ? 'counterparty_name' : 'description'

  async function handleSaveWithScope(scope: 'single' | 'future' | 'all') {
    if (!transaction || !pendingRow) return
    setPhase('saving')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Niet ingelogd')
      setPhase('scope')
      return
    }

    // 1. Update de huidige transactie altijd
    const { error: updateError } = await supabase
      .from('transactions')
      .update({ ...pendingRow, updated_at: new Date().toISOString() })
      .eq('id', transaction.id)

    if (updateError) {
      setError(updateError.message)
      setPhase('scope')
      return
    }

    // Delete splits if user converted split back to regular
    if (transaction.is_split && !isSplit) {
      await supabase.from('transaction_splits').delete().eq('transaction_id', transaction.id)
    }

    // 2. Bulk update existing transactions (als scope niet 'single')
    if (scope !== 'single' && matchName) {
      // Dezelfde selectie voor beide schrijfrondes hieronder — één plek, zodat
      // ze onmogelijk uiteen kunnen lopen.
      const bulkUpdate = (patch: Record<string, unknown>) => {
        let q = supabase
          .from('transactions')
          .update(patch)
          .eq('user_id', user.id)
          .neq('id', transaction.id)
        // Geëscapet: `matchName` is vrije gebruikerstekst, en `%`/`_` zijn
        // LIKE-jokers. Een omschrijving met een `%` erin zou deze update over
        // élke transactie van de gebruiker laten lopen.
        const safeMatch = escapeLikePattern(matchName)
        q = matchField === 'counterparty_name'
          ? q.ilike('counterparty_name', safeMatch)
          : q.ilike('description', safeMatch)
        return scope === 'future' ? q.gte('date', transaction.date) : q
      }

      // Boekt de gebruiker op Eigen rekening, dan gaat de verschuivings-markering
      // mee — spiegelt `retroSet` in lib/category-rules.ts. Zonder dit krijgen de
      // oudere rijen wél het archive-budget maar tellen ze gewoon door in de
      // spaarquote.
      await bulkUpdate({
        budget_id: form.budget_id || null,
        category_source: 'rule',
        ...(isTransferBudget ? { transaction_type: 'transfer' } : {}),
      })

      // Andersom: gaat een verschuiving naar een gewoon budget, dan moet de
      // markering weg — anders blijft een échte uitgave buiten de spaarquote.
      // Bewust géén blanket `null`: alleen rijen die nú een verschuiving zijn,
      // zodat importherkomst ('DEBIT', 'payment', …) op de rest intact blijft.
      if (!isTransferBudget) {
        await bulkUpdate({ transaction_type: null }).in('transaction_type', [...TRANSFER_TYPES])
      }
    }

    // 3. Save correction rule — system learns from every budget correction,
    // regardless of scope. Future imports from the same source will
    // automatically get the corrected category.
    //
    // Wáár de regel landt beslist dit formulier niet zelf: `planRuleTarget` is de
    // gedeelde bron (ook gebruikt door lib/category-rules.ts en de bulkroute).
    // Een boeking op Eigen rekening levert hier dus géén correctieregel — die
    // zet alleen `budget_id`, niet `transaction_type`, waardoor toekomstige
    // imports op de archive-post zouden landen én tóch zouden meetellen. En een
    // te korte matchwaarde levert helemaal geen regel: die matcht als substring
    // en zou élke volgende import sturen.
    const rulePlan = planRuleTarget({
      targetsEigenRekening: isTransferBudget,
      matchField,
      matchValue: matchName,
    })
    if (!isRejected(rulePlan) && rulePlan.target.table === 'category_corrections') {
      const target = rulePlan.target
      await supabase
        .from('category_corrections')
        .delete()
        .eq('user_id', user.id)
        .eq('match_field', target.matchField)
        .ilike('match_value', escapeLikePattern(target.matchValue))

      await supabase.from('category_corrections').insert({
        user_id: user.id,
        match_field: target.matchField,
        match_value: target.matchValue,
        budget_id: form.budget_id || null,
      })
    }

    onSaved()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    void submitForm()
  }

  /**
   * Het eigenlijke opslaan, losgetrokken van het submit-event zodat de
   * bedrag-wedervraag exact hetzelfde pad kan hervatten dat zij onderbrak.
   */
  async function submitForm() {
    if (!form.description.trim()) {
      setError('Beschrijving is verplicht')
      return
    }
    if (!form.amount || parseFloat(form.amount) === 0) {
      setError('Bedrag is verplicht')
      return
    }
    if (isSplit) {
      const validRows = splitRows.filter(r => r.amount !== '' && parseFloat(r.amount) > 0)
      if (validRows.length < 2) {
        setError('Voeg minimaal 2 splits toe')
        return
      }
      const splitTotal = validRows.reduce((s, r) => s + parseFloat(r.amount), 0)
      const mainAmount = parseFloat(form.amount)
      if (Math.abs(splitTotal - mainAmount) > 0.01) {
        setError(`Splits (${splitTotal.toFixed(2)}) moeten optellen tot het totaalbedrag (${mainAmount.toFixed(2)})`)
        return
      }
    }

    // ── Plausibiliteitsvraag bij een uitzonderlijk bedrag (UR2-18) ────────────
    //
    // Ná de vormvalidatie (een leeg of onleesbaar bedrag hoort een fout te
    // geven, geen wedervraag) en vóór élk schrijfpad — nieuw én bewerken, split
    // én terugkerend. Eén nul te veel valt in het bedragveld niet op, maar
    // trekt daarna spaarquote, gezondheidsgetal en briefing mee.
    //
    // De splits hoeven geen eigen check: hun som is hierboven al gelijkgesteld
    // aan het hoofdbedrag, dus een uitschieter dáár tilt dit bedrag mee over de
    // drempel.
    const teBevestigen = parseFloat(form.amount)
    if (
      needsTransactionAmountConfirmation(teBevestigen) &&
      bedragBevestigdRef.current !== teBevestigen
    ) {
      setError('')
      setBedragBevestiging(teBevestigen)
      return
    }

    setSaving(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Niet ingelogd')
      setSaving(false)
      return
    }

    const rawAmount = parseFloat(form.amount)
    const amount = form.is_income ? Math.abs(rawAmount) : -Math.abs(rawAmount)

    const validSplitRows = isSplit
      ? splitRows.filter(r => r.amount !== '' && parseFloat(r.amount) > 0)
      : []

    // Het canonieke trio komt uit de gedeelde helper: `category_source` altijd,
    // `transaction_type` ALLEEN wanneer de markering echt moet veranderen (zie
    // PendingRow). Dezelfde functie voedt `PATCH /api/transactions/bulk-budget`.
    const marking = transferMarkingFor({
      targetsEigenRekening: isTransferBudget,
      currentType: transaction?.transaction_type,
    })

    const row: PendingRow = {
      user_id: user.id,
      account_id: accountId,
      date: form.date,
      amount,
      description: form.description.trim(),
      counterparty_name: form.counterparty_name.trim() || null,
      // When split, don't assign a single budget (splits handle that)
      budget_id: isSplit ? null : (form.budget_id || null),
      is_income: form.is_income,
      is_split: isSplit && validSplitRows.length >= 2,
      notes: form.notes.trim() || null,
      // household_id wordt server-side afgeleid door de stamp_household_id-trigger.
      ownership: form.ownership,
      ...marking,
    }

    if (isEdit && transaction) {
      // Intercept for scope-prompt when budget changed on a non-split transaction
      const budgetChanged = !isSplit && (form.budget_id !== (transaction.budget_id ?? ''))
      if (budgetChanged) {
        setPendingRow(row)
        setPhase('scope')
        setSaving(false)
        return
      }

      const { error: updateError } = await supabase
        .from('transactions')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', transaction.id)

      if (updateError) {
        setError(updateError.message)
        setSaving(false)
        return
      }

      // Manage splits for edited transactions
      if (isSplit && validSplitRows.length >= 2) {
        // Delete all existing splits, then re-insert
        await supabase.from('transaction_splits').delete().eq('transaction_id', transaction.id)
        await supabase.from('transaction_splits').insert(
          validSplitRows.map(r => ({
            transaction_id: transaction.id,
            budget_id: r.budget_id || null,
            amount: parseFloat(r.amount),
            description: r.description.trim() || null,
          }))
        )
      } else if (!isSplit && transaction.is_split) {
        // User converted split back to regular — delete splits
        await supabase.from('transaction_splits').delete().eq('transaction_id', transaction.id)
      }
    } else {
      const { data: insertedTx, error: insertError } = await supabase
        .from('transactions')
        // Herkomst (B5) alleen op de INSERT: een handmatig aangemaakte transactie
        // is `handmatig`. Het update-pad hierboven schrijft `source` bewust NIET —
        // een bank- of importrij bewerken verandert niet waar hij vandaan kwam.
        .insert({ ...row, source: 'handmatig' })
        .select('id')
        .single()

      if (insertError || !insertedTx) {
        setError(insertError?.message ?? 'Opslaan mislukt')
        setSaving(false)
        return
      }

      // Insert split rows if applicable
      if (isSplit && validSplitRows.length >= 2) {
        await supabase.from('transaction_splits').insert(
          validSplitRows.map(r => ({
            transaction_id: insertedTx.id,
            budget_id: r.budget_id || null,
            amount: parseFloat(r.amount),
            description: r.description.trim() || null,
          }))
        )
      }

      // Create recurring template if toggled
      let recurringId: string | null = null
      if (form.is_recurring) {
        const recurringRow = {
          user_id: user.id,
          account_id: accountId,
          budget_id: form.budget_id || null,
          name: form.description.trim(),
          amount,
          description: form.description.trim(),
          counterparty_name: form.counterparty_name.trim() || null,
          frequency: form.frequency,
          day_of_month: (form.frequency === 'monthly' || form.frequency === 'quarterly' || form.frequency === 'yearly')
            ? parseInt(form.day_of_month) || 1
            : null,
          day_of_week: form.frequency === 'weekly' ? parseInt(form.day_of_week) : null,
          start_date: form.date,
          end_date: form.end_date || null,
          is_active: true,
          ownership: form.ownership,
        }

        const { data: insertedRecurring } = await supabase
          .from('recurring_transactions')
          .insert(recurringRow)
          .select('id')
          .single()
        recurringId = (insertedRecurring as { id?: string } | null)?.id ?? null
      }

      // ── Tweede net: ongedaan maken ná opslaan (UR2-18) ────────────────────
      //
      // De wedervraag hierboven vangt de tikfout vóór het schrijven; deze toast
      // vangt de gebruiker die 'm wegklikte. Bewust ALLEEN op een nieuwe rij
      // met een uitzonderlijk bedrag: bij een bewerking kennen we de vorige
      // waarden niet meer, dus "ongedaan maken" zou daar iets anders beloven
      // dan het doet. Alles wat deze save aanmaakte gaat mee terug — de rij,
      // haar splits en een eventueel terugkerend sjabloon.
      if (needsTransactionAmountConfirmation(teBevestigen)) {
        const newTxId = insertedTx.id as string
        const createdRecurringId = recurringId
        addToast({
          type: 'warning',
          title: `${formatCurrency(Math.abs(amount))} opgeslagen`,
          message: 'Uitzonderlijk bedrag — klopt het niet, dan draai je het hier meteen terug.',
          duration: 12000,
          action: {
            label: 'Ongedaan maken',
            onClick: () => {
              void (async () => {
                const undoClient = createClient()
                await undoClient.from('transaction_splits').delete().eq('transaction_id', newTxId)
                if (createdRecurringId) {
                  await undoClient.from('recurring_transactions').delete().eq('id', createdRecurringId)
                }
                await undoClient.from('transactions').delete().eq('id', newTxId)
                onSaved()
              })()
            },
          },
        })
      }
    }

    onSaved()
  }

  async function handleDelete() {
    if (!transaction) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }

    setDeleting(true)
    const supabase = createClient()
    const { error: deleteError } = await supabase
      .from('transactions')
      .delete()
      .eq('id', transaction.id)

    if (deleteError) {
      setError(deleteError.message)
      setDeleting(false)
      return
    }

    onSaved()
  }

  const scopeOptions = [
    {
      scope: 'all' as const,
      label: `Alle transacties van "${matchName}", ook eerder`,
      icon: History,
    },
    {
      scope: 'future' as const,
      label: `Transacties van "${matchName}" vanaf ${transaction ? formatDateNL(transaction.date) : ''}`,
      icon: ArrowRight,
    },
    {
      scope: 'single' as const,
      label: 'Alleen deze transactie',
      icon: FileText,
    },
  ]

  return (
    <>
    <BottomSheet
      open={true}
      onClose={onClose}
      title={phase === 'analyse' ? (transaction?.counterparty_name ?? 'Tegenpartij analyse') : (isEdit ? 'Transactie bewerken' : 'Nieuwe transactie')}
      size={phase === 'analyse' ? 'lg' : 'md'}
      // Zolang de bedrag-wedervraag openstaat treedt dit formulier terug: één
      // venster tegelijk (ADR 0039), en Escape sluit dan alleen de vraag —
      // niet het formulier mét de ingevulde regel.
      suspended={bedragBevestiging !== null}
    >
      {phase === 'analyse' && transaction && (
        <CounterpartyAnalysisPanel
          counterpartyName={transaction.counterparty_name}
          counterpartyIban={transaction.counterparty_iban}
          onBack={() => setPhase('form')}
          budgetGroups={budgetGroups}
        />
      )}

      {phase === 'scope' && (
        <div className="p-6 flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setPhase('form')}
            className="self-start inline-flex items-center gap-1.5 text-sm text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
          >
            ← Terug
          </button>

          <p className="text-sm font-semibold text-[var(--ink)]">
            Budget gewijzigd — wat wil je aanpassen?
          </p>

          {error && (
            <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3">
            {scopeOptions.map(({ scope, label, icon: Icon }) => (
              <button
                key={scope}
                type="button"
                onClick={() => handleSaveWithScope(scope)}
                disabled={saving || (phase as string) === 'saving'}
                className="flex items-start gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-left transition-all hover:border-kern-300 hover:shadow-[var(--s1)] disabled:opacity-50"
              >
                <Icon className="h-4 w-4 mt-0.5 shrink-0 text-kern-500" />
                <span className="text-sm text-[var(--ink-2)]">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === 'form' && (
        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Type toggle */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Type</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => update('is_income', false)}
                  className={`flex-1 border px-3 py-2 text-sm font-medium transition-colors ${
                    !form.is_income
                      ? 'border-negative/30 bg-negative-bg text-negative'
                      : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:bg-[var(--subtle)]'
                  }`}
                >
                  Uitgave
                </button>
                <button
                  type="button"
                  onClick={() => update('is_income', true)}
                  className={`flex-1 border px-3 py-2 text-sm font-medium transition-colors ${
                    form.is_income
                      ? 'border-positive/30 bg-positive-bg text-positive'
                      : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:bg-[var(--subtle)]'
                  }`}
                >
                  Inkomen
                </button>
              </div>
            </div>

            {/* Date + Amount */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="tx-date" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                  Datum
                </label>
                <input
                  id="tx-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => update('date', e.target.value)}
                  className="w-full border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="tx-amount" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                  Bedrag (&euro;)
                </label>
                <input
                  id="tx-amount"
                  ref={amountInputRef}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => update('amount', e.target.value)}
                  className="w-full border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                  placeholder="0,00"
                  required
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="tx-description" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                Beschrijving
              </label>
              <input
                id="tx-description"
                type="text"
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                className="w-full border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                placeholder="bijv. Albert Heijn boodschappen"
                required
              />
            </div>

            {/* Counterparty */}
            <div>
              <label htmlFor="tx-counterparty" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                Tegenpartij (optioneel)
              </label>
              <input
                id="tx-counterparty"
                type="text"
                value={form.counterparty_name}
                onChange={(e) => update('counterparty_name', e.target.value)}
                className="w-full border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                placeholder="bijv. Albert Heijn"
              />
            </div>

            {/* Budget — hidden when split is active */}
            {!isSplit && (
              <div>
                <label htmlFor="tx-budget" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                  Budget
                </label>
                <select
                  id="tx-budget"
                  value={form.budget_id}
                  onChange={(e) => update('budget_id', e.target.value)}
                  className="w-full border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                >
                  <option value="">Niet gecategoriseerd</option>
                  {buildBudgetSelectEntries(budgetGroups).map((entry) =>
                    entry.kind === 'group' ? (
                      <optgroup key={entry.id} label={entry.label}>
                        {entry.options.map((child) => (
                          <option key={child.id} value={child.id}>
                            {budgetOptionLabel(child)}
                          </option>
                        ))}
                      </optgroup>
                    ) : (
                      <option key={entry.id} value={entry.id}>
                        {budgetOptionLabel(entry)}
                      </option>
                    )
                  )}
                </select>
                {isTransferBudget && (
                  <p
                    className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--ink-3)]"
                    data-testid="tx-transfer-notice"
                  >
                    <ArrowLeftRight className="h-3 w-3 shrink-0 text-kern-600" />
                    <span>Verschuiving tussen eigen rekeningen — telt niet mee als inkomst of uitgave.</span>
                  </p>
                )}
                {showShareSuggestion && selectedBudgetIsShared && (
                  <ShareSuggestionChip
                    onAccept={() => { update('ownership', 'shared'); setShareSuggestionDismissed(true) }}
                    onDismiss={() => setShareSuggestionDismissed(true)}
                  />
                )}
                {isEdit && transaction && (transaction.category_source === 'ai' || transaction.category_source === 'rule') && transaction.budget_id && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-wil-700" data-testid="suggested-category-notice">
                    <Sparkles className="h-3 w-3 text-wil-500" />
                    <span>
                      {transaction.category_source === 'ai' ? 'Voorgesteld door AI' : 'Voorgesteld op basis van regel'}
                      {' — opslaan bevestigt deze categorie'}
                    </span>
                  </p>
                )}
              </div>
            )}

            {/* Eigendom — alleen relevant met een actief huishouden */}
            {hasHousehold && (
              <div data-testid="tx-ownership-toggle">
                <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Eigendom</label>
                <OwnershipToggle
                  value={form.ownership}
                  onChange={(v) => update('ownership', v)}
                  hasHousehold={hasHousehold}
                  compact
                />
              </div>
            )}

            {/* Split toggle — available for both new and edit */}
            <div className="border border-[var(--border-ed)] p-3">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={isSplit}
                  onChange={e => {
                    setIsSplit(e.target.checked)
                    if (e.target.checked) update('budget_id', '')
                  }}
                  className="h-4 w-4 border-[var(--border-md)] text-kern-600 focus:ring-kern-500"
                />
                <GitFork className="h-4 w-4 text-[var(--ink-3)]" />
                <span className="text-sm font-medium text-[var(--ink-2)]">Verdeel over meerdere budgetten</span>
              </label>

              {/* Warning when un-splitting an existing split transaction */}
              {isEdit && transaction?.is_split && !isSplit && (
                <p className="mt-2 text-xs text-amber-700">
                  Let op: de bestaande splits worden verwijderd als je opslaat.
                </p>
              )}

              {isSplit && (
                <div className="mt-3 space-y-2 border-t border-[var(--border-ed)] pt-3">
                  {splitsLoading ? (
                    <p className="text-xs text-[var(--ink-3)]">Splits laden...</p>
                  ) : (
                    <>
                      <p className="text-xs text-[var(--ink-3)]">
                        Totaal: <span className="font-mono font-medium">{form.amount ? `€${form.amount}` : '€0'}</span>
                        {' — '}
                        Verdeeld: <span className={`font-mono font-medium ${
                          // eslint-disable-next-line no-restricted-syntax -- validatie-status (verdeling klopt/klopt niet), geen winst/verlies
                          Math.abs(splitRows.filter(r => r.amount).reduce((s, r) => s + parseFloat(r.amount || '0'), 0) - parseFloat(form.amount || '0')) > 0.01
                            ? 'text-red-600' : 'text-emerald-600'
                        }`}>
                          €{splitRows.filter(r => r.amount).reduce((s, r) => s + parseFloat(r.amount || '0'), 0).toFixed(2)}
                        </span>
                      </p>
                      {splitRows.map((row) => (
                        <div key={row.id} className="flex items-start gap-2">
                          <div className="flex-1 space-y-1.5">
                            <select
                              value={row.budget_id}
                              onChange={e => setSplitRows(prev => prev.map(r => r.id === row.id ? { ...r, budget_id: e.target.value } : r))}
                              className="w-full rounded-[var(--r-sm)] border border-[var(--border-md)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                            >
                              <option value="">Geen budget</option>
                              {buildBudgetSelectEntries(budgetGroups).map(entry =>
                                entry.kind === 'group' ? (
                                  <optgroup key={entry.id} label={entry.label}>
                                    {entry.options.map(child => (
                                      <option key={child.id} value={child.id}>{budgetOptionLabel(child)}</option>
                                    ))}
                                  </optgroup>
                                ) : (
                                  <option key={entry.id} value={entry.id}>{budgetOptionLabel(entry)}</option>
                                )
                              )}
                            </select>
                            <div className="flex gap-2">
                              <div className="relative w-28">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--ink-3)]">€</span>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={row.amount}
                                  onChange={e => {
                                    const val = e.target.value
                                    setSplitRows(prev => {
                                      const updated = prev.map(r => r.id === row.id ? { ...r, amount: val } : r)
                                      // Auto-fill the other row when exactly 2 split rows exist
                                      if (prev.length === 2 && val !== '') {
                                        const total = parseFloat(form.amount || '0')
                                        const entered = parseFloat(val) || 0
                                        const remainder = Math.max(0, total - entered)
                                        const otherId = prev.find(r => r.id !== row.id)?.id
                                        if (otherId) {
                                          return updated.map(r =>
                                            r.id === otherId
                                              ? { ...r, amount: remainder > 0 ? remainder.toFixed(2) : '' }
                                              : r
                                          )
                                        }
                                      }
                                      return updated
                                    })
                                  }}
                                  placeholder="0,00"
                                  className="w-full rounded-[var(--r-sm)] border border-[var(--border-md)] py-1.5 pl-5 pr-2 text-right font-mono text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                                />
                              </div>
                              <input
                                type="text"
                                value={row.description}
                                onChange={e => setSplitRows(prev => prev.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                                placeholder="Omschrijving (optioneel)"
                                className="flex-1 rounded-[var(--r-sm)] border border-[var(--border-md)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                              />
                            </div>
                          </div>
                          {splitRows.length > 2 && (
                            <button
                              type="button"
                              onClick={() => setSplitRows(prev => prev.filter(r => r.id !== row.id))}
                              className="mt-1 p-1 text-[var(--ink-4)] hover:text-red-600"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSplitRows(prev => [...prev, { id: crypto.randomUUID(), budget_id: '', amount: '', description: '' }])}
                        className="inline-flex items-center gap-1 text-xs font-medium text-kern-600 hover:text-kern-700"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Regel toevoegen
                      </button>
                      {showShareSuggestion && anySplitBudgetIsShared && (
                        <ShareSuggestionChip
                          onAccept={() => { update('ownership', 'shared'); setShareSuggestionDismissed(true) }}
                          onDismiss={() => setShareSuggestionDismissed(true)}
                        />
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Recurring toggle — only for new transactions */}
            {!isEdit && (
              <div className="border border-[var(--border-ed)] p-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_recurring}
                    onChange={(e) => update('is_recurring', e.target.checked)}
                    className="h-4 w-4 border-[var(--border-md)] text-kern-600 focus:ring-kern-500"
                  />
                  <Repeat className="h-4 w-4 text-[var(--ink-3)]" />
                  <span className="text-sm font-medium text-[var(--ink-2)]">Terugkerende transactie</span>
                </label>

                {form.is_recurring && (
                  <div className="mt-3 space-y-3 border-t border-[var(--border-ed)] pt-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="tx-frequency" className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                          Frequentie
                        </label>
                        <select
                          id="tx-frequency"
                          value={form.frequency}
                          onChange={(e) => update('frequency', e.target.value)}
                          className="w-full border border-[var(--border-md)] px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                        >
                          {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                      {form.frequency === 'weekly' ? (
                        <div>
                          <label htmlFor="tx-dow" className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                            Dag van de week
                          </label>
                          <select
                            id="tx-dow"
                            value={form.day_of_week}
                            onChange={(e) => update('day_of_week', e.target.value)}
                            className="w-full border border-[var(--border-md)] px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                          >
                            {['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'].map((d, i) => (
                              <option key={i} value={i}>{d}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div>
                          <label htmlFor="tx-dom" className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                            Dag van de maand
                          </label>
                          <input
                            id="tx-dom"
                            type="number"
                            min="1"
                            max="31"
                            value={form.day_of_month}
                            onChange={(e) => update('day_of_month', e.target.value)}
                            className="w-full border border-[var(--border-md)] px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <label htmlFor="tx-enddate" className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                        Einddatum (optioneel)
                      </label>
                      <input
                        id="tx-enddate"
                        type="date"
                        value={form.end_date}
                        onChange={(e) => update('end_date', e.target.value)}
                        className="w-full border border-[var(--border-md)] px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div>
              <label htmlFor="tx-notes" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                Notities (optioneel)
              </label>
              <textarea
                id="tx-notes"
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                className="w-full border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                rows={2}
                placeholder="Optionele notities..."
              />
            </div>
          </div>

          {/* Analyse button */}
          {isEdit && !disableAnalysis && (transaction?.counterparty_name || transaction?.counterparty_iban) && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setPhase('analyse')}
                className="inline-flex w-full items-center justify-center gap-2 border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
              >
                <BarChart3 className="h-4 w-4" />
                Analyseer tegenpartij
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="mt-4 flex items-center justify-between border-t border-[var(--border-ed)] pt-4">
            <div>
              {isEdit && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                    confirmDelete
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'text-red-600 hover:bg-red-50'
                  }`}
                >
                  <Trash2 className="h-4 w-4" />
                  {confirmDelete ? 'Bevestig verwijderen' : 'Verwijderen'}
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
              >
                Annuleren
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Opslaan...' : 'Opslaan'}
              </button>
            </div>
          </div>
        </form>
      )}
    </BottomSheet>

    {/* Plausibiliteitsvraag bij een uitzonderlijk bedrag (UR2-18). Geen
        blokkade: de gebruiker mag doorzetten. De vraag staat bewust óók in
        vrijheidstijd — een extra nul valt in euro's niet op, in jaren wel. */}
    <ShellOverlay
      open={bedragBevestiging !== null}
      onClose={() => setBedragBevestiging(null)}
      kind="confirm"
      title="Klopt dit bedrag?"
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              const bedrag = bedragBevestiging
              setBedragBevestiging(null)
              if (bedrag === null) return
              bedragBevestigdRef.current = bedrag
              void submitForm()
            }}
            className="flex-1 rounded-[var(--r)] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--paper)]"
            data-testid="tx-bedrag-bevestigen"
          >
            Ja, dit klopt
          </button>
          <button
            type="button"
            onClick={() => {
              setBedragBevestiging(null)
              amountInputRef.current?.focus()
            }}
            className="flex-1 rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)]"
          >
            Aanpassen
          </button>
        </div>
      }
    >
      {bedragBevestiging !== null && (
        <div className="px-6 py-4 text-sm leading-relaxed text-[var(--ink-2)]" data-testid="tx-bedrag-bevestiging">
          <p>
            Je boekt{' '}
            <span className="font-medium text-[var(--ink)]">{formatCurrency(bedragBevestiging)}</span>
            {form.is_income ? ' aan inkomen' : ' aan uitgave'}
            {form.description.trim() ? <> bij <span className="font-medium text-[var(--ink)]">{form.description.trim()}</span></> : null}.
          </p>
          {dailyExpenseRate > 0 && (
            <p className="mt-2">
              Dat is{' '}
              <span className="font-medium text-[var(--ink)]" data-testid="tx-bedrag-bevestiging-vrijheid">
                {formatFreedomTimeString(calculateFreedomTime(bedragBevestiging, dailyExpenseRate), 'long')}
              </span>{' '}
              vrijheid bij je huidige uitgaven.
            </p>
          )}
          <p className="mt-2 text-[var(--ink-3)]">
            Een bedrag van deze omvang is meestal een typefout — één nul te veel. Klopt het wel, dan gaan we gewoon verder.
          </p>
        </div>
      )}
    </ShellOverlay>
    </>
  )
}

/**
 * Inline suggestie onder de budget-keuze: nodigt uit de transactie op
 * "gezamenlijk" te zetten wanneer een gekozen budget gezamenlijk is terwijl de
 * transactie nog persoonlijk staat. Weg te klikken met de X.
 */
function ShareSuggestionChip({ onAccept, onDismiss }: { onAccept: () => void; onDismiss: () => void }) {
  return (
    <div
      className="mt-2 flex items-center gap-2 border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 text-xs text-[var(--ink-2)]"
      data-testid="tx-share-suggestion"
    >
      <Users className="h-3.5 w-3.5 shrink-0 text-kern-600" />
      <span className="flex-1">Dit budget is gezamenlijk — transactie ook op gezamenlijk zetten?</span>
      <button
        type="button"
        onClick={onAccept}
        className="shrink-0 font-medium text-kern-600 hover:text-kern-700"
      >
        Zet op gezamenlijk
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Sluiten"
        className="shrink-0 text-[var(--ink-4)] hover:text-[var(--ink-2)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
