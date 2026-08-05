'use client'

import { memo, useState } from 'react'
import Link from 'next/link'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { Activity, TrendingUp, TrendingDown, Minus, ChevronRight, ExternalLink } from 'lucide-react'
import type { DashboardData } from './widget-renderer'
import type { HealthPillar, HealthScore } from '@/lib/financial-health'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { BesprekMetWillButton } from '@/components/app/chat/bespreek-met-fin-button'
import { WidgetEmpty } from './widget-empty'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

// Starter/low-data — waar een lege gebruiker naartoe kan om gegevens toe te
// voegen (bezittingen zijn het startpunt van de meeste pijlers).
const STARTER_HREF = '/overzicht/bezittingen'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// ── Color helpers ────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return 'var(--score-good)'
  if (score >= 60) return 'var(--score-ok)'
  if (score >= 40) return 'var(--score-warn)'
  return 'var(--score-bad)'
}

function scoreColorClass(score: number): string {
  if (score >= 80) return 'text-score-good'
  if (score >= 60) return 'text-score-ok'
  if (score >= 40) return 'text-score-warn'
  return 'text-score-bad'
}

function barColorClass(score: number): string {
  if (score >= 80) return 'bg-score-good'
  if (score >= 60) return 'bg-score-ok'
  if (score >= 40) return 'bg-score-warn'
  return 'bg-score-bad'
}

// ── Full-circle gauge SVG ────────────────────────────────────
// Uses strokeDasharray/strokeDashoffset on a <circle> element.
// The circle starts at 12 o'clock (top) via transform="rotate(-90)"
// and fills clockwise proportional to the score percentage.

function HealthGauge({ score, sz }: { score: number; sz: number }) {
  const cx = sz / 2
  const cy = sz / 2
  const strokeW = 6
  const r = (sz - strokeW - 6) / 2
  const circumference = 2 * Math.PI * r

  const pct = Math.max(0, Math.min(score, 100)) / 100
  // strokeDasharray = circumference: the full circle length
  // strokeDashoffset = circumference * (1 - pct): hides the unfilled portion
  const dashOffset = circumference * (1 - pct)

  const color = scoreColor(score)

  return (
    <svg
      width={sz}
      height={sz}
      viewBox={`0 0 ${sz} ${sz}`}
      className="mx-auto"
      role="img"
      aria-label={`Gezondheidsscore ${score} van 100`}
    >
      {/* Background track (full circle) */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="var(--border-ed)"
        strokeWidth={strokeW}
      />
      {/* Filled arc — starts at 12 o'clock, runs clockwise */}
      {pct > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.7s ease-out' }}
        />
      )}
      {/* Center score label */}
      <text
        x={cx}
        y={cy + 1}
        textAnchor="middle"
        dominantBaseline="central"
        className="font-mono text-lg font-bold tabular-nums"
        fill={color}
      >
        {score}
      </text>
    </svg>
  )
}

// ── Radar / Spider chart for 6 pillars ───────────────────────

function RadarChart({ pillars, sz }: { pillars: HealthPillar[]; sz: number }) {
  const cx = sz / 2
  const cy = sz / 2
  const maxR = (sz - 20) / 2
  const n = pillars.length

  // Background rings at 25%, 50%, 75%, 100%
  const rings = [0.25, 0.5, 0.75, 1.0]

  // Angle per pillar (start at top = -π/2)
  const angleStep = (2 * Math.PI) / n
  const startOffset = -Math.PI / 2

  function polarToCart(angle: number, radius: number) {
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    }
  }

  // Data polygon
  const dataPoints = pillars.map((p, i) => {
    const angle = startOffset + i * angleStep
    const r = (p.score / 100) * maxR
    return polarToCart(angle, r)
  })
  const dataPath = dataPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ') + ' Z'

  // A11y: het radardiagram is puur visueel; de leesbare legenda zijn de
  // pijlerbalken ernaast (naam + score). Daarom `role="img"` met een volledige
  // aria-label i.p.v. onleesbaar kleine SVG-aslabels — spiegelt Dekkingsradar.
  const radarLabel = `Radardiagram van je gezondheidspijlers: ${pillars
    .map(p => `${p.name} ${p.score} van 100`)
    .join(', ')}.`

  return (
    <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} role="img" aria-label={radarLabel}>
      {/* Background rings */}
      {rings.map(pct => {
        const r = pct * maxR
        const pts = Array.from({ length: n }, (_, i) => {
          const angle = startOffset + i * angleStep
          const p = polarToCart(angle, r)
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
        }).join(' ')
        return (
          <polygon
            key={pct}
            points={pts}
            fill="none"
            stroke="var(--border-ed)"
            strokeWidth={0.5}
            opacity={0.6}
          />
        )
      })}

      {/* Axis lines */}
      {pillars.map((_, i) => {
        const angle = startOffset + i * angleStep
        const end = polarToCart(angle, maxR)
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={end.x}
            y2={end.y}
            stroke="var(--border-ed)"
            strokeWidth={0.5}
            opacity={0.4}
          />
        )
      })}

      {/* Data polygon */}
      <path
        d={dataPath}
        fill="var(--color-horizon-500)"
        fillOpacity={0.15}
        stroke="var(--color-horizon-500)"
        strokeWidth={1.5}
      />

      {/* Data dots */}
      {dataPoints.map((pt, i) => (
        <circle
          key={i}
          cx={pt.x}
          cy={pt.y}
          r={2.5}
          fill="var(--color-horizon-500)"
        />
      ))}
    </svg>
  )
}

// ── Pillar bar row (compact) ─────────────────────────────────

function PillarRow({ pillar }: { pillar: HealthPillar }) {
  const clamp = Math.max(0, Math.min(pillar.score, 100))

  // In-view fill-animatie (700ms bezier, 0% → doel; transition:none pre-entered).
  const { ref: barRef, hasEntered } = useInViewAnimation({ duration: 700 })

  return (
    <div className="flex items-center gap-2">
      <span className="w-[72px] shrink-0 text-[10px] text-[var(--ink-3)] truncate">{pillar.name}</span>
      <div ref={barRef} className="flex-1 h-1.5 rounded-full bg-[var(--subtle)] overflow-hidden">
        <div
          className={`h-full rounded-full ${barColorClass(clamp)}`}
          style={{
            width: hasEntered ? `${clamp}%` : '0%',
            transition: hasEntered ? 'width 700ms cubic-bezier(.22,1,.36,1)' : 'none',
          }}
        />
      </div>
      <span className="w-[32px] shrink-0 text-right font-mono text-[10px] tabular-nums text-[var(--ink-2)]">{pillar.score}</span>
    </div>
  )
}

// ── Trend indicator ──────────────────────────────────────────

function TrendBadge({ trend }: { trend: number }) {
  if (trend > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-positive">
        <TrendingUp className="h-3 w-3" /> +{trend}
      </span>
    )
  }
  if (trend < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-negative">
        <TrendingDown className="h-3 w-3" /> {trend}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--ink-3)]">
      <Minus className="h-3 w-3" /> Stabiel
    </span>
  )
}

// ── Simplified Kassabon for widget (summary + link to Horizon) ──

/**
 * Widget kassabon shows a summary of the health score with pillar overview bars
 * and links to the Horizon page for the full detail view.
 * Het getal komt uit de canonieke `data.healthScore` (loader → buildHealthScore-
 * Input + computeHealthScoreFromInputs), per definitie hetzelfde getal als
 * /toekomst (ADR 0008).
 */
function HealthKassabonSummary({ health }: { health: HealthScore }) {
  return (
    <div className="space-y-4">
      {/* Total score header */}
      <KassabonShell>
        <div className="flex items-center justify-between border-b border-dashed border-[var(--border-md)] pb-2 mb-2">
          <span className="text-xs text-[var(--ink-3)]">FINANCIËLE GEZONDHEID</span>
          <span className={`font-mono text-lg font-bold tabular-nums ${scoreColorClass(health.total)}`}>
            {health.total}/100
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--ink-3)]">Beoordeling</span>
          <span className={`font-medium ${scoreColorClass(health.total)}`}>{health.label}</span>
        </div>
        {health.previousMonth !== null && (
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-[var(--ink-3)]">Vorige maand</span>
            <span className="font-mono tabular-nums text-[var(--ink-2)]">{health.previousMonth}/100</span>
          </div>
        )}
        {health.trend !== 0 && (
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-[var(--ink-3)]">Verandering</span>
            <TrendBadge trend={health.trend} />
          </div>
        )}
        <div className="border-t border-dashed border-[var(--border-md)] mt-2 pt-2 text-[10px] text-[var(--ink-3)]">
          Score = gewogen gemiddelde van {health.activePillarCount ?? 6} pilaren
        </div>
      </KassabonShell>

      {/* Compact pillar overview (bars only, no detailed breakdown) */}
      <div className="rounded-[var(--r-sm)] border border-[var(--border-ed)] p-3 space-y-1.5">
        <h3 className="text-xs font-semibold text-[var(--ink-2)] mb-2">Pilaren</h3>
        {health.pillars.map(pillar => (
          <PillarRow key={pillar.id} pillar={pillar} />
        ))}
      </div>

      {/* CTA: link to Horizon for full detail view */}
      <Link
        href="/toekomst"
        className="flex items-center justify-center gap-2 rounded-[var(--r)] border border-horizon-200 bg-horizon-50/50 px-4 py-2.5 text-xs font-medium text-horizon-700 transition-colors hover:bg-horizon-100 hover:border-horizon-300"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Bekijk volledige analyse op Toekomst
      </Link>
    </div>
  )
}

// ── Main Widget ──────────────────────────────────────────────

export const GezondheidScoreWidget = memo(function GezondheidScoreWidget({ size, data, href }: Props) {
  const [showKassabon, setShowKassabon] = useState(false)
  // Canonieke score uit de bundel (ADR 0008) — per definitie gelijk aan
  // /toekomst, inclusief de echte tax_optimization-pijler. Geen widget-eigen
  // herberekening meer (die zette de tax-pijler hardcoded op 50).
  const health = data.healthScore
  const color = scoreColorClass(health.total)

  // ── Starter / low-data ───────────────────────────────────
  // Een lege gebruiker (geen bezittingen, schulden of inkomsten/uitgaven) krijgt
  // via het engine-no-data-beleid een laag "rood" cijfer (~21) dat niets over
  // gezondheid zegt maar wél alarmerend oogt. Detecteer die kale staat op de
  // ráw bundelvelden (geen herberekening) en toon duiding i.p.v. het cijfer.
  const isStarter =
    data.totalAssets <= 0 &&
    data.totalDebts <= 0 &&
    data.monthlyIncome <= 0 &&
    data.monthlyExpenses <= 0

  if (isStarter) {
    if (size === 'mini') {
      return (
        <WidgetShell module="horizon" size="mini" kicker="Gezondheid" href={href}>
          <p className="font-mono text-[15px] font-semibold tabular-nums leading-none text-[var(--ink-3)]">–</p>
        </WidgetShell>
      )
    }
    if (size === 'quarter') {
      return (
        <WidgetShell module="horizon" size={size} kicker="Gezondheid" href={STARTER_HREF}>
          <Activity className="h-4 w-4 text-horizon-500" />
          <div className="mt-1 flex items-baseline gap-0.5">
            <p className="font-mono text-lg font-semibold tabular-nums leading-none text-[var(--ink-3)]">–</p>
            <span className="text-sm text-[var(--ink-4)]">/100</span>
          </div>
          <p className="mt-1 text-[10px] leading-snug text-[var(--ink-3)]">Nog te weinig gegevens</p>
        </WidgetShell>
      )
    }
    // half & full — volledige duiding met CTA (WidgetEmpty first-use).
    return (
      <WidgetShell module="horizon" size={size} kicker="Gezondheid">
        <WidgetEmpty
          variant="first-use"
          icon={Activity}
          title="Te weinig gegevens"
          description="Voeg je bezittingen, schulden en inkomsten toe voor een betrouwbaar gezondheidscijfer."
          action={{ label: 'Voeg je gegevens toe', href: STARTER_HREF }}
        />
      </WidgetShell>
    )
  }

  // ── Mini ─────────────────────────────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="horizon" size="mini" kicker="Gezondheid" href={href}>
        <p className={`font-mono text-[15px] font-semibold tabular-nums leading-none truncate ${color}`}>
          {health.total}
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter ────────────────────────────────────────────────
  if (size === 'quarter') {
    return (
      <WidgetShell module="horizon" size={size} kicker="Gezondheid" onClick={() => setShowKassabon(true)}>
        <Activity className="h-4 w-4 text-horizon-500" />
        <div className="mt-1 flex items-baseline gap-0.5">
          <p className={`font-mono text-lg font-semibold tabular-nums leading-none ${color}`}>
            {health.total}
          </p>
          <span className="text-sm text-[var(--ink-3)]">/100</span>
        </div>
        {health.trend !== 0 && (
          <div className="mt-1">
            <TrendBadge trend={health.trend} />
          </div>
        )}
        <BottomSheet open={showKassabon} onClose={() => setShowKassabon(false)} title="Financiële Gezondheid">
          <div className="p-5"><HealthKassabonSummary health={health} /></div>
        </BottomSheet>
      </WidgetShell>
    )
  }

  // ── Half ─────────────────────────────────────────────────
  if (size === 'half') {
    // Toon de ZWAKSTE 3 pijlers (meest actiegericht) i.p.v. de eerste 3 op
    // volgorde — sluit aan op de "verbeterpunten"-filosofie van de full-size.
    const weakestThree = [...health.pillars].sort((a, b) => a.score - b.score).slice(0, 3)
    return (
      <WidgetShell module="horizon" size={size} kicker="Gezondheid" onClick={() => setShowKassabon(true)}>
        <div className="flex items-start gap-3">
          <HealthGauge score={health.total} sz={64} />
          <div className="flex-1 min-w-0 space-y-1">
            {weakestThree.map(p => (
              <PillarRow key={p.id} pillar={p} />
            ))}
            <div className="flex items-center justify-between pt-0.5">
              {/* Trend alleen tonen bij een echte vorige-maand-vergelijking —
                  lijnt uit met de hero-kaart (geen misleidende "Stabiel"). */}
              {health.previousMonth !== null ? <TrendBadge trend={health.trend} /> : <span />}
              <span className="text-[9px] text-[var(--ink-4)] flex items-center gap-0.5">
                Details <ChevronRight className="h-2.5 w-2.5" />
              </span>
            </div>
          </div>
        </div>
        <BottomSheet open={showKassabon} onClose={() => setShowKassabon(false)} title="Financiële Gezondheid">
          <div className="p-5"><HealthKassabonSummary health={health} /></div>
        </BottomSheet>
      </WidgetShell>
    )
  }

  // ── Full ─────────────────────────────────────────────────
  // Pijlers zwakste-eerst; de 3 zwakste met ruimte (<80) vormen de gespreks-
  // context voor Fin. Puur deterministisch opgebouwd uit de canonieke pijler-
  // data (ADR 0008) — geen widget-eigen herberekening.
  const weakest = [...health.pillars].sort((a, b) => a.score - b.score)
  const focus = weakest.filter(p => p.score < 80).slice(0, 3)
  const finDetail =
    focus.length > 0
      ? `De zwakste pijlers zijn: ${focus
          .map(p => `${p.name} (${p.score}/100, nu ${p.rawValue}) — ${p.improvementTip}`)
          .join('; ')}.`
      : `Alle pijlers staan er goed voor; de laagste is ${weakest[0].name} (${weakest[0].score}/100).`

  return (
    /* Bewust GEEN onClick op de WidgetShell in deze branch: full-size bevat
       zowel een knop ("Bespreek met Fin") als een link ("Bekijk details"), en
       een <button>/<a> binnen een <button> is ongeldige HTML — dat gaf een
       React-hydratiefout en onvoorspelbaar klikgedrag. De kassabon hangt nu
       aan de score zelf, conform "elk getal is klikbaar". */
    <WidgetShell module="horizon" size={size} kicker="Gezondheid">
      {/* Top row: gauge + label + trend — tevens de kassabon-trigger.
          Bevat zelf geen interactieve kinderen, dus dit is een geldige knop. */}
      <button
        type="button"
        onClick={() => setShowKassabon(true)}
        aria-haspopup="dialog"
        aria-label={`Toon de opbouw van je financiële gezondheid (${health.total} van 100)`}
        className="flex w-full items-start gap-3 text-left transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        <HealthGauge score={health.total} sz={80} />
        <div className="flex-1 pt-2">
          <p className={`font-mono text-lg font-semibold ${color}`}>{health.label}</p>
          <div className="mt-1 flex items-center gap-2">
            {/* Trend alleen bij een echte vorige-maand-vergelijking (net als de hero). */}
            {health.previousMonth !== null && <TrendBadge trend={health.trend} />}
            {health.previousMonth !== null && (
              <span className="text-[10px] text-[var(--ink-4)]">
                (was {health.previousMonth})
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Radar chart + pillar bars side by side */}
      <div className="mt-2 flex gap-3">
        <div className="shrink-0">
          <RadarChart pillars={health.pillars} sz={100} />
        </div>
        <div className="flex-1 min-w-0 space-y-1 pt-1">
          {health.pillars.map(p => (
            <PillarRow key={p.id} pillar={p} />
          ))}
        </div>
      </div>

      {/* Bespreek met Fin — neemt de zwakste-pijler-context mee de chat in.
          Geen stopPropagation meer nodig: de kaart is zelf niet langer
          klikbaar, dus er is geen container-onClick om te onderdrukken. */}
      <div className="mt-2">
        <BesprekMetWillButton
          onderwerp={`Mijn financiële gezondheid (${health.total}/100 — ${health.label})`}
          detail={finDetail}
          vraag="Waar kan ik het meeste vrijheidstijd winnen, en welke stap zet ik als eerste?"
          className="w-full justify-center"
        />
      </div>

      {/* CTA: link to Horizon for full detail view */}
      <Link
        href="/toekomst"
        className="mt-1.5 font-serif italic text-[11px] text-horizon-600 hover:text-horizon-800 flex items-center gap-1"
      >
        Bekijk details op Toekomst <ChevronRight className="h-3 w-3" />
      </Link>

      <BottomSheet open={showKassabon} onClose={() => setShowKassabon(false)} title="Financiële Gezondheid">
        <div className="p-5"><HealthKassabonSummary health={health} /></div>
      </BottomSheet>
    </WidgetShell>
  )
})
