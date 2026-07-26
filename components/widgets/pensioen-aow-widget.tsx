'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { MaskedAmount } from '@/components/app/masked-amount'
import { NL_AOW_AGE, NL_AOW_MONTHLY, NL_AOW_MONTHLY_SAMENWONEND, NL_SWR } from '@/lib/constants'
import { computeEffectiveSwr } from '@/lib/fire-params'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const PensioenAowWidget = memo(function PensioenAowWidget({ size, data, href }: Props) {
  const currentAge = data.currentAge
  // HIGH-1: cohort-correcte AOW-leeftijd uit de bundel (loader → lookupAowAge op de
  // aow_leeftijd-tabel). NL_AOW_AGE alleen als fallback wanneer de bundel geen leeftijd
  // heeft (mock/ontbrekende dob). Nooit meer de hardcoded 67 als het cohort hoger is.
  const aowAge = data.aowAge ?? NL_AOW_AGE
  const yearsToAow = currentAge != null ? Math.max(0, aowAge - currentAge) : null
  const aowMonthly = NL_AOW_MONTHLY
  const aowYearly = aowMonthly * 12

  // MED-2: de canonieke 12-mnd rolling maanduitgave i.p.v. de losse kalendermaand-som
  // (die vroeg in de maand naar ~0 kan uitschieten en dan misleidend "AOW dekt 100%" toont).
  const exp = data.recentMonthlyExpenses ?? data.monthlyExpenses

  // Optie B: verwacht aanvullend pensioen (2e pijler) — bruto maandbedrag verbatim uit
  // de canonieke buildPensionProjection-motor (mijnpensioen 'TeBereiken'). null = geen
  // pensioen-events geïmporteerd → widget blijft AOW-only.
  const pensionMonthly = data.pensionMonthlyGross ?? null
  const hasPension = pensionMonthly != null && pensionMonthly > 0

  // Coverage: what percentage of monthly expenses does AOW cover?
  const aowCoveragePct = exp > 0 ? Math.min(100, (aowMonthly / exp) * 100) : 0

  // Capital equivalent of AOW income stream (how much less FIRE capital needed).
  // Een duurzame inkomensstroom kapitaliseer je op de ONTTREKKINGSVOET (SWR),
  // niet op het bruto rendement: kapitaal × SWR = duurzaam jaarinkomen, dus
  // kapitaal = jaarinkomen / SWR. Per-gebruiker SWR via de gedeelde helper,
  // met NL_SWR als fallback.
  const swr = (data.grossReturn != null && data.inflationRate != null)
    ? computeEffectiveSwr(data.grossReturn, data.inflationRate)
    : NL_SWR
  const aowFireReduction = aowYearly / swr

  // LOW-4: vrijheidstijd-framing ("Geld is opgeslagen tijd"). Het AOW-vermogens-
  // equivalent is gegarandeerde vrijheid die je niet zelf hoeft op te bouwen.
  // Consumeert het canonieke rolling dagtarief (data.dailyExpenseRate) — geen eigen som.
  const dailyExp = data.dailyExpenseRate ?? null
  const aowFreedomStr =
    dailyExp != null && dailyExp > 0 && aowFireReduction > 0
      ? formatFreedomTimeString(calculateFreedomTime(aowFireReduction, dailyExp), 'long')
      : null

  // In-view fill-animatie (700ms bezier, 0% → doel; transition:none pre-entered).
  const { ref: barRef, hasEntered } = useInViewAnimation({ duration: 700 })
  const barTransition = hasEntered ? 'width 700ms cubic-bezier(.22,1,.36,1)' : 'none'
  const coverageWidth = hasEntered ? `${Math.min(100, aowCoveragePct)}%` : '0%'

  // ── Mini: years to AOW ────────────────────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="horizon" size="mini" kicker="Pensioen" href={href}>
        {yearsToAow != null ? (
          <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
            {yearsToAow}j
          </p>
        ) : (
          <p className="text-[11px] text-[var(--ink-3)]">Geen geboortedatum</p>
        )}
      </WidgetShell>
    )
  }

  // ── Quarter: years + expected monthly amount ──────────────────
  if (size === 'quarter') {
    return (
      <WidgetShell module="horizon" size={size} kicker="Pensioen / AOW" href={href}>
        {yearsToAow != null ? (
          <>
            <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
              {yearsToAow} jaar
            </p>
            <p className="text-[10px] text-[var(--ink-3)]">tot AOW-leeftijd ({aowAge})</p>
            <p className="mt-1.5 text-[var(--ink)]">
              <MaskedAmount value={aowMonthly} tone="horizon" className="text-sm" />
            </p>
            <p className="text-[10px] text-[var(--ink-3)]">
              /maand AOW{hasPension ? ' + pensioen' : ' (alleenstaand)'}
            </p>
          </>
        ) : (
          <p className="text-xs text-[var(--ink-3)]">Voeg je geboortedatum toe in je profiel</p>
        )}
      </WidgetShell>
    )
  }

  // ── XL (Double): drie-pijler-overzicht + now→AOW-tijdlijn ──────
  if (size === 'xl') {
    const selfSupplementMonthly = Math.max(0, exp - aowMonthly)
    return (
      <WidgetShell module="horizon" size={size} kicker="Pensioen / AOW" href={href}>
        {yearsToAow != null ? (
          <div className="flex h-full flex-col">
            {/* Countdown + now→AOW timeline */}
            <div className="flex items-baseline gap-1.5">
              <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
                {yearsToAow} jaar
              </p>
              <span className="text-xs text-[var(--ink-3)]">tot je AOW-leeftijd ({aowAge})</span>
            </div>
            {currentAge != null && (
              <div className="mt-2">
                <div className="relative h-1.5 w-full rounded-full bg-[var(--subtle)]">
                  <div
                    ref={barRef}
                    className="absolute inset-y-0 left-0 rounded-full bg-horizon-500"
                    style={{
                      width: hasEntered ? '100%' : '0%',
                      transition: hasEntered ? 'width 700ms cubic-bezier(.22,1,.36,1)' : 'none',
                    }}
                  />
                </div>
                <div className="mt-0.5 flex justify-between text-[10px] text-[var(--ink-4)]">
                  <span>nu ({currentAge})</span>
                  <span>AOW ({aowAge})</span>
                </div>
              </div>
            )}

            {/* Drie pijlers — elk verbatim uit zijn eigen canonieke bron */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-[var(--r-md)] border border-[var(--border-ed)] p-2">
                <p className="text-[9px] uppercase tracking-wide text-[var(--ink-4)]">AOW (netto)</p>
                <p className="mt-0.5 text-[var(--ink)]">
                  <MaskedAmount value={aowMonthly} tone="horizon" className="text-sm" />
                </p>
                <p className="text-[9px] text-[var(--ink-4)]">/mnd · alleenstaand</p>
              </div>
              <div className="rounded-[var(--r-md)] border border-[var(--border-ed)] p-2">
                <p className="text-[9px] uppercase tracking-wide text-[var(--ink-4)]">Aanvullend</p>
                {hasPension ? (
                  <>
                    <p className="mt-0.5 text-[var(--ink)]">
                      <MaskedAmount value={pensionMonthly!} tone="horizon" className="text-sm" />
                    </p>
                    <p className="text-[9px] text-[var(--ink-4)]">/mnd · bruto, verwacht</p>
                  </>
                ) : (
                  <p className="mt-0.5 text-[10px] text-[var(--ink-4)] leading-tight">
                    Nog geen pensioen&shy;overzicht gekoppeld
                  </p>
                )}
              </div>
              <div className="rounded-[var(--r-md)] border border-[var(--border-ed)] p-2">
                <p className="text-[9px] uppercase tracking-wide text-[var(--ink-4)]">Zelf aanvullen</p>
                <p className="mt-0.5 text-[var(--ink)]">
                  <MaskedAmount value={selfSupplementMonthly} tone="horizon" className="text-sm" />
                </p>
                <p className="text-[9px] text-[var(--ink-4)]">/mnd · o.b.v. AOW</p>
              </div>
            </div>

            {/* Vrijheidstijd-framing */}
            {aowFreedomStr && (
              <p className="mt-3 text-xs text-[var(--ink-3)]">
                Je AOW is <span className="text-[var(--ink)]">{aowFreedomStr}</span> vrijheid die je
                niet zelf hoeft op te bouwen (
                <MaskedAmount value={aowFireReduction} tone="horizon" /> minder FIRE-pot).
              </p>
            )}

            <p className="mt-auto pt-2 border-t border-[var(--border-ed)] font-serif italic text-[10px] text-[var(--ink-4)]">
              Bedragen in 2026. AOW stijgt mee met minimumloon; aanvullend pensioen o.b.v. je
              pensioenoverzicht.
            </p>
          </div>
        ) : (
          <p className="text-xs text-[var(--ink-3)]">Voeg je geboortedatum toe in je profiel</p>
        )}
      </WidgetShell>
    )
  }

  // ── Full: complete AOW breakdown + pension overview ───────────
  if (size === 'full') {
    const selfSupplementMonthly = Math.max(0, exp - aowMonthly)
    const postAowTarget = exp > aowMonthly ? ((exp - aowMonthly) * 12) / swr : 0

    return (
      <WidgetShell module="horizon" size={size} kicker="Pensioen / AOW" href={href}>
        {/* Header: AOW countdown + amounts */}
        {yearsToAow != null ? (
          <div className="flex items-baseline gap-1.5">
            <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
              {yearsToAow} jaar
            </p>
            <span className="text-xs text-[var(--ink-3)]">tot AOW ({aowAge})</span>
          </div>
        ) : (
          <p className="text-xs text-[var(--ink-3)]">Voeg je geboortedatum toe in je profiel</p>
        )}

        {/* Comparison table: alleenstaand vs samenwonend */}
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wide text-[var(--ink-4)] mb-1">
            AOW-bedragen (netto, 2026)
          </p>
          <div className="space-y-0.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--ink-3)]">Alleenstaand</span>
              <span className="text-[var(--ink)]">
                <MaskedAmount value={NL_AOW_MONTHLY} tone="horizon" />/mnd
              </span>
              <span className="text-[var(--ink-3)]">
                <MaskedAmount value={NL_AOW_MONTHLY * 12} tone="horizon" />/jaar
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--ink-3)]">Samenwonend</span>
              <span className="text-[var(--ink)]">
                <MaskedAmount value={NL_AOW_MONTHLY_SAMENWONEND} tone="horizon" />/mnd
              </span>
              <span className="text-[var(--ink-3)]">
                <MaskedAmount value={NL_AOW_MONTHLY_SAMENWONEND * 12} tone="horizon" />/jaar
              </span>
            </div>
          </div>
        </div>

        {/* Aanvullend pensioen (optie B) — alleen als er een pensioenoverzicht is */}
        {hasPension && (
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wide text-[var(--ink-4)] mb-1">
              Aanvullend pensioen (verwacht)
            </p>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--ink-3)]">2e pijler, bruto</span>
              <span className="text-[var(--ink)]">
                <MaskedAmount value={pensionMonthly!} tone="horizon" />/mnd
              </span>
            </div>
          </div>
        )}

        {/* AOW coverage section */}
        <div className="mt-2">
          <p className="text-[11px] text-[var(--ink-3)]">
            AOW dekt {Math.round(aowCoveragePct)}% van je maandelijkse uitgaven
          </p>
          {/* Progress bar */}
          <div ref={barRef} className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
            <div
              className="h-full rounded-full bg-horizon-500"
              style={{ width: coverageWidth, transition: barTransition }}
            />
          </div>
          {selfSupplementMonthly > 0 && (
            <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
              Zelf aanvullen: <MaskedAmount value={selfSupplementMonthly} tone="horizon" />/mnd
            </p>
          )}
        </div>

        {/* FIRE impact section */}
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wide text-[var(--ink-4)] mb-1">
            Impact op FIRE
          </p>
          <div className="space-y-0.5 text-[11px]">
            <div className="flex justify-between">
              <span className="text-[var(--ink-3)] truncate mr-2">AOW-vermogensequivalent</span>
              <span className="text-[var(--ink)] shrink-0">
                <MaskedAmount value={aowFireReduction} tone="horizon" />
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--ink-3)] truncate mr-2">FIRE-pot v&oacute;&oacute;r AOW</span>
              <span className="text-[var(--ink)] shrink-0">
                <MaskedAmount value={data.fireTarget} tone="horizon" />
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--ink-3)] truncate mr-2">FIRE-pot na AOW</span>
              <span className="text-[var(--ink)] shrink-0">
                <MaskedAmount value={postAowTarget} tone="horizon" />
              </span>
            </div>
          </div>
        </div>

        {aowFreedomStr && (
          <p className="mt-2 text-[11px] text-[var(--ink-3)]">
            Dat is <span className="text-[var(--ink)]">{aowFreedomStr}</span> gegarandeerde vrijheid.
          </p>
        )}

        <p className="mt-2 pt-1.5 border-t border-[var(--border-ed)] font-serif italic text-[10px] text-[var(--ink-4)]">
          Bedragen in 2026. AOW stijgt mee met minimumloon.
        </p>
      </WidgetShell>
    )
  }

  // ── Half (default): countdown + amount + coverage bar ─────────
  return (
    <WidgetShell module="horizon" size={size} kicker="Pensioen / AOW" href={href}>
      {yearsToAow != null ? (
        <>
          {/* Main stat: years until AOW + monthly amount */}
          <div className="flex items-baseline gap-1.5">
            <p className="font-mono text-xl font-semibold tabular-nums text-[var(--ink)]">
              {yearsToAow} jaar
            </p>
            <span className="text-[10px] text-[var(--ink-3)]">tot AOW ({aowAge})</span>
          </div>
          <p className="mt-1 text-[var(--ink)]">
            <MaskedAmount value={aowMonthly} tone="horizon" className="text-sm" />/mnd
          </p>
          <p className="text-[10px] text-[var(--ink-3)]">
            AOW (alleenstaand, netto)
            {hasPension && (
              <>
                {' · '}
                <MaskedAmount value={pensionMonthly!} tone="horizon" />/mnd pensioen
              </>
            )}
          </p>

          {/* AOW coverage */}
          <p className="mt-2 text-xs text-[var(--ink-3)]">
            AOW dekt {Math.round(aowCoveragePct)}% van je uitgaven
          </p>
          <div ref={barRef} className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
            <div
              className="h-full rounded-full bg-horizon-500"
              style={{ width: coverageWidth, transition: barTransition }}
            />
          </div>

          {/* FIRE pot reduction — met vrijheidstijd-framing */}
          <p className="mt-2 text-xs text-[var(--ink-3)]">
            {aowFreedomStr ? (
              <>
                AOW = <span className="text-[var(--ink)]">{aowFreedomStr}</span> vrijheid (
                <MaskedAmount value={aowFireReduction} tone="horizon" /> minder nodig)
              </>
            ) : (
              <>
                Na AOW-leeftijd heb je <MaskedAmount value={aowFireReduction} tone="horizon" /> minder
                nodig
              </>
            )}
          </p>
        </>
      ) : (
        <p className="text-xs text-[var(--ink-3)]">Voeg je geboortedatum toe in je profiel</p>
      )}
    </WidgetShell>
  )
})
