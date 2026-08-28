'use client'

/**
 * ToekomstNavCards — de vier navigatiekaarten bovenaan de /toekomst-landing.
 *
 * Visueel én functioneel 1-op-1 gespiegeld op de vier-hefbomen-rij van
 * /overzicht (components/overview/overzicht-hero/hefbomen-nav.tsx → HefbomenNav)
 * door dezelfde gedeelde shell te HERGEBRUIKEN (components/overview/
 * leverage-card.tsx → LeverageCard):
 *  - grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3
 *  - per kaart: rounded-2xl border bg-[var(--paper)] p-3 sm:p-4
 *  - status-dot rechtsboven (emerald/amber/red/stone — dezelfde semantiek
 *    als LEVERAGE_STATUS_DOT)
 *  - icoon in getinte box (horizon-accent), label, grote KPI
 *    (font-serif tabular-nums), gekleurde status-substext
 *  - chevron-toggle rechtsonder die een drilldown-detailpaneel uitklapt
 *    (net als HefbomenNav). De hele kaart blijft een <Link> naar de subpagina;
 *    alleen de chevron-<button> toggelt het paneel (navigeert niet).
 *
 * Client component met accordeon-state (één kaart open per keer), net als
 * HefbomenNav. Alle props zijn plain serializable data (server → client). De
 * KPI + status + drilldown-inhoud worden uit props afgeleid via pure helpers
 * (geëxporteerd voor tests) — geen nieuwe data-fetch of berekening.
 */

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, Target, CalendarClock, SlidersHorizontal, Calculator } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { LeverageCard } from '@/components/overview/leverage-card'
import { GlossaryTerm } from '@/components/editorial/glossary-term'
import {
  leverageStatusBgClass,
  leverageStatusTextClass,
  type LeverageStatus,
} from '@/lib/leverage-status'
import type { GoalWithBudget } from '@/lib/fin-data-loader'
import type { LifeEvent } from '@/lib/horizon-data'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { STRATEGY_LABELS } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import type { FireParams } from '@/lib/fire-params'
import type { GoalProgress as CanonicalGoalProgress } from '@/lib/goal-data'

// ── Types ────────────────────────────────────────────────────────────

/**
 * Voortgang per doel — parallel array met `goals` (zelfde index), exact zoals
 * `loadFinData` (`FinPageData.goalProgresses`) hem teruggeeft.
 *
 * Bewust een SUBSET van het canonieke `computeGoalProgress`-contract, afgeleid
 * i.p.v. lokaal overgetikt: de kaart telt alleen aandacht-vragende doelen en
 * leunt daarvoor op `onTrack`. Een vers doel (bevinding M31) is bij de bron al
 * `onTrack: true` zolang er niets te meten valt, dus hier is geen tweede guard
 * nodig — en dus ook `measured` niet.
 */
export type GoalProgress = Pick<
  CanonicalGoalProgress,
  'current' | 'target' | 'pct' | 'onTrack' | 'eta'
>

/**
 * Drilldown-detail per kaart — getoond in het uitklap-paneel (chevron).
 * Analoog aan HefboomDetailCard op /overzicht: een uppercase label, een
 * mono tabular-nums value, een korte tip en een action-link. Alle waarden
 * zijn al uit de bestaande props afgeleid — geen extra data.
 */
type NavCardDetail = {
  /** Uppercase label-regel (bv. 'OP KOERS'). */
  detailLabel: string
  /**
   * Mono tabular value-regel rechts van het label. `ReactNode` omdat vaktermen
   * hier een `<GlossaryTerm>` mogen dragen — de drilldown rendert BUITEN de
   * kaart-`<Link>` (zie LeverageCard), dus een `<button>` is hier geldig.
   */
  value: ReactNode
  /** Korte tip-zin. Mag `<GlossaryTerm>`-uitleg bevatten (zie `value`). */
  tip: ReactNode
  /** Tekst van de action-link. */
  actionLabel: string
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
  detail: NavCardDetail
}

// ── Helpers (pure, geëxporteerd voor tests) ────────────────────────────

/** Percentage-formatter voor SWR-substext: 0.034 → "3.4%". */
export function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

/**
 * Onttrekkingsstrategie → leesbare naam voor de Voorkeuren-substext.
 * Spiegelt de WITHDRAWAL_LABELS-mapping uit voorkeuren-view.tsx (alleen de
 * `name`-velden — de uitleg zelf staat in `lib/glossary-data.ts`).
 */
const WITHDRAWAL_NAMES: Record<string, string> = {
  static: 'Vast (4%)',
  guardrails: 'Guardrails',
  vpw: 'VPW',
  bucket: 'Bucket',
}

/**
 * Onttrekkingsstrategie → glossary-key (bevinding H19).
 *
 * De kaart-VOORKANT blijft bewust kaal: die tekst zit binnen de kaart-`<Link>`
 * en een `<button>` (GlossaryTerm) in een `<a>` is ongeldige HTML. De DRILLDOWN
 * rendert als sibling BUITEN die Link (`LeverageCard`: `{expanded && children}`)
 * en draagt de uitleg wél. `static` ("Vast (4%)") is geen jargon → geen entry.
 */
const WITHDRAWAL_GLOSSARY_KEYS: Record<string, string> = {
  guardrails: 'guardrails',
  vpw: 'vpw',
  bucket: 'bucket',
}

/**
 * Vakterm met uitleg-tooltip, of kale tekst als er geen glossary-entry is.
 * `GlossaryTerm` valt zelf al terug op platte tekst bij een onbekende key;
 * deze helper houdt de call-sites in `buildNavCards` leesbaar.
 */
function withGlossary(term: string | undefined, label: string): ReactNode {
  if (!term) return label
  return <GlossaryTerm term={term}>{label}</GlossaryTerm>
}

/**
 * Doelen-status: koppel goals[i] aan goalProgresses[i], negeer voltooide
 * doelen (pct ≥ 100). Status van het slechtste actieve doel:
 *  - bad   als een actief doel !onTrack && pct < 50
 *  - warn  als een actief doel !onTrack && pct ≥ 50
 *  - good  als alle actieve doelen op koers zijn
 *  - neutral als er geen actieve doelen zijn
 *
 * CR-M1 — marge-/fire-status is live-only in het lab; spiegelt DoelenView:
 * lab-parameter-doelen (metadata.bron === 'parameter') die (i) een fire_age-doel
 * zijn (marge-status hoort op /toekomst) óf (ii) nog geen meting hebben (pct ≤ 0)
 * tellen WEL mee in het aantal ("2 doelen") maar NIET in attention/status —
 * anders zou een ongemeten of marge-doel de nav-kaart onterecht rood/oranje
 * kleuren. Handmatige doelen (géén bron-tag) blijven volledig meetellen.
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

  goals.forEach((goal, i) => {
    const p = goalProgresses[i]
    if (!p) return
    if (p.pct >= 100) return // voltooid → negeren
    activeCount += 1 // fire_age-/ongemeten parameter-doel telt WEL mee in het aantal

    // Defensieve parameter-herkenning (metadata kan ontbreken/null/{} zijn).
    const isParameter = goal.metadata?.bron === 'parameter'
    // Parameter-doel zonder betekenisvolle stoplicht-status: fire_age (marge)
    // of nog geen meting (pct ≤ 0) → buiten attention/status houden.
    if (isParameter && (goal.goal_type === 'fire_age' || p.pct <= 0)) return

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

/**
 * Icon-chip-tint per kaart. Alleen een kaart met een betekenisvolle (niet-
 * neutrale) status draagt het module-accent — op /toekomst is dat de horizon-
 * kleur (geldige module-identiteit-class voor Toekomst/Horizon). De overige
 * kaarten krijgen een neutrale ink-behandeling zodat het accent de aandacht
 * trekt waar het ertoe doet i.p.v. op alle vier de kaarten te verwateren.
 */
function tintForStatus(status: LeverageStatus): string {
  return status === 'neutral'
    ? 'text-[var(--ink-2)] bg-[var(--subtle)]'
    : 'text-horizon-700 bg-horizon-50'
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
  const onTrackCount = doelen.activeCount - doelen.attentionCount
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
      tint: tintForStatus(doelen.status),
      kpi: countKpi(doelen.activeCount, 'doel', 'doelen'),
      status: doelen.status,
      subText: doelenSubText,
      detail: {
        detailLabel: 'Op koers',
        value:
          doelen.activeCount === 0 ? '—' : `${onTrackCount}/${doelen.activeCount}`,
        tip:
          doelen.activeCount === 0
            ? 'Nog geen actieve doelen — bepaal waar je vrijheid voor opbouwt.'
            : doelen.attentionCount > 0
              ? `${doelen.attentionCount} ${doelen.attentionCount === 1 ? 'doel loopt' : 'doelen lopen'} achter op schema.`
              : 'Al je actieve doelen liggen op koers.',
        actionLabel: 'Beheer doelen',
      },
    },
    {
      key: 'gebeurtenissen',
      label: 'Gebeurtenissen',
      href: '/toekomst/gebeurtenissen',
      Icon: CalendarClock,
      tint: tintForStatus('neutral'),
      kpi: countKpi(eventCount, 'gebeurtenis', 'gebeurtenissen'),
      status: 'neutral',
      subText: next ?? 'Nog niets gepland',
      detail: {
        detailLabel: 'Gepland',
        value: countKpi(eventCount, 'gebeurtenis', 'gebeurtenissen'),
        tip: next ?? 'Plan je eerste gebeurtenis in op de tijdas.',
        actionLabel: 'Bekijk tijdas',
      },
    },
    {
      key: 'voorkeuren',
      label: 'Voorkeuren',
      href: '/toekomst/voorkeuren',
      Icon: SlidersHorizontal,
      tint: tintForStatus('neutral'),
      kpi: strategy.name,
      status: 'neutral',
      subText: `${withdrawalName} · SWR ${formatPct(fireParams.effectiveSwr)}`,
      detail: {
        detailLabel: 'Onttrekking',
        value: withGlossary(
          WITHDRAWAL_GLOSSARY_KEYS[withdrawalStrategy.strategy],
          withdrawalName,
        ),
        // Vaktermen uit de kaart-voorkant ("Vermogen opeten", "SWR") krijgen
        // hier hun uitleg — zie WITHDRAWAL_GLOSSARY_KEYS voor het waarom.
        tip: (
          <>
            {withGlossary(`eindstrategie_${fireStrategy.strategy}`, strategy.name)}
            {' · '}
            <GlossaryTerm term="swr">SWR</GlossaryTerm>{' '}
            {formatPct(fireParams.effectiveSwr)}
            {` · rendement ${formatPct(fireParams.grossReturn)} · inflatie ${formatPct(fireParams.inflationRate)}`}
          </>
        ),
        actionLabel: 'Pas voorkeuren aan',
      },
    },
    {
      key: 'rekenhulp',
      label: 'Rekenhulp',
      href: '/toekomst/rekenhulp',
      Icon: Calculator,
      tint: tintForStatus('neutral'),
      kpi: countKpi(calcCount, 'rekenhulp', 'rekenhulpen'),
      status: 'neutral',
      subText: calcCount > 0 ? 'Nieuwe met Fin' : 'Nog geen rekenhulpen',
      detail: {
        detailLabel: 'Eigen rekenhulpen',
        value: countKpi(calcCount, 'rekenhulp', 'rekenhulpen'),
        tip:
          calcCount > 0
            ? 'Fin houdt je rekenhulpen bij en maakt er nieuwe.'
            : 'Nog geen rekenhulpen — begin er één met Fin.',
        actionLabel: 'Open rekenhulpen',
      },
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
  const allCards = buildNavCards(props)

  // In Eenvoudig-modus renderen de kaarten COMPACT (1 regel: icoon + titel,
  // géén KPI/substext/status-dot) en vervalt de drilldown-chevron — de extra
  // diepte is dan niet gewenst (via de `compact`-/`expandable`-props op
  // /toekomst-niveau; /overzicht regelt z'n eigen kaarten los hiervan).
  const { mode } = useDisplayMode()
  const simple = mode === 'simple'

  // In Eenvoudig-modus verbergt de Rekenhulp-kaart volledig (hard-hide,
  // dezelfde keuze als de overige Eenvoudig-vereenvoudigingen op /toekomst):
  // de rekenhulp-diepte hoort niet bij de rustige basisweergave. In Volledig
  // verschijnt de kaart gewoon weer.
  const cards = simple ? allCards.filter((c) => c.key !== 'rekenhulp') : allCards

  // Eén kaart-expand per keer — open/dicht via chevron. Accordeon-state leeft
  // in de parent, exact zoals HefbomenNav LeverageCard aanstuurt.
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  return (
    <nav
      aria-label="Toekomst-navigatie"
      className={
        simple
          ? // Compact (Eenvoudig): 3 one-liner-kaarten — gestapeld op mobiel
            // (labels als "Gebeurtenissen" blijven dan één regel), naast
            // elkaar vanaf sm.
            'grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3'
          : 'grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3'
      }
    >
      {cards.map((card) => {
        const { key, label, href, Icon, tint, kpi, status, subText, detail } = card
        const expanded = expandedKey === key
        return (
          <LeverageCard
            key={key}
            Icon={Icon}
            tint={tint}
            label={label}
            kpi={kpi}
            status={status}
            subText={subText}
            href={href}
            /* S1: `compact` is een `variant` geworden. Deze kaarten houden hun
               huidige Eenvoudig-behandeling (one-liner) — of ook /toekomst naar
               de `verdict`-variant moet, is een eigen afweging en geen
               neveneffect van de shell-wijziging. */
            variant={simple ? 'compact' : 'full'}
            expandable={!simple}
            expanded={expanded}
            onToggleExpand={() => setExpandedKey(expanded ? null : key)}
          >
            <NavDrilldownCard detail={detail} status={status} href={href} />
          </LeverageCard>
        )
      })}
    </nav>
  )
}

/**
 * Drilldown-detail-content per navigatiekaart. Analoog aan HefboomDetailCard
 * op /overzicht: uppercase label + mono tabular value, een korte tip-zin en
 * een deep-link naar de subpagina. Tekst-/achtergrondkleur volgt de status
 * (groen/oranje/rood/neutraal) via dezelfde gedeelde helpers.
 */
function NavDrilldownCard({
  detail,
  status,
  href,
}: {
  detail: NavCardDetail
  status: LeverageStatus
  href: string
}) {
  return (
    <div
      className={`mt-2 -mx-3 sm:-mx-4 px-3 sm:px-4 py-3 border-t border-[var(--border-ed)] ${leverageStatusBgClass(status)}`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-[10px] uppercase tracking-[0.1em] font-semibold text-[var(--ink-3)]">
          {detail.detailLabel}
        </span>
        <span className={`text-[11px] font-mono tabular-nums font-semibold ${leverageStatusTextClass(status)}`}>
          {detail.value}
        </span>
      </div>
      <p className={`text-xs leading-snug ${leverageStatusTextClass(status)}`}>
        {detail.tip}
      </p>
      <Link
        href={href}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--ink-2)] hover:text-[var(--ink)] hover:underline"
      >
        {detail.actionLabel}
        <ArrowRight className="w-3 h-3" aria-hidden="true" />
      </Link>
    </div>
  )
}
