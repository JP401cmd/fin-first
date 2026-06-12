/**
 * ToekomstNavCards — de vier navigatiekaarten bovenaan de /toekomst-landing.
 *
 * Visueel 1-op-1 gespiegeld op de vier-hefbomen-rij van /overzicht
 * (components/overview/overzicht-hero/hefbomen-nav.tsx → HefbomenNav):
 *  - grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3
 *  - per kaart: rounded-2xl border bg-[var(--paper)] p-3 sm:p-4
 *  - status-dot rechtsboven (emerald/amber/red/stone — dezelfde semantiek
 *    als LEVERAGE_STATUS_DOT)
 *  - icoon in getinte box, label, grote KPI (font-serif tabular-nums),
 *    gekleurde status-substext
 *
 * In tegenstelling tot HefbomenNav GÉÉN chevron-drilldown: de hele kaart is
 * een <Link> naar de respectievelijke subpagina (de "detail" is de subpagina).
 *
 * Server component (geen 'use client', geen hooks). De KPI + status worden
 * uit props afgeleid via pure helper-functies (geëxporteerd voor tests).
 */

import Link from 'next/link'
import { Target, CalendarClock, SlidersHorizontal, Calculator } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  LEVERAGE_STATUS_DOT,
  LEVERAGE_STATUS_LABEL,
  leverageStatusTextClass,
  type LeverageStatus,
} from '@/lib/leverage-status'
import type { GoalWithBudget } from '@/lib/will-data-loader'
import type { LifeEvent } from '@/lib/horizon-data'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { STRATEGY_LABELS } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import type { FireParams } from '@/lib/fire-params'

// ── Types ────────────────────────────────────────────────────────────

/**
 * Voortgang per doel — parallel array met `goals` (zelfde index), exact zoals
 * `loadWillData` (`WillPageData.goalProgresses`) hem teruggeeft.
 */
export type GoalProgress = {
  current: number
  target: number
  pct: number
  onTrack: boolean
  eta: string | null
}

/** Afgeleide weergave per kaart. */
type NavCard = {
  key: string
  label: string
  href: string
  Icon: LucideIcon
  /** Tailwind text+bg-tint voor de icon-chip, bv. 'text-horizon-700 bg-horizon-50'. */
  tint: string
  kpi: string
  status: LeverageStatus
  subText: string | null
}

// ── Helpers (pure, geëxporteerd voor tests) ────────────────────────────

/** Percentage-formatter voor SWR-substext: 0.034 → "3.4%". */
export function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

/**
 * Onttrekkingsstrategie → leesbare naam voor de Voorkeuren-substext.
 * Spiegelt de WITHDRAWAL_LABELS-mapping uit voorkeuren-view.tsx (alleen de
 * `name`-velden — hier is geen GlossaryTerm-subtitle nodig).
 */
const WITHDRAWAL_NAMES: Record<string, string> = {
  static: 'Vast (4%)',
  guardrails: 'Guardrails',
  vpw: 'VPW',
  bucket: 'Bucket',
}

/**
 * Doelen-status: koppel goals[i] aan goalProgresses[i], negeer voltooide
 * doelen (pct ≥ 100). Status van het slechtste actieve doel:
 *  - bad   als een actief doel !onTrack && pct < 50
 *  - warn  als een actief doel !onTrack && pct ≥ 50
 *  - good  als alle actieve doelen op koers zijn
 *  - neutral als er geen actieve doelen zijn
 *
 * Geeft naast de status ook het aantal aandacht-vragende doelen terug zodat de
 * substext ("X vraagt aandacht") consistent met de status berekend wordt.
 */
export function deriveDoelenStatus(
  goals: GoalWithBudget[],
  goalProgresses: GoalProgress[],
): { status: LeverageStatus; activeCount: number; attentionCount: number } {
  let activeCount = 0
  let attentionCount = 0
  let worst: LeverageStatus = 'good'

  goals.forEach((_, i) => {
    const p = goalProgresses[i]
    if (!p) return
    if (p.pct >= 100) return // voltooid → negeren
    activeCount += 1
    if (!p.onTrack) {
      attentionCount += 1
      if (p.pct < 50) {
        worst = 'bad'
      } else if (worst !== 'bad') {
        worst = 'warn'
      }
    }
  })

  if (activeCount === 0) return { status: 'neutral', activeCount: 0, attentionCount: 0 }
  return { status: worst, activeCount, attentionCount }
}

/**
 * Eerstvolgende toekomstige gebeurtenis op `target_date` na nu, met jaartal.
 * Events met alleen `target_age` (geen datum) kunnen zonder geboortedatum niet
 * naar een kalenderjaar worden omgezet; die tonen we als "Leeftijd N".
 * Geeft `null` wanneer er geen geplande events zijn.
 */
export function nextEventLabel(events: LifeEvent[], now: Date = new Date()): string | null {
  const nowMs = now.getTime()

  // 1) Events met een echte datum in de toekomst → chronologisch eerst.
  const dated = events
    .filter((e) => e.target_date != null)
    .map((e) => ({ event: e, when: new Date(e.target_date as string).getTime() }))
    .filter((x) => !Number.isNaN(x.when) && x.when >= nowMs)
    .sort((a, b) => a.when - b.when)

  if (dated.length > 0) {
    const { event, when } = dated[0]
    return `Volgende: ${event.name} · ${new Date(when).getFullYear()}`
  }

  // 2) Geen gedateerde events → val terug op het eerste leeftijd-event.
  const aged = events
    .filter((e) => e.target_date == null && e.target_age != null)
    .sort((a, b) => (a.target_age as number) - (b.target_age as number))

  if (aged.length > 0) {
    const event = aged[0]
    return `Volgende: ${event.name} · leeftijd ${event.target_age}`
  }

  return null
}

/** "N gebeurtenissen" / "Geen", "N doelen" / "Geen", etc. */
function countKpi(n: number, singular: string, plural: string): string {
  if (n <= 0) return 'Geen'
  return `${n} ${n === 1 ? singular : plural}`
}

// ── Card-afleiding ─────────────────────────────────────────────────────

export function buildNavCards({
  goals,
  goalProgresses,
  events,
  fireStrategy,
  withdrawalStrategy,
  fireParams,
  calculatorCount,
}: {
  goals: GoalWithBudget[]
  goalProgresses: GoalProgress[]
  events: LifeEvent[]
  fireStrategy: FireStrategyConfig
  withdrawalStrategy: WithdrawalStrategyConfig
  fireParams: FireParams
  calculatorCount: number
}): NavCard[] {
  // Doelen — enige kaart met een betekenisvolle kleur-status.
  const doelen = deriveDoelenStatus(goals, goalProgresses)
  const doelenSubText =
    doelen.activeCount === 0
      ? 'Stel je eerste doel in'
      : doelen.attentionCount > 0
        ? `${doelen.attentionCount} vraagt aandacht`
        : 'Allemaal op koers'

  // Gebeurtenissen — neutrale dot, substext = eerstvolgende geplande event.
  const eventCount = events.length
  const next = nextEventLabel(events)

  // Voorkeuren — neutrale dot, KPI = eindstrategie-naam.
  const strategy = STRATEGY_LABELS[fireStrategy.strategy]
  const withdrawalName =
    WITHDRAWAL_NAMES[withdrawalStrategy.strategy] ?? withdrawalStrategy.strategy

  // Rekenhulp — neutrale dot.
  const calcCount = calculatorCount

  return [
    {
      key: 'doelen',
      label: 'Doelen',
      href: '/toekomst/doelen',
      Icon: Target,
      tint: 'text-horizon-700 bg-horizon-50',
      kpi: countKpi(doelen.activeCount, 'doel', 'doelen'),
      status: doelen.status,
      subText: doelenSubText,
    },
    {
      key: 'gebeurtenissen',
      label: 'Gebeurtenissen',
      href: '/toekomst/gebeurtenissen',
      Icon: CalendarClock,
      tint: 'text-horizon-700 bg-horizon-50',
      kpi: countKpi(eventCount, 'gebeurtenis', 'gebeurtenissen'),
      status: 'neutral',
      subText: next ?? 'Nog niets gepland',
    },
    {
      key: 'voorkeuren',
      label: 'Voorkeuren',
      href: '/toekomst/voorkeuren',
      Icon: SlidersHorizontal,
      tint: 'text-horizon-700 bg-horizon-50',
      kpi: strategy.name,
      status: 'neutral',
      subText: `${withdrawalName} · SWR ${formatPct(fireParams.effectiveSwr)}`,
    },
    {
      key: 'rekenhulp',
      label: 'Rekenhulp',
      href: '/toekomst/rekenhulp',
      Icon: Calculator,
      tint: 'text-horizon-700 bg-horizon-50',
      kpi: countKpi(calcCount, 'rekenhulp', 'rekenhulpen'),
      status: 'neutral',
      subText: calcCount > 0 ? 'Nieuwe met Will' : 'Nog geen rekenhulpen',
    },
  ]
}

// ── Component ──────────────────────────────────────────────────────────

export function ToekomstNavCards(props: {
  goals: GoalWithBudget[]
  goalProgresses: GoalProgress[]
  events: LifeEvent[]
  fireStrategy: FireStrategyConfig
  withdrawalStrategy: WithdrawalStrategyConfig
  fireParams: FireParams
  calculatorCount: number
}) {
  const cards = buildNavCards(props)

  return (
    <nav
      aria-label="Toekomst-navigatie"
      className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3"
    >
      {cards.map((card) => {
        const { key, label, href, Icon, tint, kpi, status, subText } = card
        return (
          <Link
            key={key}
            href={href}
            className="group relative flex flex-col rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4 transition-all hover:border-[var(--ink-3)] hover:shadow-sm"
          >
            <span
              className={`absolute right-2.5 top-2.5 sm:right-3 sm:top-3 w-2 h-2 rounded-full ${LEVERAGE_STATUS_DOT[status]}`}
              aria-hidden="true"
              title={LEVERAGE_STATUS_LABEL[status]}
            />
            <div
              className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center ${tint}`}
            >
              <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="mt-2 text-sm sm:text-base font-semibold text-[var(--ink)]">
              {label}
            </div>
            <div className="mt-0.5 text-base sm:text-lg font-serif font-semibold text-[var(--ink)] tabular-nums">
              {kpi}
            </div>
            <div className="mt-1 flex items-end justify-between gap-2 min-h-[16px]">
              {subText ? (
                <span className={`text-[11px] font-medium ${leverageStatusTextClass(status)}`}>
                  {subText}
                </span>
              ) : (
                <span />
              )}
            </div>
          </Link>
        )
      })}
    </nav>
  )
}
