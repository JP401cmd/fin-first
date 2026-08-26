import { Clock } from 'lucide-react'
import {
  formatCurrency,
  calculateFreedomTime,
  formatFreedomTimeString,
} from '@/lib/format'
import { BOX1_TOOLTIPS, type Box1Result } from '@/lib/box1-tax'
import { GepaardeStaven } from './gepaarde-staven'
import { Kicker, ScenarioCallout } from '@/components/editorial'

/**
 * Box1EigenWoning — eigenwoningforfait vs hypotheekrenteaftrek, plus de
 * aparte Wet Hillen-aftrek.
 *
 * Filosofie: je eigen woning is deels "opgeslagen vrijheid" (vermogen) maar
 * fiscaal een aparte rekensom: de overheid telt een forfait bij (alsof je
 * huurinkomsten hebt) en trekt je hypotheekrente weer af. Wet Hillen zorgt
 * dat je per saldo weinig bijtelt als je weinig rente hebt — maar die
 * regeling wordt jaarlijks afgebouwd.
 *
 * Vormgeving: editorial — papier + ink-hiërarchie, scherpe hoeken, Kicker +
 * Playfair netto-saldo. Alleen renderen wanneer er een eigen woning is
 * (wozValue > 0). De box-accentkleur komt uit de route-layout via
 * `var(--module-active-*)`; saldo/forfait/aftrek zijn semantisch gekleurd.
 * Server-compatible (geen hooks).
 */

export function Box1EigenWoning({
  result,
  dailyExpenses = 0,
}: {
  result: Box1Result
  /** Dagelijkse uitgaven voor de vrijheidstijd-vertaling; 0 → geen regel. */
  dailyExpenses?: number
}) {
  const forfait = result.eigenwoningforfait
  const aftrek = result.hypotheekrenteaftrek
  const hillen = result.hillenAftrek
  const saldo = result.eigenwoningSaldo // < 0 = aftrekpost, > 0 = bijtelling

  // Het werkelijke belastingeffect komt UIT DE MOTOR (consume, don't recompute).
  // Was: |saldo| × result.marginalRate — een tarief (56,01%) dat de motor
  // aantoonbaar níét toepast, want de arbeidskorting loopt over het
  // arbeidsinkomen dat een aftrekpost terecht niet verlaagt. Sinds de
  // tariefsaanpassing eigen woning (art. 2.10 lid 2 Wet IB 2001) is het echte
  // effect bovendien gemaximeerd op het aftrektarief; die eigen som toonde
  // €4.930 waar de motor €3.306 rekent.
  const belastingEffect = Math.round(Math.abs(result.eigenwoningBelastingEffect))
  const isAftrekpost = saldo < 0

  const freedom =
    dailyExpenses > 0 && belastingEffect > 0
      ? formatFreedomTimeString(
          calculateFreedomTime(belastingEffect, dailyExpenses),
        )
      : null

  return (
    <div className="bg-[var(--paper)] border border-[var(--border-ed)] p-5 sm:p-6">
      <Kicker>Eigen woning · forfait vs aftrek</Kicker>
      <p
        className="mt-2 mb-5 text-sm italic text-[var(--ink-2)] leading-snug max-w-[56ch]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        De overheid telt een{' '}
        <span className="underline decoration-dotted underline-offset-2" title={BOX1_TOOLTIPS.eigenwoningforfait}>eigenwoningforfait</span>{' '}
        bij je inkomen en trekt je{' '}
        <span className="underline decoration-dotted underline-offset-2" title={BOX1_TOOLTIPS.hypotheekrenteaftrek}>hypotheekrente</span>{' '}
        weer af.
      </p>

      <GepaardeStaven
        bars={[
          {
            label: 'Eigenwoningforfait (bijtelling)',
            value: forfait,
            colorVar: 'var(--negative)',
          },
          {
            label: 'Hypotheekrenteaftrek',
            value: aftrek,
            colorVar: 'var(--positive)',
            isWinner: aftrek > forfait,
          },
        ]}
      />

      {/* Wet Hillen apart — alleen relevant wanneer forfait > rente.
          Uniform ScenarioCallout (linker module-border) i.p.v. card-in-card. */}
      {hillen > 0 && (
        <ScenarioCallout className="mt-5">
          <span className="not-italic">
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] uppercase tracking-[0.08em] font-mono font-semibold text-[var(--ink-2)]">
                Wet Hillen-aftrek
              </span>
              <span
                className="font-mono text-sm font-semibold tabular-nums"
                style={{ color: 'var(--positive)' }}
              >
                −{formatCurrency(hillen)}
              </span>
            </span>
            <span className="mt-1.5 block text-[11px] text-[var(--ink-3)] leading-snug">
              {BOX1_TOOLTIPS.hillen}
            </span>
          </span>
        </ScenarioCallout>
      )}

      {/* Netto-effect op de Box 1-druk — Playfair saldo boven solid rule. */}
      <div className="mt-5 border-t-2 border-t-[var(--ink)] pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12px] font-semibold text-[var(--ink)] max-w-[58%] leading-snug">
            {isAftrekpost
              ? 'Netto aftrekpost (verlaagt je belasting)'
              : 'Netto bijtelling (verhoogt je belasting)'}
          </span>
          <span
            className="text-[22px] font-black tabular-nums tracking-[-0.01em] leading-none shrink-0"
            style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', color: isAftrekpost ? 'var(--positive)' : 'var(--negative)' }}
          >
            {isAftrekpost ? '−' : '+'}
            {formatCurrency(Math.abs(saldo))}
          </span>
        </div>
        {freedom && belastingEffect > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-sm text-[var(--ink-2)]">
            <Clock className="h-4 w-4 shrink-0" style={{ color: 'var(--module-active-700)' }} aria-hidden="true" />
            {isAftrekpost ? 'levert je' : 'kost je'} ≈{' '}
            <span className="font-medium text-[var(--ink)]">{freedom}</span> aan vrijheid
            {isAftrekpost ? ' terug' : ''}
          </div>
        )}
      </div>

      <p
        className="mt-3 text-[12px] italic text-[var(--ink-3)] leading-snug"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        Indicatie, geen advies — o.b.v. WOZ × 0,35% forfait en je hypotheekrente {result.year}.
      </p>
    </div>
  )
}
