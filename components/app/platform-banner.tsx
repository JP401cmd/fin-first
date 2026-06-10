'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Megaphone, X } from 'lucide-react'
import type { PlatformStatus } from '@/lib/platform-status'

/**
 * PlatformBanner — globale onderhouds- en aankondigingsbalk, getoond aan
 * iedereen. Onderhoud is niet sluitbaar; een aankondiging is per sessie
 * sluitbaar (sessionStorage, gesleuteld op de inhoud zodat een NIEUWE
 * aankondiging weer verschijnt).
 */
export function PlatformBanner({ status }: { status: PlatformStatus }) {
  const ann = status.announcement
  const annKey = `tf-ann-dismissed:${ann.title}|${ann.body}`.slice(0, 120)
  const [annDismissed, setAnnDismissed] = useState(false)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(annKey) === '1') setAnnDismissed(true)
    } catch {
      // sessionStorage onbereikbaar — toon de aankondiging gewoon.
    }
  }, [annKey])

  function dismissAnnouncement() {
    setAnnDismissed(true)
    try {
      sessionStorage.setItem(annKey, '1')
    } catch {
      /* no-op */
    }
  }

  const showMaintenance = status.maintenance.enabled && status.maintenance.message.trim().length > 0
  const showAnnouncement =
    ann.enabled && (ann.title.trim().length > 0 || ann.body.trim().length > 0) && !annDismissed

  if (!showMaintenance && !showAnnouncement) return null

  return (
    <div>
      {showMaintenance && (
        <div
          role="alert"
          className="flex items-start gap-2.5 border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800 sm:px-6"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>
            <span className="font-semibold">Onderhoud — </span>
            {status.maintenance.message}
          </p>
        </div>
      )}

      {showAnnouncement && (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-start gap-2.5 border-b px-4 py-2.5 text-sm sm:px-6 ${
            ann.level === 'warning'
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-[var(--border-ed)] bg-[var(--subtle)] text-[var(--ink-2)]'
          }`}
        >
          <Megaphone className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            {ann.title.trim().length > 0 && <p className="font-semibold">{ann.title}</p>}
            {ann.body.trim().length > 0 && <p className="mt-0.5 leading-relaxed">{ann.body}</p>}
          </div>
          <button
            type="button"
            onClick={dismissAnnouncement}
            aria-label="Aankondiging sluiten"
            className="-mr-1 flex-shrink-0 rounded p-1 opacity-70 transition-opacity hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
