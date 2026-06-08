'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  Baby,
  Briefcase,
  Home,
  HeartHandshake,
  Wallet,
  Compass,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Pencil,
  Sparkles,
  Plus,
} from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { LifeEvent, FinancialInput, FireProjection } from '@/lib/horizon-data'
import type { FireParams } from '@/lib/fire-params'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import { computeEventImpact } from '@/lib/event-impact'
import {
  isStrategyManagedEvent,
  STRATEGY_BADGE_LABEL,
  type ManagedStrategy,
} from '@/lib/strategy-events'
import { StrategieEditors, type StrategieEditorsData } from './strategie/strategie-editors'

// EventPane = herstelde toevoeg/bewerk-flow uit /horizon (catalogus + Praat met
// Will + 3-blokken-editor). Dynamisch geladen zodat de pagina-bundle licht blijft.
const EventPane = dynamic(() =>
  import('@/components/app/horizon/event-pane').then(m => ({ default: m.EventPane })),
  { ssr: false }
)

/** Prop-bundle die de EventPane van baseline-data voorziet (server-geleverd). */
export interface EventPaneData {
  baselineInput: FinancialInput
  baselineFire: FireProjection | null
  fireParams: FireParams
  fireStrategy: FireStrategyConfig
  withdrawalStrategy: WithdrawalStrategyConfig
  endAge: number
  householdMode: boolean
}

/**
 * GebeurtenissenView — content voor Gebeurtenissen-tab op /toekomst.
 *
 * Plan §6.3 splitst dit in twee secties:
 *  1. Levensgebeurtenissen — punt-in-tijd events (kind, erfenis, ZZP-start,
 *     deeltijd, verhuizing, schenking). Bewerken via sheet (kort formulier).
 *  2. Levensstrategieën — 3 multi-step strategieën met eigen pane:
 *     - AOW-strategie (ingangsleeftijd, partneraftrek, AOW-gat-overbrugging)
 *     - Pensioen-strategie (werknemerspensioen + lijfrente + jaarruimte)
 *     - Huis-strategie (kopen / verkopen / herfinancieren / aflossingsplan)
 *
 * Voor MVP-extractie: lijst van life_events uit horizonData + 3 strategie-
 * cards die deeplinken naar /toekomst/strategie. Native sheet/pane voor
 * bewerken komt in volgende iteratie.
 */

const EVENT_ICONS: Record<string, typeof Compass> = {
  child: Baby,
  kind: Baby,
  career: Briefcase,
  zzp: Briefcase,
  retirement: Compass,
  housing: Home,
  inheritance: HeartHandshake,
  default: Wallet,
}

function iconForEvent(eventType: string, icon?: string): typeof Compass {
  const key = (icon ?? eventType ?? '').toLowerCase()
  return EVENT_ICONS[key] ?? EVENT_ICONS.default ?? Compass
}

function formatEventDate(event: LifeEvent): string {
  if (event.target_date) {
    return new Date(event.target_date).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }
  if (event.target_age != null) {
    return `Leeftijd ${event.target_age}`
  }
  return 'Datum onbekend'
}

function eventImpact(event: LifeEvent): string {
  const parts: string[] = []
  if (event.one_time_cost > 0) {
    parts.push(`Eenmalig ${formatCurrency(event.one_time_cost)}`)
  } else if (event.one_time_cost < 0) {
    parts.push(`Eenmalig opbrengst ${formatCurrency(Math.abs(event.one_time_cost))}`)
  }
  if (event.monthly_cost_change !== 0) {
    const sign = event.monthly_cost_change > 0 ? '+' : '−'
    parts.push(`${sign}${formatCurrency(Math.abs(event.monthly_cost_change))}/mnd kosten`)
  }
  if (event.monthly_income_change !== 0) {
    const sign = event.monthly_income_change > 0 ? '+' : '−'
    parts.push(`${sign}${formatCurrency(Math.abs(event.monthly_income_change))}/mnd inkomen`)
  }
  return parts.length > 0 ? parts.join(' · ') : 'Geen geldelijke impact'
}

const LEVENSSTRATEGIEEN: {
  key: ManagedStrategy
  label: string
  description: string
  Icon: typeof Compass
  bg: string
  text: string
}[] = [
  {
    key: 'aow',
    label: 'AOW-strategie',
    description:
      'Ingangsleeftijd, leefsituatie en opbouwkorting (jaren buiten NL). Default = wettelijk.',
    Icon: Compass,
    bg: 'bg-violet-50',
    text: 'text-violet-700',
  },
  {
    key: 'pensioen',
    label: 'Pensioen-strategie',
    description:
      'Werknemerspensioen, lijfrente en banksparen — beheer al je pensioenpotten op één plek.',
    Icon: Wallet,
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
  },
  {
    key: 'huis',
    label: 'Huis-strategie',
    description:
      'Volledig meetellen, uitsluiten, verkopen of opeethypotheek — hoe je woning meetelt in je vrijheid.',
    Icon: Home,
    bg: 'bg-amber-50',
    text: 'text-amber-700',
  },
]

export function GebeurtenissenView({
  events,
  currentAge,
  annualSavings,
  strategieData,
  eventPaneData,
}: {
  events: LifeEvent[]
  /** Huidige leeftijd uit DOB — nodig om scenario-defaults op te baseren
   *  (target_age = currentAge + N). */
  currentAge?: number | null
  /** Jaarlijks netto overschot (income - expenses × 12). Basis voor
   *  EventImpactBadge — plan F-5 vergelijk-modus MVP. Wanneer 0 of
   *  ontbrekend: badge toont "Impact onbekend". */
  annualSavings?: number
  /** Baseline + lookup-data voor de levensstrategie-editors (AOW/Pensioen/Huis). */
  strategieData: StrategieEditorsData
  /** Baseline-data voor de EventPane (toevoegen + bewerken vrije events). */
  eventPaneData: EventPaneData
}) {
  // EventPane (toevoegen/bewerken) = scenario-tool → alleen in 'plannen'-modus
  // zichtbaar (plan A-5). Niveau-A "Kijken"-gebruikers zien dan een
  // rustige lijst van bestaande events zonder edit-knoppen.
  // EventPane-state: catalog (nieuw) of view (bestaand vrij event bekijken/bewerken).
  const [eventPaneOpen, setEventPaneOpen] = useState(false)
  const [eventPaneEditingId, setEventPaneEditingId] = useState<string | null>(null)
  const [eventPaneMode, setEventPaneMode] = useState<'catalog' | 'view'>('catalog')
  // Welke levensstrategie-modal is open (null = dicht).
  const [openStrategy, setOpenStrategy] = useState<ManagedStrategy | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Deep-link: ?strategie=aow|pensioen|huis opent de bijbehorende modal.
  // (Disjunct van het bestaande ?strategie=open van de horizon-strategiekiezer.)
  useEffect(() => {
    const s = searchParams.get('strategie')
    if (s === 'aow' || s === 'pensioen' || s === 'huis') setOpenStrategy(s)
  }, [searchParams])

  function closeStrategy() {
    setOpenStrategy(null)
    if (searchParams.get('strategie')) {
      const p = new URLSearchParams(searchParams)
      p.delete('strategie')
      router.replace(`${pathname}${p.toString() ? `?${p}` : ''}`, { scroll: false })
    }
  }

  // Routeert een klik op een event-kaart: strategie-beheerde events openen hun
  // eigen rijke editor; vrije events de herstelde EventPane (view → edit).
  function openEventOrStrategy(event: LifeEvent) {
    const managed = isStrategyManagedEvent(event)
    if (managed) {
      setOpenStrategy(managed)
    } else {
      setEventPaneEditingId(event.id)
      setEventPaneMode('view')
      setEventPaneOpen(true)
    }
  }

  // Opent de EventPane in catalog-mode (nieuw event toevoegen).
  function openCatalog() {
    setEventPaneEditingId(null)
    setEventPaneMode('catalog')
    setEventPaneOpen(true)
  }
  // Sort events op target_date (alfabet als fallback). Events met datum
  // tonen we eerst chronologisch, daarna events met alleen target_age,
  // tenslotte events zonder timing.
  const sorted = [...events].sort((a, b) => {
    if (a.target_date && b.target_date) {
      return a.target_date.localeCompare(b.target_date)
    }
    if (a.target_date) return -1
    if (b.target_date) return 1
    if (a.target_age != null && b.target_age != null) {
      return a.target_age - b.target_age
    }
    return a.name.localeCompare(b.name)
  })

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-8 space-y-8">
      {/* Levensgebeurtenissen */}
      <div>
        <header className="mb-4 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
              Toekomst — levensgebeurtenissen
            </div>
            <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
              {sorted.length === 0
                ? 'Geen gebeurtenissen'
                : `${sorted.length} gebeurtenis${sorted.length === 1 ? '' : 'sen'}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={openCatalog}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--ink-2)] transition-colors"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Levensgebeurtenis toevoegen
          </button>
        </header>

        {sorted.length === 0 ? (
          <article className="rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-6 sm:p-8 text-center">
            <p className="text-sm text-[var(--ink-2)] leading-relaxed mb-3">
              Voeg een gebeurtenis toe om de impact op je tijdas te zien —
              kind, erfenis, verhuizing, ZZP-start, deeltijd of een andere
              levenskeuze.
            </p>
            <button
              type="button"
              onClick={openCatalog}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--ink)] text-[var(--paper)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--ink-2)] transition-colors"
            >
              Eerste gebeurtenis toevoegen
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </article>
        ) : (
          // Verticale tijdlijn: doorlopende streep links met een bolletje
          // (event-icoon in een cirkel) per gebeurtenis, chronologisch
          // gesorteerd. Een "Nu"-startnode verankert de lijn.
          <ol className="relative">
            {/* De doorlopende streep — loopt door het midden van de
                bolletjes (cirkel-radius 20px → center op left-5). Stopt
                onder het laatste bolletje via de gradient-fade niet nodig;
                we laten 'm gewoon tot de laatste node lopen. */}
            <span
              aria-hidden="true"
              className="absolute left-5 top-2 bottom-8 w-px bg-[var(--border-ed)]"
            />

            {/* Start-node: "Nu" */}
            <li className="relative flex gap-4 pb-6">
              <span
                aria-hidden="true"
                className="relative z-10 shrink-0 w-10 h-10 rounded-full border-2 border-[var(--ink-3)] bg-[var(--paper)] flex items-center justify-center"
              >
                <span className="w-2 h-2 rounded-full bg-[var(--ink-3)]" />
              </span>
              <div className="flex-1 min-w-0 pt-2">
                <div className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]">
                  Nu{currentAge != null ? ` · ${currentAge} jaar` : ''}
                </div>
              </div>
            </li>

            {sorted.map((event) => {
              const Icon = iconForEvent(event.event_type, event.icon)
              // Plan F-5: per event een impact-badge met geschatte
              // delta in maanden/jaren vrijheid. Alleen wanneer
              // annualSavings beschikbaar is en > 0.
              const impact =
                annualSavings && annualSavings > 0
                  ? computeEventImpact(event, annualSavings)
                  : null
              const ImpactIcon =
                impact?.tone === 'cost'
                  ? TrendingDown
                  : impact?.tone === 'gain'
                    ? TrendingUp
                    : null
              const impactClass =
                impact?.tone === 'cost'
                  ? 'text-amber-700 bg-amber-50'
                  : impact?.tone === 'gain'
                    ? 'text-emerald-700 bg-emerald-50'
                    : 'text-[var(--ink-3)] bg-[var(--subtle)]'
              // Bolletje-kleur volgt de impact-tone zodat de tijdlijn in
              // één oogopslag kosten (amber) vs. opbrengsten (emerald)
              // toont.
              const nodeColor =
                impact?.tone === 'cost'
                  ? 'border-amber-400 text-amber-700'
                  : impact?.tone === 'gain'
                    ? 'border-emerald-400 text-emerald-700'
                    : 'border-[var(--ink-3)] text-[var(--ink-2)]'
              // Content-kaart is een button die de EventPane (vrij event)
              // of strategie-editor opent.
              const cardClass =
                'flex-1 min-w-0 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-left'
              const managed = isStrategyManagedEvent(event)
              const cardProps = {
                type: 'button' as const,
                onClick: () => openEventOrStrategy(event),
                'aria-label': managed
                  ? `Open ${STRATEGY_BADGE_LABEL[managed]}`
                  : `Bewerk ${event.name}`,
                className: `${cardClass} w-full hover:border-[var(--ink-3)] hover:shadow-sm transition-all`,
              }
              return (
                <li key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
                  {/* Bolletje met event-icoon, zit op de streep */}
                  <span
                    className={`relative z-10 shrink-0 w-10 h-10 rounded-full border-2 bg-[var(--paper)] flex items-center justify-center ${nodeColor}`}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </span>

                  <button {...cardProps}>
                    <div className="text-[11px] text-[var(--ink-3)] mb-0.5">
                      {formatEventDate(event)}
                    </div>
                    <h3 className="text-sm font-semibold text-[var(--ink)] truncate inline-flex items-center gap-1.5">
                      {event.name}
                      {!managed && (
                        <Pencil className="w-3 h-3 text-[var(--ink-4)] shrink-0" aria-hidden="true" />
                      )}
                      {managed && (
                        <Sparkles className="w-3 h-3 text-[var(--module-active-700)] shrink-0" aria-hidden="true" />
                      )}
                    </h3>
                    {managed && (
                      <div className="mt-0.5 text-[10px] font-medium text-[var(--ink-3)]">
                        {STRATEGY_BADGE_LABEL[managed]}
                      </div>
                    )}
                    <p className="text-xs text-[var(--ink-2)] leading-snug mt-1">
                      {eventImpact(event)}
                    </p>
                    {impact && impact.tone !== 'neutral' && (
                      <div
                        className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${impactClass}`}
                        title="Schatting o.b.v. jaarlijks overschot. Voor exacte impact zie Tijdas."
                      >
                        {ImpactIcon && <ImpactIcon className="w-3 h-3" aria-hidden="true" />}
                        {impact.displayLabel}
                      </div>
                    )}
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </div>

      {/* Levensstrategieën */}
      <div>
        <header className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Toekomst — levensstrategieën
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
            Drie multi-step strategieën
          </h2>
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            Anders dan losse gebeurtenissen: strategieën hebben eigen
            parameters en zijn als bandjes zichtbaar op de tijdas.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {LEVENSSTRATEGIEEN.map((strat) => {
            const Icon = strat.Icon
            const cls =
              'rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5 flex flex-col text-left'
            const inner = (
              <>
                <div
                  className={`w-9 h-9 rounded-lg ${strat.bg} ${strat.text} flex items-center justify-center mb-3`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--ink)] mb-1.5">
                  {strat.label}
                </h3>
                <p className="text-xs text-[var(--ink-2)] leading-snug flex-1">
                  {strat.description}
                </p>
                <span className="mt-3 text-[11px] font-semibold text-violet-700 inline-flex items-center gap-1">
                  Configureren
                  <ArrowRight className="w-3 h-3" aria-hidden="true" />
                </span>
              </>
            )
            return (
              <button
                key={strat.key}
                type="button"
                onClick={() => setOpenStrategy(strat.key)}
                className={`${cls} w-full hover:border-[var(--ink-3)] hover:shadow-sm transition-all`}
              >
                {inner}
              </button>
            )
          })}
        </div>
      </div>

      <EventPane
        open={eventPaneOpen}
        onClose={() => setEventPaneOpen(false)}
        editingId={eventPaneEditingId}
        initialMode={eventPaneMode}
        events={events}
        baselineInput={eventPaneData.baselineInput}
        baselineFire={eventPaneData.baselineFire}
        fireParams={eventPaneData.fireParams}
        fireStrategy={eventPaneData.fireStrategy}
        withdrawalStrategy={eventPaneData.withdrawalStrategy}
        endAge={eventPaneData.endAge}
        householdMode={eventPaneData.householdMode}
        onChanged={() => router.refresh()}
      />

      <StrategieEditors
        open={openStrategy}
        onClose={closeStrategy}
        events={events}
        data={strategieData}
        readOnly={false}
      />
    </section>
  )
}
