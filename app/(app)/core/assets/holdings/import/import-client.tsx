'use client'

import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
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
  Trash2,
  Wallet,
  CalendarClock,
} from 'lucide-react'
import {
  parseBrokerCSV,
  detectBroker,
  supportedExportKinds,
  BROKER_PRESETS,
  type BrokerType,
  type ParsedHoldingRow,
  type BrokerParseResult,
} from '@/lib/parsers/broker-csv'
import { normalizeHeadersForFingerprint } from '@/lib/parsers/format-contracts'
import { Kicker, EditorialHeadline, EditorialDeck } from '@/components/editorial'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { computePositionFromTransactions } from '@/lib/holdings-aggregation'
import type { HoldingsImportTarget } from '@/lib/holdings-import-targets'

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
  // Positions that were in the asset before but not in this upload (sold).
  holdings_deactivated?: number
  // Positions hard-deleted up front because "wis eerst alles" stond aan.
  holdings_deleted?: number
  transactions_created: number
  /** Rijen die we al hadden en dus zijn overgeslagen (overlappende upload). */
  transactions_deduped?: number
  total_value: number
  broker: string
  /** De bezitting waarin dit landde — ook als de wizard 'm net aanmaakte. */
  asset_id?: string | null
}

/** Sentinel-waarde in de bezitting-keuze voor "maak een nieuwe belegging aan". */
const NEW_ASSET = '__new__'

/** Zelfde bovengrens als de import-route hanteert. */
const MAX_ASSET_NAME_LENGTH = 80

/** Wat de gebruiker zegt te uploaden — bepaalt de importmodus. */
type ExportKind = 'positions' | 'transactions'

const EXPORT_KIND_COPY: Record<
  ExportKind,
  { title: string; blurb: string; consequence: string }
> = {
  positions: {
    title: 'Volledige portefeuille',
    blurb: 'Een momentopname van alles wat je nu bezit.',
    consequence:
      'We stemmen de bezitting af op dit bestand: aantallen worden vervangen en posities die er niet in staan markeren we als verkocht.',
  },
  transactions: {
    title: 'Transactiehistorie',
    blurb: 'Je aan- en verkopen over een gekozen periode.',
    consequence:
      'We vullen aan: transacties die we al hebben slaan we over, de rest komt erbij, en je posities leiden we opnieuw af uit de volledige historie. Niets wordt als verkocht gemarkeerd — een periode zegt immers niets over wat je verder nog bezit.',
  },
}

/**
 * De melding wanneer het bestand iets anders blijkt dan de gebruiker koos.
 *
 * Dit is geen kosmetische controle: een transactie-export als volledige
 * portefeuille inlezen markeert alles buiten de periode als verkocht, en een
 * portefeuille-export als transacties inlezen telt je hele bezit er nóg eens
 * bij op. Beide beschadigen de cijfers stil — dus tegenhouden, niet waarschuwen.
 */
function exportKindMismatch(
  expected: ExportKind,
  actual: 'positions' | 'transactions' | 'mixed',
  brokerLabel: string,
): string {
  if (actual === 'mixed') {
    return `Dit bestand bevat zowel posities als transacties. Exporteer bij ${brokerLabel} één van beide apart en probeer het opnieuw.`
  }
  if (expected === 'transactions') {
    return `Dit lijkt je volledige portefeuille (posities), geen transactiehistorie. Kies hierboven "Volledige portefeuille", of exporteer bij ${brokerLabel} je transacties.`
  }
  return `Dit lijkt een transactiehistorie, geen volledige portefeuille. Kies hierboven "Transactiehistorie", of exporteer bij ${brokerLabel} je posities.`
}

/** ISO-datum (YYYY-MM-DD) leesbaar maken zonder tijdzone-verschuiving. */
function fmtDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return iso
  return `${Number(day)}-${Number(month)}-${year}`
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

/** "3 posities" / "1 positie" — zonder de telling te herhalen in elke JSX-tak. */
function positionsLabel(count: number): string {
  return count === 1 ? '1 positie' : `${count} posities`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface HoldingsImportClientProps {
  /** Kiesbare doel-bezittingen, server-geladen. Leeg = alleen "nieuw aanmaken". */
  targets: HoldingsImportTarget[]
}

export default function HoldingsImportClient({ targets }: HoldingsImportClientProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Per-asset context: `?asset=<uuid>` (vanaf de broker-sectie van een belegging)
  // vult de keuze voor. De keuze zelf is verplicht — elke import landt in één
  // bezitting en wordt daar idempotent tegen afgestemd (snapshot-modus).
  const searchParams = useSearchParams()
  const presetAssetId = searchParams.get('asset')

  // Step management (1 = upload, 2 = preview, 3 = result)
  const [step, setStep] = useState(1)

  // Step 1 — doel-bezitting
  const [assetChoice, setAssetChoice] = useState<string>(() => {
    if (presetAssetId && targets.some((t) => t.id === presetAssetId)) return presetAssetId
    // Zonder enige bestaande belegging is "nieuw aanmaken" de enige uitweg;
    // die dan meteen voorselecteren scheelt een doodlopende keuzelijst.
    return targets.length === 0 ? NEW_ASSET : ''
  })
  const [newAssetName, setNewAssetName] = useState('')
  const [clearExisting, setClearExisting] = useState(false)

  // Step 1 — broker, soort export & bestand
  const [selectedBroker, setSelectedBroker] = useState<BrokerType | null>(null)
  const [exportKind, setExportKind] = useState<ExportKind | null>(null)
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
  // Derived — doel-bezitting
  // ---------------------------------------------------------------------------

  const selectedTarget = targets.find((t) => t.id === assetChoice) ?? null
  const isNewAsset = assetChoice === NEW_ASSET
  const trimmedNewAssetName = newAssetName.trim()
  // "Klaar om verder te gaan": een bestaande bezitting, of een naam voor een nieuwe.
  const assetReady = isNewAsset
    ? trimmedNewAssetName.length > 0 && trimmedNewAssetName.length <= MAX_ASSET_NAME_LENGTH
    : Boolean(selectedTarget)
  // Wissen kan alleen bij een bestaande bezitting die daadwerkelijk posities heeft.
  const canClear = Boolean(selectedTarget && selectedTarget.holdingsCount > 0)
  const willClear = canClear && clearExisting

  const selectedPreset = BROKER_PRESETS.find((b) => b.id === selectedBroker) ?? null

  // ---------------------------------------------------------------------------
  // Derived — soort export
  // ---------------------------------------------------------------------------

  // Levert deze broker maar één soort export, dan valt er niets te kiezen en
  // vragen we het ook niet. DEGIRO levert er twee — daar moet de keuze expliciet,
  // want ze leiden tot tegengesteld gedrag (vervangen versus aanvullen).
  const availableKinds = selectedPreset ? supportedExportKinds(selectedPreset) : []
  const effectiveKind: ExportKind | null =
    availableKinds.length === 1 ? availableKinds[0] : exportKind
  const kindReady = effectiveKind !== null

  /** Keuze wisselen zet de wis-optie altijd terug uit — nooit stil meeslepen. */
  const handleAssetChoice = useCallback((value: string) => {
    setAssetChoice(value)
    setClearExisting(false)
    setError('')
  }, [])

  /** Van broker wisselen maakt een eerder gekozen exportsoort betekenisloos. */
  const handleBrokerChoice = useCallback((broker: BrokerType) => {
    setSelectedBroker(broker)
    setExportKind(null)
    setParseError('')
  }, [])

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
   * Transition from step 1 to step 2: parse the CSV and fetch the existing
   * holdings OF THE CHOSEN ASSET for duplicate detection.
   */
  const goToPreview = useCallback(async () => {
    if (!selectedBroker || !fileContent || !assetReady || !effectiveKind) return

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

      // Klopt het bestand met wat de gebruiker zei te uploaden? Zo niet: stoppen.
      if (result.contentKind !== 'unknown' && result.contentKind !== effectiveKind) {
        setParseError(
          exportKindMismatch(
            effectiveKind,
            result.contentKind,
            selectedPreset?.label ?? 'je broker',
          ),
        )
        setLoading(false)
        return
      }

      setParseResult(result)

      // Fetch the existing holdings of the CHOSEN asset for duplicate detection.
      // Een nieuwe bezitting heeft er per definitie geen; met "wis eerst alles"
      // zijn ze straks weg — in beide gevallen is elke rij dus nieuw.
      let existing: ExistingHolding[] = []
      if (selectedTarget && !clearExisting) {
        try {
          const res = await fetch(`/api/holdings?asset_id=${encodeURIComponent(selectedTarget.id)}`)
          if (res.ok) {
            const data = await res.json()
            existing = (data.holdings ?? data ?? []) as ExistingHolding[]
          }
        } catch {
          // Non-critical: continue without duplicate detection
        }
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
  }, [
    selectedBroker,
    fileContent,
    assetReady,
    effectiveKind,
    selectedPreset,
    selectedTarget,
    clearExisting,
  ])

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
    if (!selectedBroker || !assetReady || !effectiveKind) return

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

      // Build transactions array — in BESTANDSVOLGORDE.
      //
      // Die volgorde is een contract, geen toeval. De server leidt hieruit de
      // dedup-sleutels af (lib/holdings-import-key.ts) en het volgnummer voor
      // identieke rijen — een order die de broker in deelexecuties uitvoerde —
      // telt over het hele bestand. Zou de client hier per holding groeperen,
      // dan zou dat volgnummer verschuiven en zou een overlappende upload
      // dubbele rijen opleveren.
      //
      // We sturen het RÚWE broker-id mee, niet de afgeleide sleutel: de sleutel
      // hoort server-side te ontstaan, zoals /api/transactions/import dat al doet
      // met import_hash. Anders kan een client een sleutel sturen die met een
      // bestaande rij botst en die stil als duplicaat laat overslaan.
      const transactions = selected
        .filter(
          (row): row is PreviewRow & { type: 'buy' | 'sell' | 'dividend' } =>
            row.type !== 'position',
        )
        .map((row) => ({
          holding_index: keyToIndex.get(
            (row.isin ?? row.ticker ?? row.name).toUpperCase(),
          )!,
          type: row.type,
          units: row.units,
          price_per_unit: row.price_per_unit,
          total_amount: row.total_amount,
          date: row.date,
          fees: row.fees,
          notes: null,
          external_id: row.externalId,
        }))

      const res = await fetch('/api/holdings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holdings,
          transactions,
          broker: selectedBroker,
          // Een positie-export is het volledige beeld van de bezitting en mag
          // afstemmen (vervangen + ontbrekende als verkocht). Een transactie-
          // export beslaat maar een periode en mag daarom alléén aanvullen.
          mode: effectiveKind === 'transactions' ? 'append' : 'snapshot',
          ...(isNewAsset
            ? { newAssetName: trimmedNewAssetName }
            : { targetAssetId: assetChoice }),
          ...(willClear ? { clearExisting: true } : {}),
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
      // Ververs de server-geladen keuzelijst: een net aangemaakte bezitting moet
      // erin staan, en de posities-tellingen zijn nu anders.
      router.refresh()
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Onbekende fout bij het importeren.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [
    selectedBroker,
    previewRows,
    assetReady,
    effectiveKind,
    isNewAsset,
    trimmedNewAssetName,
    assetChoice,
    willClear,
    parsedHeaderNames,
    router,
  ])

  /** Reset wizard to the beginning for another import. */
  const resetWizard = useCallback(() => {
    setStep(1)
    // Blijf op dezelfde bezitting staan — ook als die zojuist is aangemaakt.
    setAssetChoice(importSummary?.asset_id ?? assetChoice)
    setNewAssetName('')
    setClearExisting(false)
    setSelectedBroker(null)
    setExportKind(null)
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
  }, [importSummary, assetChoice])

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

  const targetLabel = isNewAsset
    ? trimmedNewAssetName || 'Nieuwe belegging'
    : (selectedTarget?.name ?? '')

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
                  ? 'bg-kern-600 text-white'
                  : step > s
                    ? 'bg-kern-100 text-kern-700'
                    : 'bg-[var(--subtle)] text-[var(--ink-4)]'
              }`}
            >
              {step > s ? <Check className="h-3.5 w-3.5" /> : s}
            </div>
            {s < 3 && (
              <div
                className={`h-px w-8 sm:w-12 ${
                  step > s ? 'bg-kern-400' : 'bg-[var(--border-ed)]'
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
      {/* STEP 1 — Bezitting, broker & bestand                               */}
      {/* ================================================================== */}
      {step === 1 && (
        <div className="space-y-6">
          {/* ---------------------------------------------------------------- */}
          {/* 1a. Doel-bezitting (verplicht)                                    */}
          {/* ---------------------------------------------------------------- */}
          <div>
            <label
              htmlFor="import-asset"
              className="mb-2 block text-sm font-semibold text-[var(--ink)]"
            >
              In welke bezitting komt dit?
            </label>
            <p className="mb-2 text-xs text-[var(--ink-3)]">
              Elke import hoort bij één belegging. Wat je uploadt is het volledige
              beeld van die bezitting: posities die niet in het bestand staan,
              markeren we als verkocht.
            </p>
            <div className="relative">
              <Wallet
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-4)]"
                aria-hidden="true"
              />
              <select
                id="import-asset"
                value={assetChoice}
                onChange={(e) => handleAssetChoice(e.target.value)}
                className="w-full appearance-none rounded-lg border-2 border-[var(--border-ed)] bg-[var(--paper)] py-2.5 pl-9 pr-3 text-sm text-[var(--ink)] transition-colors focus:border-kern-600 focus:outline-none"
              >
                <option value="">— Kies een bezitting —</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.institution ? ` · ${t.institution}` : ''} ({positionsLabel(t.holdingsCount)})
                  </option>
                ))}
                <option value={NEW_ASSET}>+ Nieuwe belegging aanmaken</option>
              </select>
            </div>

            {/* Naam voor een nieuwe belegging */}
            {isNewAsset && (
              <div className="mt-3">
                <label
                  htmlFor="import-new-asset-name"
                  className="mb-1.5 block text-xs font-semibold text-[var(--ink-2)]"
                >
                  Naam van de nieuwe belegging
                </label>
                <input
                  id="import-new-asset-name"
                  type="text"
                  value={newAssetName}
                  maxLength={MAX_ASSET_NAME_LENGTH}
                  onChange={(e) => setNewAssetName(e.target.value)}
                  placeholder="Bijvoorbeeld: DEGIRO beleggingsrekening"
                  className="w-full rounded-lg border-2 border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2.5 text-sm text-[var(--ink)] transition-colors focus:border-kern-600 focus:outline-none"
                />
                <p className="mt-1 text-xs text-[var(--ink-4)]">
                  We maken hem aan als beleggingsbezitting zodra je importeert.
                </p>
              </div>
            )}

            {/* Wis-optie — alleen zinvol bij een bezitting die posities heeft */}
            {canClear && selectedTarget && (
              <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-negative/30 bg-negative/5 p-3">
                <input
                  type="checkbox"
                  checked={clearExisting}
                  onChange={(e) => setClearExisting(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--negative)]"
                />
                <span className="text-xs leading-relaxed text-[var(--ink-2)]">
                  <span className="flex items-center gap-1.5 font-semibold text-negative">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Verwijder eerst alle bestaande aandelen van deze bezitting
                  </span>
                  <span className="mt-1 block">
                    De {positionsLabel(selectedTarget.holdingsCount)} die nu in{' '}
                    <strong className="font-semibold text-[var(--ink)]">
                      {selectedTarget.name}
                    </strong>{' '}
                    staan worden definitief verwijderd, inclusief hun transactie- en
                    koershistorie. Daarna importeren we dit bestand als een schone start.
                    Dit kan niet ongedaan worden gemaakt.
                  </span>
                </span>
              </label>
            )}
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* 1b. Broker                                                        */}
          {/* ---------------------------------------------------------------- */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-[var(--ink)]">
              Kies je broker
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {BROKER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleBrokerChoice(preset.id)}
                  className={`rounded-lg border-2 p-4 text-left transition-all ${
                    selectedBroker === preset.id
                      ? 'border-kern-600 bg-kern-50'
                      : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[var(--ink)]">
                      {preset.label}
                    </span>
                    {selectedBroker === preset.id && (
                      <Check className="h-4 w-4 text-kern-600" />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[var(--ink-3)]">
                    {preset.description}
                  </p>
                </button>
              ))}
            </div>

            {/* Welke exports werken bij deze broker — en welke niet */}
            {selectedPreset && (
              <div className="mt-3 rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] p-3">
                <p className="text-xs font-semibold text-[var(--ink-2)]">
                  Welke {selectedPreset.label}-export kun je uploaden?
                </p>
                <ul className="mt-2 space-y-2">
                  {selectedPreset.exports.map((exp) => (
                    <li key={exp.label} className="flex items-start gap-2">
                      {exp.supported ? (
                        <Check
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-positive"
                          aria-hidden="true"
                        />
                      ) : (
                        <X
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-negative"
                          aria-hidden="true"
                        />
                      )}
                      <span className="text-xs leading-relaxed text-[var(--ink-3)]">
                        <span
                          className={`font-semibold ${
                            exp.supported ? 'text-[var(--ink)]' : 'text-negative'
                          }`}
                        >
                          {exp.label}
                        </span>
                        <span className="ml-1">
                          {exp.supported ? '— ' : '— werkt niet: '}
                          {exp.detail}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                {selectedPreset.note && (
                  <p className="mt-2 border-t border-[var(--border-ed)] pt-2 text-xs text-[var(--ink-4)]">
                    {selectedPreset.note}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* 1c. Soort export — alleen als deze broker er meer dan één levert   */}
          {/* ---------------------------------------------------------------- */}
          {availableKinds.length > 1 && (
            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--ink)]">
                Wat upload je?
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {availableKinds.map((kind) => {
                  const copy = EXPORT_KIND_COPY[kind]
                  const active = exportKind === kind
                  return (
                    <button
                      key={kind}
                      onClick={() => {
                        setExportKind(kind)
                        setParseError('')
                      }}
                      className={`rounded-lg border-2 p-4 text-left transition-all ${
                        active
                          ? 'border-kern-600 bg-kern-50'
                          : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-[var(--ink)]">
                          {copy.title}
                        </span>
                        {active && <Check className="h-4 w-4 text-kern-600" />}
                      </div>
                      <p className="mt-1 text-xs text-[var(--ink-3)]">{copy.blurb}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Wat de gekozen soort betekent voor je bestaande posities */}
          {effectiveKind && (
            <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] p-3">
              <p className="text-xs leading-relaxed text-[var(--ink-3)]">
                <span className="font-semibold text-[var(--ink-2)]">
                  {EXPORT_KIND_COPY[effectiveKind].title}:
                </span>{' '}
                {EXPORT_KIND_COPY[effectiveKind].consequence}
              </p>

              {/* Bij een transactie-export: vanaf wanneer moet je exporteren? */}
              {effectiveKind === 'transactions' && (selectedTarget || isNewAsset) && (
                <p className="mt-2 flex items-start gap-1.5 border-t border-[var(--border-ed)] pt-2 text-xs leading-relaxed text-[var(--ink-2)]">
                  <CalendarClock
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-kern-700"
                    aria-hidden="true"
                  />
                  {selectedTarget?.lastTransactionDate ? (
                    <span>
                      Laatste transactie die wij kennen van{' '}
                      <strong className="font-semibold text-[var(--ink)]">
                        {selectedTarget.name}
                      </strong>
                      :{' '}
                      <strong className="font-semibold text-[var(--ink)]">
                        {fmtDate(selectedTarget.lastTransactionDate)}
                      </strong>
                      . Exporteer gerust vanaf ruim vóór die datum — overlap is geen
                      probleem, dubbele transacties herkennen wij en slaan we over. Zo
                      weet je zeker dat je niets mist.
                    </span>
                  ) : (
                    <span>
                      Wij kennen nog geen enkele transactie van{' '}
                      <strong className="font-semibold text-[var(--ink)]">
                        {targetLabel}
                      </strong>
                      . Exporteer je volledige historie — overlap met een latere upload
                      is geen probleem, die filteren wij eruit.
                    </span>
                  )}
                </p>
              )}

              {/* Bij een volledige portefeuille: schoon beginnen is hier logisch */}
              {effectiveKind === 'positions' && canClear && !clearExisting && (
                <p className="mt-2 border-t border-[var(--border-ed)] pt-2 text-xs leading-relaxed text-[var(--ink-4)]">
                  Wil je écht met een schone lei beginnen — bijvoorbeeld omdat een
                  eerdere import misging — zet dan hierboven de wis-optie aan.
                </p>
              )}
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* 1d. Bestand                                                       */}
          {/* ---------------------------------------------------------------- */}
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
                    ? 'border-kern-500 bg-kern-50'
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
                <FileText className="h-5 w-5 shrink-0 text-kern-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--ink)]">
                    {fileName}
                  </p>
                  {selectedPreset && (
                    <p className="text-xs text-[var(--ink-3)]">
                      Herkend als:{' '}
                      <span className="font-medium text-kern-700">
                        {selectedPreset.label}
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
          <div className="flex flex-col items-end gap-2">
            {!assetReady && (
              <p className="text-xs text-[var(--ink-4)]">
                Kies eerst een bezitting.
              </p>
            )}
            {assetReady && selectedBroker && !kindReady && (
              <p className="text-xs text-[var(--ink-4)]">
                Kies of je je volledige portefeuille of je transactiehistorie uploadt.
              </p>
            )}
            <button
              onClick={goToPreview}
              disabled={!assetReady || !selectedBroker || !kindReady || !fileContent || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-kern-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-kern-700 disabled:cursor-not-allowed disabled:opacity-50"
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
          {/* Doel-bezitting in beeld houden — dit is waar het naartoe gaat */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-kern-200 bg-kern-50/50 px-4 py-2.5 text-sm text-[var(--ink-2)]">
            <Wallet className="h-4 w-4 shrink-0 text-kern-700" aria-hidden="true" />
            <span>
              {effectiveKind === 'transactions' ? 'Vult aan in ' : 'Stemt af op '}
              <strong className="font-semibold text-[var(--ink)]">{targetLabel}</strong>
              {isNewAsset && ' (wordt aangemaakt)'}
            </span>
          </div>

          {/* Wis-waarschuwing — laatste moment om terug te krabbelen */}
          {willClear && selectedTarget && (
            <div className="flex items-start gap-2 rounded-lg border border-negative/40 bg-negative/10 p-3 text-sm text-negative">
              <Trash2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                De {positionsLabel(selectedTarget.holdingsCount)} die nu in{' '}
                <strong>{selectedTarget.name}</strong> staan worden bij het importeren
                definitief verwijderd, met hun transactie- en koershistorie. Terug naar
                stap 1 om dit uit te zetten.
              </span>
            </div>
          )}

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
                      className="h-3.5 w-3.5 accent-kern-600"
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
                        className="h-3.5 w-3.5 accent-kern-600"
                      />
                    </td>
                    <td className="max-w-[180px] px-3 py-2.5">
                      <div className="truncate text-sm font-medium text-[var(--ink)]">
                        {row.name}
                      </div>
                      {row.isDuplicate && (
                        <span className="mt-0.5 inline-block rounded bg-kern-100 px-1.5 py-0.5 text-[10px] font-bold text-kern-800">
                          Bestaand
                          {row.matchedHoldingName && (
                            <span className="font-normal">
                              {' '}
                              &mdash;{' '}
                              {effectiveKind === 'transactions'
                                ? 'wordt bijgeteld'
                                : 'wordt vervangen'}
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
              className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                willClear
                  ? 'bg-negative hover:bg-negative/90'
                  : 'bg-kern-600 hover:bg-kern-700'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Bezig met importeren...
                </>
              ) : willClear ? (
                <>
                  <Trash2 className="h-4 w-4" />
                  Verwijderen en importeren ({includedRows.length})
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
              Je holdings staan nu in{' '}
              <span className="font-medium text-[var(--ink)]">{targetLabel}</span>,
              geïmporteerd via{' '}
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

          {/* Overlap is geen fout maar de bedoeling — laat zien dat het werkte. */}
          {(importSummary.transactions_deduped ?? 0) > 0 && (
            <p className="text-center text-sm text-[var(--ink-3)]">
              <span className="font-mono font-bold tabular-nums text-[var(--ink)]">
                {importSummary.transactions_deduped}
              </span>{' '}
              {importSummary.transactions_deduped === 1
                ? 'transactie stond er al en is overgeslagen.'
                : 'transacties stonden er al en zijn overgeslagen.'}
            </p>
          )}

          {/* Wat er is opgeruimd — hard verwijderd op verzoek, of als verkocht
              gemarkeerd omdat de positie niet meer in het bestand stond. */}
          {(importSummary.holdings_deleted ?? 0) > 0 && (
            <p className="text-center text-sm text-[var(--ink-3)]">
              <span className="font-mono font-bold tabular-nums text-[var(--ink)]">
                {importSummary.holdings_deleted}
              </span>{' '}
              {importSummary.holdings_deleted === 1
                ? 'bestaande positie is vooraf verwijderd.'
                : 'bestaande posities zijn vooraf verwijderd.'}
            </p>
          )}
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
              className="inline-flex items-center gap-2 rounded-lg bg-kern-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-kern-700"
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
