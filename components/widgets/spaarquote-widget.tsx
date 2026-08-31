'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { calculateFreedomTime, formatFreedomTimeString, dailyExpenseRate } from '@/lib/format'
import { FIRE_SAVINGS_RATE_BENCHMARK_PCT } from '@/lib/constants'
import { savingsRateBasisLabel, savingsRateFollowsTransactions } from '@/lib/budget-basis'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { DashboardData } from './widget-renderer'
import { PiggyBank, Users, UserCheck } from 'lucide-react'
import { usePerspective } from '@/components/app/perspective-provider'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const SpaarquoteWidget = memo(function SpaarquoteWidget({ size, data, href }: Props) {
  const { perspective, partnerName } = usePerspective()
  const isHouseholdView = perspective === 'household' && data.householdOverrides != null
  const isPartnerView = perspective === 'partner' && data.partnerOverrides != null

  // Use perspective-appropriate data overrides for the headline savings metrics
  const overrides = isHouseholdView ? data.householdOverrides! : isPartnerView ? data.partnerOverrides! : null
  const monthlyIncome = overrides ? overrides.monthlyIncome : data.monthlyIncome
  const monthlyExpenses = overrides ? overrides.monthlyExpenses : data.monthlyExpenses

  // Spaarquote-% én -bedrag: BEIDE uit de canonieke bundel/override — de widget
  // rekent niets meer zelf uit (consume-don't-recompute). Het €-bedrag staat op
  // dezelfde grondslag als de %-quote (bedrag / inkomen == quote), dus de twee
  // getallen op één kaart spreken elkaar niet meer tegen.
  //
  // DE EFFECTIEVE QUOTE, NIET DE 6-MAANDS METING (31 aug 2026). Deze widget las
  // `savingsRate6m`, terwijl het instellingenblok onderaan /overzicht/cashflow en
  // de hefboomkaart op /overzicht de grondslag-geresolveerde quote tonen. Wie op
  // budgetten of eigen bedragen staat, zag daardoor 9,5 % op de widget naast 30 %
  // op /overzicht. `effectiveSavingsRatePct` is HET spaarquote-getal; de meting
  // (`savingsRate6m`) hoort alleen daar waar hij als meting gelabeld staat.
  const rate = overrides ? overrides.savingsRate : data.effectiveSavingsRatePct
  const savings = overrides ? overrides.monthlySavings : data.effectiveMonthlySavings
  const isPositive = rate >= 0

  // In-view fill-animatie (700ms bezier, 0% → doel; transition:none pre-entered).
  // Eén hook bovenaan; per render toont het widget precies één size, dus dezelfde
  // ref op elke size-track is rules-of-hooks-veilig.
  const { ref: barRef, hasEntered } = useInViewAnimation({ duration: 700 })
  const barTransition = hasEntered ? 'width 700ms cubic-bezier(.22,1,.36,1)' : 'none'
  const barWidth = hasEntered ? `${Math.min(Math.abs(rate), 100)}%` : '0%'

  // Grondslag-label (ADR 0103: elke kaart benoemt waar zijn getal op rust) — via
  // de gedeelde helper, zodat de widget letterlijk dezelfde woorden gebruikt als
  // het instellingenblok en de forecast-kaart.
  //
  // OOK IN HUISHOUD-PERSPECTIEF (L5). Het label stond eerst alleen in eigen
  // perspectief, met als argument "household/partner draagt zijn eigen kop". Dat
  // gold toen die override een eigen formule had; sinds 31 aug 2026 ÍS de
  // huishoud-quote de effectieve quote van de gebruiker zelf, dus rust hij op
  // exact dezelfde grondslag — en dan eist ADR 0121 het label daar net zo goed.
  // PARTNER blijft er bewust zonder: dat getal komt uit de partner-RPC (diens
  // eigen inkomsten/uitgaven) en niet uit deze grondslagkeuze; een label over
  // ónze grondslag zou daar juist misleiden.
  const basisLabel = isPartnerView
    ? null
    : savingsRateBasisLabel(data.savingsRateIncomeBasis, data.savingsRateExpensesBasis)

  // "Geschat" hoort ALLEEN bij een quote die daadwerkelijk de 6-maands meting is
  // (profiel/net-worth-delta-fallback). Staat de gebruiker op budgetten of eigen
  // bedragen, dan komt het getal uit zijn eigen keuze en zou de markering liegen.
  const isEstimate =
    !overrides &&
    savingsRateFollowsTransactions(data.savingsRateIncomeBasis, data.savingsRateExpensesBasis) &&
    data.savingsRateIsEstimate

  const kickerLabel = isHouseholdView
    ? 'Spaarquote — Huishouden'
    : isPartnerView
      ? `Spaarquote — ${partnerName ?? 'Partner'}`
      : 'Spaarquote'

  if (monthlyIncome === 0 && rate === 0) {
    return (
      <WidgetShell module="kern" size={size} kicker={kickerLabel} href={href}>
        <WidgetEmpty icon={PiggyBank} message="Stel budgetten in om je spaarquote te berekenen." />
      </WidgetShell>
    )
  }

  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker={kickerLabel} href={href}>
        <>
          <p className={`font-mono text-[15px] font-semibold tabular-nums leading-none truncate ${isPositive ? 'text-positive' : 'text-negative'}`}>
            {rate.toFixed(1)}%
          </p>
          <div ref={barRef} className="mt-0.5 h-[2px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
            <div className={`h-full rounded-full ${isPositive ? 'bg-positive' : 'bg-negative'}`} style={{ width: barWidth, transition: barTransition }} />
          </div>
        </>
      </WidgetShell>
    )
  }

  // ── Quarter-size: groot percentage + kleur + mini progress bar ──
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker={kickerLabel} href={href}>
        {(isHouseholdView || isPartnerView) && (
          <div className="mb-1 flex items-center gap-1 text-[10px] text-kern-600">
            {isPartnerView ? <UserCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
            {isPartnerView ? (partnerName ?? 'Partner') : 'Huishouden'}
          </div>
        )}
        <p className={`font-mono text-lg font-semibold tabular-nums ${isPositive ? 'text-positive' : 'text-negative'}`}>
          {rate.toFixed(1)}%
        </p>
        <div ref={barRef} className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
          <div
            className={`h-full rounded-full ${isPositive ? 'bg-positive' : 'bg-negative'}`}
            style={{ width: barWidth, transition: barTransition }}
          />
        </div>
      </WidgetShell>
    )
  }

  // Personal view: canoniek 12-mnd rolling dagtarief uit de bundel (KRUIS-20);
  // override-perspectief houdt zijn eigen (perspectief-eigen) uitgavenniveau.
  const dailyExp = overrides
    ? dailyExpenseRate(monthlyExpenses)
    : data.dailyExpenseRate ?? dailyExpenseRate(monthlyExpenses)
  const freedomTime = dailyExp > 0 && savings > 0
    ? calculateFreedomTime(savings, dailyExp)
    : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null

  // ── Eén canonieke historische spaarquote-serie (snapshot savings_rate) ──
  // Historie/delta zijn per-gebruiker — alleen in eigen perspectief (household/
  // partner-projecties worden niet per-maand gesnapshot). De live quote (rate)
  // wordt als 'nu'-anker toegevoegd ALLEEN als er nog geen snapshot voor de huidige
  // maand bestaat. Delta, gemiddelden én YoY komen uit DEZELFDE serie — voorheen
  // mengde de widget drie grondslagen (snapshot + 6m-anker + huidige-maand-delta).
  //
  // GRONDSLAG VAN DE REEKS (31 aug 2026): `net_worth_snapshots.savings_rate` is
  // door alle drie de snapshot-schrijvers vastgelegd als
  // `resolveSavingsSource(...).effectiveSavingsRatePct` — dus de EFFECTIEVE quote.
  // Het 'nu'-anker was tot vandaag de rauwe 6-maands meting, waardoor deze ene as
  // twee grondslagen droeg en de "t.o.v. vorige maand"-delta een sprong toonde die
  // niets met sparen te maken had (gemeten: 29 % historie → 9,5 % anker = −19,5 %).
  // Nu het anker óók de effectieve quote is, staat de hele reeks op één grondslag
  // en is er niets te markeren. Historische rijen blijven staan zoals ze gemeten
  // zijn — geen backfill, conform de snapshot-regel in ADR 0103.
  const showHistory = !isHouseholdView && !isPartnerView
  const snapshotSeries = (data.savingsHistory ?? []).map(s => Math.max(-100, Math.min(100, s.value)))
  const now = new Date()
  // Lokale maand-key (géén toISOString — zou een dag-shift/maand-shift geven).
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const lastSnapMonth = data.savingsHistory && data.savingsHistory.length > 0
    ? data.savingsHistory[data.savingsHistory.length - 1].month.slice(0, 7)
    : null
  const hasCurrentMonthSnap = lastSnapMonth === currentMonthKey
  const rateSeries = hasCurrentMonthSnap ? snapshotSeries : [...snapshotSeries, rate]

  // Maand-op-maand-delta uit diezelfde serie (laatste − voorlaatste punt).
  const hasPrevData = showHistory && rateSeries.length >= 2
  const delta = hasPrevData ? rateSeries[rateSeries.length - 1] - rateSeries[rateSeries.length - 2] : 0

  // ── Full-size: sparkline + averages + FIRE benchmark ──
  if (size === 'full') {
    // Sparkline/gemiddelden/YoY draaien op DEZELFDE serie als de delta (rateSeries):
    // de snapshot-savings_rate-historie, met de live 6m-quote als 'nu'-anker enkel
    // wanneer deze maand nog niet gesnapshot is. Eén grondslag — geen net-worth-delta-
    // afgeleide reeks of losse huidige-maand-vergelijking meer.
    const sparkData = rateSeries.slice(-12)
    const avg3m = rateSeries.length >= 3
      ? rateSeries.slice(-3).reduce((a, b) => a + b, 0) / 3
      : null
    const avg6m = rateSeries.length >= 6
      ? rateSeries.slice(-6).reduce((a, b) => a + b, 0) / 6
      : null

    // FIRE-optimaal benchmark (benoemde constante — geen magic number in de widget)
    const fireBenchmark = FIRE_SAVINGS_RATE_BENCHMARK_PCT

    // Sparkline SVG
    const svgW = 200
    const svgH = 48
    const minVal = Math.min(...sparkData, 0)
    const maxVal = Math.max(...sparkData, fireBenchmark, 10)
    const range = maxVal - minVal || 1
    const points = sparkData.map((v, i) => {
      const x = sparkData.length > 1 ? (i / (sparkData.length - 1)) * svgW : svgW / 2
      const y = svgH - ((v - minVal) / range) * svgH
      return `${x},${y}`
    }).join(' ')
    const benchmarkY = svgH - ((fireBenchmark - minVal) / range) * svgH

    return (
      <WidgetShell module="kern" size={size} kicker={kickerLabel} href={href}>
        {(isHouseholdView || isPartnerView) && (
          <div className="mb-1.5 flex items-center gap-1 text-[11px] text-kern-600">
            {isPartnerView ? <UserCheck className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
            {isPartnerView ? (partnerName ?? 'Partner') : 'Gecombineerd huishouden'}
          </div>
        )}
        {/* Percentage + bar + bedrag (stacked vertically for 2-col full) */}
        <div>
          <p className={`font-mono text-2xl font-semibold tabular-nums ${isPositive ? 'text-[var(--ink)]' : 'text-negative'}`}>
            {rate.toFixed(1)}%
          </p>

          <div ref={barRef} className="mt-2 h-[4px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
            <div
              className={`h-full rounded-full ${isPositive ? 'bg-positive' : 'bg-negative'}`}
              style={{ width: barWidth, transition: barTransition }}
            />
          </div>

          <p className="mt-2 text-xs text-[var(--ink-3)]">
            <MaskedAmount value={Math.max(savings, 0)} tone="kern" /> gespaard per maand
          </p>

          {hasPrevData && (
            <p className={`mt-1 text-xs font-mono tabular-nums ${delta >= 0 ? 'text-positive' : 'text-negative'}`}>
              {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}% t.o.v. vorige maand
            </p>
          )}

          {freedomStr && (
            <p className="mt-0.5 font-serif italic text-[12px] text-[var(--ink-3)]">
              +{freedomStr} vrijheid per maand
            </p>
          )}
        </div>

        {/* Sparkline — full width below content */}
        {showHistory && sparkData.length >= 2 && (
          <div className="mt-3">
            <svg width="100%" height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none" className="overflow-visible">
              {/* FIRE benchmark lijn */}
              <line
                x1={0} y1={benchmarkY} x2={svgW} y2={benchmarkY}
                stroke="var(--ink-4)" strokeWidth={1} strokeDasharray="4 3" opacity={0.5}
              />
              <text x={svgW} y={benchmarkY - 3} textAnchor="end" className="fill-[var(--ink-4)]" fontSize={9}>
                {fireBenchmark}%
              </text>
              {/* Trend lijn */}
              <polyline
                points={points}
                fill="none"
                stroke={isPositive ? 'var(--positive)' : 'var(--negative)'}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Data punten */}
              {sparkData.map((v, i) => {
                const x = sparkData.length > 1 ? (i / (sparkData.length - 1)) * svgW : svgW / 2
                const y = svgH - ((v - minVal) / range) * svgH
                return (
                  <circle
                    key={i}
                    cx={x} cy={y} r={2.5}
                    fill={v >= 0 ? 'var(--positive)' : 'var(--negative)'}
                  />
                )
              })}
            </svg>
          </div>
        )}

        {/* Gemiddelden + benchmark + year comparison */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--ink-3)] font-mono tabular-nums">
          {showHistory && avg3m !== null && (
            <span>3m: {avg3m.toFixed(1)}%</span>
          )}
          {showHistory && avg6m !== null && (
            <span>· 6m: {avg6m.toFixed(1)}%</span>
          )}
          <span className="text-[var(--ink-4)]">{showHistory ? '· ' : ''}FIRE: {fireBenchmark}%+</span>
          {/* ADR 0103: de kaart benoemt zijn grondslag. Zelfde woorden als het
              instellingenblok en de forecast-kaart (gedeelde helper). */}
          {basisLabel && <span className="text-[var(--ink-4)]">· {basisLabel}</span>}
          {isEstimate && <span className="text-[var(--ink-4)]">· geschat</span>}
        </div>
        {/* Year-over-year comparison */}
        {showHistory && rateSeries.length >= 12 && (() => {
          const thisYear = rateSeries.slice(-6).reduce((a, b) => a + b, 0) / 6
          const lastYear = rateSeries.slice(-12, -6).reduce((a, b) => a + b, 0) / 6
          const yoyDelta = thisYear - lastYear
          return (
            <p className={`mt-0.5 text-[11px] font-mono tabular-nums ${yoyDelta >= 0 ? 'text-positive' : 'text-negative'}`}>
              {yoyDelta >= 0 ? '↑' : '↓'} {Math.abs(yoyDelta).toFixed(1)}% t.o.v. vorig halfjaar
            </p>
          )
        })()}
      </WidgetShell>
    )
  }

  // ── Half-size: horizontal layout — left percentage, right details ──
  return (
    <WidgetShell module="kern" size={size} kicker={kickerLabel} href={href}>
      <div className="flex gap-3 h-full">
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          {(isHouseholdView || isPartnerView) && (
            <div className="mb-1 flex items-center gap-1 text-[10px] text-kern-600">
              {isPartnerView ? <UserCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
              {isPartnerView ? (partnerName ?? 'Partner') : 'Huishouden'}
            </div>
          )}
          <p className={`font-mono text-xl font-semibold tabular-nums ${isPositive ? 'text-[var(--ink)]' : 'text-negative'}`}>
            {rate.toFixed(1)}%
          </p>
          <div ref={barRef} className="mt-1.5 h-[4px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
            <div
              className={`h-full rounded-full ${isPositive ? 'bg-positive' : 'bg-negative'}`}
              style={{ width: barWidth, transition: barTransition }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--ink-3)]">
            <MaskedAmount value={Math.max(savings, 0)} tone="kern" />/mnd
          </p>
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
          {hasPrevData && (
            <p className={`text-[11px] font-mono tabular-nums ${delta >= 0 ? 'text-positive' : 'text-negative'}`}>
              {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}% t.o.v. vorige mnd
            </p>
          )}
          {freedomStr && (
            <p className="font-serif italic text-[11px] text-[var(--ink-3)]">
              +{freedomStr} vrijheid/mnd
            </p>
          )}
        </div>
      </div>
    </WidgetShell>
  )
})
