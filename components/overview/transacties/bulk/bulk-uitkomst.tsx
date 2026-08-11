'use client'

/**
 * BulkUitkomst — wat er daadwerkelijk gebeurd is, plus het regelaanbod (F19,
 * F20, AC13, AC14).
 *
 * ── "X van Y", en X komt van de server ──────────────────────────────────────
 * De getallen die dit blok toont komen uit het antwoord van de mutatieroute, dat
 * ze op zijn beurt herleidt uit `.select('id')` op de mutatie zelf. Nooit uit
 * het aantal kandidaten: een UPDATE die door RLS nul rijen raakt geeft géén
 * fout, dus wie kandidaten telt meldt succes over een mutatie die niet gebeurd
 * is. Vandaar dat dit component `requested` en `changed` allebei toont wanneer
 * ze verschillen, met de reden erbij — ook bij een half gelukte actie.
 *
 * ── Het regelaanbod laat niets achter ───────────────────────────────────────
 * De regel wordt uitsluitend aangemaakt op een expliciete klik op "Maak die
 * regel". Wegklikken (of het blok sluiten) doet niets — er is geen impliciete
 * bevestiging, geen "onthoud dit"-vinkje dat standaard aan staat.
 */

import { useEffect, useRef } from 'react'
import { Check, X } from 'lucide-react'
import { Kicker } from '@/components/editorial'
import type { BulkSkipped } from '@/lib/transactions/bulk-contract'

const nlNumber = new Intl.NumberFormat('nl-NL')

const SKIP_REASON_TEXT: Record<BulkSkipped['reason'], string> = {
  is_split: 'gesplitst — de deelregels bepalen daar het budget',
  not_found: 'niet meer gevonden — mogelijk al gewijzigd in een ander tabblad',
}

export type BulkUitkomstData =
  | {
      kind: 'budget'
      requested: number
      changed: number
      skipped: readonly BulkSkipped[]
      failedIds: readonly string[]
      truncated: boolean
      budgetLabel: string
    }
  | {
      kind: 'delete'
      requested: number
      changed: number
      orphansCleared: number
      failedIds: readonly string[]
      truncated: boolean
    }

export interface RuleCandidate {
  matchField: 'counterparty_name' | 'description'
  matchValue: string
  budgetId: string
  budgetLabel: string
}

export type RuleOfferState = 'idle' | 'busy' | 'created' | 'error'

export interface BulkUitkomstProps {
  data: BulkUitkomstData
  onDismiss: () => void
  /** Alleen na een geslaagde hercategorisatie, en alleen als er iets te matchen valt. */
  ruleCandidate: RuleCandidate | null
  ruleState: RuleOfferState
  ruleError: string | null
  onCreateRule: () => void
  onDeclineRule: () => void
}

/** Groepeer overgeslagen rijen per reden — 4.000 losse id's zijn geen informatie. */
function groupSkipped(skipped: readonly BulkSkipped[]): { reason: BulkSkipped['reason']; n: number }[] {
  const byReason = new Map<BulkSkipped['reason'], number>()
  for (const s of skipped) byReason.set(s.reason, (byReason.get(s.reason) ?? 0) + 1)
  return [...byReason.entries()].map(([reason, n]) => ({ reason, n }))
}

export function BulkUitkomst({
  data,
  onDismiss,
  ruleCandidate,
  ruleState,
  ruleError,
  onCreateRule,
  onDeclineRule,
}: BulkUitkomstProps) {
  const headingRef = useRef<HTMLParagraphElement | null>(null)

  // Na een verwijdering staan de rijen waar de focus stond er niet meer. De
  // focus verspringt daarom naar deze melding — een voorspelbaar element dat de
  // uitkomst benoemt, in plaats van naar `document.body` (R-NF10).
  //
  // Dependency is `data` en niet `[]`: dit blok blijft tussen twee mutaties
  // gemount, dus met een lege dependency-lijst zou de focus alléén bij de
  // eerste uitkomst van de sessie verspringen. Elke nieuwe uitkomst is een
  // nieuw `data`-object (één `setUitkomst` per mutatie), dus dit vuurt precies
  // één keer per uitkomst — niet bij een regel-klik of een re-render.
  useEffect(() => {
    headingRef.current?.focus()
  }, [data])

  const werkwoord = data.kind === 'delete' ? 'verwijderd' : 'gewijzigd'
  const compleet = data.changed === data.requested && data.failedIds.length === 0

  return (
    <section
      role="status"
      aria-live="polite"
      className="relative border-y border-[var(--ink)] bg-[var(--paper)] px-4 py-3"
      data-testid="bulk-uitkomst"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Melding sluiten"
        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center text-[var(--ink-3)] hover:text-[var(--ink)]"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>

      <Kicker size="small">Resultaat</Kicker>
      <p
        ref={headingRef}
        tabIndex={-1}
        className="mt-1 font-display text-[16px] font-semibold leading-snug text-[var(--ink)] outline-none"
      >
        {nlNumber.format(data.changed)} van {nlNumber.format(data.requested)} {werkwoord}
        {data.kind === 'budget' && compleet ? ` — nu gekoppeld aan ${data.budgetLabel}` : ''}
      </p>

      {data.kind === 'delete' && data.orphansCleared > 0 && (
        <p className="mt-1 text-[12px] text-[var(--ink-2)]">
          {data.orphansCleared === 1
            ? 'Eén tegenboeking van een handmatige overboeking ging mee.'
            : `${nlNumber.format(data.orphansCleared)} tegenboekingen van handmatige overboekingen gingen mee.`}
        </p>
      )}

      {data.kind === 'budget' && data.skipped.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {groupSkipped(data.skipped).map(({ reason, n }) => (
            <li key={reason} className="text-[12px] text-[var(--ink-2)]">
              {nlNumber.format(n)} overgeslagen: {SKIP_REASON_TEXT[reason]}.
            </li>
          ))}
        </ul>
      )}

      {data.failedIds.length > 0 && (
        <p className="mt-1.5 text-[12px] text-negative">
          {nlNumber.format(data.failedIds.length)}{' '}
          {data.failedIds.length === 1 ? 'transactie is' : 'transacties zijn'} niet gelukt. Zoek ze
          opnieuw op en probeer het nog een keer — wat wél gelukt is, is definitief verwerkt.
        </p>
      )}

      {data.truncated && (
        <p className="mt-1.5 text-[12px] text-[var(--ink-2)]">
          Er waren méér treffers dan in één actie meekunnen. Verfijn je filter en herhaal de actie
          voor de rest.
        </p>
      )}

      {/* ── Regelaanbod (F20) ───────────────────────────────────────────── */}
      {data.kind === 'budget' && ruleCandidate && ruleState !== 'created' && (
        <div className="mt-3 border-t border-[var(--border-ed)] pt-3">
          <p className="text-[13px] text-[var(--ink-2)]">
            Zal ik hier een blijvende regel van maken? Elke nieuwe transactie waarvan{' '}
            <span className="text-[var(--ink)]">
              {ruleCandidate.matchField === 'counterparty_name' ? 'de tegenpartij' : 'de omschrijving'}
            </span>{' '}
            <span className="font-medium text-[var(--ink)]">“{ruleCandidate.matchValue}”</span> bevat,
            gaat dan automatisch naar{' '}
            <span className="font-medium text-[var(--ink)]">{ruleCandidate.budgetLabel}</span>.
          </p>
          {ruleError && (
            <p role="alert" className="mt-1.5 text-[12px] text-negative">
              {ruleError}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onCreateRule}
              disabled={ruleState === 'busy'}
              className="min-h-9 border-2 border-[var(--ink)] bg-[var(--paper)] px-4 text-[13px] font-medium text-[var(--ink)] hover:bg-[var(--subtle)] disabled:opacity-50"
            >
              {ruleState === 'busy' ? 'Regel maken …' : 'Maak die regel'}
            </button>
            <button
              type="button"
              onClick={onDeclineRule}
              className="text-[12px] font-medium text-[var(--ink-2)] underline underline-offset-2 hover:text-[var(--ink)]"
            >
              Nee, laat maar
            </button>
          </div>
        </div>
      )}

      {/* `data.kind === 'budget'` is hier geen decoratie: het regelaanbod bestaat
          alleen bij hercategoriseren, maar `ruleState` overleeft de uitkomst
          waar het bij hoorde. Zonder deze voorwaarde staat "De regel staat
          klaar" onder een verwijder-uitkomst zodra iemand eerst een regel
          aanmaakte en daarna iets verwijderde. */}
      {data.kind === 'budget' && ruleState === 'created' && (
        <p className="mt-3 flex items-center gap-1.5 border-t border-[var(--border-ed)] pt-3 text-[12px] text-[var(--ink-2)]">
          <Check className="h-3.5 w-3.5 shrink-0 text-positive" aria-hidden />
          De regel staat klaar. Nieuwe transacties die erop passen landen vanzelf goed.
        </p>
      )}
    </section>
  )
}
