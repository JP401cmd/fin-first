import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { MaskedAmount } from '@/components/app/masked-amount'
import { NL_AOW_AGE, NL_AOW_MONTHLY, NL_AOW_MONTHLY_SAMENWONEND, NL_SWR } from '@/lib/constants'
import { computeEffectiveSwr } from '@/lib/fire-params'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const PensioenAowWidget = memo(function PensioenAowWidget({ size, data, href }: Props) {
  const currentAge = data.currentAge
  const aowAge = NL_AOW_AGE
  const yearsToAow = currentAge != null ? Math.max(0, aowAge - currentAge) : null
  const aowMonthly = NL_AOW_MONTHLY
  const aowYearly = aowMonthly * 12

  // Coverage: what percentage of monthly expenses does AOW cover?
  const aowCoveragePct =
    data.monthlyExpenses > 0
      ? Math.min(100, (aowMonthly / data.monthlyExpenses) * 100)
      : 0

  // Capital equivalent of AOW income stream (how much less FIRE capital needed).
  // Een duurzame inkomensstroom kapitaliseer je op de ONTTREKKINGSVOET (SWR),
  // niet op het bruto rendement: kapitaal × SWR = duurzaam jaarinkomen, dus
  // kapitaal = jaarinkomen / SWR. Kapitaliseren op grossReturn (~7%) onderschat
  // het vermogensequivalent met een factor ~2,4. Per-gebruiker SWR via de
  // gedeelde helper, met NL_SWR als fallback.
  const swr = (data.grossReturn != null && data.inflationRate != null)
    ? computeEffectiveSwr(data.grossReturn, data.inflationRate)
    : NL_SWR
  const aowFireReduction = aowYearly / swr

  // ── Mini: years to AOW ────────────────────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="horizon" size="mini" kicker="AOW" href={href}>
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
            <p className="text-[10px] text-[var(--ink-3)]">/maand (alleenstaand)</p>
          </>
        ) : (
          <p className="text-xs text-[var(--ink-3)]">Voeg je geboortedatum toe in je profiel</p>
        )}
      </WidgetShell>
    )
  }

  // ── Full: complete AOW breakdown + pension overview ───────────
  if (size === 'full') {
    const selfSupplementMonthly = Math.max(0, data.monthlyExpenses - aowMonthly)
    const postAowTarget =
      data.monthlyExpenses > aowMonthly
        ? (data.monthlyExpenses - aowMonthly) * 12 / swr
        : 0

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

        {/* AOW coverage section */}
        <div className="mt-2">
          <p className="text-[11px] text-[var(--ink-3)]">
            AOW dekt {Math.round(aowCoveragePct)}% van je maandelijkse uitgaven
          </p>
          {/* Progress bar */}
          <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--subtle)]">
            <div
              className="h-full rounded-full bg-horizon-500 transition-all"
              style={{ width: `${Math.min(100, aowCoveragePct)}%` }}
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
          <p className="text-[10px] text-[var(--ink-3)]">(alleenstaand, netto)</p>

          {/* AOW coverage */}
          <p className="mt-2 text-xs text-[var(--ink-3)]">
            AOW dekt {Math.round(aowCoveragePct)}% van je uitgaven
          </p>
          <div className="mt-1 h-2 w-full rounded-full bg-[var(--subtle)]">
            <div
              className="h-full rounded-full bg-horizon-500 transition-all"
              style={{ width: `${Math.min(100, aowCoveragePct)}%` }}
            />
          </div>

          {/* FIRE pot reduction */}
          <p className="mt-2 text-xs text-[var(--ink-3)]">
            Na AOW-leeftijd heb je <MaskedAmount value={aowFireReduction} tone="horizon" /> minder nodig
          </p>
        </>
      ) : (
        <p className="text-xs text-[var(--ink-3)]">Voeg je geboortedatum toe in je profiel</p>
      )}
    </WidgetShell>
  )
})
