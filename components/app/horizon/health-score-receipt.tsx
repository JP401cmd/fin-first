'use client'

import { useMemo, useId, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Lightbulb, ArrowRight, MessageSquare, ListPlus, Check, Loader2 } from 'lucide-react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { useChatContext } from '@/components/app/chat/chat-provider'
import type { HealthScore, HealthPillar } from '@/lib/financial-health'

// ── Color helpers (spec: groen >70, amber 40-70, rood <40) ──

function scoreColor(score: number): string {
  if (score > 70) return 'var(--color-positive, #10b981)'
  if (score >= 40) return 'var(--color-amber, #f59e0b)'
  return 'var(--negative, #ef4444)'
}

function scoreColorClass(score: number): string {
  if (score > 70) return 'text-emerald-600'
  if (score >= 40) return 'text-amber-600'
  return 'text-red-600'
}

function barColorClass(score: number): string {
  if (score > 70) return 'bg-emerald-500'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

function scoreBgClass(score: number): string {
  if (score > 70) return 'bg-emerald-50'
  if (score >= 40) return 'bg-amber-50'
  return 'bg-red-50'
}

function scoreLabelNl(score: number): string {
  if (score > 70) return 'Sterk'
  if (score >= 40) return 'Gemiddeld'
  return 'Zwak'
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
 * Small radar/spider chart that visualises all pillar scores at a glance.
 * Each axis represents one pillar (0-100), with zones coloured per thresholds.
 */
function PillarRadarChart({
  pillars,
  size = 200,
}: {
  pillars: HealthPillar[]
  size?: number
}) {
  const uid = useId()
  const cx = size / 2
  const cy = size / 2
  const maxR = size / 2 - 24 // leave room for labels

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
    const labelR = maxR + 16
    return {
      x: cx + labelR * Math.cos(angle),
      y: cy + labelR * Math.sin(angle),
      anchor: Math.cos(angle) < -0.3 ? 'end' : Math.cos(angle) > 0.3 ? 'start' : 'middle',
    }
  })

  const dataPoints = polygonPoints(pillars.map(p => p.score))

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-full max-w-[200px] h-auto mx-auto"
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

      {/* Labels */}
      {pillars.map((pillar, i) => (
        <text
          key={pillar.id}
          x={labelPositions[i].x}
          y={labelPositions[i].y}
          textAnchor={labelPositions[i].anchor as 'start' | 'middle' | 'end'}
          dominantBaseline="central"
          className="fill-[var(--ink-2)]"
          fontSize="9"
          fontFamily="var(--font-mono)"
        >
          {pillar.name.length > 10 ? pillar.name.slice(0, 9) + '…' : pillar.name}
        </text>
      ))}
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
            className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${scoreBgClass(pillar.score)} ${scoreColorClass(pillar.score)}`}
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
  /** Optional: override the displayed total score (e.g. from snapshot) */
  overrideTotal?: number | null
  /** Optional: override the displayed label */
  overrideLabel?: string | null
  /** Optional: footer content (e.g. backtesting link) */
  footer?: React.ReactNode
}

// ── Main Component ──────────────────────────────────────────

export function HealthScoreReceipt({
  health,
  overrideTotal,
  overrideLabel,
  footer,
}: HealthScoreReceiptProps) {
  // Always use the live computed total from the weighted average of pillars.
  const displayTotal = health.total
  const displayLabel = health.label

  // Sort pillars: weakest first for improvement focus
  const sorted = useMemo(
    () => [...health.pillars].sort((a, b) => a.score - b.score),
    [health.pillars],
  )

  // Welke pijler staat open in de "maak er een actie van"-popup.
  const [actionPillar, setActionPillar] = useState<HealthPillar | null>(null)

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

      {/* Per-pillar breakdown (enhanced with visual indicators) */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-[var(--ink-2)]">Pilaren (zwakste eerst)</h3>
        {sorted.map(pillar => (
          <PillarBar key={pillar.id} pillar={pillar} onCreateAction={setActionPillar} />
        ))}
      </div>

      {/* Weighting explanation */}
      <div className="rounded-[var(--r-sm)] bg-[var(--subtle)] p-3">
        <h4 className="text-[10px] font-semibold text-[var(--ink-2)] mb-1.5">Weging</h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {health.pillars.map(p => (
            <div key={p.id} className="flex items-center justify-between text-[10px]">
              <span className="text-[var(--ink-3)]">{p.name}</span>
              <span className="font-mono tabular-nums text-[var(--ink-2)]">{Math.round(p.weight * 100)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Optional footer (e.g. backtesting link) */}
      {footer}

      {/* Popup: maak een actie van de pijler-suggestie */}
      <PillarActionPopup pillar={actionPillar} onClose={() => setActionPillar(null)} />
    </div>
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
