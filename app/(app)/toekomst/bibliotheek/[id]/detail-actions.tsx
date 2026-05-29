'use client'

import { useState } from 'react'
import { Flag, GitFork } from 'lucide-react'
import type { CustomCalculatorRow } from '@/lib/calculator/types'
import type { CalculatorRequirementCheck } from '@/lib/calculator/requirements'
import { LikeButton } from '@/components/future/like-button'
import { ReportSheet } from '@/components/future/report-sheet'
import { DuplicateConfirmSheet } from '@/components/future/duplicate-confirm-sheet'

/**
 * DetailActions — client-wrapper voor de actie-rij op de detail-pagina.
 *
 * Zit bewust in een eigen file (en niet inline in de server-page) zodat
 * de hosting page een server-component kan blijven en we Agent C's
 * client-componenten (`LikeButton`, `DuplicateConfirmSheet`, `ReportSheet`)
 * pas in client-land hoeven te gebruiken.
 *
 * Drie acties:
 *  1. Dupliceer — opent de DuplicateConfirmSheet die zelf de POST regelt
 *     en bij success naar `/toekomst?tab=rekenhulp` navigeert.
 *  2. Like — toggle-knop met optimistische UI (Agent C).
 *  3. Melden — opent ReportSheet voor een korte vrije-tekst-melding.
 *
 * Wanneer de bezoeker niet ingelogd is (`canInteract === false`) zijn
 * Like en Dupliceer geen-no-op-knoppen meer maar wel disabled. De
 * server-page kan daar later een redirect-naar-login op zetten.
 */
export function DetailActions({
  calculator,
  checks,
  initiallyLiked,
  initialLikeCount,
  canInteract,
}: {
  calculator: CustomCalculatorRow
  checks: CalculatorRequirementCheck[]
  initiallyLiked: boolean
  initialLikeCount: number
  canInteract: boolean
}) {
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setDuplicateOpen(true)}
        disabled={!canInteract}
        className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--ink)] text-[var(--paper)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--ink-2)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <GitFork className="w-4 h-4" aria-hidden="true" />
        Dupliceer naar mijn rekenhulpen
      </button>

      {canInteract ? (
        <LikeButton
          calculatorId={calculator.id}
          initiallyLiked={initiallyLiked}
          initialCount={initialLikeCount}
        />
      ) : (
        <DisabledLikeStub initialCount={initialLikeCount} />
      )}

      <button
        type="button"
        onClick={() => setReportOpen(true)}
        disabled={!canInteract}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2.5 text-sm font-semibold text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Flag className="w-4 h-4" aria-hidden="true" />
        Melden
      </button>

      <DuplicateConfirmSheet
        open={duplicateOpen}
        onClose={() => setDuplicateOpen(false)}
        calculator={calculator}
        requirementsChecks={checks}
      />

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        calculatorId={calculator.id}
        calculatorName={calculator.name}
      />
    </div>
  )
}

/**
 * Visuele non-interactive variant van de Like-knop voor uitgelogde
 * bezoekers. Toont alleen de counter; Agent C's LikeButton beheert
 * verder zijn eigen visuele state.
 */
function DisabledLikeStub({ initialCount }: { initialCount: number }) {
  return (
    <button
      type="button"
      disabled
      aria-label="Log in om te liken"
      title="Log in om te liken"
      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2.5 text-sm font-semibold text-[var(--ink-3)] opacity-50 cursor-not-allowed"
    >
      <span className="font-mono tabular-nums">{initialCount}</span> likes
    </button>
  )
}
