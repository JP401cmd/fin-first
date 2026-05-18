'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Banknote, CreditCard, Wallet, Receipt, Target, CheckCircle2, AlertCircle } from 'lucide-react'
import { PageInfoButton } from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { HealthScoreReceipt } from '@/components/app/horizon/health-score-receipt'
import type { HealthScore } from '@/lib/financial-health'
import type { GoalWithBudget } from '@/lib/will-data-loader'

type GoalProgress = { current: number; target: number; pct: number; onTrack: boolean; eta: string | null }

type OverzichtHeroProps = {
  userName?: string
  health: HealthScore | null
  goals?: GoalWithBudget[]
  goalProgresses?: GoalProgress[]
}

const BAND_STYLES: Record<string, { ring: string; label: string; text: string; bgInner: string }> = {
  uitstekend: { ring: 'stroke-emerald-600',  label: 'Uitstekend',  text: 'text-emerald-700', bgInner: 'bg-emerald-50' },
  sterk:      { ring: 'stroke-emerald-500',  label: 'Sterk',       text: 'text-emerald-600', bgInner: 'bg-emerald-50' },
  redelijk:   { ring: 'stroke-amber-500',    label: 'Redelijk',    text: 'text-amber-700',   bgInner: 'bg-amber-50' },
  kwetsbaar:  { ring: 'stroke-orange-500',   label: 'Kwetsbaar',   text: 'text-orange-700',  bgInner: 'bg-orange-50' },
  kritiek:    { ring: 'stroke-red-600',      label: 'Kritiek',     text: 'text-red-700',     bgInner: 'bg-red-50' },
}

const HEFBOMEN = [
  { key: 'bezittingen', label: 'Bezittingen', href: '/overzicht/bezittingen', Icon: Wallet,     accent: 'text-emerald-700 bg-emerald-50' },
  { key: 'schulden',    label: 'Schulden',    href: '/overzicht/schulden',    Icon: CreditCard, accent: 'text-amber-700 bg-amber-50' },
  { key: 'cashflow',    label: 'Cashflow',    href: '/overzicht/cashflow',    Icon: Banknote,   accent: 'text-sky-700 bg-sky-50' },
  { key: 'belasting',   label: 'Belasting',   href: '/overzicht/belasting',   Icon: Receipt,    accent: 'text-violet-700 bg-violet-50' },
] as const

function formatDateNL(): string {
  const formatter = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
  const parts = formatter.format(new Date())
  return parts.charAt(0).toUpperCase() + parts.slice(1)
}

function greetingByHour(): string {
  const h = new Date().getHours()
  if (h < 6) return 'Goedenacht'
  if (h < 12) return 'Goedemorgen'
  if (h < 18) return 'Goedemiddag'
  return 'Goedenavond'
}

/**
 * OverzichtHero — visuele hero op /overzicht (Tier-2 #4 + #8).
 *
 * Bevat: begroeting + datum, financiële gezondheidsscore (ring + label
 * + trend), vier-hefbomen-rij met klikbare tegels naar verdiepingen.
 * Komt bovenop de bestaande WillLanding-content (briefing + acties +
 * widget-dashboard) — geen vervanging, wel verrijking.
 *
 * Toekomstige uitbreidingen (Tier-2 #9 + #5):
 *  - Netto-vermogen-tijdslijn-strip naast Health Score (scope tot
 *    vrijheidsmoment, klik → /toekomst voor volledige projectie)
 *  - "Wat zie ik hier?"-knop rechtsboven met inline uitleg
 *  - Status-dots op hefboom-tegels (groen/oranje/rood) op basis van
 *    LeverScores zodra die in scope zijn van /overzicht/page.tsx
 */
export function OverzichtHero({ userName, health, goals, goalProgresses }: OverzichtHeroProps) {
  const [receiptOpen, setReceiptOpen] = useState(false)

  // Bouw doelen-display: koppel goals met hun progress op index, sorteer
  // achterop-achter doelen eerst (krijgen meer aandacht). Skip voltooide.
  const goalDisplay = (goals ?? [])
    .map((g, i) => ({ goal: g, progress: goalProgresses?.[i] ?? null }))
    .filter((g) => g.progress && g.progress.pct < 100)
    .sort((a, b) => Number(!a.progress!.onTrack) - Number(!b.progress!.onTrack))
    .slice(0, 3)

  return (
    <section className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-6 pb-2 md:pt-8 md:pb-4">
      {/* "Wat zie ik hier?"-knop rechtsboven (Tier-1 #5) */}
      <PageInfoButton
        description={PAGE_INFO['/overzicht'] ?? ''}
        className="absolute right-4 top-6 sm:right-6 sm:top-8"
      />

      {/* Header: datum + begroeting */}
      <header className="mb-6 pr-12 sm:pr-16">
        <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-4)]">
          {formatDateNL()}
        </div>
        <h1 className="mt-1 font-serif text-2xl md:text-3xl font-semibold text-[var(--ink)] leading-tight">
          {greetingByHour()}{userName ? `, ${userName}` : ''}
        </h1>
      </header>

      {/* Vier-hefbomen-rij — klikbare tegels naar verdiepingen */}
      <nav aria-label="Vier hefbomen" className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-6">
        {HEFBOMEN.map(({ key, label, href, Icon, accent }) => (
          <Link
            key={key}
            href={href}
            className="group flex flex-col rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4 hover:border-[var(--ink-3)] hover:shadow-sm transition-all"
          >
            <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center ${accent}`}>
              <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="mt-2 text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]">
              Hefboom
            </div>
            <div className="text-sm sm:text-base font-semibold text-[var(--ink)] mt-0.5 group-hover:text-[var(--ink-0)]">
              {label}
            </div>
          </Link>
        ))}
      </nav>

      {/* Health Score + Voortgang doelen — 2-kolom op desktop, stacked op mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {health && (
          <HealthScoreCard
            health={health}
            onOpenReceipt={() => setReceiptOpen(true)}
          />
        )}
        {goalDisplay.length > 0 && <VoortgangDoelenCard items={goalDisplay} />}
      </div>

      {/* Drill-down sheet: kassabon met pillars per sub-score */}
      {health && (
        <BottomSheet
          open={receiptOpen}
          onClose={() => setReceiptOpen(false)}
          title="Financiële gezondheid"
          size="lg"
        >
          <HealthScoreReceipt health={health} />
        </BottomSheet>
      )}
    </section>
  )
}

function VoortgangDoelenCard({
  items,
}: {
  items: Array<{ goal: GoalWithBudget; progress: GoalProgress | null }>
}) {
  return (
    <article className="flex flex-col rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
      <header className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Voortgang doelen
          </div>
          <div className="mt-0.5 text-lg sm:text-xl font-semibold text-[var(--ink)] flex items-center gap-2">
            <Target className="w-5 h-5 text-[var(--ink-3)]" />
            {items.length} {items.length === 1 ? 'doel actief' : 'doelen actief'}
          </div>
        </div>
        <Link
          href="/will"
          className="text-xs font-semibold text-[var(--ink-2)] hover:text-[var(--ink)] hover:underline shrink-0"
        >
          Bekijk →
        </Link>
      </header>

      <ul className="flex-1 space-y-2.5">
        {items.map(({ goal, progress }) => {
          if (!progress) return null
          const pct = Math.max(0, Math.min(100, progress.pct))
          const status = progress.onTrack ? 'ontrack' : 'achter'
          const StatusIcon = status === 'ontrack' ? CheckCircle2 : AlertCircle
          const statusColor = status === 'ontrack' ? 'text-emerald-600' : 'text-amber-600'
          const barColor = status === 'ontrack' ? 'bg-emerald-500' : 'bg-amber-500'

          return (
            <li key={goal.id} className="flex items-center gap-2.5">
              <StatusIcon className={`w-4 h-4 shrink-0 ${statusColor}`} aria-hidden />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-[var(--ink)] truncate">
                    {goal.name || 'Doel'}
                  </span>
                  <span className="text-xs font-mono text-[var(--ink-3)] shrink-0">
                    {pct.toFixed(0)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-[var(--subtle)] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </article>
  )
}

function HealthScoreCard({
  health,
  onOpenReceipt,
}: {
  health: HealthScore
  onOpenReceipt: () => void
}) {
  const band = health.label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') as keyof typeof BAND_STYLES
  const style = BAND_STYLES[band] ?? BAND_STYLES.redelijk!

  // SVG ring math
  const size = 96
  const stroke = 10
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const progress = Math.max(0, Math.min(100, health.total)) / 100
  const dashOffset = circumference * (1 - progress)

  const trend = health.trend
  const trendLabel =
    trend > 0 ? `+${trend.toFixed(0)} punten t.o.v. vorige maand`
    : trend < 0 ? `${trend.toFixed(0)} punten t.o.v. vorige maand`
    : 'gelijk aan vorige maand'

  return (
    <button
      type="button"
      onClick={onOpenReceipt}
      aria-label="Open detail van financiële gezondheidsscore"
      className={`flex items-center gap-4 sm:gap-6 rounded-2xl border border-[var(--border-ed)] ${style.bgInner} p-4 sm:p-6 text-left hover:border-[var(--ink-3)] hover:shadow-sm transition-all w-full`}
    >
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-[var(--border-ed)]"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className={`${style.ring} transition-all`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-serif text-2xl font-bold text-[var(--ink)] leading-none">{Math.round(health.total)}</span>
          <span className="text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)] mt-0.5">van 100</span>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Financiële gezondheid
        </div>
        <div className={`mt-0.5 text-lg sm:text-xl font-semibold ${style.text}`}>
          {style.label}
        </div>
        {health.previousMonth !== null && (
          <div className="text-xs text-[var(--ink-3)] mt-1">{trendLabel}</div>
        )}
        <div className="text-[11px] text-[var(--ink-3)] mt-2 underline decoration-dotted underline-offset-2">
          Toon onderverdeling →
        </div>
      </div>
    </button>
  )
}
