'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Upload, FileText, Check, AlertTriangle, X,
  ChevronRight, Loader2, WifiOff, RefreshCw,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { parseMT940 } from '@/lib/parsers/mt940'
import { parseCSV, getCSVHeaders, getCSVPreview } from '@/lib/parsers/csv'
import { parseOFX } from '@/lib/parsers/ofx'
import { detectFormat, CSV_PRESETS, type CSVPreset } from '@/lib/parsers/index'
import type { ParsedTransaction } from '@/lib/parsers/shared'
import { categorizeTransaction, type CategoryCorrection } from '@/lib/parsers/categorize'
import type { Budget } from '@/lib/budget-data'

type Account = {
  id: string
  name: string
  iban: string | null
}

type ImportRow = ParsedTransaction & {
  budget_id: string | null
  budgetName: string | null
  confidence: number
  isDuplicate: boolean
  skipImport: boolean
}

function isNetworkFailure(err: unknown): boolean {
  if (err instanceof TypeError && (
    err.message.includes('Failed to fetch') ||
    err.message.includes('NetworkError') ||
    err.message.includes('Network request failed') ||
    err.message.includes('Load failed')
  )) {
    return true
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return true
  }
  // Supabase client errors with network-related messages
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message: string }).message).toLowerCase()
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || msg.includes('econnrefused') || msg.includes('enotfound')) {
      return true
    }
  }
  return false
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export default function ImportPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState(1)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [budgetGroups, setBudgetGroups] = useState<{ parent: Budget; children: Budget[] }[]>([])
  const [rows, setRows] = useState<ImportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
  const [importedBatchIndex, setImportedBatchIndex] = useState(0)
  const [isNetworkError, setIsNetworkError] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [detectedFormat, setDetectedFormat] = useState<'mt940' | 'csv' | 'ofx' | 'unknown'>('mt940')
  const [fileContent, setFileContent] = useState('')
  const [csvPreset, setCsvPreset] = useState<CSVPreset>(CSV_PRESETS[0])
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvPreview, setCsvPreview] = useState<string[][]>([])
  const [showColumnMapping, setShowColumnMapping] = useState(false)
  const [corrections, setCorrections] = useState<CategoryCorrection[]>([])

  const loadInitialData = useCallback(async () => {
    setLoading(true)
    setError('')
    setIsNetworkError(false)

    try {
      const supabase = createClient()

      const [accountsRes, budgetsRes, correctionsRes] = await Promise.all([
        supabase.from('bank_accounts').select('id, name, iban').eq('is_active', true).order('sort_order'),
        supabase.from('budgets').select('*').order('sort_order'),
        supabase.from('category_corrections').select('match_field, match_value, budget_id'),
      ])

      // Check for network errors in any of the responses
      const anyError = accountsRes.error || budgetsRes.error || correctionsRes.error
      if (anyError && isNetworkFailure(anyError)) {
        setError('Kan geen verbinding maken met de server. Controleer je internetverbinding.')
        setIsNetworkError(true)
        setLoading(false)
        return
      }

      if (accountsRes.data) {
        setAccounts(accountsRes.data as Account[])
        if (accountsRes.data.length > 0) {
          setSelectedAccountId(accountsRes.data[0].id)
        }
      }

      if (budgetsRes.data) {
        const allBudgets = budgetsRes.data as Budget[]
        setBudgets(allBudgets)
        const parents = allBudgets.filter((b) => !b.parent_id)
        const children = allBudgets.filter((b) => b.parent_id && Number(b.default_limit) > 0)
        setBudgetGroups(parents.map((p) => ({
          parent: p,
          children: children.filter((c) => c.parent_id === p.id),
        })))
      }

      if (correctionsRes.data) {
        setCorrections(correctionsRes.data as CategoryCorrection[])
      }

      setLoading(false)
    } catch (err) {
      if (isNetworkFailure(err)) {
        setError('Kan geen verbinding maken met de server. Controleer je internetverbinding.')
        setIsNetworkError(true)
      } else {
        setError('Fout bij het laden van gegevens. Probeer het opnieuw.')
      }
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  // Maximum file size: 10 MB
  const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
  const MAX_FILE_SIZE_LABEL = '10 MB'

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setError('')

    // File size validation
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1)
      setError(
        `Het bestand "${file.name}" is te groot (${fileSizeMB} MB). ` +
        `De maximale bestandsgrootte is ${MAX_FILE_SIZE_LABEL}. ` +
        'Probeer een kleiner bestand te uploaden of splits het bestand op in meerdere delen.'
      )
      // Reset the file input so user can try again
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    setParsing(true)

    try {
      const content = await file.text()
      setFileContent(content)
      const format = detectFormat(content, file.name)
      setDetectedFormat(format)

      // Get file extension for error messages
      const fileExt = file.name.split('.').pop()?.toLowerCase() || ''

      if (format === 'unknown') {
        setError(
          `Ongeldig bestandsformaat${fileExt ? ` (.${fileExt})` : ''}. ` +
          'Dit bestand wordt niet herkend als een geldig bankbestand. ' +
          'Ondersteunde formaten: MT940 (.sta, .mt940), CSV (.csv), OFX (.ofx, .qfx).'
        )
        setParsing(false)
        return
      }

      if (format === 'csv') {
        // For CSV: detect delimiter and show column mapping
        const semiCount = (content.split('\n')[0]?.match(/;/g) || []).length
        const commaCount = (content.split('\n')[0]?.match(/,/g) || []).length
        const tabCount = (content.split('\n')[0]?.match(/\t/g) || []).length

        let bestPreset = CSV_PRESETS.find(p => p.id === 'custom')!
        if (semiCount > commaCount && semiCount > tabCount) {
          bestPreset = CSV_PRESETS.find(p => p.id === 'ing') ?? bestPreset
        } else if (tabCount > commaCount) {
          bestPreset = CSV_PRESETS.find(p => p.id === 'abn') ?? bestPreset
        }

        setCsvPreset(bestPreset)
        setCsvHeaders(getCSVHeaders(content, bestPreset.delimiter))
        setCsvPreview(getCSVPreview(content, bestPreset.delimiter, bestPreset.hasHeader))
        setShowColumnMapping(true)
        setParsing(false)
        return
      }

      let parsed: ParsedTransaction[] = []
      if (format === 'mt940') {
        try {
          parsed = await parseMT940(content)
        } catch (parseErr) {
          console.error('MT940 parse error:', parseErr)
          setError(
            'Fout bij het verwerken van het MT940-bestand. ' +
            'Het bestand lijkt beschadigd of heeft een ongeldig formaat. ' +
            'Controleer of het een geldig MT940-bankafschrift is.'
          )
          setParsing(false)
          return
        }
      } else if (format === 'ofx') {
        try {
          parsed = await parseOFX(content)
        } catch (parseErr) {
          console.error('OFX parse error:', parseErr)
          setError(
            'Fout bij het verwerken van het OFX-bestand. ' +
            'Het bestand lijkt beschadigd of heeft een ongeldig formaat. ' +
            'Controleer of het een geldig OFX/QFX-bankafschrift is.'
          )
          setParsing(false)
          return
        }
      }

      if (parsed.length === 0) {
        setError(`Geen transacties gevonden in dit bestand. Controleer of het een geldig ${format.toUpperCase()}-bestand is.`)
        setParsing(false)
        return
      }

      // Auto-categorize
      const importRows: ImportRow[] = parsed.map((tx) => {
        const cat = categorizeTransaction(tx.description, tx.counterparty_name, tx.amount, budgets, corrections)
        return {
          ...tx,
          budget_id: cat.budget_id,
          budgetName: cat.budgetName,
          confidence: cat.confidence,
          isDuplicate: false,
          skipImport: false,
        }
      })

      setRows(importRows)
      setStep(2)
    } catch (err) {
      console.error('File processing error:', err)
      setError(
        'Fout bij het verwerken van het bestand. ' +
        'Het bestand is mogelijk beschadigd of niet in een ondersteund formaat. ' +
        'Ondersteunde formaten: MT940, CSV, OFX/QFX.'
      )
    }

    setParsing(false)
  }

  async function handleCSVParse() {
    setParsing(true)
    setError('')
    setShowColumnMapping(false)

    try {
      const parsed = await parseCSV(fileContent, csvPreset)

      if (parsed.length === 0) {
        setError(
          'Geen geldige transacties gevonden in het CSV-bestand. ' +
          'Het bestand is mogelijk beschadigd of de kolom-toewijzingen kloppen niet. ' +
          'Controleer of het bestand geldige datum- en bedragkolommen bevat.'
        )
        setParsing(false)
        return
      }

      const importRows: ImportRow[] = parsed.map((tx) => {
        const cat = categorizeTransaction(tx.description, tx.counterparty_name, tx.amount, budgets, corrections)
        return {
          ...tx,
          budget_id: cat.budget_id,
          budgetName: cat.budgetName,
          confidence: cat.confidence,
          isDuplicate: false,
          skipImport: false,
        }
      })

      setRows(importRows)
      setStep(2)
    } catch (err) {
      console.error('CSV parse error:', err)
      setError(
        'Fout bij het verwerken van het CSV-bestand. ' +
        'Het bestand lijkt beschadigd of heeft een onverwacht formaat. ' +
        'Controleer of het een geldig CSV-bestand van je bank is.'
      )
    }

    setParsing(false)
  }

  function updateCSVPreset(presetId: string) {
    const preset = CSV_PRESETS.find(p => p.id === presetId) ?? CSV_PRESETS[CSV_PRESETS.length - 1]
    setCsvPreset(preset)
    setCsvHeaders(getCSVHeaders(fileContent, preset.delimiter))
    setCsvPreview(getCSVPreview(fileContent, preset.delimiter, preset.hasHeader))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) {
      // Trigger via a synthetic change
      const dt = new DataTransfer()
      dt.items.add(file)
      if (fileInputRef.current) {
        fileInputRef.current.files = dt.files
        fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }
  }

  function updateRowBudget(index: number, budgetId: string) {
    const row = rows[index]
    setRows((prev) => prev.map((r, i) => {
      if (i !== index) return r
      const budget = budgets.find((b) => b.id === budgetId)
      return {
        ...r,
        budget_id: budgetId || null,
        budgetName: budget?.name ?? null,
        confidence: budgetId ? 1.0 : 0,
      }
    }))

    // Save correction for future imports (fire-and-forget)
    if (budgetId && row) {
      const matchField = row.counterparty_name ? 'counterparty_name' : 'description'
      const matchValue = row.counterparty_name || row.description
      if (matchValue) {
        void (async () => {
          const supabase = createClient()
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) return
          // Delete existing correction for this field+value, then insert new one
          await supabase.from('category_corrections')
            .delete()
            .eq('user_id', user.id)
            .eq('match_field', matchField)
            .ilike('match_value', matchValue)
          await supabase.from('category_corrections')
            .insert({ user_id: user.id, match_field: matchField, match_value: matchValue, budget_id: budgetId })
          setCorrections(prev => {
            const filtered = prev.filter(c => !(c.match_field === matchField && c.match_value.toLowerCase() === matchValue.toLowerCase()))
            return [...filtered, { match_field: matchField as 'counterparty_name' | 'description', match_value: matchValue, budget_id: budgetId }]
          })
        })()
      }
    }
  }

  function toggleSkip(index: number) {
    setRows((prev) => prev.map((r, i) =>
      i === index ? { ...r, skipImport: !r.skipImport } : r
    ))
  }

  async function checkDuplicates() {
    setError('')
    setIsNetworkError(false)

    const supabase = createClient()

    let user: { id: string } | null = null
    try {
      const { data } = await supabase.auth.getUser()
      user = data.user
    } catch (err) {
      if (isNetworkFailure(err)) {
        setIsNetworkError(true)
        setError('Geen internetverbinding. Controleer je netwerk en probeer het opnieuw.')
      } else {
        setError('Fout bij het controleren van je sessie.')
      }
      return
    }
    if (!user) return

    const hashes = rows.map((r) => r.import_hash)

    try {
      const { data: existing, error: queryError } = await supabase
        .from('transactions')
        .select('import_hash')
        .eq('user_id', user.id)
        .in('import_hash', hashes)

      if (queryError) {
        if (isNetworkFailure(queryError)) {
          setIsNetworkError(true)
          setError('Geen internetverbinding. Controleer je netwerk en probeer het opnieuw.')
        } else {
          setError(`Fout bij het controleren van duplicaten: ${queryError.message}`)
        }
        return
      }

      if (existing) {
        const existingSet = new Set(existing.map((e) => e.import_hash))
        setRows((prev) => prev.map((r) => ({
          ...r,
          isDuplicate: existingSet.has(r.import_hash),
          skipImport: existingSet.has(r.import_hash) ? true : r.skipImport,
        })))
      }

      setStep(3)
    } catch (err) {
      if (isNetworkFailure(err)) {
        setIsNetworkError(true)
        setError('Geen internetverbinding. Controleer je netwerk en probeer het opnieuw.')
      } else {
        setError('Onverwachte fout bij het controleren van duplicaten. Probeer het opnieuw.')
      }
    }
  }

  async function handleImport(retryFromBatch?: number) {
    setImporting(true)
    setError('')
    setIsNetworkError(false)

    const supabase = createClient()

    let user: { id: string } | null = null
    try {
      const { data } = await supabase.auth.getUser()
      user = data.user
    } catch (err) {
      if (isNetworkFailure(err)) {
        setError('Geen internetverbinding. Controleer je netwerk en probeer het opnieuw.')
        setIsNetworkError(true)
        setImporting(false)
        return
      }
      setError('Fout bij het controleren van je sessie. Probeer het opnieuw.')
      setImporting(false)
      return
    }

    if (!user) {
      setError('Niet ingelogd')
      setImporting(false)
      return
    }

    const toImport = rows.filter((r) => !r.skipImport)

    const insertRows = toImport.map((r) => ({
      user_id: user!.id,
      account_id: selectedAccountId,
      date: r.date,
      amount: r.amount,
      description: r.description,
      counterparty_name: r.counterparty_name,
      counterparty_iban: r.counterparty_iban,
      budget_id: r.budget_id,
      is_income: r.amount > 0,
      category_source: r.budget_id ? 'rule' : 'import',
      import_hash: r.import_hash,
      reference: r.reference,
      transaction_type: r.transaction_type,
    }))

    // Calculate batches
    const BATCH_SIZE = 50
    const batches: typeof insertRows[] = []
    for (let i = 0; i < insertRows.length; i += BATCH_SIZE) {
      batches.push(insertRows.slice(i, i + BATCH_SIZE))
    }

    const startBatch = retryFromBatch ?? importedBatchIndex
    setImportProgress({ current: startBatch * BATCH_SIZE, total: insertRows.length })

    // Insert in batches, resuming from the last successful batch
    for (let batchIdx = startBatch; batchIdx < batches.length; batchIdx++) {
      try {
        const { error: insertError } = await supabase
          .from('transactions')
          .insert(batches[batchIdx])

        if (insertError) {
          // Check if this is a network-related Supabase error
          if (isNetworkFailure(insertError)) {
            const imported = batchIdx * BATCH_SIZE
            setImportedBatchIndex(batchIdx)
            setImportProgress({ current: imported, total: insertRows.length })
            setIsNetworkError(true)
            setError(
              imported > 0
                ? `Netwerkfout: ${imported} van ${insertRows.length} transacties zijn al geïmporteerd. Controleer je verbinding en klik "Opnieuw proberen" om de rest te importeren.`
                : 'Geen internetverbinding. Controleer je netwerk en probeer het opnieuw.'
            )
            setImporting(false)
            return
          }
          // Non-network database error
          setError(`Fout bij importeren: ${insertError.message}`)
          setImporting(false)
          return
        }
      } catch (err) {
        // Catch network-level exceptions (fetch failures, timeouts)
        const imported = batchIdx * BATCH_SIZE
        setImportedBatchIndex(batchIdx)
        setImportProgress({ current: imported, total: insertRows.length })

        if (isNetworkFailure(err)) {
          setIsNetworkError(true)
          setError(
            imported > 0
              ? `Netwerkfout: ${imported} van ${insertRows.length} transacties zijn al geïmporteerd. Controleer je verbinding en klik "Opnieuw proberen" om de rest te importeren.`
              : 'Geen internetverbinding. Controleer je netwerk en probeer het opnieuw.'
          )
        } else {
          setError(`Onverwachte fout bij importeren. ${imported > 0 ? `${imported} transacties zijn al geïmporteerd.` : ''} Probeer het opnieuw.`)
        }
        setImporting(false)
        return
      }

      // Update progress after each successful batch
      const progressCount = Math.min((batchIdx + 1) * BATCH_SIZE, insertRows.length)
      setImportProgress({ current: progressCount, total: insertRows.length })
      setImportedBatchIndex(batchIdx + 1)
    }

    // Reset batch tracking on success
    setImportedBatchIndex(0)
    setStep(4)
    setImporting(false)

    // Trigger badge evaluation after successful import (fire-and-forget)
    fetch('/api/badges/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'import' }),
    }).catch(() => {}) // Silent fail — badges are non-critical
  }

  const newCount = rows.filter((r) => !r.isDuplicate).length
  const dupCount = rows.filter((r) => r.isDuplicate).length
  const toImportCount = rows.filter((r) => !r.skipImport).length
  const totalBij = rows.filter((r) => !r.skipImport && r.amount > 0).reduce((s, r) => s + r.amount, 0)
  const totalAf = rows.filter((r) => !r.skipImport && r.amount < 0).reduce((s, r) => s + r.amount, 0)

  if (loading && !error) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (loading && error) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col items-center justify-center py-20">
          <div className={`rounded-lg border p-6 text-center ${
            isNetworkError
              ? 'border-orange-200 bg-orange-50'
              : 'border-red-200 bg-red-50'
          }`}>
            {isNetworkError && <WifiOff className="mx-auto mb-3 h-8 w-8 text-orange-500" />}
            <p className={`text-sm ${isNetworkError ? 'text-orange-800' : 'text-red-700'}`}>
              {error}
            </p>
            <button
              onClick={loadInitialData}
              className={`mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white ${
                isNetworkError ? 'bg-orange-600 hover:bg-orange-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              <RefreshCw className="h-4 w-4" />
              Opnieuw proberen
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Back */}
      <div className="mb-6">
        <Link
          href="/core/cash"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-3)] hover:text-[var(--ink-2)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar Cash
        </Link>
      </div>

      <h1 className="mb-2 text-2xl font-bold text-[var(--ink)]">Transacties importeren</h1>
      <p className="mb-8 text-sm text-[var(--ink-3)]">Upload een bankbestand (MT940, CSV of OFX) van je bank.</p>

      {/* Steps indicator */}
      <div className="mb-8 flex items-center gap-2 text-sm">
        {['Upload', 'Categoriseer', 'Dubbelingen', 'Klaar'].map((label, i) => {
          const stepNum = i + 1
          const isActive = step === stepNum
          const isDone = step > stepNum

          return (
            <div key={i} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="h-4 w-4 text-[var(--ink-4)]" />}
              <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                isActive ? 'bg-kern-100 text-kern-700' :
                isDone ? 'bg-emerald-100 text-emerald-700' :
                'bg-zinc-100 text-[var(--ink-3)]'
              }`}>
                {isDone ? <Check className="h-3 w-3" /> : <span>{stepNum}</span>}
                <span>{label}</span>
              </div>
            </div>
          )
        })}
      </div>

      {error && (
        <div className={`mb-6 rounded-lg border p-4 text-sm ${
          isNetworkError
            ? 'border-orange-200 bg-orange-50 text-orange-800'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          <div className="flex items-start gap-3">
            {isNetworkError && <WifiOff className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-500" />}
            <div className="flex-1">
              <p>{error}</p>
              {isNetworkError && (
                <button
                  onClick={() => {
                    if (step === 3 && importedBatchIndex > 0) {
                      handleImport(importedBatchIndex)
                    } else if (step === 3) {
                      handleImport()
                    } else if (step === 2) {
                      checkDuplicates()
                    } else {
                      setError('')
                      setIsNetworkError(false)
                    }
                  }}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
                >
                  <RefreshCw className="h-4 w-4" />
                  Opnieuw proberen
                </button>
              )}
            </div>
          </div>
          {isNetworkError && importProgress.total > 0 && importProgress.current > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-orange-600 mb-1">
                <span>{importProgress.current} van {importProgress.total} geïmporteerd</span>
                <span>{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
              </div>
              <div className="h-2 rounded-full bg-orange-200">
                <div
                  className="h-2 rounded-full bg-orange-500 transition-all"
                  style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="space-y-6">
          {/* Account selector */}
          <div>
            <label htmlFor="import-account" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Bankrekening
            </label>
            <select
              id="import-account"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full max-w-sm rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}{a.iban ? ` (${a.iban})` : ''}</option>
              ))}
            </select>
          </div>

          {/* File upload */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border-md)] bg-[var(--subtle)] p-12 hover:border-kern-400 hover:bg-kern-50/30"
          >
            {parsing ? (
              <Loader2 className="h-8 w-8 animate-spin text-kern-500" />
            ) : (
              <>
                <FileText className="h-10 w-10 text-[var(--ink-3)]" />
                <p className="mt-4 text-sm font-medium text-[var(--ink-2)]">
                  Sleep een MT940-bestand hierheen
                </p>
                <p className="mt-1 text-xs text-[var(--ink-3)]">of</p>
                <label className="mt-3 cursor-pointer rounded-lg bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700">
                  <Upload className="mr-2 inline h-4 w-4" />
                  Bestand kiezen
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".sta,.txt,.mt940,.940,.csv,.ofx,.qfx"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
                <p className="mt-3 text-xs text-[var(--ink-3)]">Ondersteunde formaten: MT940 (.sta, .mt940), CSV (.csv), OFX (.ofx, .qfx)</p>
                <p className="mt-1 text-xs text-[var(--ink-3)]">Maximale bestandsgrootte: {MAX_FILE_SIZE_LABEL}</p>
              </>
            )}
          </div>

          {/* CSV Column Mapping */}
          {showColumnMapping && (
            <div className="space-y-4">
              <div className="rounded-lg border border-kern-200 bg-kern-50 p-4">
                <p className="text-sm font-medium text-kern-800">
                  CSV-bestand gedetecteerd: <strong>{fileName}</strong>
                </p>
                <p className="mt-1 text-xs text-kern-600">Kies een preset of wijs kolommen handmatig toe.</p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Bank preset</label>
                <select
                  value={csvPreset.id}
                  onChange={(e) => updateCSVPreset(e.target.value)}
                  className="w-full max-w-sm rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                >
                  {CSV_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>

              {csvPreset.id === 'custom' && csvHeaders.length > 0 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Datum kolom</label>
                      <select
                        value={csvPreset.dateColumn}
                        onChange={(e) => setCsvPreset(prev => ({ ...prev, dateColumn: parseInt(e.target.value) }))}
                        className="w-full rounded-lg border border-[var(--border-md)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                      >
                        {csvHeaders.map((h, i) => (
                          <option key={i} value={i}>{h || `Kolom ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Bedrag kolom</label>
                      <select
                        value={csvPreset.amountColumn}
                        onChange={(e) => setCsvPreset(prev => ({ ...prev, amountColumn: parseInt(e.target.value) }))}
                        className="w-full rounded-lg border border-[var(--border-md)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                      >
                        {csvHeaders.map((h, i) => (
                          <option key={i} value={i}>{h || `Kolom ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Beschrijving kolom</label>
                      <select
                        value={csvPreset.descriptionColumn}
                        onChange={(e) => setCsvPreset(prev => ({ ...prev, descriptionColumn: parseInt(e.target.value) }))}
                        className="w-full rounded-lg border border-[var(--border-md)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                      >
                        {csvHeaders.map((h, i) => (
                          <option key={i} value={i}>{h || `Kolom ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Datum formaat</label>
                      <select
                        value={csvPreset.dateFormat}
                        onChange={(e) => setCsvPreset(prev => ({ ...prev, dateFormat: e.target.value }))}
                        className="w-full rounded-lg border border-[var(--border-md)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                      >
                        <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                        <option value="YYYYMMDD">YYYYMMDD</option>
                        <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                        <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Tegenpartij kolom</label>
                      <select
                        value={csvPreset.counterpartyColumn ?? -1}
                        onChange={(e) => {
                          const v = parseInt(e.target.value)
                          setCsvPreset(prev => ({ ...prev, counterpartyColumn: v === -1 ? null : v }))
                        }}
                        className="w-full rounded-lg border border-[var(--border-md)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                      >
                        <option value={-1}>-- Niet beschikbaar --</option>
                        {csvHeaders.map((h, i) => (
                          <option key={i} value={i}>{h || `Kolom ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">IBAN kolom</label>
                      <select
                        value={csvPreset.ibanColumn ?? -1}
                        onChange={(e) => {
                          const v = parseInt(e.target.value)
                          setCsvPreset(prev => ({ ...prev, ibanColumn: v === -1 ? null : v }))
                        }}
                        className="w-full rounded-lg border border-[var(--border-md)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                      >
                        <option value={-1}>-- Niet beschikbaar --</option>
                        {csvHeaders.map((h, i) => (
                          <option key={i} value={i}>{h || `Kolom ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Referentie kolom</label>
                      <select
                        value={csvPreset.referenceColumn ?? -1}
                        onChange={(e) => {
                          const v = parseInt(e.target.value)
                          setCsvPreset(prev => ({ ...prev, referenceColumn: v === -1 ? null : v }))
                        }}
                        className="w-full rounded-lg border border-[var(--border-md)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                      >
                        <option value={-1}>-- Niet beschikbaar --</option>
                        {csvHeaders.map((h, i) => (
                          <option key={i} value={i}>{h || `Kolom ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview */}
              {csvPreview.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-[var(--ink-3)]">Preview (eerste {csvPreview.length} regels)</p>
                  <div className="overflow-x-auto rounded-lg border border-[var(--border-ed)]">
                    <table className="w-full text-xs">
                      <thead className="bg-[var(--subtle)]">
                        <tr>
                          {csvHeaders.map((h, i) => (
                            <th key={i} className="px-3 py-1.5 text-left font-medium text-[var(--ink-3)]">
                              {h || `Kolom ${i + 1}`}
                              {i === csvPreset.dateColumn && <span className="ml-1 text-kern-500">[D]</span>}
                              {i === csvPreset.amountColumn && <span className="ml-1 text-kern-500">[B]</span>}
                              {i === csvPreset.descriptionColumn && <span className="ml-1 text-kern-500">[O]</span>}
                              {i === csvPreset.counterpartyColumn && <span className="ml-1 text-teal-500">[T]</span>}
                              {i === csvPreset.ibanColumn && <span className="ml-1 text-teal-500">[I]</span>}
                              {i === csvPreset.referenceColumn && <span className="ml-1 text-teal-500">[R]</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {csvPreview.map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => (
                              <td key={ci} className={`max-w-[150px] truncate px-3 py-1.5 ${
                                ci === csvPreset.dateColumn || ci === csvPreset.amountColumn || ci === csvPreset.descriptionColumn
                                  ? 'bg-kern-50/50 font-medium text-[var(--ink)]'
                                  : ci === csvPreset.counterpartyColumn || ci === csvPreset.ibanColumn || ci === csvPreset.referenceColumn
                                    ? 'bg-teal-50/50 font-medium text-[var(--ink)]'
                                    : 'text-[var(--ink-2)]'
                              }`}>
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <button
                onClick={handleCSVParse}
                disabled={parsing}
                className="inline-flex items-center gap-2 rounded-lg bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
              >
                {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                Transacties importeren
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Preview + categorization */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--ink-2)]">
              <strong>{rows.length}</strong> transacties gevonden in <strong>{fileName}</strong>
            </p>
            <button
              onClick={checkDuplicates}
              className="inline-flex items-center gap-2 rounded-lg bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700"
            >
              Volgende: dubbelingen checken
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--border-ed)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--subtle)] text-left">
                <tr>
                  <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Datum</th>
                  <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Beschrijving</th>
                  <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Bedrag</th>
                  <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Budget</th>
                  <th className="px-4 py-2 font-medium text-[var(--ink-3)] text-center">Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-[var(--subtle)]">
                    <td className="whitespace-nowrap px-4 py-2 text-[var(--ink-2)]">
                      {new Date(row.date + 'T00:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="max-w-[300px] truncate px-4 py-2 text-[var(--ink)]">
                      {row.description}
                      {row.counterparty_name && (
                        <span className="ml-1 text-xs text-[var(--ink-3)]">({row.counterparty_name})</span>
                      )}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-2 font-medium ${
                      row.amount > 0 ? 'text-emerald-600' : 'text-[var(--ink)]'
                    }`}>
                      {row.amount > 0 ? '+' : ''}{formatCurrency(row.amount)}
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={row.budget_id ?? ''}
                        onChange={(e) => updateRowBudget(idx, e.target.value)}
                        className="w-full max-w-[200px] rounded border border-[var(--border-ed)] px-2 py-1 text-xs outline-none focus:border-kern-500"
                      >
                        <option value="">Niet gecategoriseerd</option>
                        {budgetGroups
                          .filter((group) => group.children.length > 0)
                          .map((group) => (
                          <optgroup key={group.parent.id} label={group.parent.name}>
                            {group.children.map((child) => (
                              <option key={child.id} value={child.id}>{child.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-center">
                      {row.confidence >= 0.9 ? (
                        <Check className="mx-auto h-4 w-4 text-emerald-500" />
                      ) : row.confidence >= 0.5 ? (
                        <AlertTriangle className="mx-auto h-4 w-4 text-orange-500" />
                      ) : (
                        <X className="mx-auto h-4 w-4 text-red-400" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Step 3: Duplicate detection */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-4 text-sm">
              <span className="text-emerald-600"><strong>{newCount}</strong> nieuwe</span>
              <span className="text-orange-600"><strong>{dupCount}</strong> duplicaten</span>
            </div>
            <button
              onClick={() => handleImport()}
              disabled={importing || toImportCount === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importeren...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  {toImportCount} transacties importeren
                </>
              )}
            </button>
          </div>

          {importing && importProgress.total > 0 && (
            <div className="rounded-lg border border-kern-200 bg-kern-50 p-4">
              <div className="flex justify-between text-xs text-kern-700 mb-1">
                <span>Importeren: {importProgress.current} van {importProgress.total} transacties...</span>
                <span>{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
              </div>
              <div className="h-2 rounded-full bg-kern-200">
                <div
                  className="h-2 rounded-full bg-kern-500 transition-all"
                  style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {dupCount > 0 && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-700">
              <strong>{dupCount}</strong> transactie(s) bestaan al in de database en worden overgeslagen. Je kunt ze handmatig selecteren om toch te importeren.
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-[var(--border-ed)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--subtle)] text-left">
                <tr>
                  <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Importeer</th>
                  <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Datum</th>
                  <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Beschrijving</th>
                  <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Bedrag</th>
                  <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Budget</th>
                  <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((row, idx) => (
                  <tr key={idx} className={`${row.skipImport ? 'bg-[var(--subtle)] opacity-60' : 'hover:bg-[var(--subtle)]'}`}>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={!row.skipImport}
                        onChange={() => toggleSkip(idx)}
                        className="h-4 w-4 rounded border-[var(--border-md)] text-kern-600 focus:ring-kern-500"
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-[var(--ink-2)]">
                      {new Date(row.date + 'T00:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="max-w-[250px] truncate px-4 py-2 text-[var(--ink)]">
                      {row.description}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-2 font-medium ${
                      row.amount > 0 ? 'text-emerald-600' : 'text-[var(--ink)]'
                    }`}>
                      {row.amount > 0 ? '+' : ''}{formatCurrency(row.amount)}
                    </td>
                    <td className="px-4 py-2 text-xs text-[var(--ink-2)]">
                      {row.budgetName ?? 'Niet gecategoriseerd'}
                    </td>
                    <td className="px-4 py-2">
                      {row.isDuplicate ? (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                          Duplicaat
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Nieuw
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Step 4: Success */}
      {step === 4 && (
        <div className="rounded-[var(--r-lg)] border border-emerald-200 bg-emerald-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-6 w-6 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-[var(--ink)]">Import geslaagd!</h2>
          <p className="mt-2 text-sm text-[var(--ink-2)]">
            <strong>{toImportCount}</strong> transacties geïmporteerd.
          </p>
          <div className="mt-2 flex justify-center gap-6 text-sm text-[var(--ink-3)]">
            <span>Totaal bij: <strong className="text-emerald-600">{formatCurrency(totalBij)}</strong></span>
            <span>Totaal af: <strong className="text-red-600">{formatCurrency(Math.abs(totalAf))}</strong></span>
          </div>
          <div className="mt-6">
            <Link
              href="/core/cash"
              className="inline-flex items-center gap-2 rounded-lg bg-kern-600 px-6 py-2 text-sm font-medium text-white hover:bg-kern-700"
            >
              Naar Cash overzicht
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
