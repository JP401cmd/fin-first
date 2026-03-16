'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, X, Check, Loader2, AlertCircle } from 'lucide-react'

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

interface PensionPdfUploadProps {
  onFileSelected?: (file: File) => void
  onFileRemoved?: () => void
  onParseResult?: (result: unknown) => void
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export function PensionPdfUpload({ onFileSelected, onFileRemoved, onParseResult }: PensionPdfUploadProps) {
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const validateAndSet = useCallback((f: File) => {
    setError(null)
    if (f.type !== 'application/pdf') {
      setError('Alleen PDF-bestanden zijn toegestaan.')
      return
    }
    if (f.size > MAX_FILE_SIZE) {
      setError('Bestand is te groot. Maximaal 10 MB.')
      return
    }
    setFile(f)
    setStatus('uploading')
    onFileSelected?.(f)

    // Upload to parse API
    const formData = new FormData()
    formData.append('file', f)
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
      })
      .catch(err => {
        setStatus('error')
        setError(err.message || 'Er ging iets mis bij het verwerken van de PDF.')
      })
  }, [onFileSelected, onParseResult])

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
    if (inputRef.current) inputRef.current.value = ''
    onFileRemoved?.()
  }, [onFileRemoved])

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // ── Success state ──
  if (status === 'success' && file) {
    return (
      <div className="rounded-[var(--r)] border border-emerald-200 bg-emerald-50/50 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--ink)]">{file.name}</p>
            <p className="text-xs text-[var(--ink-3)]">{formatFileSize(file.size)} — verwerkt</p>
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

  // ── Uploading state ──
  if (status === 'uploading' && file) {
    return (
      <div className="rounded-[var(--r)] border border-horizon-200 bg-horizon-50/30 p-3">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-horizon-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--ink)]">{file.name}</p>
            <p className="text-xs text-[var(--ink-3)]">{formatFileSize(file.size)} — wordt verwerkt...</p>
          </div>
        </div>
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
            title="Verwijder en probeer opnieuw"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
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
          accept="application/pdf"
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
              <span className="hidden sm:inline">Sleep je PDF hierheen of </span>
              <span className="text-horizon-600 underline underline-offset-2">kies een bestand</span>
            </p>
            <p className="mt-0.5 text-xs text-[var(--ink-4)]">Alleen PDF, max 10 MB</p>
          </div>
        </div>
      </div>
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
