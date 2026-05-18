'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Banknote, CreditCard, Wallet, Receipt, Target, CheckCircle2, AlertCircle, Activity } from 'lucide-react'
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
  /** Percentage op weg naar financiële vrijheid (0-100). Uit healthScoreInput. */
  freedomPct?: number | null
}

const BAND_STYLES: Record<string, { ring: string; label: string; text: string; bgInner: string }> = {
  uitstekend: { ring: 'stroke-emerald-600',  label: 'Uitstekend',  text: 'text-emerald-700', bgInner: 'bg-emerald-50' },
  sterk:      { ring: 'stroke-emerald-500',  label: 'Sterk',       text: 'text-emerald-600', bgInner: 'bg-emerald-50' },
  redelijk:   { ring: 'stroke-amber-500',    label: 'Redelijk',    text: 'text-amber-700',   bgInner: 'bg-amber-50' },
  kwetsbaar:  { ring: 'stroke-orange-500',   label: 'Kwetsbaar',   text: 'text-orange-700',  bgInner: 'bg-orange-50' },
  kritiek:    { ring: 'stroke-red-600',      label: 'Kritiek',     text: 'text-red-700',     bgInner: 'bg-red-50' },
}

const HEFBOMEN: ReadonlyArray<{
  key: 'bezittingen' | 'schulden' | 'cashflow' | 'belasting'
  label: string
  href: string
  Icon: typeof Wallet
  accent: string
  /** Pillar-key uit HealthScore voor status-bepaling. null = altijd neutraal. */
  pillarKey: string | null
}> = [
  { key: 'bezittingen', label: 'Bezittingen', href: '/overzicht/bezittingen', Icon: Wallet,     accent: 'text-emerald-700 bg-emerald-50', pillarKey: 'diversification' },
  { key: 'schulden',    label: 'Schulden',    href: '/overzicht/schulden',    Icon: CreditCard, accent: 'text-amber-700 bg-amber-50',     pillarKey: 'debt_ratio' },
  { key: 'cashflow',    label: 'Cashflow',    href: '/overzicht/cashflow',    Icon: Banknote,   accent: 'text-sky-700 bg-sky-50',         pillarKey: 'savings_rate' },
  { key: 'belasting',   label: 'Belasting',   href: '/overzicht/belasting',   Icon: Receipt,    accent: 'text-violet-700 bg-violet-50',   pillarKey: null },
] as const

/**
 * Map pillar-score (0-100) naar status-codering. Drempels stemmen overeen
 * met de bandbreedtes uit financial-health.ts (Sterk ≥ 70, Redelijk 50-70,
 * Kwetsbaar/Kritiek < 50). Pillar zonder score → neutraal.
 */
function pillarStatus(score: number | null | undefined): 'good' | 'warn' | 'bad' | 'neutral' {
  if (score == null) return 'neutral'
  if (score >= 70) return 'good'
  if (score >= 50) return 'warn'
  return 'bad'
}

const STATUS_DOT: Record<'good' | 'warn' | 'bad' | 'neutral', string> = {
  good:    'bg-emerald-500',
  warn:    'bg-amber-500',
  bad:     'bg-red-500',
  neutral: 'bg-stone-300',
}

const STATUS_LABEL: Record<'good' | 'warn' | 'bad' | 'neutral', string> = {
  good:    'Goed op koers',
  warn:    'Aandacht',
  bad:     'Risico',
  neutral: 'Geen score',
}

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
export function OverzichtHero({ userName, health, goals, goalProgresses, freedomPct }: OverzichtHeroProps) {
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

      {/* Vier-hefbomen-rij — klikbare tegels naar verdiepingen met status-dot */}
      <nav aria-label="Vier hefbomen" className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-6">
        {HEFBOMEN.map(({ key, label, href, Icon, accent, pillarKey }) => {
          // Zoek pillar-score uit health voor deze hefboom. Belasting heeft
          // (nog) geen eigen pillar → gebruik overall health.score als proxy
          // zodat de tegel niet altijd "neutraal" toont voor users met data.
          // Andere hefbomen gebruiken hun eigen pillar uit HEFBOMEN-config.
          const pillar = pillarKey && health
            ? health.pillars.find((p) => p.id === pillarKey)
            : undefined
          const proxyScore = !pillarKey && health ? health.total : null
          const status = pillarStatus(pillar?.score ?? proxyScore)
          return (
            <Link
              key={key}
              href={href}
              className="group relative flex flex-col rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4 hover:border-[var(--ink-3)] hover:shadow-sm transition-all"
            >
              {/* Status-dot rechtsboven */}
              <span
                className={`absolute right-2.5 top-2.5 sm:right-3 sm:top-3 w-2 h-2 rounded-full ${STATUS_DOT[status]}`}
                aria-label={STATUS_LABEL[status]}
                title={STATUS_LABEL[status]}
              />
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
          )
        })}
      </nav>

      {/* Health Score + Voortgang doelen — 2-kolom op desktop, stacked op mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {health ? (
          <HealthScoreCard
            health={health}
            onOpenReceipt={() => setReceiptOpen(true)}
          />
        ) : (
          <HealthScoreEmptyState />
        )}
        {goalDisplay.length > 0 ? (
          <VoortgangDoelenCard items={goalDisplay} />
        ) : (
          <DoelenEmptyState />
        )}
      </div>

      {/* Vrijheid-strip: % op weg naar financiële vrijheid → klik naar Toekomst.
          Bij ontbrekende freedomPct (geen DOB / geen FIRE-target / geen netto-
          inkomen): toon dashed CTA naar /mijn/profiel om profile te completeren. */}
      {freedomPct == null && (
        <Link
          href="/mijn/profiel"
          className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-3 sm:p-4 hover:border-violet-300 hover:shadow-sm transition-all group"
        >
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
              Op weg naar vrijheid
            </div>
            <div className="mt-0.5 text-sm sm:text-base text-[var(--ink-2)]">
              Vul je geboortedatum, inkomen en gewenste vrijheidsbestedingen in om je vrijheidsmoment te zien.
            </div>
          </div>
          <span className="shrink-0 text-xs font-semibold text-violet-700 group-hover:underline">
            Vul profiel aan →
          </span>
        </Link>
      )}
      {freedomPct != null && (
        <Link
          href="/toekomst"
          className="mt-3 flex flex-col gap-2 rounded-xl border border-[var(--border-ed)] bg-gradient-to-r from-violet-50 to-stone-50 p-3 sm:p-4 hover:border-violet-300 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-violet-700">
                Op weg naar vrijheid
              </div>
              <div className="mt-0.5 text-sm sm:text-base text-[var(--ink)]">
                Je bent <strong className="font-serif text-lg sm:text-xl text-violet-700">{Math.round(freedomPct)}%</strong>
                {' '}op weg naar het moment dat je niet meer hoeft te werken voor geld.
              </div>
            </div>
            <span className="shrink-0 text-xs font-semibold text-violet-700 group-hover:underline">
              Bekijk projectie →
            </span>
          </div>
          {/* Visuele progress-bar — toont freedomPct als geleidelijke vulling
              van violet-300. Klein detail dat het percentage tastbaar maakt. */}
          <div
            className="h-1.5 rounded-full bg-violet-100 overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round(freedomPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Voortgang naar financiële vrijheid"
          >
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-violet-700 transition-all duration-700"
              style={{ width: `${Math.min(100, Math.max(0, freedomPct))}%` }}
            />
          </div>
        </Link>
      )}

      {/* Subtiele filosofie-tagline: bindt alle metingen aan kern-philosophy */}
      <p className="mt-2 text-center text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)] font-medium">
        Geld is opgeslagen tijd
      </p>

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

function HealthScoreEmptyState() {
  return (
    <article className="flex flex-col rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
          <Activity className="w-5 h-5 text-amber-700" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Gezondheid
          </div>
          <div className="text-base font-semibold text-[var(--ink)]">
            Nog geen score
          </div>
        </div>
      </div>
      <p className="text-sm text-[var(--ink-2)] leading-relaxed mb-4">
        Voeg bezittingen of een schuld toe en je financiële gezondheid
        verschijnt — vier pijlers (buffer, schuld, sparen, vrijheid) die
        samen één cijfer vormen.
      </p>
      <Link
        href="/overzicht/bezittingen"
        className="self-start inline-flex items-center gap-2 bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-stone-800 transition-colors"
      >
        Voeg bezitting toe →
      </Link>
    </article>
  )
}

function DoelenEmptyState() {
  return (
    <article className="flex flex-col rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center">
          <Target className="w-5 h-5 text-violet-700" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Doelen
          </div>
          <div className="text-base font-semibold text-[var(--ink)]">
            Stel je eerste doel
          </div>
        </div>
      </div>
      <p className="text-sm text-[var(--ink-2)] leading-relaxed mb-4">
        Een doel maakt zichtbaar waar je naar toe werkt — vrijheid op je
        62e, kind in 2027, of een ander mijlpaal. Voortgang zie je dan
        elke keer dat je inlogt.
      </p>
      <Link
        href="/toekomst"
        className="self-start inline-flex items-center gap-2 bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-stone-800 transition-colors"
      >
        Maak een doel →
      </Link>
    </article>
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
          href="/toekomst"
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
