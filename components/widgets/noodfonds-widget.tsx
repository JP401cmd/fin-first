'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { calculateFreedomTime, formatFreedomTimeString, dailyExpenseRate } from '@/lib/format'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { DashboardData } from './widget-renderer'
import { ShieldCheck, Lightbulb } from 'lucide-react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

/**
 * Kleur naar dekking, geschaald op de NORM (3 maandsalarissen): groen op/boven
 * doel, neutraal vanaf de helft, rood daaronder. `target` meegegeven zodat de
 * uitgaven-terugval (norm 6) dezelfde verhouding aanhoudt i.p.v. vaste getallen.
 */
function progressColor(months: number, target: number): { text: string; bar: string; bg: string } {
  const norm = target > 0 ? target : 3
  if (months >= norm) return { text: 'text-positive', bar: 'bg-positive', bg: 'bg-positive/10' }
  if (months >= norm / 2) return { text: 'text-[var(--ink-2)]', bar: 'bg-[var(--ink-3)]', bg: 'bg-[var(--subtle)]' }
  return { text: 'text-negative', bar: 'bg-negative', bg: 'bg-negative/10' }
}

export const NoodfondsWidget = memo(function NoodfondsWidget({ size, data, href }: Props) {
  const { emergencyFund } = data
  const { currentAmount, targetAmount, monthsCovered, targetMonths, isComplete } = emergencyFund
  const pct = targetAmount > 0 ? Math.min((currentAmount / targetAmount) * 100, 100) : 0
  const colors = progressColor(monthsCovered, targetMonths)

  // Grondslag van de norm: 3 × netto maandsalaris, of (bij nul inkomen) de
  // terugval op 6 × maanduitgaven. In BEIDE gevallen geldt
  // `targetMonths × maandbasis == targetAmount` exact, dus de maandbasis is
  // veilig te reconstrueren — dat was in het oude doel-gestuurde model niet zo.
  const onSalaryBasis = emergencyFund.source !== 'expenses'
  const monthlyBase = targetMonths > 0 ? targetAmount / targetMonths : data.monthlyExpenses
  const basisLabel = onSalaryBasis ? 'netto maandsalaris' : 'maanduitgaven'

  // Freedom time framing
  // Canoniek 12-mnd rolling dagtarief uit de bundel (KRUIS-20); fallback voor mocks.
  const dailyExp = data.dailyExpenseRate ?? dailyExpenseRate(data.monthlyExpenses)
  const freedomTime = dailyExp > 0 && currentAmount > 0
    ? calculateFreedomTime(currentAmount, dailyExp)
    : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null

  // DRIE GRONDSLAGEN, expliciet benoemd (W29, bijgewerkt bij H4).
  // Alle drie delen dezelfde TELLER (de canonieke liquide pot) maar hebben
  // bewust een andere NOEMER:
  //   dekking      = pot ÷ netto maandsalaris → de norm (3×, sinds 29 jul 2026)
  //   runway       = pot ÷ maanduitgaven      → "hoe lang kom je hiervan rond"
  //   vrijheidstijd = pot ÷ dailyExpenseRate (12-mnd rolling) → "je gemiddelde uitgaven"
  // Op /overzicht komt deze bundel sinds H4 uit `withCanonicalOverviewFigures`,
  // dus exact dezelfde cijfers als de noodfonds-pijler in de gezondheidsmodal.
  // Beide komen kant-en-klaar uit de bundel (consume, don't recompute); de widget
  // labelt ze alleen zó dat "6 mnd gedekt" naast "~2 mnd vrijheid" geen tegenspraak
  // meer leest. Het gelijktrekken van de noemers zelf is een rekenmotor-besluit.
  const rollingMonthlyExpenses = data.recentMonthlyExpenses ?? null

  // In-view fill-animatie (700ms bezier, 0% → doel; transition:none pre-entered).
  // Eén hook bovenaan; per render toont het widget precies één size, dus dezelfde
  // ref op elke size-track is rules-of-hooks-veilig.
  const { ref: barRef, hasEntered } = useInViewAnimation({ duration: 700 })
  const barTransition = hasEntered ? 'width 700ms cubic-bezier(.22,1,.36,1)' : 'none'

  // AFKAPPING BOVEN DE NORM. Zodra het doel gehaald is, stopt de teller: de
  // balk staat vol en de kop leest "Doel bereikt" i.p.v. een doorgroeiend
  // "11,0 / 3 maanden gedekt". Een buffer die vier keer de norm is, is geen
  // vier keer betere buffer — het meerdere hoort te beleggen, niet te scoren.
  // Het BEDRAG blijft wél volledig zichtbaar (regel eronder), en de runway
  // vertelt hoe lang je er echt van rondkomt.
  const doelBereiktKop = 'Doel bereikt'

  // ── Mini-size ────────────────────────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Noodfonds" href={href}>
        <p className={`font-mono text-[15px] font-semibold tabular-nums leading-none truncate ${isComplete ? 'text-positive' : 'text-[var(--ink)]'}`}>
          {isComplete ? 'Bereikt' : `${monthsCovered.toFixed(1)} mnd`}
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter: compact months + mini progress bar ──
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Noodfonds" href={href}>
        <p className={`font-mono text-lg font-semibold tabular-nums ${colors.text}`}>
          {isComplete
            ? doelBereiktKop
            : <>{monthsCovered.toFixed(1)} <span className="text-xs text-[var(--ink-3)]">van {targetMonths} maanden</span></>}
        </p>
        {/* Mini progress bar */}
        <div ref={barRef} className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
          <div
            className={`h-full rounded-full ${colors.bar}`}
            style={{ width: hasEntered ? `${pct}%` : '0%', transition: barTransition }}
          />
        </div>
        {isComplete && (
          <p className="mt-1 text-[10px] text-[var(--ink-3)]">{targetMonths}× je {basisLabel}</p>
        )}
      </WidgetShell>
    )
  }

  // ── Half: compact for 1-row height — progress bar + bedrag + maanden ──
  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker="Noodfonds" href={href}>
        {/* Header with icon */}
        <div className="flex items-center gap-2">
          <div className={`flex-shrink-0 rounded-md p-1.5 ${colors.bg}`}>
            <ShieldCheck className={`h-4 w-4 ${colors.text}`} strokeWidth={1.5} />
          </div>
          <p className={`font-mono text-xl font-semibold tabular-nums ${isComplete ? 'text-positive' : 'text-[var(--ink)]'}`}>
            {isComplete
              ? doelBereiktKop
              : <>{monthsCovered.toFixed(1)}<span className="text-sm text-[var(--ink-3)]"> / {targetMonths} mnd</span></>}
          </p>
        </div>

        {/* Progress bar */}
        <div ref={barRef} className="mt-2 h-[5px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
          <div
            className={`h-full rounded-full ${colors.bar}`}
            style={{ width: hasEntered ? `${pct}%` : '0%', transition: barTransition }}
          />
        </div>

        {/* Amount */}
        <div className="mt-1.5 flex justify-between text-[11px] text-[var(--ink-3)]">
          <MaskedAmount value={currentAmount} tone="kern" />
          <MaskedAmount value={targetAmount} tone="kern" />
        </div>

        {/* Vrijheidstijd — expliciet op de andere grondslag (zie toelichting boven).
            Bij een bereikt doel kleurt dezelfde regel positief i.p.v. een aparte
            'bereikt'-regel: de tegel is 140px hoog en de groene kop + volle balk
            dragen dat signaal al. */}
        {freedomStr ? (
          <p className={`mt-1.5 font-serif italic text-[11px] ${isComplete ? 'text-positive' : 'text-[var(--ink-3)]'}`}>
            {freedomStr} vrijheid op je gemiddelde uitgaven
          </p>
        ) : null}
      </WidgetShell>
    )
  }

  // ── Full: progress bar with milestones + bedrag + berekening + tips ──
  // Milestone positions on the bar
  const milestones = [1, 2, 3].map(m => ({
    months: m,
    pct: targetMonths > 0 ? Math.min((m / targetMonths) * 100, 100) : 0,
    reached: monthsCovered >= m,
    label: `${m}m`,
  }))

  const remaining = Math.max(targetAmount - currentAmount, 0)

  return (
    <WidgetShell module="kern" size={size} kicker="Noodfonds" href={href}>
      {/* Header with icon */}
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 rounded-lg p-2 ${colors.bg}`}>
          <ShieldCheck className={`h-5 w-5 ${colors.text}`} strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`font-mono text-2xl font-semibold tabular-nums ${isComplete ? 'text-positive' : 'text-[var(--ink)]'}`}>
            {isComplete
              ? doelBereiktKop
              : <>{monthsCovered.toFixed(1)}<span className="text-base text-[var(--ink-3)]"> / {targetMonths} maanden gedekt</span></>}
          </p>
          {/* Grondslag van de dekking, zodat de vrijheidsregel onderaan (andere
              noemer) niet als tegenspraak leest. Boven de norm benoemt dezelfde
              regel wat er bereikt is, i.p.v. een doorgroeiende teller. */}
          <p className="mt-0.5 text-[11px] text-[var(--ink-4)]">
            {isComplete
              ? `${targetMonths}× je ${basisLabel} staat opzij`
              : `van je ${basisLabel}`}
          </p>
        </div>
      </div>

      {/* Progress bar with milestone markers */}
      <div className="mt-3 relative">
        <div ref={barRef} className="h-[8px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
          <div
            className={`h-full rounded-full ${colors.bar}`}
            style={{ width: hasEntered ? `${pct}%` : '0%', transition: barTransition }}
          />
        </div>
        {/* Milestone markers */}
        <div className="relative h-4 mt-0.5">
          {milestones.map(m => (
            <div
              key={m.months}
              className="absolute flex flex-col items-center"
              style={{ left: `${m.pct}%`, transform: 'translateX(-50%)' }}
            >
              <div className={`w-[2px] h-[6px] ${m.reached ? colors.bar : 'bg-[var(--border-md)]'}`} />
              <span className={`text-[9px] font-mono tabular-nums ${m.reached ? colors.text : 'text-[var(--ink-4)]'}`}>
                {m.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Amounts */}
      <div className="mt-1 flex justify-between text-xs text-[var(--ink-3)]">
        <MaskedAmount value={currentAmount} tone="kern" />
        <span>Doel: <MaskedAmount value={targetAmount} tone="kern" /></span>
      </div>

      {/* Calculation explanation */}
      <div className="mt-3 rounded-lg bg-[var(--subtle)] px-3 py-2 text-[11px] text-[var(--ink-3)]">
        <p className="font-medium text-[var(--ink-2)]">Berekening</p>
        <p className="mt-0.5">
          {targetMonths}&times; <MaskedAmount value={monthlyBase} tone="kern" /> {basisLabel} = <MaskedAmount value={targetAmount} tone="kern" /> doel
        </p>
        {emergencyFund.runwayMonths != null && emergencyFund.runwayMonths > 0 && (
          <p className="mt-0.5">
            Daarmee kom je {emergencyFund.runwayMonths.toFixed(1)} maanden rond van je vaste lasten
          </p>
        )}
        {!isComplete && remaining > 0 && (
          <p className="mt-0.5">
            Nog <MaskedAmount value={remaining} tone="kern" /> te gaan
          </p>
        )}
        {/* De tweede grondslag expliciet: vrijheidstijd rekent met het 12-mnd
            rolling uitgavenniveau, niet met de maanduitgaven hierboven. */}
        {freedomStr && (
          <p className="mt-1.5 border-t border-[var(--border-ed)] pt-1.5">
            Vrijheidstijd rekent met je gemiddelde uitgaven over 12 maanden
            {rollingMonthlyExpenses != null && (
              <> (<MaskedAmount value={rollingMonthlyExpenses} tone="kern" /> per maand)</>
            )} — een andere grondslag dan de dekking hierboven.
          </p>
        )}
      </div>

      {/* Tips to reach faster (only when not complete) */}
      {!isComplete && (
        <div className="mt-3 flex items-start gap-2 text-[11px] text-[var(--ink-3)]">
          <Lightbulb className="h-3.5 w-3.5 flex-shrink-0 text-kern-500 mt-0.5" strokeWidth={1.5} />
          <div>
            <p className="font-medium text-[var(--ink-2)]">Sneller bereiken</p>
            <ul className="mt-0.5 space-y-0.5 list-none">
              <li>Automatiseer een vaste storting per maand</li>
              <li>Zet onverwachte meevallers direct opzij</li>
              <li>Begin met één maandsalaris, bouw stap voor stap op</li>
            </ul>
          </div>
        </div>
      )}

      {/* Vrijheidstijd — altijd mét zijn eigen grondslag erbij (W29). */}
      {freedomStr && (
        <p className="mt-2 font-serif italic text-[12px] text-[var(--ink-3)]">
          {isComplete
            ? `${freedomStr} vrijheid op je gemiddelde uitgaven — je vangnet staat`
            : `${freedomStr} vrijheid op je gemiddelde uitgaven, en het groeit`
          }
        </p>
      )}
    </WidgetShell>
  )
})
