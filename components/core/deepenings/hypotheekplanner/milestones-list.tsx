'use client'

/**
 * `MilestonesList` — toont LTV-mijlpalen (80%, 50%) en de schuldvrij-datum
 * voor de hypotheek. Per mijlpaal: maand/jaar van bereiken, hoeveel jaar
 * vanaf nu, en een eenregelige uitleg waarom dat mijlpunt ertoe doet
 * (lagere risicopremie, schuldvrij wonen).
 *
 * Graceful degradation:
 * - Wanneer er geen `marketValue` (geen gekoppeld huis), tonen we alleen
 *   de schuldvrij-datum. LTV-mijlpalen verdwijnen automatisch.
 * - Aflossingsvrije hypotheken hebben geen schuldvrij-datum binnen de
 *   simulatie — we tonen dan een rustige note in plaats van een lege
 *   lijst.
 *
 * Krant-discipline:
 * - Per mijlpaal een rij met kicker (mijlpaal-percentage) + datum (DM Mono)
 *   + serif italic uitleg.
 * - Geen iconen; volgorde + typografie communiceert hiërarchie.
 * - Scherpe horizontale separators tussen rijen.
 */

import { useMemo } from 'react'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import {
  amortizationSchedule,
  linearAmortization,
  type AmortizationRow,
  type RepaymentType,
} from '@/lib/debt-data'

// ── Types ────────────────────────────────────────────────────

interface Milestone {
  /** Korte label voor de mijlpaal-kicker (bv. "LTV 80%"). */
  label: string
  /** Wanneer het mijlpunt wordt bereikt — geformatteerd als "MMM yyyy". */
  reachedAt: string | null
  /** Aantal maanden vanaf nu. `null` betekent: niet bereikbaar binnen looptijd. */
  monthsFromNow: number | null
  /** Eénregelige uitleg waarom dit mijlpunt ertoe doet. */
  why: string
}

interface MilestonesListProps {
  /** Hypotheekschuld nu (€). */
  balance: number
  /** Marktwaarde van het huis (€). `null` bij ontbrekend gekoppeld huis. */
  marketValue: number | null
  /** Jaarlijkse rente (%). */
  interestRate: number
  /** Resterende looptijd in maanden. */
  remainingMonths: number
  /** Aflossingsvorm. */
  repaymentType: RepaymentType
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Format ISO-datum naar "MMM yyyy" — krant-stijl, geen relatieve tijden.
 * Sluit aan bij de format-helpers in `debt-payoff-strategy.tsx`.
 */
function formatMilestoneDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
}

function formatYearSpan(months: number | null): string {
  if (months == null || months <= 0) return '—'
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `${m} mnd`
  if (m === 0) return `${y} jr`
  return `${y} jr ${m} mnd`
}

// ── Component ────────────────────────────────────────────────

export function MilestonesList({
  balance,
  marketValue,
  interestRate,
  remainingMonths,
  repaymentType,
}: MilestonesListProps) {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  const schedule = useMemo<AmortizationRow[]>(() => {
    if (balance <= 0 || remainingMonths <= 0) return []
    if (repaymentType === 'aflossingsvrij') {
      // Aflossingsvrij: schedule heeft geen aflossing — milestones bestaan
      // niet binnen de simulatie. We retourneren een lege array zodat de
      // component-kant het kan detecteren en aangepaste copy kan tonen.
      return []
    }
    if (repaymentType === 'lineair') {
      return linearAmortization(balance, interestRate, remainingMonths)
    }
    const monthlyRate = interestRate / 100 / 12
    let pmt: number
    if (interestRate === 0) {
      pmt = balance / remainingMonths
    } else {
      const factor = Math.pow(1 + monthlyRate, remainingMonths)
      pmt = (balance * (monthlyRate * factor)) / (factor - 1)
    }
    return amortizationSchedule(balance, interestRate, pmt)
  }, [balance, interestRate, remainingMonths, repaymentType])

  /**
   * Bereken alle mijlpalen. LTV-mijlpalen worden alleen toegevoegd wanneer
   * we marktwaarde hebben — anders rest alleen de schuldvrij-datum.
   *
   * LTV (Loan-to-Value) = restschuld / marktwaarde × 100. We zoeken de
   * eerste maand waarop deze ratio onder de drempel duikt.
   */
  const milestones = useMemo<Milestone[]>(() => {
    const out: Milestone[] = []

    // ── LTV-mijlpalen ─────────────────────────────────────
    if (marketValue != null && marketValue > 0 && schedule.length > 0) {
      const ltvTargets = [
        {
          pct: 80,
          label: 'LTV 80%',
          why: 'Vanaf hier komen vaak gunstigere hypotheekrentes binnen bereik (lagere risico-opslag).',
        },
        {
          pct: 50,
          label: 'LTV 50%',
          why: 'Halverwege betaald — de restschuld is kleiner dan het eigen vermogen.',
        },
      ]
      for (const target of ltvTargets) {
        // Begin met huidige LTV: als die al onder de drempel zit, slaan
        // we de mijlpaal over (krijgt geen "bereikt" rij — het is al verleden).
        const currentLtv = (balance / marketValue) * 100
        if (currentLtv <= target.pct) continue

        const month = schedule.find(
          (row) => (row.balance / marketValue) * 100 <= target.pct,
        )
        out.push({
          label: target.label,
          reachedAt: month?.date ?? null,
          monthsFromNow: month?.month ?? null,
          why: target.why,
        })
      }
    }

    // ── Schuldvrij-datum ───────────────────────────────────
    if (repaymentType === 'aflossingsvrij') {
      out.push({
        label: 'Schuldvrij',
        reachedAt: null,
        monthsFromNow: null,
        why: 'Aflossingsvrije hypotheken eindigen met een restschuld; plan een eindstrategie.',
      })
    } else if (schedule.length > 0) {
      const last = schedule[schedule.length - 1]
      out.push({
        label: 'Schuldvrij',
        reachedAt: last.date,
        monthsFromNow: last.month,
        why: 'Geen hypotheek meer — de woonlasten dalen tot alleen onderhoud, OZB en verzekering.',
      })
    }

    return out
  }, [balance, marketValue, repaymentType, schedule])

  // ── Empty state ───────────────────────────────────────────
  if (milestones.length === 0) {
    return (
      <section className="space-y-3">
        <header>
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Mijlpalen
          </p>
        </header>
        <p className="border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/40 px-4 py-6 text-center font-serif italic text-sm text-[var(--ink-3)]">
          Onvoldoende gegevens om mijlpalen te berekenen.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <header>
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Mijlpalen
        </p>
      </header>

      <ul className="border border-[var(--border-ed)] bg-[var(--paper)]">
        {milestones.map((m, idx) => (
          <li
            key={m.label}
            className={[
              'flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4',
              idx > 0 ? 'border-t border-[var(--border-ed)]' : '',
            ].join(' ')}
          >
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
                {m.label}
              </p>
              <p className="mt-0.5 font-serif italic text-[12px] leading-snug text-[var(--ink-2)]">
                {m.why}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="font-mono tabular-nums text-sm font-semibold text-[var(--ink)]">
                {formatMilestoneDate(m.reachedAt)}
              </p>
              <p className="font-mono tabular-nums text-[10px] text-[var(--ink-4)]">
                {formatYearSpan(m.monthsFromNow)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {/* Marktwaarde-noot — laat user zien dat LTV-mijlpalen afhankelijk zijn
          van de huidige marktwaarde. Alleen tonen wanneer we wél een
          marktwaarde hebben (anders is de noot misleidend). */}
      {marketValue != null && marketValue > 0 && (
        <p className="text-[11px] leading-relaxed text-[var(--ink-4)]">
          LTV-percentages zijn berekend tegen de huidige marktwaarde van{' '}
          <span className="font-mono tabular-nums">
            {fc(marketValue)}
          </span>
          . Een waardestijging brengt deze mijlpalen dichterbij.
        </p>
      )}
    </section>
  )
}
