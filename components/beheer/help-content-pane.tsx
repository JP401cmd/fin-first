'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Trash2, Upload, ImagePlus } from 'lucide-react'
import { ShellOverlay, type PaneAction } from '@/components/app/shell/shell-overlay'
import type { HelpEntry, HelpScreenshot } from '@/lib/briefing/guide-help'

interface HelpContentPaneProps {
  open: boolean
  onClose: () => void
  /** helpKey (bv. "standard:sg_assets" of "goal:noodfonds:nf_calc") */
  helpKey: string
  /** Korte naam voor de stap — getoond in de pane-header voor context. */
  stepLabel?: string
  /** Callback wanneer save succesvol is — laat de host de status-badge bijwerken. */
  onSaved?: (entry: HelpEntry) => void
}

const EMPTY_ENTRY: HelpEntry = {
  explanation: '',
  howTo: '',
  screenshots: [],
  updatedAt: '',
}

/**
 * Admin-pane voor het bewerken van help-content (uitleg + how-to +
 * screenshots) per stap. Driewegregel: gebruikt `<ShellOverlay kind="pane">`.
 *
 * Datapad:
 * - Bij open: fetch hele guide-help blob, pluk de entry voor `helpKey`.
 * - Save (footer-knop): PUT explanation+howTo via `/api/guide-help/[helpKey]`.
 * - Screenshots zijn live (POST/DELETE/PATCH direct na actie) — geen
 *   "save" stap, vergelijkbaar met inline file-uploads in andere admin-tools.
 *   Reden: bestand uploaden kost tijd; we willen progress-feedback per file
 *   en niet één grote save aan het eind.
 */
export function HelpContentPane({
  open,
  onClose,
  helpKey,
  stepLabel,
  onSaved,
}: HelpContentPaneProps) {
  const [entry, setEntry] = useState<HelpEntry>(EMPTY_ENTRY)
  const [original, setOriginal] = useState<HelpEntry>(EMPTY_ENTRY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch entry bij open. Re-fetch wanneer helpKey wijzigt zodat dezelfde
  // pane-instance hergebruikt kan worden voor verschillende stappen.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setUploadError(null)
    ;(async () => {
      try {
        const res = await fetch('/api/guide-help')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = (await res.json()) as Record<string, HelpEntry>
        if (cancelled) return
        const found = blob[helpKey] ?? EMPTY_ENTRY
        setEntry(found)
        setOriginal(found)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Onbekende fout')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, helpKey])

  const textChanged =
    entry.explanation !== original.explanation || entry.howTo !== original.howTo

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/guide-help/${encodeURIComponent(helpKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          explanation: entry.explanation,
          howTo: entry.howTo,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const updated = (await res.json()) as HelpEntry
      setEntry(updated)
      setOriginal(updated)
      onSaved?.(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt')
    } finally {
      setSaving(false)
    }
  }, [helpKey, entry.explanation, entry.howTo, onSaved])

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true)
      setUploadError(null)
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch(
          `/api/guide-help/${encodeURIComponent(helpKey)}/screenshots`,
          { method: 'POST', body: fd },
        )
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? `HTTP ${res.status}`)
        }
        const updated = (await res.json()) as HelpEntry
        setEntry(updated)
        setOriginal((prev) => ({ ...prev, screenshots: updated.screenshots }))
        onSaved?.(updated)
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload mislukt')
      } finally {
        setUploading(false)
      }
    },
    [helpKey, onSaved],
  )

  const handleFilePick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) void handleUpload(file)
      // Reset zodat dezelfde file opnieuw kan worden gekozen
      e.target.value = ''
    },
    [handleUpload],
  )

  const handleDeleteScreenshot = useCallback(
    async (filename: string) => {
      if (!confirm(`Verwijder screenshot "${filename}"?`)) return
      try {
        const res = await fetch(
          `/api/guide-help/${encodeURIComponent(helpKey)}/screenshots/${encodeURIComponent(filename)}`,
          { method: 'DELETE' },
        )
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? `HTTP ${res.status}`)
        }
        const updated = (await res.json()) as HelpEntry
        setEntry(updated)
        setOriginal((prev) => ({ ...prev, screenshots: updated.screenshots }))
        onSaved?.(updated)
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Verwijderen mislukt')
      }
    },
    [helpKey, onSaved],
  )

  const handleCaptionChange = useCallback(
    async (filename: string, caption: string) => {
      // Optimistisch: pas lokaal aan, sync naar server zonder spinner.
      setEntry((prev) => ({
        ...prev,
        screenshots: prev.screenshots.map((s) =>
          s.filename === filename ? { ...s, caption } : s,
        ),
      }))
      try {
        await fetch(
          `/api/guide-help/${encodeURIComponent(helpKey)}/screenshots/${encodeURIComponent(filename)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caption }),
          },
        )
      } catch {
        // Stilzwijgend negeren — caption is niet kritiek.
      }
    },
    [helpKey],
  )

  const primaryAction: PaneAction = {
    label: saving ? 'Opslaan…' : 'Opslaan',
    onClick: handleSave,
    disabled: !textChanged || saving,
    loading: saving,
  }
  const secondaryAction: PaneAction = {
    label: 'Sluiten',
    onClick: onClose,
  }

  return (
    <ShellOverlay
      open={open}
      onClose={onClose}
      kind="pane" mobileBackCloses
      title={stepLabel ? `Uitleg: ${stepLabel}` : 'Uitleg bewerken'}
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
    >
      <div className="space-y-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
            Help-key
          </p>
          <p className="mt-0.5 font-mono text-xs text-[var(--ink-2)] break-all">{helpKey}</p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-[var(--ink-3)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uitleg laden…
          </div>
        ) : (
          <>
            <FormField
              label="Wat is dit?"
              hint="Korte uitleg in 1-3 zinnen — wat de stap betekent voor de gebruiker."
            >
              <textarea
                value={entry.explanation}
                onChange={(e) =>
                  setEntry((prev) => ({ ...prev, explanation: e.target.value }))
                }
                rows={3}
                placeholder="Hier vul je je bezittingen aan — alles van waarde dat je bezit."
                className="w-full rounded border border-[var(--border-md)] bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none focus:ring-1 focus:ring-[var(--ink-3)]"
              />
            </FormField>

            <FormField
              label="Hoe doe je dit?"
              hint="Stap-voor-stap instructies. Newlines worden gerespecteerd."
            >
              <textarea
                value={entry.howTo}
                onChange={(e) =>
                  setEntry((prev) => ({ ...prev, howTo: e.target.value }))
                }
                rows={6}
                placeholder={'1. Klik op "Toevoegen"\n2. Kies een type\n3. Vul de waarde in'}
                className="w-full rounded border border-[var(--border-md)] bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none focus:ring-1 focus:ring-[var(--ink-3)] font-mono"
              />
            </FormField>

            <FormField
              label="Screenshots"
              hint="Max 6 afbeeldingen, PNG/JPG/WebP, max 4 MB per stuk. Worden direct opgeslagen."
            >
              <ScreenshotsManager
                screenshots={entry.screenshots}
                uploading={uploading}
                uploadError={uploadError}
                onPick={() => fileInputRef.current?.click()}
                onDelete={handleDeleteScreenshot}
                onCaptionChange={handleCaptionChange}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFilePick}
                hidden
              />
            </FormField>

            {error && (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </ShellOverlay>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function FormField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-[var(--ink)]">{label}</label>
      {hint && <p className="text-xs italic text-[var(--ink-3)]">{hint}</p>}
      {children}
    </div>
  )
}

function ScreenshotsManager({
  screenshots,
  uploading,
  uploadError,
  onPick,
  onDelete,
  onCaptionChange,
}: {
  screenshots: HelpScreenshot[]
  uploading: boolean
  uploadError: string | null
  onPick: () => void
  onDelete: (filename: string) => void
  onCaptionChange: (filename: string, caption: string) => void
}) {
  return (
    <div className="space-y-3">
      {screenshots.length === 0 ? (
        <p className="rounded border border-dashed border-[var(--border-md)] px-3 py-6 text-center text-xs italic text-[var(--ink-3)]">
          Nog geen screenshots geüpload.
        </p>
      ) : (
        <ul className="space-y-3">
          {screenshots.map((s) => (
            <li
              key={s.filename}
              className="flex items-start gap-3 rounded border border-[var(--border-ed)] bg-[var(--paper)] p-3"
            >
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="block shrink-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.url}
                  alt={s.caption ?? s.filename}
                  className="h-20 w-32 object-cover border border-[var(--border-ed)]"
                />
              </a>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="font-mono text-[11px] text-[var(--ink-3)] break-all">
                  {s.filename}
                </p>
                <input
                  type="text"
                  value={s.caption ?? ''}
                  onChange={(e) => onCaptionChange(s.filename, e.target.value)}
                  placeholder="Bijschrift (optioneel)"
                  className="w-full rounded border border-[var(--border-md)] bg-white px-2 py-1 text-xs text-[var(--ink)] outline-none focus:ring-1 focus:ring-[var(--ink-3)]"
                />
              </div>
              <button
                type="button"
                onClick={() => onDelete(s.filename)}
                className="shrink-0 rounded p-1.5 text-[var(--ink-4)] transition-colors hover:bg-red-50 hover:text-red-500"
                aria-label="Verwijder screenshot"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {uploadError && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {uploadError}
        </p>
      )}

      <button
        type="button"
        onClick={onPick}
        disabled={uploading || screenshots.length >= 6}
        className="inline-flex items-center gap-2 rounded border border-dashed border-[var(--border-md)] px-3 py-2 text-xs font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--ink-3)] hover:bg-[var(--subtle)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {uploading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Uploaden…
          </>
        ) : (
          <>
            {screenshots.length === 0 ? (
              <ImagePlus className="h-3.5 w-3.5" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {screenshots.length === 0 ? 'Eerste screenshot uploaden' : 'Screenshot toevoegen'}
          </>
        )}
      </button>
    </div>
  )
}

// ── Status-badge — gebruikt door step-row als trailing-cel ────────

interface StatusBadgeProps {
  entry?: HelpEntry
  onClick: () => void
}

/**
 * Klikbare badge die de huidige status van de help-content samenvat:
 * - leeg / ontbrekend → grijs "geen uitleg"
 * - alleen tekst → emerald "uitleg"
 * - tekst + screenshots → paars "uitleg + N foto's"
 *
 * Klik opent de HelpContentPane.
 */
export function HelpStatusBadge({ entry, onClick }: StatusBadgeProps) {
  const hasText = !!(entry && (entry.explanation || entry.howTo))
  const photoCount = entry?.screenshots.length ?? 0

  let dotClass = 'bg-[var(--ink-4)]'
  let textClass = 'text-[var(--ink-3)]'
  let label = 'geen uitleg'

  if (hasText && photoCount > 0) {
    dotClass = 'bg-purple-500'
    textClass = 'text-purple-700'
    label = `uitleg + ${photoCount} ${photoCount === 1 ? 'foto' : "foto's"}`
  } else if (hasText) {
    dotClass = 'bg-emerald-500'
    textClass = 'text-emerald-700'
    label = 'uitleg'
  } else if (photoCount > 0) {
    dotClass = 'bg-amber-500'
    textClass = 'text-amber-700'
    label = `${photoCount} ${photoCount === 1 ? 'foto' : "foto's"}`
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors hover:bg-[var(--subtle)] ${textClass}`}
      title="Bewerk uitleg"
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {label}
    </button>
  )
}
