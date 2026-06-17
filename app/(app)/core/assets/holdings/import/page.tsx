'use client'

import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Upload,
  FileText,
  Check,
  AlertTriangle,
  X,
  Loader2,
  CheckCircle,
  ArrowRight,
  FileUp,
} from 'lucide-react'
import {
  parseBrokerCSV,
  detectBroker,
  BROKER_PRESETS,
  type BrokerType,
  type ParsedHoldingRow,
  type BrokerParseResult,
} from '@/lib/parsers/broker-csv'
import { normalizeHeadersForFingerprint } from '@/lib/parsers/format-contracts'
import { Kicker, EditorialHeadline, EditorialDeck } from '@/components/editorial'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { computePositionFromTransactions } from '@/lib/holdings-aggregation'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExistingHolding = {
  id: string
  ticker: string | null
  isin: string | null
  name: string
}

type PreviewRow = ParsedHoldingRow & {
  included: boolean
  isDuplicate: boolean
  matchedHoldingName: string | null
}

type ImportSummary = {
  holdings_created: number
  holdings_updated: number
  // Only present for snapshot imports (positions sold since the last upload).
  holdings_deactivated?: number
  transactions_created: number
  total_value: number
  broker: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(n)
}

function fmtUnits(n: number): string {
  return new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(n)
}

/** Map row type to a human-readable Dutch label. */
function typeLabel(type: ParsedHoldingRow['type']): string {
  switch (type) {
    case 'buy':
      return 'Koop'
    case 'sell':
      return 'Verkoop'
    case 'dividend':
      return 'Dividend'
    case 'position':
      return 'Positie'
  }
}

/** Map row type to a Tailwind text colour class. */
function typeColor(type: ParsedHoldingRow['type']): string {
  switch (type) {
    case 'buy':
      return 'text-positive'
    case 'sell':
      return 'text-negative'
    case 'dividend':
      return 'text-blue-600'
    case 'position':
      return 'text-[var(--ink-3)]'
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HoldingsImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Per-asset context: `?asset=<uuid>` means "this CSV is the full portfolio of
  // that asset". We then import in idempotent snapshot mode (replace + sold-out
  // deactivation) instead of the generic append mode. Without it, the page keeps
  // the legacy append behaviour.
  const searchParams = useSearchParams()
  const targetAssetId = searchParams.get('asset')
  const isSnapshot = Boolean(targetAssetId)

  // Step management (1 = upload, 2 = preview, 3 = result)
  const [step, setStep] = useState(1)

  // Step 1 state
  const [selectedBroker, setSelectedBroker] = useState<BrokerType | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileContent, setFileContent] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [parseError, setParseError] = useState('')

  // Step 2 state
  const [parseResult, setParseResult] = useState<BrokerParseResult | null>(null)
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  // Kolomnamen voor Laag A-runtime contract-bewaking — alleen NAMEN, nooit waarden.
  const [parsedHeaderNames, setParsedHeaderNames] = useState<string[]>([])
  // Stored for reset cycle; the actual duplicate matching uses local variables in goToPreview
  const [, setExistingHoldings] = useState<ExistingHolding[]>([])

  // Step 3 state
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)

  // Shared state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // ---------------------------------------------------------------------------
  // File handling
  // ---------------------------------------------------------------------------

  const readFile = useCallback(
    (file: File) => {
      setParseError('')
      setError('')

      if (!file.name.toLowerCase().endsWith('.csv')) {
        setParseError('Alleen CSV-bestanden worden ondersteund.')
        return
      }

      // Limit file size to 10 MB
      if (file.size > 10 * 1024 * 1024) {
        setParseError('Bestand is te groot (max 10 MB).')
        return
      }

      setFileName(file.name)

      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        if (!text || text.trim().length === 0) {
          setParseError('Bestand is leeg.')
          return
        }
        setFileContent(text)

        // Auto-detect broker from CSV headers
        const detected = detectBroker(text)
        if (detected) {
          setSelectedBroker(detected)
        }
      }
      reader.onerror = () => {
        setParseError('Fout bij het lezen van het bestand.')
      }
      reader.readAsText(file)
    },
    [],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) readFile(file)
    },
    [readFile],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) readFile(file)
    },
    [readFile],
  )

  const removeFile = useCallback(() => {
    setFileName('')
    setFileContent('')
    setParseError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Step transitions
  // ---------------------------------------------------------------------------

  /**
   * Transition from step 1 to step 2: parse the CSV and fetch existing
   * holdings for duplicate detection.
   */
  const goToPreview = useCallback(async () => {
    if (!selectedBroker || !fileContent) return

    setLoading(true)
    setError('')
    setParseError('')

    try {
      // Parse CSV
      const result = parseBrokerCSV(fileContent, selectedBroker)

      // Extraheer kolomnamen voor Laag A-runtime contract-bewaking.
      // Gebruik de eerste niet-lege regel van het bestand — dezelfde logica als
      // parseBrokerCSV zelf. Normaliseer via dezelfde helper als de server
      // (BOM-strip, trim, lowercase, gesorteerd) zodat fingerprints overeenkomen.
      // Privacy: we sturen ALLEEN namen — nooit rij-data of financiële waarden.
      const cleanedContent = fileContent.replace(/^﻿/, '')
      const firstLine = cleanedContent.split(/\r?\n/).find((l) => l.trim().length > 0) ?? ''
      // Detecteer delimiter: meest voorkomend ',' of ';'
      const delimChar = firstLine.includes(';') ? ';' : ','
      const rawHeaders = firstLine.split(delimChar).map((h) => h.replace(/^["']|["']$/g, ''))
      // Sla genormaliseerde namen op (BOM-strip, trim, lowercase, gesorteerd)
      // — gelijke normalisatie als fingerprintHeaders() in de server-route.
      setParsedHeaderNames(normalizeHeadersForFingerprint(rawHeaders))

      if (result.rows.length === 0) {
        const msg =
          result.errors.length > 0
            ? result.errors[0]
            : 'Geen geldige rijen gevonden in het bestand.'
        setParseError(msg)
        setLoading(false)
        return
      }

      setParseResult(result)

      // Fetch existing holdings for duplicate detection
      let existing: ExistingHolding[] = []
      try {
        const res = await fetch('/api/holdings')
        if (res.ok) {
          const data = await res.json()
          existing = (data.holdings ?? data ?? []) as ExistingHolding[]
        }
      } catch {
        // Non-critical: continue without duplicate detection
      }
      setExistingHoldings(existing)

      // Build lookup maps for duplicate matching
      const byIsin = new Map<string, ExistingHolding>()
      const byTicker = new Map<string, ExistingHolding>()
      for (const h of existing) {
        if (h.isin) byIsin.set(h.isin.toUpperCase(), h)
        if (h.ticker) byTicker.set(h.ticker.toUpperCase(), h)
      }

      // Enrich rows with duplicate info and default inclusion
      const enriched: PreviewRow[] = result.rows.map((row) => {
        const isinMatch = row.isin ? byIsin.get(row.isin.toUpperCase()) : undefined
        const tickerMatch = row.ticker
          ? byTicker.get(row.ticker.toUpperCase())
          : undefined
        const match = isinMatch || tickerMatch || null

        return {
          ...row,
          included: true,
          isDuplicate: !!match,
          matchedHoldingName: match?.name ?? null,
        }
      })

      setPreviewRows(enriched)
      setStep(2)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Onbekende fout bij het parsen.'
      setParseError(msg)
    } finally {
      setLoading(false)
    }
  }, [selectedBroker, fileContent])

  /** Toggle inclusion of a single preview row. */
  const toggleRow = useCallback((index: number) => {
    setPreviewRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, included: !r.included } : r)),
    )
  }, [])

  /** Toggle all rows on or off. */
  const toggleAll = useCallback(() => {
    setPreviewRows((prev) => {
      const allIncluded = prev.every((r) => r.included)
      return prev.map((r) => ({ ...r, included: !allIncluded }))
    })
  }, [])

  /**
   * Perform the actual import by posting selected rows to the API.
   *
   * The mapping logic groups rows by ISIN/ticker to build the holdings and
   * transactions arrays expected by the import endpoint.
   */
  const performImport = useCallback(async () => {
    if (!selectedBroker) return

    const selected = previewRows.filter((r) => r.included)
    if (selected.length === 0) {
      setError('Selecteer minstens één rij om te importeren.')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Group rows by ISIN (or name as fallback) to build holdings
      const holdingMap = new Map<
        string,
        {
          key: string
          row: PreviewRow
          transactions: PreviewRow[]
        }
      >()

      for (const row of selected) {
        const key = (row.isin ?? row.ticker ?? row.name).toUpperCase()

        if (!holdingMap.has(key)) {
          holdingMap.set(key, { key, row, transactions: [] })
        }

        // Non-position rows are also transactions
        if (row.type !== 'position') {
          holdingMap.get(key)!.transactions.push(row)
        }
      }

      // Build holdings array. Het huidige bezit volgt uit de transactiehistorie:
      // een positie-export (Portfolio.csv) levert het aantal direct, een
      // transactie-export (Transactions.csv) wordt genet via de canonieke
      // aggregatie — zodat 10 koop + 5 verkoop = 5 over, niet 15 of 1 rij.
      const holdings = Array.from(holdingMap.values()).map((entry) => {
        if (entry.row.type === 'position') {
          return {
            name: entry.row.name,
            ticker: entry.row.ticker,
            isin: entry.row.isin,
            units: entry.row.units,
            avg_purchase_price: entry.row.price_per_unit,
            current_price: entry.row.price_per_unit,
            purchase_date: entry.row.date,
            exchange: entry.row.exchange,
            asset_id: null,
          }
        }
        // Transactie-export: netto positie + gemiddelde kostprijs uit de historie.
        const agg = computePositionFromTransactions(
          entry.transactions.map((t) => ({
            type: t.type,
            units: t.units,
            price_per_unit: t.price_per_unit,
            total_amount: t.total_amount,
            date: t.date,
          })),
        )
        const avgCost = agg.netUnits > 0 ? agg.avgCost : 0
        return {
          name: entry.row.name,
          ticker: entry.row.ticker,
          isin: entry.row.isin,
          units: agg.netUnits,
          avg_purchase_price: avgCost,
          // Geen live koers in een transactie-export; gemiddelde kostprijs als
          // neutrale placeholder tot een koers-refresh de actuele prijs ophaalt.
          current_price: avgCost,
          purchase_date: entry.row.date,
          exchange: entry.row.exchange,
          asset_id: null,
        }
      })

      // Build holding index lookup for transactions
      const holdingKeys = Array.from(holdingMap.keys())
      const keyToIndex = new Map<string, number>()
      holdingKeys.forEach((k, i) => keyToIndex.set(k, i))

      // Build transactions array
      const transactions: {
        holding_index: number
        type: 'buy' | 'sell' | 'dividend'
        units: number
        price_per_unit: number
        total_amount: number
        date: string | null
        fees: number
        notes: string | null
      }[] = []

      for (const entry of holdingMap.values()) {
        const holdingIndex = keyToIndex.get(entry.key)!
        for (const tx of entry.transactions) {
          if (tx.type === 'position') continue
          transactions.push({
            holding_index: holdingIndex,
            type: tx.type,
            units: tx.units,
            price_per_unit: tx.price_per_unit,
            total_amount: tx.total_amount,
            date: tx.date,
            fees: tx.fees,
            notes: null,
          })
        }
      }

      const res = await fetch('/api/holdings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holdings,
          transactions,
          broker: selectedBroker,
          // With an asset context the upload is the full portfolio of that asset,
          // so reconcile it idempotently. Otherwise keep the generic append flow.
          ...(isSnapshot
            ? { mode: 'snapshot', targetAssetId }
            : {}),
          // Laag A-runtime contract-bewaking: kolomnamen voor drift-detectie.
          // Alleen genormaliseerde NAMEN — nooit rij-data of financiële waarden.
          ...(parsedHeaderNames.length > 0
            ? { headerNames: parsedHeaderNames }
            : {}),
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(
          body?.error ?? `Import mislukt (status ${res.status})`,
        )
      }

      const data = await res.json()
      setImportSummary(data.summary as ImportSummary)
      setStep(3)
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Onbekende fout bij het importeren.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [selectedBroker, previewRows, isSnapshot, targetAssetId])

  /** Reset wizard to the beginning for another import. */
  const resetWizard = useCallback(() => {
    setStep(1)
    setSelectedBroker(null)
    setFileName('')
    setFileContent('')
    setParseError('')
    setParseResult(null)
    setPreviewRows([])
    setParsedHeaderNames([])
    setExistingHoldings([])
    setImportSummary(null)
    setError('')
    setLoading(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Derived values for the preview step
  // ---------------------------------------------------------------------------

  const includedRows = previewRows.filter((r) => r.included)
  const holdingsCount = includedRows.filter(
    (r) => r.type === 'position' || r.type === 'buy',
  ).length
  const transactionsCount = includedRows.filter(
    (r) => r.type !== 'position',
  ).length
  const totalValue = includedRows.reduce((sum, r) => sum + r.total_amount, 0)

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <NavStackMeta title="Holdings importeren" />
      {/* Page header — editorial blueprint */}
      <header className="mb-8 space-y-2">
        <Kicker>Holdings · Importeren</Kicker>
        <EditorialHeadline level="h1" emphasis="importeren" size="lg">
          CSV importeren
        </EditorialHeadline>
        <EditorialDeck>
          Importeer holdings en transacties vanuit je broker.
        </EditorialDeck>
      </header>

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                step === s
                  ? 'bg-amber-600 text-white'
                  : step > s
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-[var(--subtle)] text-[var(--ink-4)]'
              }`}
            >
              {step > s ? <Check className="h-3.5 w-3.5" /> : s}
            </div>
            {s < 3 && (
              <div
                className={`h-px w-8 sm:w-12 ${
                  step > s ? 'bg-amber-400' : 'bg-[var(--border-ed)]'
                }`}
              />
            )}
          </div>
        ))}
        <span className="ml-2 text-xs text-[var(--ink-4)]">
          {step === 1 && 'Upload'}
          {step === 2 && 'Voorbeeld'}
          {step === 3 && 'Resultaat'}
        </span>
      </div>

      {/* Global error banner */}
      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-negative/30 bg-negative/10 p-3 text-sm text-negative">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => setError('')}
            className="ml-auto shrink-0 text-negative/70 hover:text-negative"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ================================================================== */}
      {/* STEP 1 — Upload & Broker Selection                                 */}
      {/* ================================================================== */}
      {step === 1 && (
        <div className="space-y-6">
          {/* Broker selection */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-[var(--ink)]">
              Kies je broker
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {BROKER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setSelectedBroker(preset.id)}
                  className={`rounded-lg border-2 p-4 text-left transition-all ${
                    selectedBroker === preset.id
                      ? 'border-amber-600 bg-amber-50'
                      : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[var(--ink)]">
                      {preset.label}
                    </span>
                    {selectedBroker === preset.id && (
                      <Check className="h-4 w-4 text-amber-600" />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[var(--ink-3)]">
                    {preset.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* File upload dropzone */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-[var(--ink)]">
              Upload CSV-bestand
            </label>

            {!fileName ? (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors ${
                  dragOver
                    ? 'border-amber-500 bg-amber-50'
                    : 'border-[var(--border-ed)] bg-[var(--subtle)] hover:border-[var(--border-md)]'
                }`}
              >
                <FileUp className="h-10 w-10 text-[var(--ink-4)]" />
                <div className="text-center">
                  <p className="text-sm font-medium text-[var(--ink-2)]">
                    Sleep je CSV-bestand hierheen
                  </p>
                  <p className="mt-1 text-xs text-[var(--ink-4)]">
                    of klik om een bestand te kiezen
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-3">
                <FileText className="h-5 w-5 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--ink)]">
                    {fileName}
                  </p>
                  {selectedBroker && (
                    <p className="text-xs text-[var(--ink-3)]">
                      Herkend als:{' '}
                      <span className="font-medium text-amber-700">
                        {BROKER_PRESETS.find((b) => b.id === selectedBroker)?.label}
                      </span>
                    </p>
                  )}
                </div>
                <button
                  onClick={removeFile}
                  className="shrink-0 rounded p-1 text-[var(--ink-4)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Hidden file input for re-use after clearing */}
            {fileName && (
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileSelect}
              />
            )}
          </div>

          {/* Parse error */}
          {parseError && (
            <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Next button */}
          <div className="flex justify-end">
            <button
              onClick={goToPreview}
              disabled={!selectedBroker || !fileContent || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Bezig met verwerken...
                </>
              ) : (
                <>
                  Volgende
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* STEP 2 — Preview & Review                                          */}
      {/* ================================================================== */}
      {step === 2 && (
        <div className="space-y-6">
          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-3">
            <div className="text-sm text-[var(--ink-2)]">
              <span className="font-mono tabular-nums font-bold text-[var(--ink)]">
                {holdingsCount}
              </span>{' '}
              holdings
            </div>
            <div className="text-sm text-[var(--ink-2)]">
              <span className="font-mono tabular-nums font-bold text-[var(--ink)]">
                {transactionsCount}
              </span>{' '}
              transacties
            </div>
            <div className="text-sm text-[var(--ink-2)]">
              Totale waarde:{' '}
              <span className="font-mono tabular-nums font-bold text-[var(--ink)]">
                {fmt(totalValue)}
              </span>
            </div>
            {parseResult && parseResult.errors.length > 0 && (
              <div className="text-sm text-yellow-700">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                {parseResult.errors.length} waarschuwing
                {parseResult.errors.length !== 1 && 'en'}
              </div>
            )}
          </div>

          {/* Parse warnings */}
          {parseResult && parseResult.errors.length > 0 && (
            <div className="space-y-1 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
              <p className="text-xs font-semibold text-yellow-800">
                Waarschuwingen bij het parsen:
              </p>
              {parseResult.errors.map((msg, i) => (
                <p key={i} className="text-xs text-yellow-700">
                  {msg}
                </p>
              ))}
            </div>
          )}

          {/* Preview table */}
          <div className="overflow-x-auto rounded-lg border border-[var(--border-ed)]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
                  <th className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={previewRows.every((r) => r.included)}
                      onChange={toggleAll}
                      className="h-3.5 w-3.5 accent-amber-600"
                    />
                  </th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-[var(--ink-2)]">
                    Naam
                  </th>
                  <th className="hidden px-3 py-2.5 text-xs font-semibold text-[var(--ink-2)] sm:table-cell">
                    Ticker / ISIN
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-[var(--ink-2)]">
                    Aantal
                  </th>
                  <th className="hidden px-3 py-2.5 text-right text-xs font-semibold text-[var(--ink-2)] sm:table-cell">
                    Prijs
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-[var(--ink-2)]">
                    Waarde
                  </th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-[var(--ink-2)]">
                    Type
                  </th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b border-[var(--border-ed)] transition-colors last:border-b-0 ${
                      !row.included
                        ? 'bg-[var(--subtle)] opacity-50'
                        : 'bg-[var(--paper)] hover:bg-[var(--subtle)]'
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={row.included}
                        onChange={() => toggleRow(i)}
                        className="h-3.5 w-3.5 accent-amber-600"
                      />
                    </td>
                    <td className="max-w-[180px] px-3 py-2.5">
                      <div className="truncate text-sm font-medium text-[var(--ink)]">
                        {row.name}
                      </div>
                      {row.isDuplicate && (
                        <span className="mt-0.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                          Bestaand
                          {row.matchedHoldingName && (
                            <span className="font-normal">
                              {' '}
                              &mdash; wordt samengevoegd
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="hidden px-3 py-2.5 sm:table-cell">
                      <span className="font-mono text-xs text-[var(--ink-3)]">
                        {row.ticker || row.isin || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-sm text-[var(--ink)]">
                      {fmtUnits(row.units)}
                    </td>
                    <td className="hidden px-3 py-2.5 text-right font-mono tabular-nums text-sm text-[var(--ink-2)] sm:table-cell">
                      {fmt(row.price_per_unit)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-sm font-medium text-[var(--ink)]">
                      {fmt(row.total_amount)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`text-xs font-bold ${typeColor(row.type)}`}
                      >
                        {typeLabel(row.type)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {previewRows.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--ink-4)]">
              Geen rijen gevonden in het bestand.
            </p>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => setStep(1)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-2.5 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Terug
            </button>
            <button
              onClick={performImport}
              disabled={loading || includedRows.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Bezig met importeren...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Importeren ({includedRows.length})
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* STEP 3 — Import Result                                             */}
      {/* ================================================================== */}
      {step === 3 && importSummary && (
        <div className="space-y-6">
          {/* Success card */}
          <div className="flex flex-col items-center rounded-lg border border-positive/30 bg-positive/10 p-8 text-center">
            <CheckCircle className="mb-3 h-12 w-12 text-positive" />
            <h2 className="text-xl font-bold text-[var(--ink)]">
              Import geslaagd
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-3)]">
              Je holdings zijn succesvol geimporteerd via{' '}
              <span className="font-medium text-[var(--ink)]">
                {BROKER_PRESETS.find((b) => b.id === importSummary.broker)?.label ??
                  importSummary.broker}
              </span>
            </p>
          </div>

          {/* Summary grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-4">
              <p className="text-xs text-[var(--ink-4)]">Aangemaakt</p>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[var(--ink)]">
                {importSummary.holdings_created}
              </p>
              <p className="text-xs text-[var(--ink-3)]">holdings</p>
            </div>
            <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-4">
              <p className="text-xs text-[var(--ink-4)]">Bijgewerkt</p>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[var(--ink)]">
                {importSummary.holdings_updated}
              </p>
              <p className="text-xs text-[var(--ink-3)]">bestaande</p>
            </div>
            <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-4">
              <p className="text-xs text-[var(--ink-4)]">Transacties</p>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[var(--ink)]">
                {importSummary.transactions_created}
              </p>
              <p className="text-xs text-[var(--ink-3)]">aangemaakt</p>
            </div>
            <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-4">
              <p className="text-xs text-[var(--ink-4)]">Totale waarde</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--ink)]">
                {fmt(importSummary.total_value)}
              </p>
              <p className="text-xs text-[var(--ink-3)]">geimporteerd</p>
            </div>
          </div>

          {/* Snapshot-only: positions that were in the portfolio before but not
              in this upload are treated as sold and deactivated. */}
          {(importSummary.holdings_deactivated ?? 0) > 0 && (
            <p className="text-center text-sm text-[var(--ink-3)]">
              <span className="font-mono font-bold tabular-nums text-[var(--ink)]">
                {importSummary.holdings_deactivated}
              </span>{' '}
              {importSummary.holdings_deactivated === 1
                ? 'positie stond niet meer in dit overzicht en is als verkocht gemarkeerd.'
                : 'posities stonden niet meer in dit overzicht en zijn als verkocht gemarkeerd.'}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/core/assets/holdings"
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-amber-700"
            >
              Bekijk holdings
              <ArrowRight className="h-4 w-4" />
            </Link>
            <button
              onClick={resetWizard}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-5 py-2.5 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
            >
              <Upload className="h-4 w-4" />
              Nog een import
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
