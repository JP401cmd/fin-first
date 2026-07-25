'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { MaskedAmount } from '@/components/app/masked-amount'
import { Home, TrendingUp, Scale } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const HypotheekVsBeleggenWidget = memo(function HypotheekVsBeleggenWidget({ size, data, href }: Props) {
  const { ref: inViewRef, hasEntered } = useInViewAnimation({ duration: 700 })
  const hvb = data.hvbSummary

  // Null-state: no mortgage
  if (!hvb) {
    return (
      <WidgetShell module="kern" size={size} kicker="Hypotheek vs Beleggen" href={href}>
        <WidgetEmpty icon={Home} message="Voeg een hypotheek toe om aflossen vs beleggen te vergelijken." />
      </WidgetShell>
    )
  }

  const {
    restschuld, rente, breakevenRendement, aanbeveling, isTaxDeductible,
    beleggenVoordeel, aflossenVoordeel, verschil, extraBedragMaand, horizonJaren,
    fireImpactMaanden,
  } = hvb

  const breakevenPctStr = (breakevenRendement * 100).toFixed(1).replace('.', ',')
  const rentePctStr = rente.toFixed(2).replace('.', ',')

  const adviesLabel = aanbeveling === 'beleggen'
    ? 'Beleggen is voordeliger'
    : aanbeveling === 'aflossen'
      ? 'Extra aflossen is voordeliger'
      : 'Vrijwel gelijkwaardig'

  const adviesColor = aanbeveling === 'beleggen'
    ? 'text-positive'
    : aanbeveling === 'aflossen'
      ? 'text-[var(--ink-2)]'
      : 'text-[var(--ink-3)]'

  const AdviesIcon = aanbeveling === 'beleggen' ? TrendingUp : aanbeveling === 'aflossen' ? Home : Scale

  // ── Mini: advies label (Aflossen / Beleggen / Gelijk) ──
  if (size === 'mini') {
    const miniLabel = aanbeveling === 'beleggen'
      ? 'Beleggen'
      : aanbeveling === 'aflossen'
        ? 'Aflossen'
        : 'Gelijk'
    return (
      <WidgetShell module="kern" size="mini" kicker="Hyp. vs Beleggen" href={href}>
        <div className="flex items-center gap-2">
          <AdviesIcon className={`h-3.5 w-3.5 ${adviesColor}`} />
          <span className={`text-[12px] font-medium truncate ${adviesColor}`}>{miniLabel}</span>
        </div>
      </WidgetShell>
    )
  }

  // ── Quarter: compact summary ──
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Hypotheek vs Beleggen" href={href}>
        <div className="flex items-center gap-2 mb-1.5">
          <AdviesIcon className={`h-4 w-4 ${adviesColor}`} />
          <span className={`text-sm font-medium ${adviesColor}`}>{adviesLabel}</span>
        </div>
        <div className="mt-1">
          <p className="text-xs text-[var(--ink-3)]">Breakeven rendement</p>
          <p className="font-mono tabular-nums text-sm font-semibold text-[var(--ink)] mt-0.5">
            {breakevenPctStr}%
          </p>
        </div>
      </WidgetShell>
    )
  }

  // ── Half: advies + breakeven, begrensd tot de vaste tegelhoogte ──
  // Bewust compact: metrics-grid, aparte aftrek-noot en eigen CTA zijn weggelaten
  // zodat de inhoud binnen de 'half'-tegel valt (en niet afknipt wanneer 'full'
  // op mobiel naar 'half' downsized). Restschuld/rente blijven in de 'full'-tegel.
  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker="Hypotheek vs Beleggen" href={href}>
        <div ref={inViewRef}>
          {/* Recommendation header */}
          <div className="flex items-center gap-2 mb-2">
            <AdviesIcon className={`h-4 w-4 ${adviesColor}`} />
            <span className={`text-sm font-semibold ${adviesColor}`}>{adviesLabel}</span>
          </div>

          {/* Breakeven rendement — aftrek-noot ingevouwen in het onderschrift */}
          <div
            className="p-2.5 rounded-md bg-[var(--subtle)] border border-[var(--border-ed)]"
            style={{
              opacity: hasEntered ? 1 : 0,
              transform: hasEntered ? 'translateY(0)' : 'translateY(4px)',
              transition: 'opacity 400ms 200ms ease, transform 400ms 200ms ease',
            }}
          >
            <p className="text-xs text-[var(--ink-3)] mb-0.5">Breakeven rendement</p>
            <p className="font-mono tabular-nums text-lg font-bold text-[var(--ink)]">
              {breakevenPctStr}%
            </p>
            <p className="text-[11px] text-[var(--ink-3)] leading-snug mt-0.5">
              {aanbeveling === 'beleggen'
                ? 'Verwacht rendement boven dit punt — beleggen wint.'
                : aanbeveling === 'aflossen'
                  ? 'Verwacht rendement onder dit punt — aflossen wint.'
                  : 'Verwacht rendement dicht bij dit punt.'}
              {isTaxDeductible && ' Incl. renteaftrek.'}
            </p>
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── Full (default): complete comparison — consumeert de canonieke engine ──
  // De horizon-scenario's (netto voordeel beleggen/aflossen + verschil) komen
  // rechtstreeks uit `compareMortgageVsInvest` via de loader; niets wordt hier
  // herberekend (consume-don't-recompute). Premisse: `extraBedragMaand`/`horizonJaren`.
  const premisse = `o.b.v. €${extraBedragMaand}/mnd extra · ${horizonJaren} jaar`

  // Vrijheidstijd-framing: `fireImpactMaanden` > 0 = beleggen brengt je eerder vrij.
  const impactMaanden = fireImpactMaanden ?? 0
  const impactJaren = Math.floor(Math.abs(impactMaanden) / 12)
  const impactRestMaanden = Math.abs(impactMaanden) % 12
  const impactParts: string[] = []
  if (impactJaren > 0) impactParts.push(`${impactJaren} jaar`)
  if (impactRestMaanden > 0) impactParts.push(`${impactRestMaanden} maand${impactRestMaanden > 1 ? 'en' : ''}`)
  const impactStr = impactParts.length > 0 ? impactParts.join(' en ') : null

  return (
    <WidgetShell module="kern" size={size} kicker="Hypotheek vs Beleggen" href={href}>
      <div ref={inViewRef}>
        {/* Recommendation header */}
        <div className="flex items-center gap-2 mb-2">
          <AdviesIcon className={`h-4 w-4 ${adviesColor}`} />
          <span className={`text-sm font-semibold ${adviesColor}`}>{adviesLabel}</span>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div
            style={{
              opacity: hasEntered ? 1 : 0,
              transform: hasEntered ? 'translateY(0)' : 'translateY(4px)',
              transition: 'opacity 400ms 100ms ease, transform 400ms 100ms ease',
            }}
          >
            <p className="text-xs text-[var(--ink-3)]">Restschuld</p>
            <p className="text-[var(--ink)] mt-0.5">
              <MaskedAmount value={restschuld} tone="kern" className="text-sm font-semibold" />
            </p>
          </div>
          <div
            style={{
              opacity: hasEntered ? 1 : 0,
              transform: hasEntered ? 'translateY(0)' : 'translateY(4px)',
              transition: 'opacity 400ms 200ms ease, transform 400ms 200ms ease',
            }}
          >
            <p className="text-xs text-[var(--ink-3)]">Hypotheekrente</p>
            <p className="font-mono tabular-nums text-sm font-semibold text-[var(--ink)] mt-0.5">
              {rentePctStr}%
            </p>
          </div>
        </div>

        {/* Breakeven rendement card — aftrek-noot ingevouwen in het onderschrift */}
        <div
          className="p-2 rounded-md bg-[var(--subtle)] border border-[var(--border-ed)] mb-2"
          style={{
            opacity: hasEntered ? 1 : 0,
            transform: hasEntered ? 'translateY(0)' : 'translateY(4px)',
            transition: 'opacity 400ms 300ms ease, transform 400ms 300ms ease',
          }}
        >
          <p className="text-xs text-[var(--ink-3)] mb-0.5">Breakeven rendement</p>
          <p className="font-mono tabular-nums text-base font-bold text-[var(--ink)]">
            {breakevenPctStr}%
          </p>
          {isTaxDeductible && (
            <p className="text-[10px] text-[var(--ink-3)] leading-snug mt-0.5 italic">
              Incl. hypotheekrenteaftrek — netto kosten lager.
            </p>
          )}
        </div>

        {/* Horizon scenario comparison — engine-outputs (consume, don't recompute) */}
        <div
          className="border border-[var(--border-ed)] rounded-md overflow-hidden mb-2"
          style={{
            opacity: hasEntered ? 1 : 0,
            transition: 'opacity 400ms 400ms ease',
          }}
        >
          <div className="flex items-baseline justify-between gap-2 bg-[var(--subtle)] px-2 py-1 border-b border-[var(--border-ed)]">
            <span className="text-[10px] uppercase tracking-wider font-medium text-[var(--ink-3)]">
              Netto voordeel
            </span>
            <span className="text-[10px] text-[var(--ink-3)]">{premisse}</span>
          </div>
          <div className="px-2 py-1.5 space-y-1">
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="text-[var(--ink-2)] flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-[var(--ink-3)]" />
                Beleggen
              </span>
              <span className={aanbeveling === 'beleggen' ? 'text-[var(--ink)] font-semibold' : 'text-[var(--ink-2)]'}>
                <MaskedAmount value={beleggenVoordeel} signPrefix="+" tone="kern" className="font-medium" />
              </span>
            </div>
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="text-[var(--ink-2)] flex items-center gap-1">
                <Home className="h-3 w-3 text-[var(--ink-3)]" />
                Aflossen
              </span>
              <span className={aanbeveling === 'aflossen' ? 'text-[var(--ink)] font-semibold' : 'text-[var(--ink-2)]'}>
                <MaskedAmount value={aflossenVoordeel} signPrefix="+" tone="kern" className="font-medium" />
              </span>
            </div>
            <div className="border-t border-[var(--border-ed)] pt-1 flex items-baseline justify-between text-[11px]">
              <span className="text-[var(--ink-3)]">
                {verschil >= 0 ? 'Beleggen voordeliger' : 'Aflossen voordeliger'}
              </span>
              <span className={`font-semibold ${adviesColor}`}>
                <MaskedAmount
                  value={Math.abs(verschil)}
                  signPrefix="+"
                  tone="kern"
                  className="font-semibold"
                />
              </span>
            </div>
          </div>
        </div>

        {/* Vrijheidstijd-framing: FIRE-impact van de aanbevolen keuze */}
        {impactStr && impactMaanden !== 0 && (
          <p
            className="text-[11px] text-[var(--ink-2)] italic leading-snug mb-1.5"
            style={{
              opacity: hasEntered ? 1 : 0,
              transition: 'opacity 400ms 450ms ease',
            }}
          >
            {impactMaanden > 0
              ? `Beleggen brengt je ± ${impactStr} eerder vrij.`
              : `Aflossen brengt je ± ${impactStr} eerder vrij.`}
          </p>
        )}

        {/* CTA verwijderd: de hele tegel is al een link en de WidgetShell rendert
            al een hover-pijl — een eigen CTA-regel was dubbel én duwde de inhoud
            uit de vaste tegelhoogte. Aftrek-noot is nu in het breakeven-onderschrift. */}
      </div>
    </WidgetShell>
  )
})
