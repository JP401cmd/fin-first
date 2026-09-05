'use client'

import { useMemo, type ReactNode } from 'react'
import {
  formatMaskedCurrency,
  calculateFreedomTime,
  formatFreedomTimeString,
} from '@/lib/format'
import { useFlashChange } from '@/lib/hooks/use-flash-change'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { Kicker, HighlightMark, FiguresStrip, GlossaryTerm } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { NetWorthSnapshot } from '@/lib/net-worth-data'
import { healthScoreVerdict, type HealthScore } from '@/lib/financial-health'
import { GRONDSLAG_ONBEKEND_KOP } from '@/lib/grondslag-guard'
import { ModuleTipStrip } from './module-tip-strip'

interface CoreHeroProps {
  /** Effectief netto vermogen in EUR. */
  netWorth: number
  /** Totaal bezittingen, EUR. */
  totalAssets: number
  /** Totaal schulden, EUR (positief getoond). */
  totalDebts: number
  /** Aantal actieve bezittingen — gebruikt in 3-koloms strip. */
  assetCount: number
  /** Aantal actieve schulden — gebruikt in 3-koloms strip. */
  debtCount: number
  /** Jaarlijkse must-uitgaven — basis voor de vrijheid-rekenregel. */
  yearlyMustExpenses: number
  /**
   * Net-worth snapshots, oudste-eerst. Gebruikt voor delta vs vorige maand.
   * Behouden voor compatibiliteit, niet meer in de hero zichtbaar.
   */
  snapshots: NetWorthSnapshot[]
  /** Of `toekomstplannen` actief is — bepaalt zichtbaarheid van FIRE-bar. */
  toekomstActive: boolean
  /** FIRE-doelbedrag in EUR (0 = nog niet bepaald). */
  fireTarget: number
  /** Financiële gezondheidsscore (0-100) — 6-pilaren gewogen gemiddelde. */
  healthScore: HealthScore
  /** Klik op het bedrag → open netto-vermogen-kassabon. */
  onShowNetWorthReceipt?: () => void
  /** Klik op de FIRE-bar → open FIRE-kassabon. */
  onShowFireReceipt?: () => void
  /** Klik op de gezondheidsscore → open drill-down kassabon. */
  onShowHealthReceipt?: () => void
  /**
   * Netto-vermogen-tijdslijn slot. Rendert naast de gezondheidsscore op
   * desktop (lg+) en eronder op mobile. De twee visuele ankers van Kern:
   * score (hoe gezond) + tijdslijn (waar naartoe).
   */
  timelineSlot?: ReactNode
}

/**
 * Pure registratie-hero voor de Kern-landing.
 *
 * Layout (zie referentie-afbeelding):
 *  1. Kern-bruin accent-streep boven
 *  2. Groot bedrag (Playfair) + "netto vermogen" naast in serif
 *  3. Vrijheidstijd-regel in horizon-amber italic
 *  4. FIRE-voortgangsbar (kern-bruin) met % links + doelbedrag rechts
 *  5. Bezittingen/schulden-bar (positive groen / negative rood) met bedragen
 *  6. Drie kolommen: Totale Bezittingen, Totale Schulden, Schuldgraad
 */
export function CoreHero({
  netWorth,
  totalAssets,
  totalDebts,
  assetCount,
  debtCount,
  yearlyMustExpenses,
  toekomstActive,
  fireTarget,
  healthScore,
  onShowNetWorthReceipt,
  onShowFireReceipt,
  onShowHealthReceipt,
  timelineSlot,
}: CoreHeroProps) {
  // useFlashChange leeft binnen HeroAmount zelf — flashClass-updates triggeren
  // dan alleen een re-render van die span en niet van de omhullende button
  // (LCP-element). Houdt INP stabiel bij netWorth-mutaties.

  // Vrijheidstijd: hoeveel jaren/maanden kan dit netto vermogen je dragen?
  // Basis = jaarlijkse must-uitgaven; bij 0 valt de regel weg.
  const freedomLine = useMemo(() => {
    if (yearlyMustExpenses <= 0 || netWorth <= 0) return null
    const dailyExpenses = yearlyMustExpenses / 365
    const breakdown = calculateFreedomTime(netWorth, dailyExpenses)
    if (breakdown.isInfinite || breakdown.totalDays <= 0) return null
    return `dat is ${formatFreedomTimeString(breakdown, 'long', false)} vrijheid`
  }, [yearlyMustExpenses, netWorth])

  // Schuldgraad = totaal schulden / totaal bezittingen × 100. Categorie
  // bepaalt het label rechtsonder; krant-discipline → geen kleur in label.
  const debtRatio =
    totalAssets > 0 ? (totalDebts / totalAssets) * 100 : 0
  const debtRatioLabel =
    debtRatio <= 0
      ? 'Geen schulden'
      : debtRatio < 30
        ? 'Gezonde schuldenlast'
        : debtRatio < 60
          ? 'Gemiddelde schuldenlast'
          : 'Hoge schuldenlast'

  return (
    <section
      data-testid="kern-hero"
      className="border-b border-[var(--border-ed)] bg-[var(--paper)]"
    >
      {/* Module-active accent-streep — automatisch Kern-700 op /core. */}
      <div
        className="h-1"
        style={{ background: 'var(--module-active-700)' }}
      />

      <div className="px-4 py-7 sm:px-6 sm:py-9">
        {/* Kicker met 28×1px module-streep — editorial signature-element.
            Vervangt het inline "netto vermogen"-label hieronder als primaire context. */}
        <div className="mb-3">
          <Kicker>Netto vermogen</Kicker>
        </div>

        {/* Hoofdbedrag + "netto vermogen" inline (klein label voor mobile-context) */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {onShowNetWorthReceipt ? (
            <button
              type="button"
              onClick={onShowNetWorthReceipt}
              className="text-left transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <HeroAmount netWorth={netWorth} />
            </button>
          ) : (
            <HeroAmount netWorth={netWorth} />
          )}
          <span className="font-serif text-base italic text-[var(--ink-3)] sm:text-lg">
            <GlossaryTerm term="netto_vermogen">netto vermogen</GlossaryTerm>
          </span>
        </div>

        {/* Vrijheidstijd — horizon-amber italic */}
        {freedomLine && (
          <p className="mt-3 font-serif text-sm italic text-horizon-700 sm:text-base">
            {freedomLine}
          </p>
        )}

        {/* ── Score + Tijdslijn grid ────────────────────────────────
            Desktop (lg+): twee kolommen naast elkaar — de twee visuele
            ankers van Kern. Mobile: gestapeld (score boven, tijdslijn
            onder). max-h-[40vh] op de grid voorkomt dat de hero te hoog
            wordt op desktop. */}
        <div className={timelineSlot ? 'mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2 lg:max-h-[40vh]' : ''}>
          {/* Gezondheidsscore — prominent SVG-gauge met pilaar-bars */}
          <HealthScoreHero healthScore={healthScore} onClick={onShowHealthReceipt} />

          {/* Tijdslijn — vermogensprognose als inline embed.
              overflow-x-auto enables horizontal touch-scroll on mobile when the
              chart's min-width exceeds the viewport. */}
          {timelineSlot && (
            <div className="min-w-0 overflow-x-auto border border-[var(--border-ed)] bg-[var(--subtle)]/30 px-4 py-4 sm:px-5">
              {timelineSlot}
            </div>
          )}
        </div>

        {/* FIRE-voortgangsbar — kern-bruin, met % links + doelbedrag rechts */}
        {toekomstActive ? (
          <FireProgressBar
            currentValue={netWorth}
            targetAmount={fireTarget}
            onClick={onShowFireReceipt}
          />
        ) : (
          <div className="mt-6">
            <ModuleTipStrip
              copy="Activeer Toekomstplannen om je FIRE-voortgang en vrijheidsdatum te zien."
              linkLabel="Instellingen"
            />
          </div>
        )}

        {/* Bezittingen/schulden-bar */}
        <AssetsDebtsBar totalAssets={totalAssets} totalDebts={totalDebts} />

        {/* Drie kolommen onderaan — Type 1 blueprint figures-strip met
            top + bottom solid borders en verticale rule-soft dividers.
            Bezittingen en Schulden zijn klikbaar; Schuldgraad blijft static. */}
        <FiguresStrip
          cols={3}
          figures={[
            {
              kicker: 'Totale bezittingen',
              amount: <MaskedAmount value={totalAssets} tone="kern" monoWhenVisible={false} />,
              sub: `${assetCount} ${assetCount === 1 ? 'bezitting' : 'bezittingen'}`,
              variant: 'positive',
              href: '/core/assets',
            },
            {
              kicker: 'Totale schulden',
              amount: <MaskedAmount value={totalDebts} tone="kern" monoWhenVisible={false} />,
              sub: `${debtCount} ${debtCount === 1 ? 'schuld' : 'schulden'}`,
              variant: 'negative',
              href: '/core/debts',
            },
            {
              kicker: 'Schuldgraad',
              amount: `${(Math.round(debtRatio * 10) / 10).toString().replace('.', ',')}%`,
              sub: debtRatioLabel,
              variant: 'neutral',
            },
          ]}
        />
      </div>
    </section>
  )
}

// ── Subcomponent: hoofdbedrag ────────────────────────────────

function HeroAmount({ netWorth }: { netWorth: number }) {
  // Hook leeft hier zodat flash-class-updates alleen deze span re-renderen
  // en de omhullende button (LCP-element) stabiel blijft.
  const { flashClass } = useFlashChange(netWorth)
  const { masked } = useMaskedAmounts()
  return (
    <span
      className={[
        'font-mono text-[40px] font-bold leading-[1] tabular-nums tracking-tight',
        'sm:text-[56px] md:text-[64px]',
        masked ? 'text-[var(--module-active-500)]' : 'text-[var(--ink)]',
        flashClass,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ fontFamily: 'var(--font-playfair, var(--font-mono, monospace))' }}
    >
      {/* Halve transparante streep in module-active-200 (Kern-200 op /core).
          Markeert het netto vermogen als hoofduitkomst-cijfer van de pagina. */}
      <HighlightMark>{formatMaskedCurrency(netWorth, masked)}</HighlightMark>
    </span>
  )
}

// ── Subcomponent: FIRE-voortgangsbar ─────────────────────────

function FireProgressBar({
  currentValue,
  targetAmount,
  onClick,
}: {
  currentValue: number
  targetAmount: number
  onClick?: () => void
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 700 })

  if (targetAmount <= 0) {
    return (
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-ed)] pt-3">
        <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          FIRE-voortgang
        </p>
        <p className="font-serif italic text-sm text-[var(--ink-3)]">
          Stel je FIRE-doel in via Instellingen.
        </p>
      </div>
    )
  }

  const pct = Math.min(100, Math.max(0, (currentValue / targetAmount) * 100))
  const pctRounded = Math.round(pct * 10) / 10

  const Wrapper: React.ElementType = onClick ? 'button' : 'div'
  const wrapperProps = onClick
    ? {
        type: 'button' as const,
        onClick,
        className:
          'group mt-6 block w-full text-left transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]',
      }
    : { className: 'mt-6 block w-full' }

  return (
    <Wrapper {...wrapperProps}>
      <div className="flex items-baseline justify-between gap-3">
        <span
          className="font-mono text-sm font-semibold tabular-nums sm:text-base"
          style={{ color: 'var(--module-active-700)' }}
        >
          {pctRounded.toString().replace('.', ',')}%
        </span>
        <span
          className="font-mono text-sm font-semibold tabular-nums sm:text-base"
          style={{ color: 'var(--module-active-700)' }}
        >
          <MaskedAmount value={targetAmount} tone="kern" className="text-sm font-semibold sm:text-base" />
        </span>
      </div>
      <div
        ref={ref}
        className="mt-1.5 h-[5px] w-full overflow-hidden bg-[var(--subtle)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label="FIRE-voortgang"
      >
        <div
          className="h-full"
          style={{
            background: 'var(--module-active-700)',
            width: hasEntered ? `${pct}%` : '0%',
            transition: 'width 700ms cubic-bezier(.22,1,.36,1)',
          }}
        />
      </div>
    </Wrapper>
  )
}

// ── Subcomponent: gezondheidsscore in hero ──────────────────

/** Kleurbepaling op basis van score (0–100). */
function healthScoreColor(score: number): string {
  if (score >= 80) return 'var(--score-good)'
  if (score >= 60) return 'var(--score-ok)'
  if (score >= 40) return 'var(--score-warn)'
  return 'var(--score-bad)'
}

function healthBarColorClass(score: number): string {
  if (score >= 80) return 'bg-score-good'
  if (score >= 60) return 'bg-score-ok'
  if (score >= 40) return 'bg-score-warn'
  return 'bg-score-bad'
}

/**
 * Trend-indicator: toont ↑ / ↓ / → pijl met delta ten opzichte van vorige maand.
 * Groen voor verbetering, rood voor verslechtering, neutraal voor gelijk.
 * Verschijnt alleen wanneer `previousMonth` beschikbaar is (caller-verantwoordelijkheid).
 */
function HealthTrendIndicator({ trend }: { trend: number }) {
  const arrow = trend > 0 ? '↑' : trend < 0 ? '↓' : '→'
  const colorClass = trend > 0
    ? 'text-positive'
    : trend < 0
      ? 'text-negative'
      : 'text-[var(--ink-3)]'

  return (
    <p
      className={`mt-1 flex items-center gap-0.5 font-mono text-[10px] font-semibold tabular-nums ${colorClass}`}
      data-testid="health-trend-indicator"
    >
      <span>{arrow}</span>
      <span>{trend > 0 ? '+' : ''}{trend}</span>
    </p>
  )
}

/**
 * Semi-circular gauge SVG voor de gezondheidsscore.
 * Vult van links naar rechts als een halve cirkel (180°).
 */
function HeroHealthGauge({ score, size = 88 }: { score: number; size?: number }) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 800 })
  const cx = size / 2
  const cy = size / 2 + 4
  const strokeW = 7
  const r = (size - strokeW - 8) / 2
  // Half-circle: starts at π (left) and goes to 0 (right)
  const halfCircumference = Math.PI * r

  const pct = Math.max(0, Math.min(score, 100)) / 100
  const dashOffset = hasEntered ? halfCircumference * (1 - pct) : halfCircumference
  const color = healthScoreColor(score)

  return (
    <div ref={ref}>
    <svg width={size} height={size / 2 + 12} viewBox={`0 0 ${size} ${size / 2 + 12}`} className="block">
      {/* Background track (half circle) */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="var(--border-ed)"
        strokeWidth={strokeW}
        strokeLinecap="round"
      />
      {/* Filled arc */}
      {pct > 0 && (
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeDasharray={halfCircumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(.22,1,.36,1)' }}
        />
      )}
      {/* Center score number */}
      <text
        x={cx}
        y={cy - 6}
        textAnchor="middle"
        dominantBaseline="auto"
        className="font-mono text-xl font-bold tabular-nums"
        fill={color}
      >
        {score}
      </text>
    </svg>
    </div>
  )
}

/**
 * Gezondheidsscore-sectie in de Core hero.
 * Toont een semi-circulaire gauge (links) met label + pilaar-bars (rechts).
 * Compact genoeg om niet te concurreren met het netto-vermogen, maar
 * prominent genoeg om de financiële gezondheid als eerste-orde metric te tonen.
 * Klikbaar wanneer `onClick` is meegegeven — opent de drill-down kassabon.
 */
function HealthScoreHero({ healthScore, onClick }: { healthScore: HealthScore; onClick?: () => void }) {
  const Wrapper: React.ElementType = onClick ? 'button' : 'div'
  const wrapperProps = onClick
    ? {
        type: 'button' as const,
        onClick,
        className:
          'mt-5 w-full text-left border border-[var(--border-ed)] bg-[var(--subtle)]/30 px-4 py-4 sm:px-5 transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] cursor-pointer',
      }
    : {
        className: 'mt-5 border border-[var(--border-ed)] bg-[var(--subtle)]/30 px-4 py-4 sm:px-5',
      }

  // Onbekend is geen nul (ADR 0131): zonder inkomen/uitgaven geen meter en
  // geen oordeel — de kop van de horizon-melding plus de ene zin.
  const verdict = healthScoreVerdict(healthScore)
  const onbekend = verdict.kind === 'onbekend' ? verdict.onbekend : null

  return (
    <Wrapper
      {...wrapperProps}
      data-testid="health-score-hero"
    >
      <div className="flex items-start gap-4 sm:gap-5">
        {/* Gauge — links */}
        {onbekend ? (
          <div className="shrink-0 flex w-[88px] flex-col items-center text-center">
            <p className="font-serif text-sm font-bold leading-tight text-[var(--ink)]">{GRONDSLAG_ONBEKEND_KOP}</p>
            <p className="mt-1 text-[10px] leading-snug text-[var(--ink-3)]">{onbekend.hint}</p>
          </div>
        ) : (
          <div className="shrink-0 flex flex-col items-center">
            <HeroHealthGauge score={healthScore.total} size={88} />
            <p
              className="mt-0 text-[10px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: healthScoreColor(healthScore.total) }}
            >
              {healthScore.label}
            </p>
            {/* Trend-indicator: pijl + delta vs vorige maand */}
            {healthScore.previousMonth !== null && (
              <HealthTrendIndicator trend={healthScore.trend} />
            )}
          </div>
        )}

        {/* Pilaar-bars — rechts */}
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] mb-2">
            Financiële gezondheid
          </p>
          <div className="space-y-1.5">
            {healthScore.pillars.map(pillar => (
              <div key={pillar.id} className="flex items-center gap-2">
                <span className="w-[64px] shrink-0 text-[10px] text-[var(--ink-3)] truncate sm:w-[80px]">
                  {pillar.name}
                </span>
                <div className="flex-1 h-[5px] overflow-hidden bg-[var(--subtle)]">
                  <div
                    className={`h-full ${healthBarColorClass(pillar.score)}`}
                    style={{ width: `${Math.max(0, Math.min(pillar.score, 100))}%` }}
                  />
                </div>
                <span className="w-[24px] shrink-0 text-right font-mono text-[10px] tabular-nums text-[var(--ink-2)]">
                  {pillar.score}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {onClick && (
        <p className="mt-2 text-right text-[9px] text-[var(--ink-4)] tracking-wide">
          Tik voor details ›
        </p>
      )}
    </Wrapper>
  )
}

// ── Subcomponent: bezittingen/schulden split-bar ─────────────

function AssetsDebtsBar({
  totalAssets,
  totalDebts,
}: {
  totalAssets: number
  totalDebts: number
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 700 })
  const { masked } = useMaskedAmounts()
  const sum = totalAssets + totalDebts
  const assetPct = sum > 0 ? (totalAssets / sum) * 100 : 0

  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between gap-3">
        <MaskedAmount value={totalAssets} tone="kern" className="text-sm font-semibold text-[var(--ink)] sm:text-base" />
        <MaskedAmount value={totalDebts} tone="kern" className="text-sm font-semibold text-[var(--ink)] sm:text-base" />
      </div>
      <div
        ref={ref}
        className="mt-1.5 flex h-[5px] w-full overflow-hidden bg-[var(--subtle)]"
        role="img"
        aria-label={`Bezittingen ${formatMaskedCurrency(totalAssets, masked)} en schulden ${formatMaskedCurrency(totalDebts, masked)}`}
      >
        <div
          className="h-full bg-positive"
          style={{
            width: hasEntered ? `${assetPct}%` : '0%',
            transition: 'width 700ms cubic-bezier(.22,1,.36,1)',
          }}
        />
        <div
          className="h-full bg-negative"
          style={{
            width: hasEntered ? `${100 - assetPct}%` : '0%',
            transition: 'width 700ms cubic-bezier(.22,1,.36,1)',
            transitionDelay: '60ms',
          }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] uppercase tracking-[0.08em]">
        <span className="text-positive">bezittingen</span>
        <span className="text-negative">schulden</span>
      </div>
    </div>
  )
}

