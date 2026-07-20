'use client'

/**
 * UploadStep — PDF-drop voor de aangifte-import flow.
 *
 * Verantwoordelijkheden:
 *   1. Drag-drop / click-to-pick van een PDF (native HTML5 events — geen
 *      `react-dropzone`-dep want die is niet geïnstalleerd en de
 *      requirement is "rolt-eigen tenzij nodig").
 *   2. Client-side parse via `pdfjs-dist` met juiste worker-pad.
 *   3. BSN-strip via `stripSensitiveData()` vóór data het apparaat
 *      verlaat. Console-log toont alleen `strippedCount` voor audit, nooit
 *      `clean` of de originele tekst.
 *   4. POST naar `/api/onboarding/aangifte-extract` (B1). Bij 404/5xx tonen
 *      we een fallback met "typ liever zelf"-link conform plan: parallelle
 *      ontwikkeling, fault-tolerant.
 *   5. Tax-year-picker default = vorig jaar (aangiftes lopen 1 jaar achter).
 *   6. Loading-state met `FinDots`-pulse en kopij "Bedragen worden gelezen".
 *
 * Verbod:
 *   - Geen logging van raw tekst of bedragen — alleen schema-fouten.
 *   - Geen pdf.worker via CDN: gebruik bundled `pdf.worker.min.mjs` zodat
 *     de gebruiker geen externe CDN-call ziet en CSP soepel blijft.
 *
 * Pdf.js worker setup: de worker (`pdf.worker.min.mjs`) wordt door een
 * postinstall-script (`scripts/copy-pdfjs-worker.mjs`) vanuit
 * `node_modules/pdfjs-dist/build/` naar `public/` gekopieerd. Dat
 * resulteert in een Next.js-served static asset op `/pdf.worker.min.mjs`
 * dat we aan `GlobalWorkerOptions.workerSrc` toewijzen. Voordeel boven
 * CDN-route: geen externe call, CSP-compatibel, geen supply-chain-
 * dependency op het host-runtime, geen IP/UA-leak naar derden.
 */

import { useCallback, useRef, useState } from 'react'
import { Upload, FileText, AlertCircle, X } from 'lucide-react'
import { FinDots } from '@/components/app/fin-dots'
import { stripSensitiveData } from '@/lib/aangifte/strip-bsn'
import type { AangifteExtractionResult } from '@/lib/aangifte/types'

interface UploadStepProps {
  /** Default tax-year voor de picker. Default: huidige jaar - 1. */
  fallbackTaxYear?: number
  /** Callback met succesvolle extractie. Routet door naar review-step. */
  onExtracted: (result: AangifteExtractionResult) => void
  /** Fallback-link "typ liever zelf" — switcht naar manual-wizard. */
  onSwitchToManual: () => void
  /** Annuleren — sluit de pane. */
  onCancel: () => void
}

const CURRENT_YEAR = new Date().getFullYear()
// Aangifte loopt altijd één jaar achter; als de gebruiker in 2026 zit
// importeren ze meestal de aangifte over 2025.
const DEFAULT_FALLBACK_YEAR = CURRENT_YEAR - 1
const TAX_YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - 1 - i)

/**
 * Parse een PDF-File naar platte tekst via pdfjs-dist. Async dynamic import
 * zodat de zware bibliotheek pas geladen wordt bij eerste klik (next/lazy
 * doet dit voor componenten, dynamic import doet hetzelfde voor libs).
 *
 * Worker-strategie: pdfjs-dist v4 ships `pdf.worker.min.mjs` als losse
 * worker-bundle. Een postinstall-hook (`scripts/copy-pdfjs-worker.mjs`)
 * kopieert deze naar `public/pdf.worker.min.mjs` zodat Next.js het op
 * een stabiel pad serveert. Wij wijzen `GlobalWorkerOptions.workerSrc`
 * exact daarheen — geen CDN, geen externe netwerk-call.
 */
// Statisch pad onder /public; wordt door de postinstall-hook gevuld zodat
// Next.js het als static asset serveert. Constante uitgelift uit de
// functie omdat hij ook door de version-mismatch-warning gebruikt wordt.
const PDFJS_WORKER_SRC = '/pdf.worker.min.mjs'

async function extractTextFromPdf(file: File): Promise<string> {
  // Dynamische import — voorkomt dat pdfjs op SSR landt en houdt de bundle
  // kleiner voor users die de feature niet aanraken.
  const pdfjs = await import('pdfjs-dist')

  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC
  }

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise

  let fullText = ''
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    // pdfjs returnt een items-array met str-veld per text-fragment.
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    fullText += `${pageText}\n`
  }
  return fullText
}

export function UploadStep({
  fallbackTaxYear = DEFAULT_FALLBACK_YEAR,
  onExtracted,
  onSwitchToManual,
  onCancel,
}: UploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [taxYear, setTaxYear] = useState<number>(fallbackTaxYear)
  const [parsedFileName, setParsedFileName] = useState<string | null>(null)

  /**
   * Centrale parse-flow: bestand binnen → tekst eruit → BSN-strip →
   * POST naar extract-API → onExtracted callback. Bij elke stap kan het
   * falen; de error-state ondersteunt de fallback naar de manual wizard.
   */
  const processFile = useCallback(
    async (file: File) => {
      // Validatie: alleen PDF's. Belastingdienst-PDF is altijd `application/pdf`,
      // maar sommige browsers leveren empty mime — vallen we terug op extensie.
      const isPdf =
        file.type === 'application/pdf' ||
        file.name.toLowerCase().endsWith('.pdf')
      if (!isPdf) {
        setError('Alleen PDF-bestanden worden ondersteund. Probeer opnieuw met een PDF van Mijn Belastingdienst.')
        return
      }

      // Sanity-check: aangifte-PDF's zijn doorgaans 200KB-2MB. >10MB is bijna
      // zeker geen aangifte (foto's, scans). Voorkomt browser-crash op grote
      // PDF's.
      const TEN_MB = 10 * 1024 * 1024
      if (file.size > TEN_MB) {
        setError('Dit bestand is groter dan 10 MB. Een aangifte-PDF is meestal kleiner — kies de juiste download.')
        return
      }

      setParsing(true)
      setError(null)
      setParsedFileName(file.name)

      try {
        const rawText = await extractTextFromPdf(file)
        if (!rawText.trim()) {
          throw new Error('De PDF lijkt leeg of bevat alleen afbeeldingen. Voor gescande aangiftes werkt PDF-import niet — typ de bedragen liever zelf.')
        }

        // BSN-strip in browser. We loggen alleen `strippedCount` voor audit,
        // nooit de clean tekst zelf — die bevat nog wel financiële data.
        const { clean, strippedCount } = stripSensitiveData(rawText)
        console.info(`[aangifte] removed ${strippedCount} BSN-pattern matches before upload`)

        const res = await fetch('/api/onboarding/aangifte-extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: clean, fallback_tax_year: taxYear }),
        })

        if (res.status === 404) {
          // B1 nog niet live. Geef gebruiker een vriendelijke fallback.
          throw new Error('De PDF-import is nog niet beschikbaar. Typ de bedragen liever zelf — dat is in 1 minuut gedaan.')
        }

        if (!res.ok) {
          // Server gaf een nette fout terug (extract mislukte). We tonen
          // de generieke kop maar laten de fallback open.
          let detail = 'PDF lezen lukte niet'
          try {
            const data = (await res.json()) as { error?: string }
            if (data?.error) detail = data.error
          } catch {
            // Body kan leeg/non-JSON zijn — gebruik generieke tekst.
          }
          throw new Error(detail)
        }

        const result = (await res.json()) as AangifteExtractionResult
        onExtracted(result)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Er ging iets mis bij het lezen van de PDF.'
        setError(message)
      } finally {
        setParsing(false)
      }
    },
    [taxYear, onExtracted],
  )

  // ── Drag-drop handlers ─────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      const file = e.dataTransfer.files?.[0]
      if (file) {
        void processFile(file)
      }
    },
    [processFile],
  )

  const handleFilePick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        void processFile(file)
      }
      // Reset zodat dezelfde file opnieuw gekozen kan worden na fout.
      e.target.value = ''
    },
    [processFile],
  )

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Editorial header */}
      <div className="space-y-2">
        <p className="flex items-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
          <span
            className="inline-block w-7 h-px bg-[var(--color-kern-500)] mr-2.5 align-middle"
            aria-hidden="true"
          />
          Stap 1 — PDF uploaden
        </p>
        <h2 className="font-serif text-2xl text-[var(--ink)] leading-tight">
          Sleep je aangifte hier{' '}
          <em className="font-serif italic font-normal text-[var(--color-kern-700)]">naartoe</em>
        </h2>
        <p className="font-serif italic text-sm text-[var(--ink-2)] leading-relaxed border-l-2 border-[var(--color-kern-500)] pl-3 max-w-[60ch]">
          Download eerst &quot;Kopie van de aangifte&quot; via Mijn Belastingdienst, en sleep
          die hier naartoe. De PDF zelf gaat nooit naar de server. Alleen de bedragen-tekst
          (zonder BSN) wordt geanalyseerd door onze AI.
        </p>
      </div>

      {/* Tax-year picker */}
      <div className="flex items-center gap-3">
        <label htmlFor="aangifte-tax-year" className="text-xs font-mono uppercase tracking-[0.10em] text-[var(--ink-3)]">
          Belastingjaar
        </label>
        <select
          id="aangifte-tax-year"
          value={taxYear}
          onChange={(e) => setTaxYear(Number.parseInt(e.target.value, 10))}
          disabled={parsing}
          className="min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 font-mono text-sm tabular-nums text-[var(--ink)] focus:border-[var(--color-kern-500)] focus:outline-none disabled:opacity-50"
        >
          {TAX_YEAR_OPTIONS.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {/* Drop-zone */}
      {!parsing && !error && (
        <div
          role="button"
          tabIndex={0}
          aria-label="PDF uploaden of slepen"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              inputRef.current?.click()
            }
          }}
          className={`relative flex flex-col items-center justify-center gap-3 border-2 border-dashed px-6 py-12 transition-colors cursor-pointer min-h-[200px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-kern-500)] focus-visible:ring-offset-2 ${
            isDragging
              ? 'border-[var(--color-kern-500)] bg-[var(--color-kern-50)]/40'
              : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--color-kern-300)] hover:bg-[var(--subtle)]/50'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFilePick}
            className="sr-only"
          />
          <Upload
            className="h-10 w-10 text-[var(--ink-3)]"
            strokeWidth={1.25}
            aria-hidden="true"
          />
          <p className="font-serif italic text-base text-[var(--ink-2)]">
            Sleep je PDF hier of <span className="not-italic font-medium text-[var(--color-kern-700)]">kies een bestand</span>
          </p>
          <p className="text-xs text-[var(--ink-3)] font-mono">
            Maximaal 10 MB · alleen PDF
          </p>
        </div>
      )}

      {/* Loading state */}
      {parsing && (
        <div className="flex flex-col items-center gap-4 border border-[var(--border-ed)] bg-[var(--paper)] px-6 py-12 min-h-[200px]">
          {/* FinDots heeft een eigen state-gestuurde puls; geen extra wrapper-animate-pulse. */}
          <FinDots size={48} state="loading" />
          <div className="text-center space-y-1">
            <p className="font-serif italic text-base text-[var(--ink-2)]">
              Bedragen worden gelezen...
            </p>
            {parsedFileName && (
              <p className="text-xs text-[var(--ink-3)] font-mono truncate max-w-[40ch]">
                <FileText className="inline h-3 w-3 mr-1 align-text-bottom" />
                {parsedFileName}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Error state met fallback-link */}
      {error && !parsing && (
        <div
          role="alert"
          className="border border-[var(--border-ed)] border-l-4 border-l-[var(--negative)] bg-[var(--paper)] p-4 space-y-3"
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              className="h-5 w-5 text-[var(--negative)] shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="flex-1 space-y-1">
              <p className="text-[10px] font-mono uppercase tracking-[0.10em] text-[var(--ink-3)]">
                PDF lezen lukte niet
              </p>
              <p className="font-serif italic text-sm text-[var(--ink-2)] leading-relaxed">
                {error}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setError(null)
                setParsedFileName(null)
              }}
              aria-label="Sluit foutmelding"
              className="shrink-0 text-[var(--ink-4)] hover:text-[var(--ink)] transition-colors p-1 -m-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 pt-1 pl-8">
            <button
              type="button"
              onClick={onSwitchToManual}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-2 text-sm font-medium text-[var(--color-kern-700)] hover:text-[var(--color-kern-800)] underline underline-offset-4 decoration-1 transition-colors"
            >
              Typ liever zelf
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-2 text-sm font-medium text-[var(--ink-2)] hover:text-[var(--ink)] underline underline-offset-4 decoration-1 transition-colors"
            >
              Andere PDF kiezen
            </button>
          </div>
        </div>
      )}

      {/* Footer-actions */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--border-ed)]">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] px-3 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
        >
          Annuleren
        </button>
        <button
          type="button"
          onClick={onSwitchToManual}
          className="min-h-[44px] inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-kern-700)] hover:text-[var(--color-kern-800)] underline underline-offset-4 decoration-1 transition-colors"
        >
          Typ liever zelf →
        </button>
      </div>
    </div>
  )
}
