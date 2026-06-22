'use client'

import { useMemo, useId, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Lightbulb, ArrowRight, MessageSquare, ListPlus, Check, Loader2, Receipt } from 'lucide-react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { useChatContext } from '@/components/app/chat/chat-provider'
import type { HealthScore, HealthPillar, PillarGroup } from '@/lib/financial-health'

// ── Pillar-group presentatie-metadata ────────────────────────
// Vaste volgorde + leesbaar label voor de vier gedragspijlers (ADR 0010).
// De receipt groepeert de indicatoren hieronder met een subtotaal per groep.

const PILLAR_GROUP_ORDER: PillarGroup[] = ['rondkomen', 'buffer', 'schuld', 'vrijheid']

const PILLAR_GROUP_LABELS: Record<PillarGroup, string> = {
  rondkomen: 'Rondkomen',
  buffer: 'Buffer',
  schuld: 'Schuld',
  vrijheid: 'Vrijheid',
}

/**
 * Eén-regel duiding per groep: waarom deze pijler er toe doet in
 * vrijheidstijd-termen — kort, niet-oordelend.
 */
const PILLAR_GROUP_BLURBS: Record<PillarGroup, string> = {
  rondkomen: 'Wat je elke maand overhoudt — de motor van je vrijheid.',
  buffer: 'Je stootkussen — hoelang je het volhoudt zonder inkomen.',
  schuld: 'Vrijheid die je terugkoopt — hoe zwaar je lasten wegen.',
  vrijheid: 'Je weg naar volledige vrijheid — voortgang en spreiding.',
}

type PillarGroupBucket = {
  group: PillarGroup
  label: string
  blurb: string
  /** Gewogen subtotaal (Σ score×weight ÷ Σ weight) van actieve indicatoren. */
  subtotal: number
  pillars: HealthPillar[]
}

/**
 * Groepeer de pijlers onder de vier gedragsgroepen en bereken een gewogen
 * subtotaal per groep (presentatie-berekening — geen engine-veld). Pijlers
 * zonder `pillarGroup` (oudere/overige indicatoren of test-fixtures) vallen in
 * een "overig"-bucket dat alleen verschijnt als er zulke pijlers zijn.
 */
function groupPillars(pillars: HealthPillar[]): {
  groups: PillarGroupBucket[]
  ungrouped: HealthPillar[]
} {
  const byGroup = new Map<PillarGroup, HealthPillar[]>()
  const ungrouped: HealthPillar[] = []

  for (const p of pillars) {
    if (p.pillarGroup) {
      const list = byGroup.get(p.pillarGroup) ?? []
      list.push(p)
      byGroup.set(p.pillarGroup, list)
    } else {
      ungrouped.push(p)
    }
  }

  const groups: PillarGroupBucket[] = []
  for (const group of PILLAR_GROUP_ORDER) {
    const list = byGroup.get(group)
    if (!list || list.length === 0) continue
    const weightSum = list.reduce((acc, p) => acc + p.weight, 0)
    const subtotal = weightSum > 0
      ? Math.round(list.reduce((acc, p) => acc + p.score * p.weight, 0) / weightSum)
      : Math.round(list.reduce((acc, p) => acc + p.score, 0) / list.length)
    groups.push({
      group,
      label: PILLAR_GROUP_LABELS[group],
      blurb: PILLAR_GROUP_BLURBS[group],
      subtotal,
      pillars: [...list].sort((a, b) => a.score - b.score),
    })
  }

  return { groups, ungrouped }
}

/**
 * Rond een set gewichten (0-1, samen ~1) om naar hele procenten die optisch op
 * 100 sluiten — grootste-rest-methode (largest remainder). Voorkomt dat de
 * weging-sectie 99/101 toont door losstaande afrondingen.
 */
function roundWeightsToPercent<T>(
  items: T[],
  weightOf: (item: T) => number,
): Map<T, number> {
  const total = items.reduce((acc, it) => acc + weightOf(it), 0)
  const result = new Map<T, number>()
  if (total <= 0) {
    for (const it of items) result.set(it, 0)
    return result
  }
  const raw = items.map((it) => ({ item: it, exact: (weightOf(it) / total) * 100 }))
  const floored = raw.map((r) => ({ ...r, base: Math.floor(r.exact), rem: r.exact - Math.floor(r.exact) }))
  let remainder = 100 - floored.reduce((acc, r) => acc + r.base, 0)
  // Deel de resterende procenten uit aan de grootste resten.
  const order = [...floored].sort((a, b) => b.rem - a.rem)
  for (const r of order) {
    if (remainder <= 0) break
    r.base += 1
    remainder -= 1
  }
  for (const r of floored) result.set(r.item, r.base)
  return result
}

// ── Color helpers (canonieke 4-traps score-tokens, drempels >=80/>=60/>=40) ──
// Spiegelt BAND_STYLES in components/overview/overzicht-hero/health-score-card.tsx
// en de score-tier tokens (text-score-good/-ok/-warn/-bad, bg-score-*) uit
// app/globals.css — één score-kleurconventie door de hele app.

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

// 5-traps label conform getLabel in lib/financial-health.ts en BAND_STYLES.
function scoreLabelNl(score: number): string {
  if (score >= 80) return 'Uitstekend'
  if (score >= 60) return 'Sterk'
  if (score >= 40) return 'Redelijk'
  if (score >= 20) return 'Kwetsbaar'
  return 'Kritiek'
}

/**
 * Context-prompt voor Will met het oordeel + de suggestie van de pijler, zodat
 * hij gericht dieper kan kijken naar concrete acties (i.p.v. een lege chat).
 */
function buildWillContext(pillar: HealthPillar): string {
  const oordeel = scoreLabelNl(pillar.score)
  return [
    `Mijn financiële gezondheid — pijler "${pillar.name}": score ${pillar.score}/100 (${oordeel}).`,
    `Huidige waarde: ${pillar.rawValue}. ${pillar.explanation}`,
    `De app suggereert nu: "${pillar.improvementTip}".`,
    `Kijk hier dieper naar: wat kan ik concreet doen om deze pijler te verbeteren, en wat levert dat op in vrijheidstijd? Geef een paar concrete acties.`,
  ].join(' ')
}

// ── Trend indicator ──────────────────────────────────────────

function TrendBadge({ trend }: { trend: number }) {
  if (trend > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600">
        <TrendingUp className="h-3 w-3" /> +{trend}
      </span>
    )
  }
  if (trend < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-600">
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

// ── Radar Chart ──────────────────────────────────────────────

/**
 * Split a pillar name into at most two display lines (visual only — the full
 * name stays intact in the SVG aria-label). Short names stay on one line;
 * longer multi-word names break on the most balanced space.
 */
function wrapLabel(name: string): string[] {
  if (name.length <= 12) return [name]
  const words = name.trim().split(/\s+/)
  if (words.length < 2) return [name]
  // Find the split that best balances the two halves
  let best = 1
  let bestDiff = Infinity
  for (let i = 1; i < words.length; i++) {
    const left = words.slice(0, i).join(' ').length
    const right = words.slice(i).join(' ').length
    const diff = Math.abs(left - right)
    if (diff < bestDiff) {
      bestDiff = diff
      best = i
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')]
}

/**
 * Small radar/spider chart that visualises all pillar scores at a glance.
 * Each axis represents one pillar (0-100), with zones coloured per thresholds.
 */
function PillarRadarChart({
  pillars,
  size = 280,
}: {
  pillars: HealthPillar[]
  size?: number
}) {
  const uid = useId()
  const cx = size / 2
  const cy = size / 2
  const maxR = size / 2 - 44 // leave room for full labels

  const n = pillars.length
  if (n < 3) return null

  // Compute polygon points for a given score (0-100)
  function polygonPoints(scores: number[]): string {
    return scores
      .map((score, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2
        const r = (score / 100) * maxR
        const px = cx + r * Math.cos(angle)
        const py = cy + r * Math.sin(angle)
        return `${px.toFixed(1)},${py.toFixed(1)}`
      })
      .join(' ')
  }

  // Grid levels at 40, 70, 100
  const gridLevels = [40, 70, 100]

  // Label positions (slightly outside the chart)
  const labelPositions = pillars.map((_, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2
    const labelR = maxR + 18
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    // Small per-quadrant vertical nudge so top/bottom labels clear the polygon/grid
    const dy = sin < -0.3 ? -4 : sin > 0.3 ? 4 : 0
    return {
      x: cx + labelR * cos,
      y: cy + labelR * sin,
      dy,
      anchor: cos < -0.3 ? 'end' : cos > 0.3 ? 'start' : 'middle',
    }
  })

  const dataPoints = polygonPoints(pillars.map(p => p.score))

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-full max-w-[280px] h-auto mx-auto"
      style={{ overflow: 'visible' }}
      role="img"
      aria-label={`Radar chart van ${n} financiële gezondheids-pilaren. ${pillars.map(p => `${p.name}: ${p.score}`).join(', ')}`}
    >
      <defs>
        <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-horizon-500)" stopOpacity={0.3} />
          <stop offset="100%" stopColor="var(--color-horizon-500)" stopOpacity={0.08} />
        </linearGradient>
      </defs>

      {/* Zone backgrounds: red (0-40), amber (40-70), green (70-100) */}
      <polygon
        points={polygonPoints(Array(n).fill(100))}
        fill="rgba(16,185,129,0.06)"
        stroke="none"
      />
      <polygon
        points={polygonPoints(Array(n).fill(70))}
        fill="rgba(245,158,11,0.06)"
        stroke="none"
      />
      <polygon
        points={polygonPoints(Array(n).fill(40))}
        fill="rgba(239,68,68,0.06)"
        stroke="none"
      />

      {/* Grid polygons */}
      {gridLevels.map(level => (
        <polygon
          key={level}
          points={polygonPoints(Array(n).fill(level))}
          fill="none"
          stroke="var(--border-ed)"
          strokeWidth={level === 100 ? 1 : 0.5}
          strokeDasharray={level === 100 ? undefined : '3,3'}
          opacity={0.6}
        />
      ))}

      {/* Axis lines */}
      {pillars.map((_, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2
        const ex = cx + maxR * Math.cos(angle)
        const ey = cy + maxR * Math.sin(angle)
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={ex}
            y2={ey}
            stroke="var(--border-ed)"
            strokeWidth={0.5}
            opacity={0.4}
          />
        )
      })}

      {/* Data polygon (filled) */}
      <polygon
        points={dataPoints}
        fill={`url(#${uid}-fill)`}
        stroke="var(--color-horizon-600)"
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Data points */}
      {pillars.map((pillar, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2
        const r = (pillar.score / 100) * maxR
        const px = cx + r * Math.cos(angle)
        const py = cy + r * Math.sin(angle)
        return (
          <circle
            key={pillar.id}
            cx={px}
            cy={py}
            r={3.5}
            fill={scoreColor(pillar.score)}
            stroke="var(--paper)"
            strokeWidth={1.5}
          />
        )
      })}

      {/* Labels — full pillar names, wrapped over two lines when long */}
      {pillars.map((pillar, i) => {
        const pos = labelPositions[i]
        const lines = wrapLabel(pillar.name)
        return (
          <text
            key={pillar.id}
            x={pos.x}
            y={pos.y + pos.dy}
            textAnchor={pos.anchor as 'start' | 'middle' | 'end'}
            dominantBaseline="central"
            className="fill-[var(--ink-2)]"
            fontSize="10"
            fontFamily="var(--font-mono)"
          >
            {lines.map((line, li) => (
              <tspan
                key={li}
                x={pos.x}
                dy={li === 0 ? (lines.length > 1 ? '-0.55em' : 0) : '1.1em'}
              >
                {line}
              </tspan>
            ))}
          </text>
        )
      })}
    </svg>
  )
}

// ── Pillar Bar (enhanced) ────────────────────────────────────

function PillarBar({
  pillar,
  onCreateAction,
}: {
  pillar: HealthPillar
  onCreateAction: (pillar: HealthPillar) => void
}) {
  const label = scoreLabelNl(pillar.score)
  const { openWithMessage } = useChatContext()

  return (
    <div
      className="rounded-[var(--r-sm)] border border-[var(--border-ed)] p-3"
      role="group"
      aria-label={`Pilaar: ${pillar.name}, score ${pillar.score} van 100, ${label}`}
    >
      {/* Header row: name + score badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--ink)]">{pillar.name}</span>
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-white/80 ${scoreColorClass(pillar.score)}`}
          >
            {label}
          </span>
          <span className={`font-mono text-sm font-bold tabular-nums ${scoreColorClass(pillar.score)}`}>
            {pillar.score}
          </span>
        </div>
      </div>

      {/* Explanation */}
      <p className="mt-1 text-[11px] text-[var(--ink-3)]">{pillar.explanation}</p>

      {/* Raw value */}
      <div className="mt-1.5 flex items-center justify-between text-[10px]">
        <span className="text-[var(--ink-3)]">Waarde</span>
        <span className="font-mono tabular-nums text-[var(--ink-2)]">{pillar.rawValue}</span>
      </div>

      {/* Enhanced progress bar with score marker */}
      <div
        className="mt-2 relative"
        role="meter"
        aria-label={`${pillar.name} score`}
        aria-valuenow={pillar.score}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {/* Track with zone indicators */}
        <div className="h-2.5 w-full rounded-full bg-[var(--subtle)] overflow-hidden flex">
          {/* Red zone (0-40) */}
          <div className="h-full bg-red-100" style={{ width: '40%' }} />
          {/* Amber zone (40-70) */}
          <div className="h-full bg-amber-50" style={{ width: '30%' }} />
          {/* Green zone (70-100) */}
          <div className="h-full bg-emerald-50" style={{ width: '30%' }} />
        </div>
        {/* Filled bar overlay */}
        <div
          className={`absolute top-0 left-0 h-2.5 rounded-full transition-all duration-500 ${barColorClass(pillar.score)}`}
          style={{ width: `${pillar.score}%` }}
        />
        {/* Zone dividers */}
        <div
          className="absolute top-0 h-2.5 w-px bg-[var(--border-md)]"
          style={{ left: '40%' }}
          aria-hidden="true"
        />
        <div
          className="absolute top-0 h-2.5 w-px bg-[var(--border-md)]"
          style={{ left: '70%' }}
          aria-hidden="true"
        />
        {/* Zone labels below bar */}
        <div className="flex mt-0.5 text-[8px] text-[var(--ink-4)]" aria-hidden="true">
          <span className="w-[40%] text-center">zwak</span>
          <span className="w-[30%] text-center">gemiddeld</span>
          <span className="w-[30%] text-center">sterk</span>
        </div>
      </div>

      {/* Improvement tip + acties (navigeer · bespreek met Will · maak actie) */}
      <div className="mt-2 flex items-start gap-1.5">
        <Lightbulb className="h-3 w-3 text-horizon-500 mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-[var(--ink-2)] leading-snug">{pillar.improvementTip}</p>
          <Link
            href={pillar.actionHref}
            className="inline-flex items-center gap-1 mt-1 text-[10px] font-medium text-horizon-600 hover:text-horizon-800 transition-colors group/tip"
            aria-label={`${pillar.actionLabel} voor ${pillar.name}`}
          >
            <span className="underline underline-offset-2 group-hover/tip:decoration-horizon-800">
              {pillar.actionLabel}
            </span>
            <ArrowRight className="h-2.5 w-2.5 transition-transform group-hover/tip:translate-x-0.5" aria-hidden="true" />
          </Link>

          {/* Twee extra knoppen per pijler */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => openWithMessage(buildWillContext(pillar))}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--color-wil-300)] bg-[var(--color-wil-50)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-wil-700)] transition-colors hover:bg-[var(--color-wil-100)]"
              aria-label={`Bespreek ${pillar.name} met Will`}
            >
              <MessageSquare className="h-3 w-3" aria-hidden="true" />
              Bespreek met Will
            </button>
            <button
              type="button"
              onClick={() => onCreateAction(pillar)}
              className="inline-flex items-center gap-1 rounded-full border border-horizon-300 bg-horizon-50 px-2.5 py-1 text-[10px] font-medium text-horizon-700 transition-colors hover:bg-horizon-100"
              aria-label={`Maak een actie van: ${pillar.name}`}
            >
              <ListPlus className="h-3 w-3" aria-hidden="true" />
              Maak er een actie van
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Props ────────────────────────────────────────────────────

interface HealthScoreReceiptProps {
  health: HealthScore
  /** Optional: footer content (e.g. backtesting link) */
  footer?: React.ReactNode
}

// ── Main Component ──────────────────────────────────────────

export function HealthScoreReceipt({
  health,
  footer,
}: HealthScoreReceiptProps) {
  // Always use the live computed total from the weighted average of pillars.
  const displayTotal = health.total
  const displayLabel = health.label

  // Welke pijler staat open in de "maak er een actie van"-popup.
  const [actionPillar, setActionPillar] = useState<HealthPillar | null>(null)

  // Indicatoren gegroepeerd onder de vier gedragspijlers, met subtotaal.
  const { groups, ungrouped } = useMemo(
    () => groupPillars(health.pillars),
    [health.pillars],
  )

  // Count pillars by category
  const strongCount = health.pillars.filter(p => p.score > 70).length
  const mediumCount = health.pillars.filter(p => p.score >= 40 && p.score <= 70).length
  const weakCount = health.pillars.filter(p => p.score < 40).length

  return (
    <div className="space-y-4" role="region" aria-label="Financiële gezondheidsscore breakdown">
      {/* Total score header */}
      <KassabonShell>
        <div className="flex items-center justify-between border-b border-dashed border-[var(--border-md)] pb-2 mb-2">
          <span className="text-xs text-[var(--ink-3)]">FINANCI&Euml;LE GEZONDHEID</span>
          <span
            className={`font-mono text-lg font-bold tabular-nums ${scoreColorClass(displayTotal)}`}
            aria-label={`Totaalscore ${displayTotal} van 100`}
          >
            {displayTotal}/100
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--ink-3)]">Beoordeling</span>
          <span className={`font-medium ${scoreColorClass(displayTotal)}`}>{displayLabel}</span>
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

        {/* Quick summary of pillar status */}
        <div className="border-t border-dashed border-[var(--border-md)] mt-2 pt-2">
          <div className="flex items-center gap-3 text-[10px]" aria-label="Pilaaroverzicht">
            {strongCount > 0 && (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
                {strongCount} sterk
              </span>
            )}
            {mediumCount > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-600">
                <span className="w-2 h-2 rounded-full bg-amber-500" aria-hidden="true" />
                {mediumCount} gemiddeld
              </span>
            )}
            {weakCount > 0 && (
              <span className="inline-flex items-center gap-1 text-red-600">
                <span className="w-2 h-2 rounded-full bg-red-500" aria-hidden="true" />
                {weakCount} zwak
              </span>
            )}
          </div>
          <p className="mt-1 text-[10px] text-[var(--ink-4)]">
            Score = gewogen gemiddelde van {health.activePillarCount ?? 6} pilaren
            {health.budgetingActive === false && (
              <> (budgetdiscipline uitgesloten)</>
            )}
          </p>
        </div>
      </KassabonShell>

      {/* Radar chart overview — at-a-glance pillar comparison */}
      <div
        className="rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] p-4"
        aria-label="Radar chart van alle pilaren"
      >
        <h3 className="text-xs font-semibold text-[var(--ink-2)] mb-3 text-center">
          Pilaaroverzicht
        </h3>
        <PillarRadarChart pillars={health.pillars} />
        {/* Legend: color zones */}
        <div className="flex justify-center gap-4 mt-3 text-[9px] text-[var(--ink-3)]" aria-hidden="true">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            &gt;70 sterk
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            40-70
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            &lt;40 zwak
          </span>
        </div>
      </div>

      {/* Per-groep breakdown: vier gedragspijlers, elk met subtotaal + indicatoren */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-[var(--ink-2)]">Pijlers (subtotaal per groep)</h3>
        {groups.map(bucket => (
          <PillarGroupSection
            key={bucket.group}
            bucket={bucket}
            onCreateAction={setActionPillar}
          />
        ))}

        {/* Overige indicatoren zonder gedragsgroep (backward-compat / fixtures) */}
        {ungrouped.length > 0 && (
          <section aria-label="Overige indicatoren" className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Overig
              </span>
            </div>
            {[...ungrouped]
              .sort((a, b) => a.score - b.score)
              .map(pillar => (
                <PillarBar key={pillar.id} pillar={pillar} onCreateAction={setActionPillar} />
              ))}
          </section>
        )}
      </div>

      {/* Educatieve belasting-"kans" — buiten de score (ADR 0010, Wft: richting­aanwijzer) */}
      <TaxOpportunitySection />

      {/* Weighting explanation — per gedragsgroep (zelfde vier pijlers als boven) */}
      <WeightingSection groups={groups} ungrouped={ungrouped} />

      {/* Optional footer (e.g. backtesting link) */}
      {footer}

      {/* Popup: maak een actie van de pijler-suggestie */}
      <PillarActionPopup pillar={actionPillar} onClose={() => setActionPillar(null)} />
    </div>
  )
}

// ── Pillar group section (kassabon-stijl: groepskop + subtotaal) ──
// Eén gedragspijler-groep: een groepskop met subtotaal (gewogen gemiddelde
// van de actieve indicatoren in de groep) en de indicatoren als subregels.

function PillarGroupSection({
  bucket,
  onCreateAction,
}: {
  bucket: PillarGroupBucket
  onCreateAction: (pillar: HealthPillar) => void
}) {
  const label = scoreLabelNl(bucket.subtotal)
  return (
    <section
      aria-label={`Pijler ${bucket.label}: subtotaal ${bucket.subtotal} van 100, ${label}`}
      className="rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden"
    >
      {/* Groepskop met subtotaal — rustige lichte tint van de bandkleur met een
          accent-randstreep links; tekst blijft neutraal (ink) voor leesbaarheid
          (Editorial Finance: beperkt kleur). */}
      <div
        className="flex items-start justify-between gap-3 border-l-[3px] px-3 py-2.5"
        style={{
          backgroundColor: `color-mix(in oklch, ${scoreColor(bucket.subtotal)} 10%, transparent)`,
          borderLeftColor: scoreColor(bucket.subtotal),
        }}
      >
        <div className="min-w-0">
          <h4 className="text-xs font-semibold text-[var(--ink)]">{bucket.label}</h4>
          <p className="mt-0.5 text-[10px] text-[var(--ink-3)] leading-snug">{bucket.blurb}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-1.5 py-0.5 text-[9px] font-semibold ${scoreColorClass(bucket.subtotal)}`}
          >
            {label}
          </span>
          <span
            className={`font-mono text-base font-bold tabular-nums ${scoreColorClass(bucket.subtotal)}`}
            aria-hidden="true"
          >
            {bucket.subtotal}
          </span>
        </div>
      </div>

      {/* Indicatoren als subregels onder de groepskop */}
      <div className="space-y-2 border-t border-dashed border-[var(--border-md)] p-2.5">
        {bucket.pillars.map(pillar => (
          <PillarBar key={pillar.id} pillar={pillar} onCreateAction={onCreateAction} />
        ))}
      </div>
    </section>
  )
}

// ── Weging per gedragsgroep (kassabon-stijl) ─────────────────
// Spiegelt de groepering hierboven: per groep het GROEPSGEWICHT (Σ herverdeelde
// gewichten van de actieve indicatoren) als heel procent — grootste-rest zodat
// de som optisch op 100% sluit — met daaronder de indicatoren en hun eigen
// gewicht. Inactieve indicatoren (niet in een groep) verschijnen niet.

function WeightingSection({
  groups,
  ungrouped,
}: {
  groups: PillarGroupBucket[]
  ungrouped: HealthPillar[]
}) {
  // Groepsgewicht = som van de pijlergewichten in de groep; afgerond met
  // grootste-rest over álle actieve groepen samen zodat het op 100% sluit.
  const groupPct = roundWeightsToPercent(
    groups,
    (b) => b.pillars.reduce((acc, p) => acc + p.weight, 0),
  )

  if (groups.length === 0 && ungrouped.length === 0) return null

  return (
    <div className="rounded-[var(--r-sm)] bg-[var(--subtle)] p-3">
      <h4 className="text-[10px] font-semibold text-[var(--ink-2)] mb-2">Weging per pijler</h4>
      <div className="space-y-2">
        {groups.map((bucket) => (
          <div
            key={bucket.group}
            className="border-l-[3px] pl-2.5"
            style={{ borderLeftColor: scoreColor(bucket.subtotal) }}
          >
            {/* Groepskop: label + groepsgewicht */}
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold text-[var(--ink)]">{bucket.label}</span>
              <span className="font-mono text-[11px] font-semibold tabular-nums text-[var(--ink)]">
                {groupPct.get(bucket) ?? 0}%
              </span>
            </div>
            {/* Indicatoren van de groep met hun eigen gewicht */}
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
              {bucket.pillars.map((p) => (
                <span key={p.id} className="text-[10px] text-[var(--ink-3)]">
                  {p.name}{' '}
                  <span className="font-mono tabular-nums text-[var(--ink-2)]">
                    {Math.round(p.weight * 100)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ))}

        {/* Overige indicatoren zonder gedragsgroep (backward-compat) */}
        {ungrouped.length > 0 && (
          <div className="border-l-[3px] border-[var(--border-md)] pl-2.5">
            <span className="text-[11px] font-semibold text-[var(--ink)]">Overig</span>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
              {ungrouped.map((p) => (
                <span key={p.id} className="text-[10px] text-[var(--ink-3)]">
                  {p.name}{' '}
                  <span className="font-mono tabular-nums text-[var(--ink-2)]">
                    {Math.round(p.weight * 100)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Educatieve belasting-"kans" (buiten de score) ────────────
// ADR 0010: belasting voedt sinds v2 GEEN pijler meer, maar verschijnt als
// educatieve richtingaanwijzer. Wft-eis: educatie/oriëntatie, GEEN handelings-
// of fiscaal advies, geen euro-besparing beloven.

function TaxOpportunitySection() {
  return (
    <section
      aria-label="Belasting: educatief inzicht"
      className="rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)] p-3"
    >
      <div className="flex items-start gap-2">
        <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
        <div className="min-w-0">
          <h4 className="text-xs font-semibold text-[var(--ink)]">Belasting · ter oriëntatie</h4>
          <p className="mt-1 text-[11px] leading-snug text-[var(--ink-2)]">
            Verken je Box 3-positie. Je heffingsvrije vermogen en hoe je het saldo over
            partners verdeelt bepalen mee hoeveel belasting je over je vermogen betaalt.
            Dit telt bewust niet mee in je gezondheidsscore — het is geen oordeel, maar
            iets om te begrijpen.
          </p>
          <Link
            href="/overzicht/belasting"
            className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-horizon-600 transition-colors hover:text-horizon-800"
          >
            <span className="underline underline-offset-2">Verken je belastingpositie</span>
            <ArrowRight className="h-2.5 w-2.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}

// ── Pillar action popup ──────────────────────────────────────
// "Maak er een actie van": neemt de pijler-suggestie over als bewerkbare
// actie en slaat 'm op via POST /api/ai/actions. Genest in de receipt-sheet.

function PillarActionPopup({
  pillar,
  onClose,
}: {
  pillar: HealthPillar | null
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [freedomDays, setFreedomDays] = useState('0')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset de velden telkens wanneer een andere pijler wordt geopend.
  useEffect(() => {
    if (pillar) {
      setTitle(pillar.actionLabel)
      setDescription(pillar.improvementTip)
      setFreedomDays('0')
      setDone(false)
      setError(null)
    }
  }, [pillar])

  const save = useCallback(async () => {
    if (!title.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          freedom_days_impact: Number(freedomDays) || 0,
          source: 'manual',
        }),
      })
      if (!res.ok) throw new Error('save failed')
      setDone(true)
    } catch {
      setError('Kon de actie niet opslaan. Probeer het opnieuw.')
    } finally {
      setSaving(false)
    }
  }, [title, description, freedomDays, saving])

  return (
    <BottomSheet open={!!pillar} onClose={onClose} title="Maak er een actie van" size="sm">
      {pillar && (
        <div className="space-y-4 pb-2">
          {done ? (
            <div className="py-4 text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--positive)]/10">
                <Check className="h-5 w-5 text-positive" aria-hidden="true" />
              </div>
              <p className="font-serif text-base text-[var(--ink)]">Toegevoegd aan je acties</p>
              <p className="mt-1 text-xs text-[var(--ink-3)]">Je vindt &apos;m terug bij Tips &amp; acties.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Link
                  href="/overzicht/tips"
                  className="inline-flex items-center gap-1 rounded-full bg-horizon-500 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-horizon-600"
                >
                  Bekijk je acties
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-[var(--border-ed)] px-3.5 py-2 text-xs font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
                >
                  Sluiten
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-[var(--r-sm)] border border-[var(--border-ed)] border-l-2 border-l-horizon-500 bg-[var(--paper)] p-3">
                <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                  {pillar.name} · {scoreLabelNl(pillar.score)} ({pillar.score}/100)
                </div>
                <p className="mt-1 text-xs leading-snug text-[var(--ink-2)]">{pillar.improvementTip}</p>
              </div>

              <div>
                <label htmlFor="pillar-action-title" className="mb-1 block text-[11px] font-medium text-[var(--ink-2)]">
                  Actie
                </label>
                <input
                  id="pillar-action-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Wat ga je doen?"
                  className="w-full rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-horizon-500 focus:outline-none focus:ring-1 focus:ring-horizon-500"
                />
              </div>

              <div>
                <label htmlFor="pillar-action-desc" className="mb-1 block text-[11px] font-medium text-[var(--ink-2)]">
                  Toelichting <span className="text-[var(--ink-4)]">(optioneel)</span>
                </label>
                <textarea
                  id="pillar-action-desc"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full resize-none rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink-2)] focus:border-horizon-500 focus:outline-none focus:ring-1 focus:ring-horizon-500"
                />
              </div>

              <div>
                <label htmlFor="pillar-action-days" className="mb-1 block text-[11px] font-medium text-[var(--ink-2)]">
                  Vrijheidswinst <span className="text-[var(--ink-4)]">(dagen/jaar — schatting)</span>
                </label>
                <input
                  id="pillar-action-days"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={freedomDays}
                  onChange={(e) => setFreedomDays(e.target.value)}
                  className="w-28 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm font-mono tabular-nums text-[var(--ink)] focus:border-horizon-500 focus:outline-none focus:ring-1 focus:ring-horizon-500"
                />
              </div>

              {error && (
                <p className="text-xs text-negative" role="alert">
                  {error}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || !title.trim()}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-horizon-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-horizon-600 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ListPlus className="h-4 w-4" aria-hidden="true" />
                  )}
                  Voeg toe aan acties
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-[var(--border-ed)] px-4 py-2.5 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
                >
                  Annuleren
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </BottomSheet>
  )
}
