'use client'

/**
 * Review-primitives — editorial sub-componenten voor `<ReviewStep>`.
 *
 * Geïnspireerd door `ReviewSection` / `ReviewItem` uit
 * `components/onboarding/onboarding-nieuws-only.tsx:438-502`. Geduplikeerd
 * (niet hergebruikt) zodat de aangifte-flow eigen styling kan dragen:
 *   - editorial border (kicker-streep, dotted-rules)
 *   - delta-veld (actuele waarde) per rij
 *   - confirm-checkmark + remove-knop
 *   - conflict-warning met 3-keuze pillset
 *
 * Pure presentational — alle state leeft in de parent (`<ReviewStep>`).
 */

import { Trash2, Check, AlertTriangle } from 'lucide-react'

interface ReviewSectionProps {
  title: string
  count: number
  children: React.ReactNode
}

export function ReviewSection({ title, count, children }: ReviewSectionProps) {
  return (
    <section className="border border-[var(--border-ed)] bg-[var(--paper)]">
      <header className="flex items-baseline justify-between border-b border-[var(--border-ed)] px-4 py-2.5">
        <h3 className="text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--ink-3)]">
          {title}
        </h3>
        <span className="font-mono text-xs tabular-nums text-[var(--ink-4)]">
          {count}
        </span>
      </header>
      <div>{children}</div>
    </section>
  )
}

interface PeildatumBannerProps {
  taxYear: number
  peildatum: string
  monthsOld: number
}

export function PeildatumBanner({ taxYear, peildatum, monthsOld }: PeildatumBannerProps) {
  // Format peildatum als "1 januari YYYY"
  const date = new Date(peildatum)
  const formatted = date.toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="border border-[var(--border-ed)] border-l-4 border-l-[var(--color-kern-500)] bg-[var(--paper)] p-3 sm:p-4">
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--ink-3)] mb-1">
        Aangifte {taxYear}
      </p>
      <p className="font-serif italic text-sm text-[var(--ink-2)] leading-relaxed">
        Peildatum {formatted}
        {monthsOld > 0 && (
          <span className="text-[var(--ink-3)]">
            {' '}— {monthsOld} {monthsOld === 1 ? 'maand' : 'maanden'} geleden
          </span>
        )}
        . Pas aan naar de actuele stand of bevestig als startpunt.
      </p>
    </div>
  )
}

interface ReviewCardProps {
  name: string
  onNameChange: (v: string) => void
  typeLabel: string
  value: number
  onValueChange: (v: number) => void
  actualValue: string
  onActualChange: (v: string) => void
  actualPlaceholder?: string
  confirmed: boolean
  onConfirm: () => void
  onRemove: () => void
  conflictName: string | null
  conflictResolution: 'replace' | 'side-by-side' | 'skip' | null
  onConflictResolve: (resolution: 'replace' | 'side-by-side' | 'skip') => void
}

/**
 * Één review-rij — editorial card met:
 *   · naam-input (left)
 *   · type-label (kicker-mono, onder naam)
 *   · peildatum-bedrag-input (rechts)
 *   · delta "actueel" input (klein, daaronder)
 *   · acties: bevestig (check) / verwijder (trash)
 *   · conflict-warning bij naam-overlap met bestaande asset/debt
 */
export function ReviewCard({
  name,
  onNameChange,
  typeLabel,
  value,
  onValueChange,
  actualValue,
  onActualChange,
  actualPlaceholder,
  confirmed,
  onConfirm,
  onRemove,
  conflictName,
  conflictResolution,
  onConflictResolve,
}: ReviewCardProps) {
  return (
    <div className="border-b border-dotted border-[var(--border-ed)] last:border-b-0 px-4 py-3 space-y-2.5">
      <div className="flex items-start gap-2.5">
        <div className="flex-1 min-w-0 space-y-1">
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="block w-full bg-transparent border-0 border-b border-transparent hover:border-[var(--border-ed)] focus:border-[var(--color-kern-500)] focus:outline-none font-serif text-sm text-[var(--ink)] py-0.5 -ml-0.5 px-0.5 transition-colors"
            aria-label="Naam"
          />
          <p className="text-[10px] font-mono uppercase tracking-[0.10em] text-[var(--ink-3)]">
            {typeLabel}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {/* Peildatum-bedrag */}
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-4)] font-mono"
            >
              €
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={value === 0 ? '' : String(value)}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^\d.,]/g, '')
                const normalized = cleaned.replace(/\./g, '').replace(',', '.')
                const parsed = Number.parseFloat(normalized)
                onValueChange(Number.isNaN(parsed) ? 0 : parsed)
              }}
              placeholder="peildatum"
              className="w-32 border border-[var(--border-ed)] bg-[var(--paper)] py-1.5 pl-6 pr-2 text-right font-mono text-sm tabular-nums text-[var(--ink)] focus:border-[var(--color-kern-500)] focus:outline-none"
              aria-label="Bedrag op peildatum"
            />
          </div>

          {/* Actuele waarde (optioneel delta) */}
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-4)] font-mono"
            >
              €
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={actualValue}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^\d.,]/g, '')
                onActualChange(cleaned)
              }}
              placeholder={actualPlaceholder ?? 'actueel'}
              className="w-32 border border-dotted border-[var(--border-ed)] bg-transparent py-1.5 pl-6 pr-2 text-right font-mono text-xs tabular-nums text-[var(--ink-2)] placeholder:text-[var(--ink-4)] focus:border-solid focus:border-[var(--color-kern-500)] focus:outline-none"
              aria-label="Actuele waarde (optioneel)"
            />
          </div>
        </div>

        {/* Acties */}
        <div className="flex flex-col gap-1 shrink-0">
          <button
            type="button"
            onClick={onConfirm}
            aria-label={confirmed ? 'Bevestigd' : 'Bevestig deze regel'}
            aria-pressed={confirmed}
            className={`flex h-8 w-8 items-center justify-center transition-colors ${
              confirmed
                ? 'bg-[var(--color-kern-600)] text-[var(--paper)]'
                : 'text-[var(--ink-4)] hover:bg-[var(--subtle)] hover:text-[var(--color-kern-700)]'
            }`}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Verwijder"
            className="flex h-8 w-8 items-center justify-center text-[var(--ink-4)] hover:bg-[var(--subtle)] hover:text-[var(--negative)] transition-colors"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Conflict-warning */}
      {conflictName && (
        <ConflictWarning
          existingName={conflictName}
          resolution={conflictResolution}
          onResolve={onConflictResolve}
        />
      )}
    </div>
  )
}

interface ConflictWarningProps {
  existingName: string
  resolution: 'replace' | 'side-by-side' | 'skip' | null
  onResolve: (resolution: 'replace' | 'side-by-side' | 'skip') => void
}

/**
 * Inline waarschuwing bij naam-conflict + 3-knops keuze.
 */
export function ConflictWarning({ existingName, resolution, onResolve }: ConflictWarningProps) {
  return (
    <div className="bg-[var(--subtle)]/50 border border-dotted border-[var(--ink-4)] p-2.5 space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="h-4 w-4 text-[var(--negative)] shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <p className="font-serif italic text-xs text-[var(--ink-2)] leading-snug">
          Je hebt al een &ldquo;{existingName}&rdquo;. Kies hoe je dit wilt oplossen.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5 pl-6">
        <ConflictPill active={resolution === 'replace'} onClick={() => onResolve('replace')}>
          Vervangen
        </ConflictPill>
        <ConflictPill active={resolution === 'side-by-side'} onClick={() => onResolve('side-by-side')}>
          Naast elkaar
        </ConflictPill>
        <ConflictPill active={resolution === 'skip'} onClick={() => onResolve('skip')}>
          Overslaan
        </ConflictPill>
      </div>
    </div>
  )
}

function ConflictPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 min-h-[28px] px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.08em] border transition-colors ${
        active
          ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
          : 'bg-transparent text-[var(--ink-3)] border-[var(--border-ed)] hover:border-[var(--ink-3)]'
      }`}
    >
      {active && <Check className="h-2.5 w-2.5" aria-hidden="true" />}
      {children}
    </button>
  )
}
