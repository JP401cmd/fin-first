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
import {
  withdrawalProfielFromEnum,
  type WithdrawalProfiel,
  type WithdrawalStrategyConfig,
} from '@/lib/withdrawal-strategy'
import type { FireParams } from '@/lib/fire-params'
import { deriveDoelenStatus, type GoalProgress } from '@/components/future/doelen-verdict'
import { PLAN_REVIEW_HREF, PLAN_REVIEW_NAAM, PLAN_REVIEW_STAP_TITELS, type PlanReviewProgress } from '@/lib/plan-review/types'
import { usePlanReviewOpener } from '@/components/future/plan-review/plan-review-provider'

// ── Types ────────────────────────────────────────────────────────────

/**
 * `GoalProgress` en `deriveDoelenStatus` wonen sinds de kop-herziening (sep
 * 2026) in `./doelen-verdict` — een server-veilige module, omdat de paginatitel
 * van /toekomst/doelen dezelfde telling leest en die server-side rendert. Hier
 * blijven ze doorgegeven zodat bestaande importeurs (en hun tests) ongemoeid
 * blijven; de afleiding zelf heeft maar één home.
 */
export { deriveDoelenStatus }
export type { GoalProgress }

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
  /** Label in Eenvoudig (compact, zonder KPI) — valt terug op `label`. */
  compactLabel?: string
  /** TPR-01: deze kaart opent de plan-review in plaats van naar `href` te navigeren. */
  opensPlanReview?: boolean
}

// ── Helpers (pure, geëxporteerd voor tests) ────────────────────────────

/** Percentage-formatter voor SWR-substext: 0.034 → "3.4%". */
export function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

/**
 * OnttrekkingsPROFIEL → leesbare naam voor de Voorkeuren-substext (B-042: gesleuteld
 * op `WithdrawalProfiel`, niet op de enum die vast/afnemend/oplopend alle drie als
 * 'static' draagt). Spiegelt de WITHDRAWAL_LABELS-mapping uit voorkeuren-view.tsx
 * (alleen de `name`-velden — de uitleg zelf staat in `lib/glossary-data.ts`).
 */
const WITHDRAWAL_NAMES: Record<WithdrawalProfiel, string> = {
  vast: 'Vast (4%)',
  afnemend: 'Afnemend',
  oplopend: 'Oplopend',
  guardrails: 'Guardrails',
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

/** De eerstvolgende gebeurtenis, uit elkaar getrokken zodat elk deel zijn eigen plek krijgt. */
export interface VolgendeGebeurtenis {
  /** Naam zoals de gebruiker 'm invoerde — vrije tekst, tot 100 tekens. */
  naam: string
  /** Wanneer, kort en cijfermatig: "2028" of "leeftijd 67". */
  wanneer: string
}

/**
 * Eerstvolgende toekomstige gebeurtenis. Events met alleen `target_age` (geen
 * datum) kunnen zonder geboortedatum niet naar een kalenderjaar worden omgezet;
 * die geven "leeftijd N" als `wanneer`. `null` wanneer er niets gepland staat.
 *
 * WAAROM UIT ELKAAR. De KPI-plek van een navkaart is een cijfer-slot
 * (`font-serif tabular-nums`, zonder afkapping — zie `LeverageCard`); daar hoort
 * `wanneer` en nooit de vrije naam, die een halve-breedte kaart op mobiel over
 * drie regels zou trekken en de kaart ernaast mee laat rekken. De naam gaat naar
 * de subtekst, die die vrije tekst voorheen ook al droeg.
 */
export function nextEvent(events: LifeEvent[], now: Date = new Date()): VolgendeGebeurtenis | null {
  const nowMs = now.getTime()

  // 1) Events met een echte datum in de toekomst → chronologisch eerst.
  const dated = events
    .filter((e) => e.target_date != null)
    .map((e) => ({ event: e, when: new Date(e.target_date as string).getTime() }))
    .filter((x) => !Number.isNaN(x.when) && x.when >= nowMs)
    .sort((a, b) => a.when - b.when)

  if (dated.length > 0) {
    const { event, when } = dated[0]
    return { naam: event.name, wanneer: String(new Date(when).getFullYear()) }
  }

  // 2) Geen gedateerde events → val terug op het eerste leeftijd-event.
  const aged = events
    .filter((e) => e.target_date == null && e.target_age != null)
    .sort((a, b) => (a.target_age as number) - (b.target_age as number))

  if (aged.length > 0) {
    const event = aged[0]
    return { naam: event.name, wanneer: `leeftijd ${event.target_age}` }
  }

  return null
}

/** Dezelfde gebeurtenis als volzin voor een tip: "Volgende: Kind · 2028". */
export function nextEventLabel(events: LifeEvent[], now: Date = new Date()): string | null {
  const v = nextEvent(events, now)
  return v == null ? null : `Volgende: ${v.naam} · ${v.wanneer}`
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

/**
 * TPR-01 — de Voorkeuren-kaart in review-stand. Status `warn` (stoplicht: aandacht —
 * er staan nog keuzes onbevestigd), KPI = afgeleide voortgang, drilldown noemt de open
 * stappen. De href is de deeplink; op /toekomst onderschept de provider de klik en
 * opent de pane zonder route-roundtrip.
 */
export function planReviewCard(progress: PlanReviewProgress): NavCard {
  const open = progress.stappen.filter((s) => s.status === 'open')
  const n = open.length
  return {
    key: 'voorkeuren',
    label: PLAN_REVIEW_NAAM,
    compactLabel: `${PLAN_REVIEW_NAAM} · ${progress.bevestigd}/${progress.totaal}`,
    href: PLAN_REVIEW_HREF,
    Icon: SlidersHorizontal,
    tint: tintForStatus('warn'),
    kpi: `${progress.bevestigd} van ${progress.totaal}`,
    status: 'warn',
    subText: `${n} ${n === 1 ? 'stap' : 'stappen'} nog niet bevestigd`,
    opensPlanReview: true,
    detail: {
      detailLabel: 'Nog open',
      value: `${n}`,
      tip: `${open.map((s) => PLAN_REVIEW_STAP_TITELS[s.stap]).join(' · ')}. Per stap zie je waar de app nu mee rekent en wat een andere keuze doet.`,
      actionLabel: PLAN_REVIEW_NAAM,
    },
  }
}

// ── Card-afleiding ─────────────────────────────────────────────────────

export function buildNavCards({
  goals,
  goalProgresses,
  events,
  fireStrategy,
  withdrawalStrategy,
  withdrawalProfiel,
  fireParams,
  calculatorCount,
  planReview,
}: {
  goals: GoalWithBudget[]
  goalProgresses: GoalProgress[]
  events: LifeEvent[]
  fireStrategy: FireStrategyConfig
  withdrawalStrategy: WithdrawalStrategyConfig
  /**
   * Het actieve onttrekkingsPROFIEL zoals de kernel het leest
   * (`resolveWithdrawalProfiel`, B-042). Optioneel: zonder prop valt de kaart terug
   * op de enum-mapping (static → vast) en kan hij "Vast" tonen waar de motor
   * Afnemend rekent — de server-page levert hem daarom altijd mee.
   */
  withdrawalProfiel?: WithdrawalProfiel
  fireParams: FireParams
  calculatorCount: number
  /**
   * TPR-01 — afgeleide voortgang van de plan-review (`derivePlanReviewProgress`).
   * Niet voltooid → de Voorkeuren-kaart wordt "Je plan · N van M" met status aandacht
   * en opent de review (besluit eigenaar 13 sep 2026). Voltooid, of `null`/afwezig
   * (review niet beschikbaar) → de gewone Voorkeuren-kaart.
   */
  planReview?: PlanReviewProgress | null
}): NavCard[] {
  // Doelen — enige kaart met een betekenisvolle kleur-status.
  const doelen = deriveDoelenStatus(goals, goalProgresses)
  // "Op koers" telt alleen over de BEOORDEELDE doelen. Een doel zonder
  // streefdatum (of zonder meetperiode) heeft geen tempo-oordeel; dat als "op
  // koers" presenteren is precies de bug die op de doelenpagina is weggehaald
  // — hij mag hier niet terugkomen (R5).
  const onTrackCount = doelen.judgedCount - doelen.attentionCount
  const doelenSubText =
    doelen.activeCount === 0
      ? 'Stel je eerste doel in'
      : doelen.attentionCount > 0
        ? `${doelen.attentionCount} vraagt aandacht`
        : doelen.judgedCount === 0
          ? 'Nog niets te meten'
          : 'Allemaal op koers'

  // Gebeurtenissen — neutrale dot. Bewust GÉÉN telling op deze kaart: de tijdas
  // toont naast deze server-events ook momenten die de kernel zélf uit het plan
  // afleidt ("Berekend door je plan", `lib/horizon/kernel-strategy-moments.ts`).
  // Die bestaan alleen client-side, na hydration, dus een server-telling hier
  // stond structureel lager dan wat de pagina eronder laat zien — "2" op de
  // kaart, drie kaarten op de tijdas. Zelfde keuze als op de paginatitel
  // (b0ed31eb9): bij twee tellingen die elkaar tegenspreken blijft er één over,
  // en die woont in de view die de rijen ook echt rendert. De kaart wijst nu
  // naar het eerstvolgende moment in plaats van naar een aantal.
  const volgende = nextEvent(events)
  const next = nextEventLabel(events)

  // Voorkeuren — neutrale dot, KPI = eindstrategie-naam.
  const strategy = STRATEGY_LABELS[fireStrategy.strategy]
  // Profiel > enum-terugval — dezelfde voorrang als de kernel-adapter (B-042).
  const activeProfiel: WithdrawalProfiel =
    withdrawalProfiel ?? withdrawalProfielFromEnum(withdrawalStrategy.strategy)
  const withdrawalName = WITHDRAWAL_NAMES[activeProfiel]

  // Rekenhulp — neutrale dot.
  const calcCount = calculatorCount

  // Voorkeuren-kaart: zolang de plan-review niet voltooid is, is dit de review-ingang.
  const voorkeurenCard: NavCard =
    planReview && !planReview.voltooid
      ? planReviewCard(planReview)
      : {
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
              WITHDRAWAL_GLOSSARY_KEYS[activeProfiel],
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
        }

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
          doelen.activeCount === 0 || doelen.judgedCount === 0
            ? '—'
            : `${onTrackCount}/${doelen.judgedCount}`,
        tip:
          doelen.activeCount === 0
            ? 'Nog geen actieve doelen — bepaal waar je vrijheid voor opbouwt.'
            : doelen.judgedCount === 0
              ? 'Je doelen hebben nog geen streefdatum, dus er valt nog geen tempo te meten.'
              : doelen.attentionCount > 0
                ? `${doelen.attentionCount} ${doelen.attentionCount === 1 ? 'doel loopt' : 'doelen lopen'} achter op schema.`
                : 'Al je beoordeelde doelen liggen op koers.',
        actionLabel: 'Beheer doelen',
      },
    },
    {
      key: 'gebeurtenissen',
      label: 'Gebeurtenissen',
      href: '/toekomst/gebeurtenissen',
      Icon: CalendarClock,
      tint: tintForStatus('neutral'),
      // KPI = alleen het moment (cijfer-slot); de naam staat in de subtekst, die
      // vrije gebruikerstekst voorheen ook al droeg. "Geen" spiegelt de lege
      // staat van de Doelen- en Rekenhulp-kaart in dezelfde rij.
      kpi: volgende?.wanneer ?? 'Geen',
      status: 'neutral',
      subText: volgende ? `Volgende: ${volgende.naam}` : 'Nog niets gepland',
      detail: {
        detailLabel: 'Volgende',
        value: volgende?.wanneer ?? '—',
        tip: next ?? 'Plan je eerste gebeurtenis in op de tijdas.',
        actionLabel: 'Bekijk tijdas',
      },
    },
    voorkeurenCard,
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
  /** Zie `buildNavCards` — het profiel zoals de kernel het leest (B-042). */
  withdrawalProfiel?: WithdrawalProfiel
  fireParams: FireParams
  calculatorCount: number
  /** Zie `buildNavCards` — TPR-01, afgeleide plan-review-voortgang. */
  planReview?: PlanReviewProgress | null
}) {
  const allCards = buildNavCards(props)
  // Binnen de PlanReviewProvider (op /toekomst) opent de review-kaart de pane
  // direct; daarbuiten volgt hij gewoon zijn deeplink.
  const planReviewOpener = usePlanReviewOpener()

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
          ? // Compact (Eenvoudig): 3 kleine kaarten naast elkaar — ook op
            // mobiel (eigenaarswens sep 2026); de compact-variant stapelt
            // daar icoon boven label zodat "Gebeurtenissen" past.
            'grid grid-cols-3 gap-2 sm:gap-3'
          : 'grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3'
      }
    >
      {cards.map((card) => {
        const { key, label, compactLabel, href, Icon, tint, kpi, status, subText, detail, opensPlanReview } = card
        const expanded = expandedKey === key
        const leverageCard = (
          <LeverageCard
            key={key}
            Icon={Icon}
            tint={tint}
            label={simple ? (compactLabel ?? label) : label}
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
        if (!opensPlanReview || !planReviewOpener) return leverageCard
        // Onderschep de klik op de kaart-link én de drilldown-actielink (capture-fase,
        // vóór Next's eigen handler). Een gewone klik opent de pane zonder dat /toekomst
        // al zijn loaders opnieuw draait; ctrl/cmd/shift/middelklik volgen de deeplink.
        return (
          <div
            key={key}
            className="contents"
            onClickCapture={(e) => {
              if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
              const anchor = (e.target as HTMLElement).closest('a')
              if (!anchor || anchor.getAttribute('href') !== PLAN_REVIEW_HREF) return
              e.preventDefault()
              e.stopPropagation()
              planReviewOpener.open()
            }}
          >
            {leverageCard}
          </div>
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
