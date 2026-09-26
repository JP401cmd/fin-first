'use client'

import type { ReactNode } from 'react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'

/**
 * StrategieModalShell — gedeelde chrome voor de drie levensstrategie-editors
 * (AOW, Pensioen, Huis). Bouwt op `ShellOverlay kind="sheet"` (ADR 0039; sinds ADR 0179
 * fase 3 — daarvoor een directe BottomSheet), dus portal, drag-dismiss, focus-trap, Escape
 * en sticky footer) en standaardiseert kicker + serif-titel + intro +
 * amber error-banner + read-only-modus.
 *
 * De `footer`-slot is volledig injecteerbaar (geen vaste onSave), omdat de
 * Pensioen-editor twee views heeft (lijst vs pot-editor) met verschillende
 * acties en Huis zijn eigen inline-save behoudt. Gebruik `StrategieFooter` voor
 * het standaard Annuleer/Opslaan-paar.
 */
export function StrategieModalShell({
  open,
  onClose,
  kicker = 'Toekomst — levensstrategie',
  title,
  intro,
  children,
  footer,
  error,
  readOnly,
  size = 'lg',
}: {
  open: boolean
  onClose: () => void
  kicker?: string
  title: string
  intro?: ReactNode
  children: ReactNode
  footer?: ReactNode
  error?: string | null
  readOnly?: boolean
  size?: 'md' | 'lg' | 'xl'
}) {
  return (
    <ShellOverlay kind="sheet" open={open} onClose={onClose} title={title} size={size} footer={footer}>
      <div className="px-5 py-4 sm:px-6">
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            {kicker}
          </div>
          {intro && (
            <p
              className="mt-2 text-sm leading-relaxed text-[var(--ink-2)] italic"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              {intro}
            </p>
          )}
        </div>

        {readOnly && (
          <div className="mb-3 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 text-xs text-[var(--ink-3)]">
            Alleen-lezen in Kijken-modus. Schakel naar Plannen om te bewerken.
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            {error}
          </div>
        )}

        {children}
      </div>
    </ShellOverlay>
  )
}

/** Standaard footer-actiebalk: optioneel een leading-element links, Annuleer + Opslaan rechts. */
export function StrategieFooter({
  onCancel,
  onSave,
  saving,
  saveDisabled,
  saveLabel = 'Opslaan',
  cancelLabel = 'Annuleer',
  leading,
  info,
}: {
  onCancel: () => void
  onSave?: () => void
  saving?: boolean
  saveDisabled?: boolean
  saveLabel?: string
  cancelLabel?: string
  leading?: ReactNode
  /** ADR 0179 §7.7 — de verschilregel van de body (`RegelEditActionsState.footerInfo`). */
  info?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-6">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
        {leading}
        {info && <span className="text-[var(--ink-2)]">{info}</span>}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-3 py-2 text-sm font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
        >
          {cancelLabel}
        </button>
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            disabled={saving || saveDisabled}
            className="rounded-xl bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:opacity-50"
          >
            {saving ? 'Opslaan…' : saveLabel}
          </button>
        )}
      </div>
    </div>
  )
}
