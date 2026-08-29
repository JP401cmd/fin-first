'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, FileText, X, Check, Loader2, AlertCircle, Download, RefreshCw } from 'lucide-react'
import {
  parseMijnpensioenJson,
  mijnpensioenJsonToParseResult,
} from '@/lib/pension/mijnpensioen-json'
import { parseMijnpensioenXml } from '@/lib/pension/mijnpensioen-xml'
import { useExecutionMode } from '@/lib/ai/local/use-execution-mode'
import { extractPdfPageTexts } from '@/lib/pdf/extract-text'
import { stripSensitiveData } from '@/lib/aangifte/strip-bsn'
import { createLocalPensionResolver } from '@/lib/ai/local/local-pension-resolver'
import { PensionLocalReview } from './pension-local-review'
import type { PensionOnzekerVeld } from '@/lib/ai/local/local-pension-parse'
import type { PensionParseResult } from '@/lib/pension/types'

// 'review' bestaat alleen op het LOKALE pad: daar wordt niets overgenomen
// zonder dat de gebruiker het heeft gezien (zie pension-local-review.tsx).
type UploadStatus = 'idle' | 'uploading' | 'review' | 'success' | 'error'

/** Wat de reviewstap nodig heeft, zoals de lokale resolver het teruggeeft. */
interface LocalReviewData {
  result: PensionParseResult
  onzeker: PensionOnzekerVeld[][]
  afgevallen: number
}

/**
 * Paginacap voor het lokale pad. Een UPO is enkele pagina's; een per ongeluk
 * aangeboden boekwerk moet niet minutenlang de hoofdthread bezighouden — en elk
 * blok kost on-device een eigen decode van tientallen seconden.
 */
const MAX_LOCAL_PDF_PAGES = 12

interface PensionPdfUploadProps {
  onFileSelected?: (file: File) => void
  onFileRemoved?: () => void
  onParseResult?: (result: unknown) => void
  /** When provided, the parsed PDF will also be stored in Supabase Storage */
  lifeEventId?: string | null
  /** Whether a PDF is already stored for this life event */
  existingPdfPath?: string | null
  /**
   * Woonsituatie voor de JSON-import van mijnpensioen.nl: bepaalt of het
   * AOW-bedrag samenwonend (true) of alleenstaand (false) wordt overgenomen.
   * Niet relevant voor de PDF-route (AI leidt dat zelf af). Default: samenwonend.
   */
  samenwonend?: boolean
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

const ACCEPT_ATTR =
  'application/pdf,application/json,text/xml,application/xml,.pdf,.json,.xml'

/** Of een bestand een mijnpensioen.nl JSON-export is (op naam óf MIME-type). */
function isJsonFile(f: File): boolean {
  return f.type === 'application/json' || f.name.toLowerCase().endsWith('.json')
}

/**
 * Of een bestand de mijnpensioen.nl XML-export is (`pensioenaanspraken.xml`).
 * Op naam óf MIME-type: browsers geven voor .xml zowel 'text/xml' als
 * 'application/xml', en op sommige systemen een lege string.
 */
function isXmlFile(f: File): boolean {
  return (
    f.type === 'text/xml' ||
    f.type === 'application/xml' ||
    f.name.toLowerCase().endsWith('.xml')
  )
}

export function PensionPdfUpload({
  onFileSelected,
  onFileRemoved,
  onParseResult,
  lifeEventId,
  existingPdfPath,
  samenwonend = true,
}: PensionPdfUploadProps) {
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [storedPdfPath, setStoredPdfPath] = useState<string | null>(existingPdfPath ?? null)
  const [downloading, setDownloading] = useState(false)
  const [localReview, setLocalReview] = useState<LocalReviewData | null>(null)
  const [progressLabel, setProgressLabel] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Waar mag het uitlezen van documenten draaien? Deze hook is de ENIGE bron van
  // die beslissing (fail-closed: in 'resolving' en 'blocked' vertrekt er niets —
  // niet naar de cloud én niet naar het model).
  const exec = useExecutionMode('documenten')
  // Keep a reference to the selected file for later storage upload
  const pendingFileRef = useRef<File | null>(null)

  // Sync external existingPdfPath changes
  useEffect(() => {
    setStoredPdfPath(existingPdfPath ?? null)
  }, [existingPdfPath])

  /** Upload the file to Supabase Storage after the life event is saved */
  const uploadToStorage = useCallback(async (fileToUpload: File, eventId: string) => {
    try {
      const formData = new FormData()
      formData.append('file', fileToUpload)
      formData.append('lifeEventId', eventId)
      const res = await fetch('/api/pension/storage', { method: 'POST', body: formData })
      if (res.ok) {
        const data = await res.json()
        setStoredPdfPath(data.path ?? null)
      } else {
        console.warn('[pension/storage] Upload to storage failed:', await res.text())
      }
    } catch (err) {
      console.warn('[pension/storage] Upload to storage error:', err)
    }
  }, [])

  /**
   * Deterministische DATA-import van mijnpensioen.nl: volledig client-side,
   * ZONDER /api/pension/parse (geen AI). Twee serialisaties, één pad — het
   * pensioenregister publiceert één datamodel-spec, dus de XML-adapter levert
   * dezelfde objectboom als JSON.parse() en daarna is de keten identiek.
   *
   * De mapper levert exact hetzelfde PensionParseResult-contract als de
   * PDF-route, zodat de verwerking downstream (reconcile → review → write)
   * ongewijzigd blijft. Data-bestanden worden NIET in storage bewaard (dat pad
   * is bewust alleen voor de PDF).
   *
   * Dat dit op het toestel blijft is de productbelofte, niet toeval — zie
   * docs/adr/0115-pensioen-import-blijft-op-het-toestel.md (bewuste afwijking
   * van de datapad-conventie in ADR 0058).
   */
  const handleDataFile = useCallback(async (f: File, formaat: 'json' | 'xml') => {
    setFile(f)
    setStatus('uploading')
    pendingFileRef.current = null
    onFileSelected?.(f)
    try {
      const text = await f.text()
      const parsed =
        formaat === 'xml' ? parseMijnpensioenXml(text) : parseMijnpensioenJson(text)
      if (!parsed.ok) {
        setStatus('error')
        setError(parsed.error)
        return
      }
      const result = mijnpensioenJsonToParseResult(parsed.data, { samenwonend })
      setStatus('success')
      onParseResult?.(result)
    } catch (err) {
      setStatus('error')
      setError(
        err instanceof Error
          ? err.message
          : `Er ging iets mis bij het lezen van het ${formaat.toUpperCase()}-bestand.`,
      )
    }
  }, [onFileSelected, onParseResult, samenwonend])

  /**
   * LOKALE PDF-route — volledig on-device, geen enkele byte naar buiten.
   *
   * Andere taak dan de cloud-route, geen omzetting: het cloud-pad stuurt de PDF
   * mee en het model KIJKT ernaar; hier wint pdfjs eerst deterministisch de
   * tekstlaag en doet het lokale model alleen nog tekst→JSON. Zie de kop van
   * lib/ai/local/local-pension-resolver.ts.
   *
   * Drie dingen die hier BEWUST ontbreken t.o.v. de cloud-route: de AVG-consent
   * (`pension_pdf_ai_v1`), het credit-verbruik en de storage-upload-bij-succes
   * blijft aan het eind van de REVIEW hangen — er is geen derde partij, geen
   * rekening, en er wordt niets overgenomen zonder bevestiging.
   */
  const handleLocalPdf = useCallback(async (f: File) => {
    setFile(f)
    setStatus('uploading')
    setLocalReview(null)
    pendingFileRef.current = f
    onFileSelected?.(f)

    try {
      setProgressLabel('tekst uit de PDF lezen…')
      // Pagina voor pagina, met een cap: een 10 MB-PDF ligt hier naast ~2 GB
      // modelgewicht op gedeeld iGPU-geheugen (zie lib/pdf/extract-text.ts).
      const pages = await extractPdfPageTexts(f, { maxPages: MAX_LOCAL_PDF_PAGES })

      // Lokaal niet strikt nodig (er is geen egress), maar een BSN hoeft nergens
      // in een promptstring te staan — goedkope hygiëne op een document dat per
      // definitie persoonsgegevens draagt.
      const schoon = pages.map((p) => stripSensitiveData(p).clean)

      const resolve = createLocalPensionResolver({
        onSessionState: (s) =>
          setProgressLabel(s === 'starten' ? 'model klaarzetten…' : 'pensioengegevens lezen…'),
        onProgress: (done, total) => setProgressLabel(`onderdeel ${done} van ${total}…`),
      })
      const uitkomst = await resolve(schoon)

      if (!uitkomst.ok) {
        // Eerlijk stoppen — nooit een stille terugval op /api/pension/parse.
        setStatus('error')
        setError(uitkomst.message)
        return
      }

      setLocalReview({
        result: uitkomst.result,
        onzeker: uitkomst.onzeker,
        afgevallen: uitkomst.afgevallen,
      })
      setStatus('review')
    } catch (err) {
      console.error('[lokale-ai] pensioen-PDF lokaal uitlezen mislukt:', err)
      setStatus('error')
      setError(
        'Het uitlezen op je eigen apparaat is niet gelukt. Probeer het opnieuw, of gebruik de XML-download van mijnpensioenoverzicht.nl.',
      )
    } finally {
      setProgressLabel(null)
    }
  }, [onFileSelected])

  /** Bevestigd in de reviewstap — pas hier wordt er iets overgenomen. */
  const bevestigLokaal = useCallback((result: PensionParseResult) => {
    setLocalReview(null)
    setStatus('success')
    onParseResult?.(result)
    const f = pendingFileRef.current
    if (lifeEventId && f) uploadToStorage(f, lifeEventId)
  }, [onParseResult, lifeEventId, uploadToStorage])

  const validateAndSet = useCallback((f: File) => {
    setError(null)

    const json = isJsonFile(f)
    const xml = isXmlFile(f)
    if (!json && !xml && f.type !== 'application/pdf') {
      setError('Alleen XML-, JSON- of PDF-bestanden van mijnpensioen.nl zijn toegestaan.')
      return
    }
    if (f.size > MAX_FILE_SIZE) {
      setError('Bestand is te groot. Maximaal 10 MB.')
      return
    }

    // ── DATA-route (XML/JSON): deterministisch, client-side, geen AI ──
    // Staat óók in privé-modus voorop: geen model, geen risico, nul tokens.
    // XML gaat vóór JSON: de downloadknop van mijnpensioenoverzicht.nl levert
    // `pensioenaanspraken.xml`, dus dat is het bestand dat de meeste
    // gebruikers daadwerkelijk in handen krijgen.
    if (xml) {
      void handleDataFile(f, 'xml')
      return
    }
    if (json) {
      void handleDataFile(f, 'json')
      return
    }

    // ── PDF-route: de uitvoerkeuze bepaalt WAAR dit draait ────────────────────
    // FAIL-CLOSED. Alleen bij een expliciet 'mag lokaal' of 'mag cloud' vertrekt
    // er iets. In 'resolving' weten we de voorkeur nog niet en in 'blocked' kan
    // het toestel het niet — in beide gevallen gebeurt er NIETS, en zeker geen
    // stille cloud-aanroep "want dat werkt tenminste".
    if (exec.canUseLocal) {
      void handleLocalPdf(f)
      return
    }

    if (!exec.canUseCloud) {
      if (exec.status === 'blocked') {
        setError(
          `${exec.message ?? 'Lokale AI is nu niet beschikbaar op dit toestel.'} Gebruik de XML-download van mijnpensioenoverzicht.nl, of zet "Documenten lezen" op /mijn/privacy om naar de cloud.`,
        )
      } else {
        setError('We controleren nog waar het uitlezen mag draaien. Probeer het zo opnieuw.')
      }
      return
    }

    // ── PDF-route via de cloud: ongewijzigd (AI-extractie via /api/pension/parse) ──
    setFile(f)
    setStatus('uploading')
    pendingFileRef.current = f
    onFileSelected?.(f)

    // Upload to parse API. The PDF is sent to an AI provider for one-time
    // extraction (documented in ADR 0035). By choosing to upload the PDF the
    // user gives explicit, logged AVG-consent; the token below records it
    // server-side. The JSON-route (above) never sends data to the AI provider.
    const formData = new FormData()
    formData.append('file', f)
    formData.append('consent', 'pension_pdf_ai_v1')
    fetch('/api/pension/parse', { method: 'POST', body: formData })
      .then(async res => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `Upload mislukt (${res.status})`)
        }
        return res.json()
      })
      .then(data => {
        setStatus('success')
        onParseResult?.(data)

        // If we already have a lifeEventId, upload to storage immediately
        if (lifeEventId) {
          uploadToStorage(f, lifeEventId)
        }
      })
      .catch(err => {
        setStatus('error')
        setError(err.message || 'Er ging iets mis bij het verwerken van de PDF.')
      })
  }, [
    onFileSelected,
    onParseResult,
    lifeEventId,
    uploadToStorage,
    handleDataFile,
    handleLocalPdf,
    exec.canUseLocal,
    exec.canUseCloud,
    exec.status,
    exec.message,
  ])

  /**
   * Called externally (via ref or effect) after a life event is saved,
   * to upload the pending file to storage.
   */
  const uploadPendingFile = useCallback(async (eventId: string) => {
    const f = pendingFileRef.current
    if (f && eventId) {
      await uploadToStorage(f, eventId)
    }
  }, [uploadToStorage])

  // Expose uploadPendingFile via a custom attribute on the component
  // We use a different approach: the parent will call /api/pension/storage directly after save

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) validateAndSet(f)
  }, [validateAndSet])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) validateAndSet(f)
  }, [validateAndSet])

  const handleRemove = useCallback(() => {
    setFile(null)
    setStatus('idle')
    setError(null)
    setLocalReview(null)
    setProgressLabel(null)
    pendingFileRef.current = null
    if (inputRef.current) inputRef.current.value = ''
    onFileRemoved?.()
  }, [onFileRemoved])

  /**
   * Opnieuw proberen na een verwerkingsfout — herhaalt de upload/validatie met
   * het reeds gekozen bestand (nog in `file`-state), zónder dat de gebruiker
   * opnieuw hoeft te slepen of te kiezen.
   */
  const handleRetry = useCallback(() => {
    if (file) validateAndSet(file)
  }, [file, validateAndSet])

  const handleDownload = useCallback(async () => {
    if (!lifeEventId) return
    setDownloading(true)
    try {
      const res = await fetch(`/api/pension/storage?lifeEventId=${lifeEventId}`)
      if (!res.ok) throw new Error('Download mislukt')
      const data = await res.json()
      if (data.url) {
        window.open(data.url, '_blank', 'noopener')
      }
    } catch (err) {
      console.error('[pension/storage] Download error:', err)
    } finally {
      setDownloading(false)
    }
  }, [lifeEventId])

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // ── Existing stored PDF (no new upload in progress) ──
  if (!file && storedPdfPath && status === 'idle') {
    return (
      <div className="rounded-[var(--r)] border border-horizon-200 bg-horizon-50/30 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-horizon-100">
            <FileText className="h-4 w-4 text-horizon-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--ink)]">Pensioenoverzicht (PDF)</p>
            <p className="text-xs text-[var(--ink-3)]">Opgeslagen document</p>
          </div>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="shrink-0 rounded-md p-1.5 text-horizon-600 hover:bg-horizon-100 transition-colors disabled:opacity-50"
            title="Download PDF"
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setStoredPdfPath(null)
            inputRef.current?.click()
          }}
          className="mt-2 w-full text-center text-xs text-[var(--ink-3)] hover:text-horizon-600 transition-colors underline underline-offset-2"
        >
          Opnieuw uploaden
        </button>
        {/* Hidden file input for re-upload */}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    )
  }

  // ── Success state ──
  if (status === 'success' && file) {
    return (
      <div className="rounded-[var(--r)] border border-horizon-200 bg-horizon-50/50 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-horizon-100">
            <Check className="h-4 w-4 text-horizon-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--ink)]">{file.name}</p>
            <p className="text-xs text-[var(--ink-3)]">
              {formatFileSize(file.size)} — verwerkt
              {storedPdfPath && ' · opgeslagen'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            className="shrink-0 rounded-md p-1.5 text-[var(--ink-4)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] transition-colors"
            title="Verwijder bestand"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={handleRemove}
          className="mt-2 w-full text-center text-xs text-[var(--ink-3)] hover:text-horizon-600 transition-colors underline underline-offset-2"
        >
          Opnieuw uploaden
        </button>
      </div>
    )
  }

  // ── Review state (alleen lokaal): niets overnemen zonder bevestiging ──
  if (status === 'review' && localReview) {
    return (
      <PensionLocalReview
        result={localReview.result}
        onzeker={localReview.onzeker}
        afgevallen={localReview.afgevallen}
        onConfirm={bevestigLokaal}
        onCancel={handleRemove}
      />
    )
  }

  // ── Uploading state ──
  if (status === 'uploading' && file) {
    return (
      <div className="rounded-[var(--r)] border border-horizon-200 bg-horizon-50/30 p-3">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-horizon-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--ink)]">{file.name}</p>
            {/* Op het lokale pad duurt dit merkbaar langer dan via de cloud; de
                fase-tekst voorkomt dat een stille GPU-warmup als hang voelt. */}
            <p className="text-xs text-[var(--ink-3)]">
              {formatFileSize(file.size)} — {progressLabel ?? 'wordt verwerkt...'}
            </p>
          </div>
        </div>
        {exec.status === 'lokaal' && (
          <p className="mt-2 text-[11px] leading-snug text-[var(--ink-4)]">
            Dit gebeurt volledig op je eigen apparaat. De eerste keer duurt het klaarzetten van het
            model wat langer.
          </p>
        )}
      </div>
    )
  }

  // ── Error state (with file) ──
  if (status === 'error' && file) {
    return (
      <div className="rounded-[var(--r)] border border-red-200 bg-red-50/50 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100">
            <AlertCircle className="h-4 w-4 text-red-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--ink)]">{file.name}</p>
            <p className="text-xs text-red-600">{error || 'Verwerking mislukt'}</p>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            className="shrink-0 rounded-md p-1.5 text-[var(--ink-4)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] transition-colors"
            title="Verwijder bestand"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Echte retry: herhaalt de verwerking met hetzelfde bestand. De X
            hierboven blijft het secundaire pad (bestand weggooien). */}
        <button
          type="button"
          onClick={handleRetry}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[var(--r)] border border-red-200 bg-red-100/50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Opnieuw proberen
        </button>
      </div>
    )
  }

  // ── Idle / drop zone ──
  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`
          cursor-pointer rounded-[var(--r)] border-2 border-dashed p-4 text-center transition-colors
          ${dragOver
            ? 'border-horizon-400 bg-horizon-50/60'
            : 'border-[var(--border-md)] bg-[var(--subtle)] hover:border-horizon-300 hover:bg-horizon-50/30'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          onChange={handleFileChange}
          className="hidden"
        />
        <div className="flex flex-col items-center gap-2">
          {dragOver ? (
            <FileText className="h-8 w-8 text-horizon-500" />
          ) : (
            <Upload className="h-8 w-8 text-[var(--ink-4)]" />
          )}
          {/* Desktop: drag & drop text; Mobile: tap to select */}
          <div>
            <p className="text-sm font-medium text-[var(--ink-2)]">
              <span className="hidden sm:inline">Sleep je XML, JSON of PDF hierheen of </span>
              <span className="text-horizon-600 underline underline-offset-2">kies een bestand</span>
            </p>
            <p className="mt-0.5 text-xs text-[var(--ink-4)]">
              {exec.status === 'lokaal'
                ? 'XML of JSON van mijnpensioenoverzicht.nl (aanbevolen) of PDF, max 10 MB'
                : 'XML, JSON of PDF van mijnpensioenoverzicht.nl, max 10 MB'}
            </p>
          </div>
        </div>
      </div>
      {/* AVG-notice — drie varianten, want de bestemming van het document
          verschilt écht per uitvoerkeuze en dat mag de gebruiker niet raden. */}
      <p className="mt-1.5 text-[11px] leading-snug text-[var(--ink-4)]">
        {exec.status === 'lokaal' ? (
          <>
            Alle drie de bestanden verwerken we volledig op je eigen apparaat — er gaat niets naar
            een AI-dienst. De datadownload van mijnpensioenoverzicht.nl (XML, of JSON) is de
            betrouwbaarste route: die lezen we zonder AI uit. Een PDF laten we door het model op je
            toestel lezen; je controleert het resultaat daarna zelf.
          </>
        ) : exec.status === 'blocked' ? (
          <>
            Je hebt gekozen om documenten op je eigen apparaat te lezen, maar dat lukt hier niet:{' '}
            {exec.message ?? 'lokale AI is nu niet beschikbaar op dit toestel.'} Gebruik de
            XML-download van mijnpensioenoverzicht.nl — die verwerken we zonder AI, volledig op je
            apparaat.
          </>
        ) : (
          <>
            Een PDF wordt eenmalig door een AI-dienst gelezen om de bedragen over te nemen en niet
            bewaard. Liever niet? Gebruik de XML-download van mijnpensioenoverzicht.nl — die
            verwerken we volledig op je eigen apparaat.
          </>
        )}
      </p>
      {/* Inline error (no file selected yet) */}
      {error && !file && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * Upload a pending pension PDF to storage after a life event is created/updated.
 * Call this from the parent after saving the life event.
 */
export async function uploadPensionPdfToStorage(file: File, lifeEventId: string): Promise<string | null> {
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('lifeEventId', lifeEventId)
    const res = await fetch('/api/pension/storage', { method: 'POST', body: formData })
    if (res.ok) {
      const data = await res.json()
      return data.path ?? null
    }
    console.warn('[pension/storage] Upload failed:', await res.text())
    return null
  } catch (err) {
    console.warn('[pension/storage] Upload error:', err)
    return null
  }
}

/**
 * Delete a pension PDF from storage when a life event is deleted.
 */
export async function deletePensionPdfFromStorage(lifeEventId: string): Promise<void> {
  try {
    await fetch(`/api/pension/storage?lifeEventId=${lifeEventId}`, { method: 'DELETE' })
  } catch (err) {
    console.warn('[pension/storage] Delete error:', err)
  }
}
