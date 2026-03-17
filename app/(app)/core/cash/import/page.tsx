'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Upload, FileText, Check, AlertTriangle, X,
  ChevronRight, Loader2, WifiOff, RefreshCw, ArrowLeftRight, Sparkles,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { parseMT940 } from '@/lib/parsers/mt940'
import { parseCSV, getCSVHeaders, getCSVPreview } from '@/lib/parsers/csv'
import { parseOFX } from '@/lib/parsers/ofx'
import { detectFormat, CSV_PRESETS, type CSVPreset } from '@/lib/parsers/index'
import type { ParsedTransaction } from '@/lib/parsers/shared'
import { categorizeTransaction, isOwnAccountTransfer, buildFrequencyMap, type CategoryCorrection, type FrequencyMatch } from '@/lib/parsers/categorize'
import type { Budget } from '@/lib/budget-data'
import { linkUnmatchedTransfers } from '@/lib/transfer-matching'
import { useToast } from '@/components/app/toast-provider'

type Account = {
  id: string
  name: string
  iban: string | null
}

type AISuggestion = {
  import_hash: string
  budget_slug: string | null
  budget_id: string | null
  confidence: number
  reasoning: string
}

type ImportRow = ParsedTransaction & {
  budget_id: string | null
  budgetName: string | null
  confidence: number
  category_source: string | null
  isDuplicate: boolean
  skipImport: boolean
  isTransfer: boolean
  aiAccepted?: boolean
  userManuallyChanged?: boolean
}

// BulkApplyPrompt removed — live correction propagation now auto-applies

// --- Import session persistence (localStorage) ---
const IMPORT_SESSION_KEY = 'fintwo_import_session'

type ImportSession = {
  id: string
  accountId: string
  fileName: string
  totalRows: number
  completedBatchIndex: number
  importedHashes: string[]
  startedAt: number
}

function saveImportSession(session: ImportSession) {
  try { localStorage.setItem(IMPORT_SESSION_KEY, JSON.stringify(session)) } catch { /* quota exceeded */ }
}

function loadImportSession(): ImportSession | null {
  try {
    const raw = localStorage.getItem(IMPORT_SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as ImportSession
    // Expire sessions older than 24 hours
    if (Date.now() - session.startedAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(IMPORT_SESSION_KEY)
      return null
    }
    return session
  } catch { return null }
}

function clearImportSession() {
  try { localStorage.removeItem(IMPORT_SESSION_KEY) } catch { /* ignore */ }
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
  const { addToast } = useToast()
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
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, failed: 0 })
  const [failedBatches, setFailedBatches] = useState<{ batchIdx: number; error: string; retries: number; rows: Record<string, unknown>[] }[]>([])
  const [showFailedDetails, setShowFailedDetails] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [importedBatchIndex, setImportedBatchIndex] = useState(0)
  const [importStartTime, setImportStartTime] = useState<number | null>(null)
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
  const [freqMap, setFreqMap] = useState<Map<string, FrequencyMatch>>(new Map())
  const [ownIbans, setOwnIbans] = useState<Set<string>>(new Set())
  const [aiSuggestions, setAiSuggestions] = useState<Map<string, AISuggestion>>(new Map())
  const [aiLoading, setAiLoading] = useState(false)
  const [aiReady, setAiReady] = useState(false)
  const [aiError, setAiError] = useState(false)
  const [aiProgress, setAiProgress] = useState({ current: 0, total: 0, skippedHighConf: 0 })
  const [aiFailedBatches, setAiFailedBatches] = useState<Array<{ index: number; payload: Array<{ import_hash: string; description: string; counterparty_name: string | null; amount: number; reference: string | null }> }>>([])
  const [aiRetrying, setAiRetrying] = useState(false)
  // bulkApplyPrompt removed — live correction propagation now applies automatically
  const [checkingDups, setCheckingDups] = useState(false)
  const [pendingSession, setPendingSession] = useState<ImportSession | null>(null)
  const PAGE_SIZE = 50
  const [currentPage, setCurrentPage] = useState(0)
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | 'low' | 'none'>('all')

  const loadInitialData = useCallback(async () => {
    setLoading(true)
    setError('')
    setIsNetworkError(false)

    try {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()

      const [accountsRes, budgetsRes, correctionsRes, ownIbansRes] = await Promise.all([
        supabase.from('bank_accounts').select('id, name, iban').eq('is_active', true).order('sort_order'),
        supabase.from('budgets').select('*').order('sort_order'),
        supabase.from('category_corrections').select('match_field, match_value, budget_id'),
        user ? supabase.from('user_own_ibans').select('iban').eq('user_id', user.id) : Promise.resolve({ data: [], error: null }),
      ])

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
        const ibansFromAccounts = (accountsRes.data as Account[])
          .map((a) => a.iban)
          .filter(Boolean)
          .map((i) => i!.replace(/\s/g, '').toUpperCase())
        const ibansFromOwn = (ownIbansRes.data ?? []).map((r: { iban: string }) => r.iban.replace(/\s/g, '').toUpperCase())
        setOwnIbans(new Set([...ibansFromAccounts, ...ibansFromOwn]))
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

      // Build frequency map from historical transactions (async, non-blocking)
      if (user) {
        buildFrequencyMap(user.id, supabase).then(fm => setFreqMap(fm)).catch(() => { /* non-critical */ })
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

  // Check for pending import session on mount
  useEffect(() => {
    const session = loadImportSession()
    if (session) {
      setPendingSession(session)
    }
  }, [])

  // Semaphore for limiting concurrent AI requests
  async function runWithConcurrency<T>(
    tasks: (() => Promise<T>)[],
    maxConcurrent: number,
    onComplete: (index: number) => void,
  ): Promise<PromiseSettledResult<T>[]> {
    const results: PromiseSettledResult<T>[] = new Array(tasks.length)
    let nextIndex = 0

    async function runNext(): Promise<void> {
      while (nextIndex < tasks.length) {
        const idx = nextIndex++
        try {
          const value = await tasks[idx]()
          results[idx] = { status: 'fulfilled', value }
        } catch (reason) {
          results[idx] = { status: 'rejected', reason }
        }
        onComplete(idx)
      }
    }

    const workers = Array.from({ length: Math.min(maxConcurrent, tasks.length) }, () => runNext())
    await Promise.all(workers)
    return results
  }

  async function enrichWithAI(importRows: ImportRow[], retryPayloads?: typeof aiFailedBatches) {
    // Feature #101: Skip AI for high-confidence rule matches (>= 0.8)
    const allNonTransfer = importRows.filter((r) => !r.isTransfer)
    const highConfidence = allNonTransfer.filter((r) => r.confidence >= 0.8)
    const toEnrich = retryPayloads
      ? [] // when retrying, we use retryPayloads directly
      : allNonTransfer.filter((r) => r.confidence < 0.8)

    if (!retryPayloads && toEnrich.length === 0) return

    setAiLoading(true)
    setAiReady(false)
    setAiError(false)
    if (!retryPayloads) {
      setAiSuggestions(new Map())
      setAiFailedBatches([])
    }
    setAiRetrying(!!retryPayloads)

    try {
      // Build batches of 20
      let batches: Array<{ index: number; payload: Array<{ import_hash: string; description: string; counterparty_name: string | null; amount: number; reference: string | null }> }>

      if (retryPayloads) {
        batches = retryPayloads.map((b, i) => ({ index: i, payload: b.payload }))
      } else {
        const payload = toEnrich.map((r) => ({
          import_hash: r.import_hash,
          description: r.description,
          counterparty_name: r.counterparty_name,
          amount: r.amount,
          reference: r.reference,
        }))

        batches = []
        for (let i = 0; i < payload.length; i += 20) {
          batches.push({ index: batches.length, payload: payload.slice(i, i + 20) })
        }
      }

      const totalTxCount = batches.reduce((sum, b) => sum + b.payload.length, 0)
      setAiProgress({ current: 0, total: totalTxCount, skippedHighConf: retryPayloads ? 0 : highConfidence.length })

      let completedTxCount = 0

      // Feature #100: Parallel AI categorization with concurrency limiter (max 3)
      const tasks = batches.map((batch) => async () => {
        const res = await fetch('/api/ai/categorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactions: batch.payload }),
        })
        if (!res.ok) throw new Error('AI niet beschikbaar')
        return await res.json() as { results: AISuggestion[] }
      })

      const results = await runWithConcurrency(tasks, 3, (idx) => {
        completedTxCount += batches[idx].payload.length
        setAiProgress((prev) => ({ ...prev, current: completedTxCount }))
      })

      // Collect successes and failures
      const allResults: AISuggestion[] = []
      const failed: typeof aiFailedBatches = []

      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          allResults.push(...result.value.results)
        } else {
          failed.push(batches[idx])
        }
      })

      // Merge with existing suggestions (important for retry flow)
      const map = new Map<string, AISuggestion>(retryPayloads ? aiSuggestions : [])
      for (const s of allResults) {
        if (s.budget_id && s.confidence >= 0.5) {
          map.set(s.import_hash, s)
        }
      }
      setAiSuggestions(map)
      setAiFailedBatches(failed)
      setAiReady(true)

      // If all batches failed, show error
      if (allResults.length === 0 && failed.length > 0) {
        setAiError(true)
      }
    } catch {
      setAiError(true)
    } finally {
      setAiLoading(false)
      setAiRetrying(false)
    }
  }

  // Maximum file size: 10 MB
  const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
  const MAX_FILE_SIZE_LABEL = '10 MB'

  // Check for duplicates against existing transactions.
  // When called with rowsParam (after parsing), sets rows + goes to step 2.
  // When called without param (retry), re-checks current rows state.
  async function checkDuplicates(rowsParam?: ImportRow[]) {
    setError('')
    setIsNetworkError(false)
    setCheckingDups(true)

    // If called with fresh rows after parsing, set them immediately and go to step 2
    if (rowsParam) {
      setRows(rowsParam)
      setCurrentPage(0)
      setStep(2)
    }

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
      setCheckingDups(false)
      return
    }
    if (!user) {
      setCheckingDups(false)
      return
    }

    const sourceRows = rowsParam ?? rows

    const minDate = sourceRows.reduce((min, r) => r.date < min ? r.date : min, sourceRows[0].date)
    const maxDate = sourceRows.reduce((max, r) => r.date > max ? r.date : max, sourceRows[0].date)

    try {
      // Single range-query: all transactions within the import's date range
      // Replaces the fragile .in('import_hash', hashes) approach that silently failed on large imports
      const { data: existing, error: queryError } = await supabase
        .from('transactions')
        .select('date, amount, description')
        .eq('user_id', user.id)
        .gte('date', minDate)
        .lte('date', maxDate)
        .limit(50000)

      if (queryError) {
        if (isNetworkFailure(queryError)) {
          setIsNetworkError(true)
          setError('Geen internetverbinding. Controleer je netwerk en probeer het opnieuw.')
        } else {
          setError(`Fout bij het controleren van duplicaten: ${queryError.message}`)
        }
        setCheckingDups(false)
        return
      }

      // Build a content-Set with normalized keys
      const contentSet = new Set<string>()
      if (existing) {
        for (const t of existing) {
          // DB returns NUMERIC as string ("8.10", "100", "-143.13")
          // parseFloat → String normalizes both sides to the same representation
          const normalizedAmount = String(parseFloat(String(t.amount)))
          const key = `${t.date}|${normalizedAmount}|${String(t.description ?? '').slice(0, 100)}`
          contentSet.add(key)
        }
      }

      // Also check hashes from pending import session (crash recovery)
      const pendingHashes = new Set<string>()
      const session = loadImportSession()
      if (session?.importedHashes) {
        for (const h of session.importedHashes) pendingHashes.add(h)
      }

      const markDups = (r: ImportRow) => {
        const normalizedAmount = String(parseFloat(String(r.amount)))
        const contentKey = `${r.date}|${normalizedAmount}|${r.description.slice(0, 100)}`
        const isDuplicate = contentSet.has(contentKey) || pendingHashes.has(r.import_hash)
        return {
          ...r,
          isDuplicate,
          skipImport: isDuplicate ? true : r.skipImport,
        }
      }

      // Phase 3: within-file dedup — same hash appearing more than once in the import
      // (e.g. two identical transactions on the same day from the same merchant)
      const seenInFile = new Set<string>()
      const applyFileDedup = (r: ImportRow) => {
        if (r.isDuplicate) { seenInFile.add(r.import_hash); return r }
        if (seenInFile.has(r.import_hash)) return { ...r, isDuplicate: true, skipImport: true }
        seenInFile.add(r.import_hash)
        return r
      }

      if (rowsParam) {
        setRows(rowsParam.map(markDups).map(applyFileDedup))
      } else {
        setRows((prev) => prev.map(markDups).map(applyFileDedup))
      }

      setCheckingDups(false)
    } catch (err) {
      if (isNetworkFailure(err)) {
        setIsNetworkError(true)
        setError('Geen internetverbinding. Controleer je netwerk en probeer het opnieuw.')
      } else {
        setError('Onverwachte fout bij het controleren van duplicaten. Probeer het opnieuw.')
      }
      setCheckingDups(false)
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setError('')

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1)
      setError(
        `Het bestand "${file.name}" is te groot (${fileSizeMB} MB). ` +
        `De maximale bestandsgrootte is ${MAX_FILE_SIZE_LABEL}. ` +
        'Probeer een kleiner bestand te uploaden of splits het bestand op in meerdere delen.'
      )
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
        const semiCount = (content.split('\n')[0]?.match(/;/g) || []).length
        const commaCount = (content.split('\n')[0]?.match(/,/g) || []).length
        const tabCount = (content.split('\n')[0]?.match(/\t/g) || []).length

        let bestPreset = CSV_PRESETS.find(p => p.id === 'custom')!
        if (semiCount > commaCount && semiCount > tabCount) {
          bestPreset = CSV_PRESETS.find(p => p.id === 'ing') ?? bestPreset
        } else if (tabCount > commaCount) {
          bestPreset = CSV_PRESETS.find(p => p.id === 'abn') ?? bestPreset
        }
        const firstLineLower = content.split('\n')[0]?.toLowerCase() ?? ''
        if (firstLineLower.includes('tijdzone') || firstLineLower.includes('transactie-id')) {
          bestPreset = CSV_PRESETS.find(p => p.id === 'paypal') ?? bestPreset
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

      const importRows: ImportRow[] = parsed.map((tx) => {
        const isTransfer = isOwnAccountTransfer(tx.counterparty_iban, ownIbans)
        const cat = isTransfer
          ? { budget_id: null, confidence: 1.0, budgetName: null, category_source: 'transfer' }
          : categorizeTransaction(tx.description, tx.counterparty_name, tx.amount, budgets, corrections, undefined, tx.counterparty_iban, freqMap)
        return {
          ...tx,
          budget_id: cat.budget_id,
          budgetName: cat.budgetName,
          confidence: cat.confidence,
          category_source: cat.category_source ?? null,
          isDuplicate: false,
          skipImport: false,
          isTransfer,
          transaction_type: isTransfer ? 'transfer' : tx.transaction_type,
        }
      })

      // First check duplicates, then go to step 2
      void checkDuplicates(importRows)
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
        const isTransfer = isOwnAccountTransfer(tx.counterparty_iban, ownIbans)
        const cat = isTransfer
          ? { budget_id: null, confidence: 1.0, budgetName: null, category_source: 'transfer' }
          : categorizeTransaction(tx.description, tx.counterparty_name, tx.amount, budgets, corrections, undefined, tx.counterparty_iban, freqMap)
        return {
          ...tx,
          budget_id: cat.budget_id,
          budgetName: cat.budgetName,
          confidence: cat.confidence,
          category_source: cat.category_source ?? null,
          isDuplicate: false,
          skipImport: false,
          isTransfer,
          transaction_type: isTransfer ? 'transfer' : tx.transaction_type,
        }
      })

      // First check duplicates, then go to step 2
      void checkDuplicates(importRows)
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
      const dt = new DataTransfer()
      dt.items.add(file)
      if (fileInputRef.current) {
        fileInputRef.current.files = dt.files
        fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }
  }

  function updateRowBudget(index: number, budgetId: string, source: 'user' | 'ai' = 'user') {
    const row = rows[index]
    const budget = budgets.find((b) => b.id === budgetId)
    const isUserChange = source === 'user'

    // Determine counterparty match criteria
    const matchField = row?.counterparty_name ? 'counterparty_name' as const : 'description' as const
    const matchValue = row?.counterparty_name || row?.description || ''

    // Update the target row + auto-propagate to siblings with same counterparty
    setRows((prev) => {
      let siblingCount = 0
      const updated = prev.map((r, i) => {
        // The row being changed
        if (i === index) {
          return {
            ...r,
            budget_id: budgetId || null,
            budgetName: budget?.name ?? null,
            confidence: budgetId ? 1.0 : 0,
            category_source: budgetId ? (isUserChange ? 'correction' : source) : null,
            aiAccepted: source === 'ai',
            userManuallyChanged: isUserChange,
          }
        }
        // Auto-propagate to siblings: same counterparty, not manually changed, not transfer, not skipped
        if (isUserChange && budgetId && matchValue && !r.userManuallyChanged && !r.isTransfer && !r.skipImport) {
          const matches = matchField === 'counterparty_name'
            ? r.counterparty_name?.toLowerCase() === matchValue.toLowerCase()
            : r.description?.toLowerCase().includes(matchValue.toLowerCase())
          if (matches) {
            siblingCount++
            return {
              ...r,
              budget_id: budgetId,
              budgetName: budget?.name ?? null,
              confidence: 1.0,
              category_source: 'correction',
              aiAccepted: false,
            }
          }
        }
        return r
      })

      // Show toast for auto-propagated siblings (deferred to avoid setState-in-render)
      if (siblingCount > 0 && budget) {
        setTimeout(() => {
          addToast({
            type: 'success',
            title: `Budget toegepast op ${siblingCount} vergelijkbare transactie${siblingCount === 1 ? '' : 's'}`,
            message: `${budget.name} → ${matchValue}`,
            duration: 3000,
          })
        }, 0)
      }

      return updated
    })

    // Save correction to category_corrections table
    if (budgetId && row && matchValue && isUserChange) {
      void (async () => {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
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

  function toggleSkip(index: number) {
    setRows((prev) => prev.map((r, i) =>
      i === index ? { ...r, skipImport: !r.skipImport } : r
    ))
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

    // Safety net: remove any duplicate hashes that may have slipped through the check
    const seenHashes = new Set<string>()
    const toImportDeduped = toImport.filter((r) => {
      if (seenHashes.has(r.import_hash)) return false
      seenHashes.add(r.import_hash)
      return true
    })

    const insertRows = toImportDeduped.map((r) => ({
      user_id: user!.id,
      account_id: selectedAccountId,
      date: r.date,
      amount: r.amount,
      description: r.description,
      counterparty_name: r.counterparty_name,
      counterparty_iban: r.counterparty_iban,
      budget_id: r.isTransfer ? null : r.budget_id,
      is_income: r.amount > 0,
      category_source: r.isTransfer ? 'transfer' : (r.category_source ?? (r.aiAccepted ? 'ai' : r.budget_id ? 'rule' : 'import')),
      import_hash: r.import_hash,
      reference: r.reference,
      transaction_type: r.isTransfer ? 'transfer' : r.transaction_type,
    }))

    const BATCH_SIZE = 100
    const batches: typeof insertRows[] = []
    for (let i = 0; i < insertRows.length; i += BATCH_SIZE) {
      batches.push(insertRows.slice(i, i + BATCH_SIZE))
    }

    const startBatch = retryFromBatch ?? importedBatchIndex
    setImportProgress({ current: startBatch * BATCH_SIZE, total: insertRows.length, failed: 0 })
    setImportStartTime(Date.now())
    let failedCount = 0

    // Persist import session to localStorage for crash recovery
    const sessionId = `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const importedHashesSoFar: string[] = []
    saveImportSession({
      id: sessionId,
      accountId: selectedAccountId,
      fileName,
      totalRows: insertRows.length,
      completedBatchIndex: startBatch,
      importedHashes: importedHashesSoFar,
      startedAt: Date.now(),
    })

    const newFailedBatches: typeof failedBatches = []

    for (let batchIdx = startBatch; batchIdx < batches.length; batchIdx++) {
      let batchFailed = false
      let batchError = ""

      try {
        const { error: insertError } = await supabase
          .from("transactions")
          .insert(batches[batchIdx])
        if (insertError) {
          batchFailed = true
          batchError = insertError.message
        }
      } catch (err) {
        batchFailed = true
        batchError = err instanceof Error ? err.message : "Onbekende fout"
      }

      if (batchFailed) {
        failedCount += batches[batchIdx].length
        newFailedBatches.push({ batchIdx, error: batchError, retries: 0, rows: batches[batchIdx] })
      } else {
        // Track successfully imported hashes for crash recovery
        for (const row of batches[batchIdx]) {
          importedHashesSoFar.push((row as { import_hash: string }).import_hash)
        }
      }

      const progressCount = Math.min((batchIdx + 1) * BATCH_SIZE, insertRows.length)
      setImportProgress({ current: progressCount, total: insertRows.length, failed: failedCount })
      setImportedBatchIndex(batchIdx + 1)

      // Update localStorage session after each batch
      saveImportSession({
        id: sessionId,
        accountId: selectedAccountId,
        fileName,
        totalRows: insertRows.length,
        completedBatchIndex: batchIdx + 1,
        importedHashes: importedHashesSoFar,
        startedAt: Date.now(),
      })
    }

    // Import complete — clear session from localStorage
    clearImportSession()
    setPendingSession(null)

    setFailedBatches(newFailedBatches)
    setImportedBatchIndex(0)
    setImportStartTime(null)
    setStep(4)
    setImporting(false)

    // Link transfer pairs in background (non-blocking)
    if (failedCount < insertRows.length) {
      linkUnmatchedTransfers(supabase, user!.id).catch(console.error)
    }
  }

  async function retryFailedBatches() {
    if (failedBatches.length === 0) return
    setRetrying(true)
    setError("")
    const supabase = createClient()
    const remaining: typeof failedBatches = []

    for (const fb of failedBatches) {
      if (fb.retries >= 2) {
        remaining.push(fb)
        continue
      }
      let ok = true
      let errMsg = ""
      try {
        const { error: insertError } = await supabase.from("transactions").insert(fb.rows)
        if (insertError) { ok = false; errMsg = insertError.message }
      } catch (err) {
        ok = false
        errMsg = err instanceof Error ? err.message : "Onbekende fout"
      }
      if (!ok) {
        remaining.push({ ...fb, retries: fb.retries + 1, error: errMsg })
      }
    }

    const stillFailed = remaining.reduce((sum, fb) => sum + fb.rows.length, 0)
    setFailedBatches(remaining)
    setImportProgress((prev) => ({ ...prev, failed: stillFailed }))

    if (remaining.length === 0) {
      const { data } = await supabase.auth.getUser()
      if (data.user) linkUnmatchedTransfers(supabase, data.user.id).catch(console.error)
    } else if (remaining.every((fb) => fb.retries >= 2)) {
      setError(`${stillFailed} transacties konden niet worden geïmporteerd na meerdere pogingen.`)
    }
    setRetrying(false)
  }

  const newCount = rows.filter((r) => !r.isDuplicate).length
  const dupCount = rows.filter((r) => r.isDuplicate).length
  const toImportCount = rows.filter((r) => !r.skipImport).length
  const totalBij = rows.filter((r) => !r.skipImport && r.amount > 0).reduce((s, r) => s + r.amount, 0)
  const totalAf = rows.filter((r) => !r.skipImport && r.amount < 0).reduce((s, r) => s + r.amount, 0)

  // Compute date range from imported rows for post-import navigation and display
  const importDateRange = useMemo(() => {
    const imported = rows.filter((r) => !r.skipImport && r.date)
    if (imported.length === 0) return null
    const minDate = imported.reduce((min, r) => r.date < min ? r.date : min, imported[0].date)
    const maxDate = imported.reduce((max, r) => r.date > max ? r.date : max, imported[0].date)
    return { min: minDate, max: maxDate, minMonth: minDate.slice(0, 7), maxMonth: maxDate.slice(0, 7) }
  }, [rows])

  const importedMinMonth = importDateRange?.minMonth ?? null

  // Pagination helper for step 2 and step 3 tables
  function PaginationBar({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
    if (totalPages <= 1) return null
    return (
      <div className="flex items-center justify-between border-t border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-2">
        <span className="text-xs text-[var(--ink-3)]">
          Pagina {page + 1} van {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
            className="rounded border border-[var(--border-md)] px-3 py-1 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--paper)] disabled:opacity-40"
          >
            Vorige
          </button>
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange(page + 1)}
            className="rounded border border-[var(--border-md)] px-3 py-1 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--paper)] disabled:opacity-40"
          >
            Volgende
          </button>
        </div>
      </div>
    )
  }

  if (loading && !error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (loading && error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
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
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Back */}
      <div className="mb-3 sm:mb-6">
        <Link
          href="/core/cash"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-3)] hover:text-[var(--ink-2)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar Cash
        </Link>
      </div>

      <h1 className="mb-2 text-2xl font-bold text-[var(--ink)]">Transacties importeren</h1>
      <p className="mb-5 sm:mb-8 text-sm text-[var(--ink-3)]">Upload een bankbestand (MT940, CSV of OFX) van je bank.</p>

      {/* Steps indicator */}
      <div className="mb-5 sm:mb-8 flex items-center gap-2 text-sm">
        {['Upload', 'Dubbelingen', 'Categoriseer', 'Klaar'].map((label, i) => {
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
        <div className={`mb-3 sm:mb-6 rounded-lg border p-4 text-sm ${
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
                      void checkDuplicates()
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

      {/* Pending import session banner */}
      {pendingSession && step === 1 && (
        <div className="mb-4 rounded-lg border border-kern-300 bg-kern-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-kern-800">
                Onafgeronde import gevonden
              </p>
              <p className="mt-1 text-xs text-kern-600">
                Bestand: <strong>{pendingSession.fileName}</strong> — {pendingSession.importedHashes.length} van {pendingSession.totalRows} transacties geïmporteerd.
              </p>
              <p className="mt-0.5 text-xs text-[var(--ink-4)]">
                Gestart op {new Date(pendingSession.startedAt).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => {
                  clearImportSession()
                  setPendingSession(null)
                }}
                className="rounded border border-[var(--border-md)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
              >
                Verwijderen
              </button>
            </div>
          </div>
          {pendingSession.importedHashes.length > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-kern-600 mb-1">
                <span>{pendingSession.importedHashes.length} van {pendingSession.totalRows} geïmporteerd</span>
                <span>{Math.round((pendingSession.importedHashes.length / pendingSession.totalRows) * 100)}%</span>
              </div>
              <div className="h-2 rounded-full bg-kern-200">
                <div
                  className="h-2 rounded-full bg-kern-500 transition-all"
                  style={{ width: `${(pendingSession.importedHashes.length / pendingSession.totalRows) * 100}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-kern-600">
                Upload hetzelfde bestand opnieuw om verder te gaan. Al geïmporteerde transacties worden automatisch overgeslagen.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="space-y-4 sm:space-y-6">
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

              {csvPreset.id === 'paypal' && (
                <div className="rounded-lg border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-4 text-sm">
                  <p className="font-medium text-[var(--ink-2)]">Hoe exporteer je een PayPal CSV?</p>
                  <ol className="mt-2 space-y-1 text-xs text-[var(--ink-3)] list-decimal list-inside">
                    <li>Log in op paypal.com</li>
                    <li>Ga naar <strong className="text-[var(--ink-2)]">Activiteiten</strong> → <strong className="text-[var(--ink-2)]">Alle transacties</strong></li>
                    <li>Klik op <strong className="text-[var(--ink-2)]">Downloaden</strong> en kies <strong className="text-[var(--ink-2)]">CSV</strong></li>
                    <li>Upload het gedownloade bestand hierboven</li>
                  </ol>
                  <p className="mt-2 text-xs text-[var(--ink-4)]">
                    Alleen transacties met status "Voltooid" worden geïmporteerd. Bedragen zijn netto (incl. PayPal-kosten).
                  </p>
                </div>
              )}

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

      {/* Step 2: Dubbelingen */}
      {step === 2 && (
        <div className="space-y-4">
          {checkingDups ? (
            <div className="flex items-center justify-center gap-3 py-16">
              <Loader2 className="h-5 w-5 animate-spin text-kern-500" />
              <p className="text-sm text-[var(--ink-2)]">Controleren op dubbelingen…</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex gap-4 text-sm">
                  <span className="text-emerald-600"><strong>{newCount}</strong> nieuw</span>
                  {dupCount > 0 && (
                    <span className="text-orange-600"><strong>{dupCount}</strong> {dupCount === 1 ? 'duplicaat' : 'duplicaten'}</span>
                  )}
                </div>
                <button
                  onClick={() => { setCurrentPage(0); setStep(3) }}
                  className="inline-flex items-center gap-2 rounded-lg bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700"
                >
                  Volgende: categoriseren
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {dupCount > 0 && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-700">
                  <strong>{dupCount}</strong> transactie(s) bestaan al in de database en worden overgeslagen. Je kunt ze hieronder aan- of uitvinken.
                </div>
              )}

              {(() => {
                const step2TotalPages = Math.ceil(rows.length / PAGE_SIZE)
                const step2PageRows = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
                const step2Offset = currentPage * PAGE_SIZE
                return (
                  <div className="overflow-x-auto rounded-xl border border-[var(--border-ed)]">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--subtle)] text-left">
                        <tr>
                          <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Importeer</th>
                          <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Datum</th>
                          <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Beschrijving</th>
                          <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Bedrag</th>
                          <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {step2PageRows.map((row, localIdx) => {
                          const realIdx = step2Offset + localIdx
                          return (
                            <tr key={realIdx} className={`${row.skipImport ? 'bg-[var(--subtle)] opacity-60' : 'hover:bg-[var(--subtle)]'}`}>
                              <td className="px-4 py-2">
                                <input
                                  type="checkbox"
                                  checked={!row.skipImport}
                                  onChange={() => toggleSkip(realIdx)}
                                  className="h-4 w-4 rounded border-[var(--border-md)] text-kern-600 focus:ring-kern-500"
                                />
                              </td>
                              <td className="whitespace-nowrap px-4 py-2 text-[var(--ink-2)]">
                                {new Date(row.date + 'T00:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                              </td>
                              <td className="max-w-[300px] truncate px-4 py-2 text-[var(--ink)]">
                                {row.description}
                                {row.counterparty_name && (
                                  <span className="ml-1 text-xs text-[var(--ink-3)]">({row.counterparty_name})</span>
                                )}
                              </td>
                              <td className={`whitespace-nowrap px-4 py-2 font-mono font-medium ${
                                row.amount > 0 ? 'text-emerald-600' : 'text-[var(--ink)]'
                              }`}>
                                {row.amount > 0 ? '+' : ''}{formatCurrency(row.amount)}
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
                          )
                        })}
                      </tbody>
                    </table>
                    <PaginationBar page={currentPage} totalPages={step2TotalPages} onPageChange={setCurrentPage} />
                  </div>
                )
              })()}
            </>
          )}
        </div>
      )}

      {/* Step 3: Categoriseer + Importeer */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--ink-2)]">
              <strong>{toImportCount}</strong> transacties om te importeren uit <strong>{fileName}</strong>
            </p>
            <div className="flex items-center gap-2">
              {/* Ask Will button — only show when AI hasn't been triggered yet */}
              {!aiLoading && !aiReady && !aiError && (
                <button
                  type="button"
                  onClick={() => void enrichWithAI(rows.filter(r => !r.skipImport))}
                  className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-kern-300 px-3 py-1.5 text-xs font-medium text-kern-700 hover:bg-kern-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Vraag Will
                </button>
              )}
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
          </div>

          {/* Import progress */}
          {importing && importProgress.total > 0 && (() => {
            const pct = Math.round((importProgress.current / importProgress.total) * 100)
            const batchNum = Math.ceil(importProgress.current / 100) || 1
            const totalBatches = Math.ceil(importProgress.total / 100)
            const elapsed = importStartTime ? (Date.now() - importStartTime) / 1000 : 0
            const rate = elapsed > 0 && importProgress.current > 0 ? importProgress.current / elapsed : 0
            const remaining = rate > 0 ? Math.ceil((importProgress.total - importProgress.current) / rate) : null
            const remainingStr = remaining !== null && remaining > 0
              ? remaining >= 60
                ? `~${Math.ceil(remaining / 60)} min resterend`
                : `~${remaining}s resterend`
              : null
            return (
              <div className="rounded-lg border border-kern-200 bg-kern-50 p-4">
                <div className="flex justify-between text-xs text-kern-700 mb-1.5">
                  <span className="font-medium">
                    Importeren: {importProgress.current} van {importProgress.total} transacties
                    <span className="text-[var(--ink-4)] ml-1.5">(batch {batchNum}/{totalBatches})</span>
                  </span>
                  <span className="font-mono tabular-nums font-semibold">{pct}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-kern-200 overflow-hidden">
                  <div
                    className="h-2.5 rounded-full bg-kern-500"
                    style={{
                      width: `${(importProgress.current / importProgress.total) * 100}%`,
                      transition: 'width 0.4s ease-out',
                    }}
                  />
                </div>
                {remainingStr && (
                  <p className="mt-1.5 text-[11px] text-[var(--ink-4)]">{remainingStr}</p>
                )}
              </div>
            )
          })()}

          {/* AI loading banner with batch progress */}
          {aiLoading && (
            <div className="rounded-[var(--r-lg)] border border-dashed border-kern-200 bg-kern-50/50 px-4 py-3 space-y-2">
              <div className="flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-kern-500 shrink-0" />
                <p className="text-sm text-kern-700">
                  {aiRetrying ? 'Will herprobeert gefaalde batches…' : (
                    aiProgress.total > 0
                      ? <>Will categoriseert… <span className="font-mono tabular-nums font-medium">{aiProgress.current}</span> van <span className="font-mono tabular-nums font-medium">{aiProgress.total}</span> transacties</>
                      : <>Will analyseert…</>
                  )}
                </p>
              </div>
              {aiProgress.total > 0 && (
                <div className="h-1.5 rounded-full bg-kern-200 overflow-hidden">
                  <div
                    className="h-1.5 rounded-full bg-kern-500"
                    style={{
                      width: `${(aiProgress.current / aiProgress.total) * 100}%`,
                      transition: 'width 0.4s ease-out',
                    }}
                  />
                </div>
              )}
              {aiProgress.skippedHighConf > 0 && (
                <p className="text-[11px] text-[var(--ink-4)]">
                  {aiProgress.skippedHighConf} transacties automatisch herkend (overgeslagen)
                </p>
              )}
            </div>
          )}

          {/* AI ready banner */}
          {aiReady && aiSuggestions.size > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 rounded-[var(--r-lg)] border border-kern-300 bg-kern-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-4 w-4 text-kern-600 shrink-0" />
                  <p className="text-sm font-medium text-kern-700">
                    Will heeft {aiSuggestions.size} {aiSuggestions.size === 1 ? 'voorstel' : 'voorstellen'}
                    {aiProgress.skippedHighConf > 0 && (
                      <span className="text-[var(--ink-3)] font-normal ml-1">
                        · {aiProgress.skippedHighConf} automatisch herkend
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRows((prev) => prev.map((r) => {
                      const s = aiSuggestions.get(r.import_hash)
                      if (!s || !s.budget_id) return r
                      const budget = budgets.find((b) => b.id === s.budget_id)
                      return { ...r, budget_id: s.budget_id, budgetName: budget?.name ?? null, confidence: s.confidence, category_source: 'ai', aiAccepted: true }
                    }))
                  }}
                  className="inline-flex items-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-kern-700"
                >
                  <Check className="h-3.5 w-3.5" />
                  Alles goedkeuren
                </button>
              </div>
              {/* Failed batches retry button */}
              {aiFailedBatches.length > 0 && (
                <div className="flex items-center justify-between gap-3 rounded-[var(--r-lg)] border border-orange-200 bg-orange-50 px-4 py-3">
                  <p className="text-sm text-orange-700">
                    {aiFailedBatches.reduce((sum, b) => sum + b.payload.length, 0)} transacties konden niet gecategoriseerd worden
                  </p>
                  <button
                    type="button"
                    onClick={() => void enrichWithAI(rows.filter(r => !r.skipImport), aiFailedBatches)}
                    className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-orange-300 px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-100"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Opnieuw proberen
                  </button>
                </div>
              )}
            </div>
          )}

          {/* AI error banner */}
          {aiError && (
            <div className="rounded-[var(--r-lg)] border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
              Will is even niet beschikbaar — categoriseer handmatig.
            </div>
          )}

          {/* Bulk-apply is now automatic — see updateRowBudget auto-propagation + toast */}

          {/* Transfer banner */}
          {rows.some((r) => r.isTransfer && !r.skipImport) && (
            <div className="rounded-[var(--r-lg)] border border-[var(--hor-m)] bg-[var(--hor-l)] px-4 py-3 flex items-start gap-3">
              <ArrowLeftRight className="h-4 w-4 text-[var(--hor-t)] mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-[var(--ink-2)]">
                  {rows.filter((r) => r.isTransfer && !r.skipImport).length} eigen {rows.filter((r) => r.isTransfer && !r.skipImport).length === 1 ? 'overboeking' : 'overboekingen'} herkend
                </p>
                <p className="text-xs italic text-[var(--ink-3)] font-[var(--font-source-serif)]">
                  Deze transacties worden geïmporteerd maar tellen niet mee in budgetten of geldstroom.
                </p>
              </div>
            </div>
          )}

          {/* Confidence filter buttons */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-[var(--ink-3)]">Filter:</span>
            {([['all', 'Alles'], ['low', 'Lage confidence'], ['none', 'Zonder budget']] as const).map(([key, label]) => {
              const count = key === 'all'
                ? rows.filter((r) => !r.skipImport).length
                : key === 'low'
                  ? rows.filter((r) => !r.skipImport && !r.isTransfer && r.confidence > 0 && r.confidence < 0.9).length
                  : rows.filter((r) => !r.skipImport && !r.isTransfer && !r.budget_id).length
              return (
                <button key={key} type="button"
                  onClick={() => { setConfidenceFilter(key); setCurrentPage(0) }}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${confidenceFilter === key ? 'bg-kern-600 text-white' : 'border border-[var(--border-ed)] text-[var(--ink-3)] hover:bg-[var(--subtle)]'}`}
                >{label} ({count})</button>
              )
            })}
          </div>

          {/* Categorization table — filtered, sorted by confidence, paginated */}
          {(() => {
            const allVisible = rows.map((row, idx) => ({ row, realIdx: idx })).filter(({ row }) => !row.skipImport)
            const filteredRows = confidenceFilter === 'all' ? allVisible : confidenceFilter === 'low' ? allVisible.filter(({ row }) => !row.isTransfer && row.confidence > 0 && row.confidence < 0.9) : allVisible.filter(({ row }) => !row.isTransfer && !row.budget_id)
            const sortedRows = [...filteredRows].sort((a, b) => { if (a.row.isTransfer !== b.row.isTransfer) return a.row.isTransfer ? 1 : -1; return a.row.confidence - b.row.confidence })
            const step3TotalPages = Math.ceil(sortedRows.length / PAGE_SIZE)
            const step3PageRows = sortedRows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
            const SRC: Record<string, string> = { correction: 'Correctieregel', frequency: 'Frequentie', rule: 'Trefwoord', ai: 'AI (Will)', user: 'Handmatig', transfer: 'Eigen rekening' }
            return (
              <div className="overflow-x-auto rounded-xl border border-[var(--border-ed)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--subtle)] text-left">
                    <tr>
                      <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Datum</th>
                      <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Beschrijving</th>
                      <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Bedrag</th>
                      <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Budget</th>
                      <th className="px-4 py-2 font-medium text-[var(--ink-3)] text-center">Bron</th>
                      <th className="px-4 py-2 font-medium text-[var(--ink-3)] text-center">Match</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {step3PageRows.map(({ row, realIdx }) => (
                      <tr key={realIdx} className={row.isTransfer ? 'bg-[var(--subtle)]/50' : 'hover:bg-[var(--subtle)]'}>
                        <td className="whitespace-nowrap px-4 py-2 text-[var(--ink-2)]">
                          {new Date(row.date + 'T00:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                        </td>
                        <td className="max-w-[300px] truncate px-4 py-2 text-[var(--ink)]">
                          {row.description}
                          {row.counterparty_name && (
                            <span className="ml-1 text-xs text-[var(--ink-3)]">({row.counterparty_name})</span>
                          )}
                        </td>
                        <td className={`whitespace-nowrap px-4 py-2 font-mono font-medium ${
                          row.isTransfer ? 'text-[var(--ink-2)]' : row.amount > 0 ? 'text-emerald-600' : 'text-[var(--ink)]'
                        }`}>
                          {!row.isTransfer && (row.amount > 0 ? '+' : '')}{formatCurrency(row.amount)}
                        </td>
                        <td className="px-4 py-2">
                          {row.isTransfer ? (
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-[var(--subtle)] border border-[var(--border-ed)] px-2 py-0.5 text-[9px] font-medium uppercase tracking-[.06em] text-[var(--ink-3)]">
                                Eigen rekening
                              </span>
                              <button
                                type="button"
                                onClick={() => setRows((prev) => prev.map((r, i) =>
                                  i === realIdx ? { ...r, isTransfer: false, transaction_type: null } : r
                                ))}
                                className="text-[11px] italic text-[var(--ink-4)] hover:text-kern-600 font-[var(--font-source-serif)]"
                              >
                                Toch als uitgave?
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {/* AI proposal block */}
                              {(() => {
                                const s = aiSuggestions.get(row.import_hash)
                                if (!s?.budget_id) return null
                                if (row.aiAccepted) {
                                  return (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-medium text-emerald-700">
                                      <Check className="h-2.5 w-2.5" />
                                      Gekeurd
                                    </span>
                                  )
                                }
                                return (
                                  <div className="rounded border border-dashed border-kern-200 bg-kern-50/50 px-2 py-1.5">
                                    <p className="font-[var(--font-source-serif)] text-[10px] italic text-[var(--ink-3)] line-clamp-1">{s.reasoning}</p>
                                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                      <span className="inline-flex items-center gap-0.5 rounded-full bg-kern-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[.06em] text-kern-700">
                                        <Sparkles className="h-2.5 w-2.5" />
                                        Will
                                      </span>
                                      <span className="text-[10px] font-medium text-[var(--ink-2)]">
                                        {budgets.find((b) => b.id === s.budget_id)?.name}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => updateRowBudget(realIdx, s.budget_id!, 'ai')}
                                        className="rounded-full bg-kern-600 px-2 py-0.5 text-[9px] font-medium text-white hover:bg-kern-700"
                                      >
                                        OK?
                                      </button>
                                    </div>
                                  </div>
                                )
                              })()}
                              <select
                                value={row.budget_id ?? ''}
                                onChange={(e) => {
                                  if (e.target.value === '__transfer__') {
                                    setRows((prev) => prev.map((r, i) => i === realIdx ? { ...r, isTransfer: true, transaction_type: 'transfer', budget_id: null, budgetName: null } : r))
                                  } else {
                                    updateRowBudget(realIdx, e.target.value, 'user')
                                  }
                                }}
                                className="w-full max-w-[200px] rounded border border-[var(--border-ed)] px-2 py-1 text-xs outline-none focus:border-kern-500"
                              >
                                <option value="">Niet gecategoriseerd</option>
                                <option value="__transfer__">↔ Eigen overboeking</option>
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
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {row.isTransfer ? (
                            <ArrowLeftRight className="mx-auto h-4 w-4 text-[var(--ink-3)]" />
                          ) : row.confidence >= 0.9 ? (
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
                <PaginationBar page={currentPage} totalPages={step3TotalPages} onPageChange={setCurrentPage} />
              </div>
            )
          })()}
        </div>
      )}

      {/* Step 4: Success */}
      {step === 4 &&
        (() => {
          const skippedCount = rows.filter((r) => r.skipImport).length
          const importedCount = toImportCount - importProgress.failed
          return (
            <div className="rounded-[var(--r-lg)] border border-emerald-200 bg-emerald-50 p-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <Check className="h-6 w-6 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-[var(--ink)]">Import geslaagd!</h2>
              <p className="mt-2 text-sm text-[var(--ink-2)]">
                <strong>{importedCount}</strong> transacties geïmporteerd
                {importDateRange && (() => {
                  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
                  const startLabel = fmt(importDateRange.min)
                  const endLabel = fmt(importDateRange.max)
                  return importDateRange.minMonth === importDateRange.maxMonth
                    ? <> in <strong>{startLabel}</strong></>
                    : <> van <strong>{startLabel}</strong> tot <strong>{endLabel}</strong></>
                })()}
                .
              </p>
              <div className="mt-3 flex justify-center flex-wrap gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-emerald-700 font-medium">
                  <Check className="h-3 w-3" /> {importedCount} geïmporteerd
                </span>
                {skippedCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--subtle)] px-3 py-1 text-[var(--ink-3)] font-medium">
                    {skippedCount} overgeslagen
                  </span>
                )}
                {importProgress.failed > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-red-700 font-medium">
                    {importProgress.failed} mislukt
                  </span>
                )}
              </div>
              {/* Retry failed batches */}
              {failedBatches.length > 0 && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-left">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-red-800">
                      {failedBatches.reduce((s, fb) => s + fb.rows.length, 0)} transacties in{" "}
                      {failedBatches.length} batch{failedBatches.length > 1 ? "es" : ""} mislukt
                    </p>
                    <div className="flex items-center gap-2">
                      {failedBatches.some((fb) => fb.retries < 2) && (
                        <button
                          type="button"
                          onClick={() => void retryFailedBatches()}
                          disabled={retrying}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {retrying ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          {retrying ? "Bezig..." : "Opnieuw proberen"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowFailedDetails((v) => !v)}
                        className="text-xs text-red-600 underline hover:text-red-800"
                      >
                        {showFailedDetails ? "Verberg details" : "Toon details"}
                      </button>
                    </div>
                  </div>
                  {failedBatches.some((fb) => fb.retries >= 2) && (
                    <p className="mt-1 text-xs text-red-600">
                      Sommige batches hebben het maximum aantal pogingen (2) bereikt.
                    </p>
                  )}
                  {showFailedDetails && (
                    <div className="mt-3 max-h-48 overflow-y-auto space-y-2">
                      {failedBatches.map((fb, i) => (
                        <div
                          key={i}
                          className="rounded border border-red-200 bg-white p-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-red-800">
                              Batch {fb.batchIdx + 1} — {fb.rows.length} transacties
                            </span>
                            <span className="text-red-500">
                              {fb.retries >= 2
                                ? "Max pogingen bereikt"
                                : `Poging ${fb.retries}/2`}
                            </span>
                          </div>
                          <p className="mt-0.5 text-red-600 truncate">{fb.error}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-3 flex justify-center gap-6 text-sm text-[var(--ink-3)]">
                <span>
                  Totaal bij:{" "}
                  <strong className="text-emerald-600 font-mono tabular-nums">
                    {formatCurrency(totalBij)}
                  </strong>
                </span>
                <span>
                  Totaal af:{" "}
                  <strong className="text-red-600 font-mono tabular-nums">
                    {formatCurrency(Math.abs(totalAf))}
                  </strong>
                </span>
              </div>
              <div className="mt-3 sm:mt-6">
                <Link
                  href={
                    selectedAccountId && importedMinMonth
                      ? `/core/assets/cash/${selectedAccountId}?month=${importedMinMonth}`
                      : '/core/cash'
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-kern-600 px-6 py-2 text-sm font-medium text-white hover:bg-kern-700"
                >
                  {selectedAccountId ? 'Naar rekeningdetail' : 'Naar Cash overzicht'}
                </Link>
              </div>
            </div>
          )
        })()}
    </div>
  )
}
