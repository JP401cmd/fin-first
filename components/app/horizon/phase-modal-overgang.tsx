'use client'

import { memo } from 'react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { formatCurrency } from '@/lib/format'

// ── Types ────────────────────────────────────────────────────────────────────

export type TransitionScenario = 'gap' | 'shortfall' | 'none'

interface PhaseModalOvergangProps {
  open: boolean
  onClose: () => void
  transitionScenario: TransitionScenario
  startAge: number          // FIRE age (gap) or AOW age (shortfall)
  endAge: number            // AOW age (gap) or FIRE age (shortfall)
  fireAge: number
  aowAge: number
  /** Annual portfolio withdrawal during transition */
  yearlyWithdrawal: number
  /** Annual AOW income (only relevant for shortfall scenario) */
  yearlyAowIncome: number
  /** Annual expenses */
  yearlyExpenses: number
  /** Portfolio value at start of transition */
  portfolioAtTransitionStart: number
}

// ── Component ────────────────────────────────────────────────────────────────

export const PhaseModalOvergang = memo(function PhaseModalOvergang({
  open,
  onClose,
  transitionScenario,
  startAge,
  endAge,
  fireAge,
  aowAge,
  yearlyWithdrawal,
  yearlyAowIncome,
  yearlyExpenses,
  portfolioAtTransitionStart,
}: PhaseModalOvergangProps) {
  if (transitionScenario === 'none') return null

  const durationYears = Math.max(Math.round(endAge - startAge), 1)
  const title = `Overgangsfase · ${Math.round(startAge)} \u2192 ${Math.round(endAge)} jaar`

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="p-5">
        {transitionScenario === 'gap' ? (
          <GapAnalysis
            durationYears={durationYears}
            fireAge={fireAge}
            aowAge={aowAge}
            yearlyWithdrawal={yearlyWithdrawal}
            yearlyExpenses={yearlyExpenses}
            portfolioAtTransitionStart={portfolioAtTransitionStart}
          />
        ) : (
          <ShortfallAnalysis
            durationYears={durationYears}
            fireAge={fireAge}
            aowAge={aowAge}
            yearlyAowIncome={yearlyAowIncome}
            yearlyExpenses={yearlyExpenses}
            yearlyWithdrawal={yearlyWithdrawal}
          />
        )}

        {/* Filosofische noot */}
        <div className="mt-5 rounded-[var(--r)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/30 px-4 py-3">
          <p className="font-serif text-sm italic leading-relaxed text-[var(--ink-3)]">
            {durationYears} jaar overgang = {durationYears} jaar eerder verdiende vrijheid die je nu overbrugt
          </p>
        </div>
      </div>
    </BottomSheet>
  )
})

// ── Scenario A: Gap (FIRE < AOW) ────────────────────────────────────────────

function GapAnalysis({
  durationYears,
  fireAge,
  aowAge,
  yearlyWithdrawal,
  yearlyExpenses,
  portfolioAtTransitionStart,
}: {
  durationYears: number
  fireAge: number
  aowAge: number
  yearlyWithdrawal: number
  yearlyExpenses: number
  portfolioAtTransitionStart: number
}) {
  const totalWithdrawal = yearlyWithdrawal * durationYears
  const totalExpenses = yearlyExpenses * durationYears

  return (
    <KassabonShell>
      {/* Header */}
      <div className="mb-3 text-center">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          GAP-ANALYSE
        </p>
        <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
          FIRE ({Math.round(fireAge)}) tot AOW ({Math.round(aowAge)}) &middot; {durationYears} jaar zonder AOW
        </p>
      </div>

      {/* Receipt rows */}
      <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2">
        <ReceiptRow label="Duur overgangsfase" value={`${durationYears} jaar`} />
        <ReceiptRow label="Vermogen bij FIRE" value={formatCurrency(Math.round(portfolioAtTransitionStart))} />
        <ReceiptRow label="Jaarlijkse uitgaven" value={formatCurrency(Math.round(yearlyExpenses))} />
        <ReceiptRow label="Portfolio-onttrekking/jaar" value={formatCurrency(Math.round(yearlyWithdrawal))} />
      </div>

      {/* Total */}
      <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
        <span className="font-sans text-sm text-[var(--ink)]">Totaal benodigd</span>
        <span className="font-mono tabular-nums text-[var(--ink)]">
          {formatCurrency(Math.round(totalWithdrawal))}
        </span>
      </div>

      {/* Coverage indicator */}
      <div className="mt-2">
        {portfolioAtTransitionStart >= totalExpenses ? (
          <p className="text-[11px] text-[var(--positive)]">
            &#10003; Vermogen dekt de overgangsperiode volledig
          </p>
        ) : (
          <p className="text-[11px] text-[var(--negative)]">
            &#9888; Tekort van {formatCurrency(Math.round(totalExpenses - portfolioAtTransitionStart))} tijdens overgang
          </p>
        )}
      </div>
    </KassabonShell>
  )
}

// ── Scenario B: Shortfall (FIRE > AOW) ──────────────────────────────────────

function ShortfallAnalysis({
  durationYears,
  fireAge,
  aowAge,
  yearlyAowIncome,
  yearlyExpenses,
  yearlyWithdrawal,
}: {
  durationYears: number
  fireAge: number
  aowAge: number
  yearlyAowIncome: number
  yearlyExpenses: number
  yearlyWithdrawal: number
}) {
  const shortfallPerYear = Math.max(yearlyExpenses - yearlyAowIncome, 0)
  const totalShortfall = shortfallPerYear * durationYears

  return (
    <KassabonShell>
      {/* Header */}
      <div className="mb-3 text-center">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          TEKORT-ANALYSE
        </p>
        <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
          AOW ({Math.round(aowAge)}) tot FIRE ({Math.round(fireAge)}) &middot; {durationYears} jaar met AOW
        </p>
      </div>

      {/* Receipt rows */}
      <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2">
        <ReceiptRow label="Duur overgangsfase" value={`${durationYears} jaar`} />
        <ReceiptRow label="Jaarlijkse uitgaven" value={formatCurrency(Math.round(yearlyExpenses))} />
        <ReceiptRow label="AOW-inkomen/jaar" value={formatCurrency(Math.round(yearlyAowIncome))} />
        <ReceiptRow label="Aanvulling nodig/jaar" value={formatCurrency(Math.round(shortfallPerYear))} />
        <ReceiptRow label="Portfolio-onttrekking/jaar" value={formatCurrency(Math.round(yearlyWithdrawal))} />
      </div>

      {/* Total */}
      <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
        <span className="font-sans text-sm text-[var(--ink)]">Tekort totaal</span>
        <span className="font-mono tabular-nums text-[var(--ink)]">
          {formatCurrency(Math.round(totalShortfall))}
        </span>
      </div>

      {/* Coverage note */}
      {shortfallPerYear === 0 && (
        <div className="mt-2">
          <p className="text-[11px] text-[var(--positive)]">
            &#10003; AOW dekt je uitgaven volledig in deze fase
          </p>
        </div>
      )}
    </KassabonShell>
  )
}

// ── Receipt row helper ───────────────────────────────────────────────────────

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="font-sans text-sm text-[var(--ink-2)]">{label}</span>
      <span className="font-mono tabular-nums text-[var(--ink)]">{value}</span>
    </div>
  )
}
