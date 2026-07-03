'use client'

import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  Briefcase,
  Home,
  Wallet,
  Compass,
  ArrowRight,
  Calculator,
  KeyRound,
  TrendingDown,
  TrendingUp,
  Pencil,
  Sparkles,
  Plus,
} from 'lucide-react'
import { formatCurrency, formatWithFreedom } from '@/lib/format'
import { resolveEventIcon } from '@/lib/event-icon'
import type { LifeEvent, FinancialInput, FireProjection, WerkMetadata } from '@/lib/horizon-data'
import type { FireParams } from '@/lib/fire-params'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import type { PreviewBaseline } from '@/lib/strategy-preview'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { Box3Method } from '@/lib/bucket-projection'
import type { HousingStrategyConfig } from '@/lib/housing-strategy'
import { computeEventImpact } from '@/lib/event-impact'
import { useHorizonFireSim } from '@/lib/hooks/use-horizon-fire-sim'
import {
  deriveOpeetLifespanFromRows,
  derivePensionPotEndFromRows,
} from '@/lib/horizon/kernel-strategy-moments'
import { detectDeficitLoanFromRows } from '@/lib/horizon/deficit-loan-display'
import {
  isStrategyManagedEvent,
  STRATEGY_BADGE_LABEL,
  type ManagedStrategy,
} from '@/lib/strategy-events'
import { StrategieEditors, type StrategieEditorsData } from './strategie/strategie-editors'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { BottomSheet } from '@/components/app/bottom-sheet'

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
  /**
   * Rauwe kernel-context (zelfde als de Tijdas-grafiek). Wanneer gezet, draaien de
   * EventPane-delta-previews via de horizon-kernel (`computeConvergentieProjection`);
   * null → geen doorrekening (lege staat). Zie gebeurtenissen/page.tsx.
   */
  previewBaseline: PreviewBaseline | null
}

/**
 * Feature #876 — hook-inputs voor de kernel-run op deze tab die níet al in
 * `strategieData.baseline.rawContext` of `eventPaneData` zitten. De view draait
 * `useHorizonFireSim` (DEZELFDE run-site als de Tijdas-grafiek) zodat de
 * kernel-afgeleide strategiemomenten per constructie het verkoopmoment/de
 * rijen van de grafiek delen. `null` (geen rauwe context) → geen kernel-run,
 * geen kernel-rijen.
 */
export interface KernelSimData {
  aowAgeFractional: number
  box3Method: Box3Method
  bankAccountCash: number
  monthlySavingsOverride: number | null
  baseAnnualSavingsFromCashflow: number | null
  housingStrategy?: HousingStrategyConfig
  /** Gehanteerde tekort-lening-jaarrente (canonieke V7-resolver, 0..1). */
  deficitLoanRate: number
}

/** Eén kernel-afgeleid strategiemoment als tijdlijn-rij (puur weergave). */
interface KernelMoment {
  key: string
  /** Leeftijd op de rij-as (kan fractioneel zijn; weergave vloert op hele jaren). */
  age: number
  /** Klik-doel: strategie-modal (huis/pensioen) of de tekort-uitleg-sheet. */
  action: 'huis' | 'pensioen' | 'tekort'
  Icon: typeof Compass
  title: string
  detail: string
  sub?: string
  /** Waarschuwings-toon (stoplicht-amber, geen module-accent). */
  warn?: boolean
}

/** Kaart-styling van een tijdlijn-rij (gedeeld tussen event- en kernel-rijen). */
const TIMELINE_CARD_CLASS =
  'flex-1 min-w-0 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-left'

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

// Icoon-resolutie loopt nu via de canonieke bron (lib/event-icon.ts): eerst
// op `event.icon` (de catalogus-Lucide-naam), dan een event_type→naam-fallback
// voor legacy-rijen, anders een nette default. Vóórheen viel praktisch elk
// event door naar Wallet omdat de lokale map alleen event-type-sleutels kende.
function iconForEvent(eventType: string, icon?: string): typeof Compass {
  return resolveEventIcon(eventType, icon)
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

/** Korte samenvatting van de Werk-strategie uit de metadata (delta's, niet één bedrag). */
function werkSummary(event: LifeEvent): string {
  const m = (event.metadata ?? {}) as WerkMetadata
  const parts: string[] = []
  if (m.reeleGroeiPct && m.reeleGroeiPct > 0) {
    parts.push(`groei ${Math.round(m.reeleGroeiPct * 1000) / 10}%/jr`)
  }
  if (m.plafondNettoMaand && m.plafondNettoMaand > 0) {
    parts.push(`plafond ${formatCurrency(m.plafondNettoMaand)}`)
  }
  if (m.faseStappen && m.faseStappen.length > 0) {
    const first = [...m.faseStappen].sort((a, b) => a.fromAge - b.fromAge)[0]!
    parts.push(`minder werken vanaf ${first.fromAge}`)
  }
  if (m.sprongen && m.sprongen.length > 0) {
    parts.push(`${m.sprongen.length} sprong${m.sprongen.length === 1 ? '' : 'en'}`)
  }
  return parts.length > 0 ? parts.join(' · ') : 'Inkomenslijn ingesteld'
}

function eventImpact(event: LifeEvent): string {
  if (event.event_type === 'werk') return werkSummary(event)
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
  {
    key: 'werk',
    label: 'Werk-strategie',
    description:
      'Salarisgroei, een plafond, minder werken en promotie-sprongen — je inkomenslijn over de jaren.',
    Icon: Briefcase,
    bg: 'bg-sky-50',
    text: 'text-sky-700',
  },
]

export function GebeurtenissenView({
  events,
  currentAge,
  annualSavings,
  strategieData,
  eventPaneData,
  kernelSim = null,
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
  /** Feature #876 — extra hook-inputs voor de kernel-run; null = geen kernel-rijen. */
  kernelSim?: KernelSimData | null
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
  // Feature #876 — read-only uitleg-sheet voor de tekort-lening-rij.
  const [deficitSheetOpen, setDeficitSheetOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // ── Feature #876: kernel-run (zelfde run-site als de Tijdas-grafiek) ─────
  // De hook draait pas ná hydration (params null → isLoading, skeleton-rij);
  // een korte mount-flits is acceptabel en consistent met de grafiek. GEEN
  // tweede server-run: alle invoer komt uit de al-geserialiseerde props.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  const rawContext = strategieData.baseline?.rawContext ?? null
  const kernelSimActive = Boolean(kernelSim && rawContext)
  const sim = useHorizonFireSim(
    hydrated && kernelSim && rawContext
      ? {
          horizonInput: eventPaneData.baselineInput,
          lifeEvents: events,
          fireStrategy: eventPaneData.fireStrategy,
          withdrawalStrategy: eventPaneData.withdrawalStrategy,
          grossReturn: eventPaneData.fireParams.grossReturn,
          inflation: eventPaneData.fireParams.inflationRate,
          aowAgeFractional: kernelSim.aowAgeFractional,
          assets: rawContext.assets as Asset[],
          debts: rawContext.debts as Debt[],
          box3Method: kernelSim.box3Method,
          hasPartner: eventPaneData.householdMode,
          bankAccountCash: kernelSim.bankAccountCash,
          monthlySavingsOverride: kernelSim.monthlySavingsOverride,
          baseAnnualSavingsFromCashflow: kernelSim.baseAnnualSavingsFromCashflow,
          housingStrategy: kernelSim.housingStrategy,
          kernelRawProfile: rawContext.profile,
          aowRows: rawContext.aowRows as AowLeeftijdRow[] | undefined,
        }
      : null,
  )

  // Bedragen in € mét vrijheidstijd — zelfde dagtarief-grondslag als de
  // strategie-editors (consume, don't recompute). Zonder dagtarief: alleen €.
  const dailyExpenses = strategieData.dailyExpenses
  const fmtAmount = (v: number) =>
    dailyExpenses > 0 ? formatWithFreedom(v, dailyExpenses) : formatCurrency(v)

  // Tekort-lening uit dezelfde rijen als de grafiek (kernel-only signaal).
  const deficitNotice = useMemo(
    () => detectDeficitLoanFromRows(sim.unifiedRows),
    [sim.unifiedRows],
  )

  // Kernel-afgeleide strategiemomenten (puur weergave; voeden NOOIT lifeEvents
  // of simulatie-invoer terug). Rijen verschijnen alleen als het moment bestaat.
  const kernelMoments = useMemo<KernelMoment[]>(() => {
    const out: KernelMoment[] = []
    const opeet = deriveOpeetLifespanFromRows(sim.unifiedRows)
    if (opeet) {
      out.push({
        key: 'opeet-start',
        age: opeet.startAge,
        action: 'huis',
        Icon: KeyRound,
        title: 'Opname opeethypotheek start',
        detail:
          dailyExpenses > 0
            ? `Totaal ${formatWithFreedom(opeet.totalDrawn, dailyExpenses)} opgenomen binnen je plan`
            : `Totaal ${formatCurrency(opeet.totalDrawn)} opgenomen binnen je plan`,
      })
      if (opeet.depletionAge != null) {
        out.push({
          key: 'opeet-uitputting',
          age: opeet.depletionAge,
          action: 'huis',
          Icon: KeyRound,
          title: 'Leenruimte opeethypotheek uitgeput',
          detail: 'De overwaarde-ruimte is op — geen verdere opnames meer.',
          warn: true,
        })
      }
    }
    for (const end of derivePensionPotEndFromRows(sim.unifiedRows, sim.kernelPensionPots)) {
      out.push({
        key: `pensioen-einde-${end.naam}-${end.endAge}`,
        age: end.endAge,
        action: 'pensioen',
        Icon: Wallet,
        title: `${end.naam} stopt`,
        detail: `${formatCurrency(end.maandbedrag)}/mnd uitkering valt weg`,
      })
    }
    if (deficitNotice) {
      out.push({
        key: 'tekort-lening',
        age: deficitNotice.firstAge,
        action: 'tekort',
        Icon: TrendingDown,
        title: 'Tekort-lening ontstaat',
        detail:
          dailyExpenses > 0
            ? `Loopt op tot ${formatWithFreedom(deficitNotice.peak, dailyExpenses)}`
            : `Loopt op tot ${formatCurrency(deficitNotice.peak)}`,
        warn: true,
      })
    }
    return out.sort((a, b) => a.age - b.age)
  }, [sim.unifiedRows, sim.kernelPensionPots, deficitNotice, dailyExpenses])

  // Klik-routering kernel-rijen: huis/opeet → bestaand ?strategie=huis-
  // mechanisme (zelfde modal-open als de deeplink), pensioenpot-einde →
  // pensioen-strategie, tekort-lening → read-only uitleg-sheet.
  function openKernelMoment(m: KernelMoment) {
    if (m.action === 'tekort') setDeficitSheetOpen(true)
    else setOpenStrategy(m.action)
  }

  // Deep-link: ?strategie=aow|pensioen|huis opent de bijbehorende modal.
  // (Disjunct van het bestaande ?strategie=open van de horizon-strategiekiezer.)
  useEffect(() => {
    const s = searchParams.get('strategie')
    if (s === 'aow' || s === 'pensioen' || s === 'huis' || s === 'werk') setOpenStrategy(s)
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

  // Deep-link: ?nieuw=1|true opent de EventPane direct in catalog-mode
  // (vanuit een overlay-CTA op de Tijdas-grafiek). Spiegelt het ?strategie=-effect.
  // Na openCatalog gedeclareerd zodat de functie in scope is bij mount.
  useEffect(() => {
    const n = searchParams.get('nieuw')
    if (n === '1' || n === 'true') openCatalog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Sluit de EventPane én ruim een eventuele ?nieuw-param op (spiegelt closeStrategy).
  function closeEventPane() {
    setEventPaneOpen(false)
    if (searchParams.get('nieuw')) {
      const p = new URLSearchParams(searchParams)
      p.delete('nieuw')
      router.replace(`${pathname}${p.toString() ? `?${p}` : ''}`, { scroll: false })
    }
  }
  // Tijdlijn-bron: op de kernel-tak vervangt de hook het stale server-virtuele
  // verkoop-event door het kernel-afgeleide verkoopmoment (zelfde run als de
  // grafiek-markers); vóór hydration vallen we terug op de server-events.
  const displayEvents = sim.effectiveLifeEvents.length > 0 ? sim.effectiveLifeEvents : events

  // Sort events op target_date (alfabet als fallback). Events met datum
  // tonen we eerst chronologisch, daarna events met alleen target_age,
  // tenslotte events zonder timing.
  const sorted = [...displayEvents].sort((a, b) => {
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

  // Interleave de kernel-momenten op leeftijd tussen de leeftijd-gesorteerde
  // events (datum-events blijven vooraan, conform de bestaande sortering).
  // Zonder kernel-momenten is de tijdlijn identiek aan de events-lijst.
  type TimelineItem = { kind: 'event'; event: LifeEvent } | { kind: 'moment'; moment: KernelMoment }
  const timeline: TimelineItem[] = []
  {
    let mi = 0
    for (const event of sorted) {
      const evAge = event.target_date == null ? event.target_age : null
      while (mi < kernelMoments.length && evAge != null && kernelMoments[mi].age <= evAge) {
        timeline.push({ kind: 'moment', moment: kernelMoments[mi++] })
      }
      timeline.push({ kind: 'event', event })
    }
    while (mi < kernelMoments.length) {
      timeline.push({ kind: 'moment', moment: kernelMoments[mi++] })
    }
  }

  // Skeleton-rij zolang de kernel-run nog niet gedraaid heeft (tot hydration).
  const showKernelSkeleton = kernelSimActive && sim.isLoading

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

        {sorted.length === 0 && kernelMoments.length === 0 && !showKernelSkeleton ? (
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

            {timeline.map((item) => {
              // ── Kernel-afgeleid strategiemoment (feature #876) ──────────
              // Niet-bewerkbaar: geen EventPane/edit-affordance. Klik opent de
              // bijbehorende strategie-modal of de tekort-uitleg-sheet.
              if (item.kind === 'moment') {
                const m = item.moment
                const MomentIcon = m.Icon
                const nodeTone = m.warn
                  ? 'border-amber-400 text-amber-700'
                  : 'border-[var(--ink-3)] text-[var(--ink-2)]'
                return (
                  <li key={`kernel-${m.key}`} className="relative flex gap-4 pb-6 last:pb-0">
                    {/* Gestippeld bolletje = berekend (onderscheid met events) */}
                    <span
                      className={`relative z-10 shrink-0 w-10 h-10 rounded-full border-2 border-dashed bg-[var(--paper)] flex items-center justify-center ${nodeTone}`}
                    >
                      <MomentIcon className="w-4 h-4" aria-hidden="true" />
                    </span>

                    <button
                      type="button"
                      onClick={() => openKernelMoment(m)}
                      aria-label={`Berekend: ${m.title}`}
                      className={`${TIMELINE_CARD_CLASS} w-full hover:border-[var(--ink-3)] hover:shadow-sm transition-all`}
                    >
                      <div className="text-[11px] text-[var(--ink-3)] mb-0.5">
                        Leeftijd {Math.floor(m.age)}
                      </div>
                      <h3 className="text-sm font-semibold text-[var(--ink)] truncate inline-flex items-center gap-1.5">
                        {m.title}
                        <Calculator
                          className="w-3 h-3 text-[var(--ink-4)] shrink-0"
                          aria-hidden="true"
                        />
                      </h3>
                      <div className="mt-0.5 text-[10px] font-medium text-[var(--ink-3)]">
                        Berekend door je plan
                      </div>
                      <p className="text-xs text-[var(--ink-2)] leading-snug mt-1">{m.detail}</p>
                      {m.sub && (
                        <p className="text-[11px] text-[var(--ink-3)] leading-snug mt-0.5">
                          {m.sub}
                        </p>
                      )}
                      {/* Klik-bestemming expliciet (ux-review): strategie-modal vs
                          read-only uitleg — uit het uiterlijk alleen niet af te leiden. */}
                      <p className="mt-1.5 text-[11px] font-medium text-[var(--module-active-700)]">
                        {m.action === 'tekort' ? 'Meer uitleg →' : 'Bekijk strategie →'}
                      </p>
                    </button>
                  </li>
                )
              }

              const event = item.event
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
                    ? 'text-positive bg-positive/10'
                    : 'text-[var(--ink-3)] bg-[var(--subtle)]'
              // Bolletje-kleur volgt de impact-tone zodat de tijdlijn in
              // één oogopslag kosten (amber) vs. opbrengsten (positief)
              // toont.
              const nodeColor =
                impact?.tone === 'cost'
                  ? 'border-amber-400 text-amber-700'
                  : impact?.tone === 'gain'
                    ? 'border-positive/40 text-positive'
                    : 'border-[var(--ink-3)] text-[var(--ink-2)]'
              // Content-kaart is een button die de EventPane (vrij event)
              // of strategie-editor opent.
              const managed = isStrategyManagedEvent(event)
              // Feature #876: het kernel-afgeleide verkoop-event (uit
              // `applyKernelHousingSaleToEvents`) is puur weergave — badge
              // "Berekend door je plan", geen edit-affordance; klik opent de
              // Huis-strategie (via `managed`, zelfde ?strategie=huis-modal).
              const meta = (event.metadata ?? {}) as {
                kernelDerived?: boolean
                saleProceeds?: number
                mortgageBalanceAtTrigger?: number
              }
              const kernelDerived = meta.kernelDerived === true
              const cardProps = {
                type: 'button' as const,
                onClick: () => openEventOrStrategy(event),
                'aria-label': kernelDerived
                  ? `Berekend: ${event.name}`
                  : managed
                    ? `Open ${STRATEGY_BADGE_LABEL[managed]}`
                    : `Bewerk ${event.name}`,
                className: `${TIMELINE_CARD_CLASS} w-full hover:border-[var(--ink-3)] hover:shadow-sm transition-all`,
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
                      {kernelDerived && event.target_age != null
                        ? `Leeftijd ${Math.floor(event.target_age)}`
                        : formatEventDate(event)}
                    </div>
                    <h3 className="text-sm font-semibold text-[var(--ink)] truncate inline-flex items-center gap-1.5">
                      {event.name}
                      {!managed && !kernelDerived && (
                        <Pencil className="w-3 h-3 text-[var(--ink-4)] shrink-0" aria-hidden="true" />
                      )}
                      {managed && !kernelDerived && (
                        <Sparkles className="w-3 h-3 text-[var(--module-active-700)] shrink-0" aria-hidden="true" />
                      )}
                      {kernelDerived && (
                        <Calculator className="w-3 h-3 text-[var(--ink-4)] shrink-0" aria-hidden="true" />
                      )}
                    </h3>
                    {kernelDerived ? (
                      <div className="mt-0.5 text-[10px] font-medium text-[var(--ink-3)]">
                        Berekend door je plan
                      </div>
                    ) : (
                      managed && (
                        <div className="mt-0.5 text-[10px] font-medium text-[var(--ink-3)]">
                          {STRATEGY_BADGE_LABEL[managed]}
                        </div>
                      )
                    )}
                    <p className="text-xs text-[var(--ink-2)] leading-snug mt-1">
                      {kernelDerived && typeof meta.saleProceeds === 'number' && meta.saleProceeds > 0
                        ? `Netto-opbrengst ${fmtAmount(Math.round(meta.saleProceeds))}`
                        : eventImpact(event)}
                    </p>
                    {kernelDerived &&
                      typeof meta.mortgageBalanceAtTrigger === 'number' &&
                      meta.mortgageBalanceAtTrigger > 0 && (
                        <p className="text-[11px] text-[var(--ink-3)] leading-snug mt-0.5">
                          Restschuld hypotheek (≈{' '}
                          {formatCurrency(Math.round(meta.mortgageBalanceAtTrigger))}) wordt bij
                          verkoop afgelost
                        </p>
                      )}
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

            {/* Feature #876 — skeleton-rij tot hydration: de kernel-momenten
                komen uit de client-side kernel-run (zelfde als de grafiek). */}
            {showKernelSkeleton && (
              <li className="relative flex gap-4 pb-6 last:pb-0" aria-hidden="true">
                <span className="relative z-10 shrink-0 w-10 h-10 rounded-full border-2 border-dashed border-[var(--border-md)] bg-[var(--paper)] animate-pulse" />
                <div className={`${TIMELINE_CARD_CLASS} animate-pulse`}>
                  <div className="h-3 w-20 rounded bg-[var(--subtle)] mb-2" />
                  <div className="h-4 w-44 rounded bg-[var(--subtle)]" />
                </div>
              </li>
            )}
          </ol>
        )}
      </div>

      {/* Levensstrategieën */}
      <HideInSimple>
      <div>
        <header className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Toekomst — levensstrategieën
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
            Vier multi-step strategieën
          </h2>
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            Anders dan losse gebeurtenissen: strategieën hebben eigen
            parameters en zijn als bandjes zichtbaar op de tijdas.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
                <span className="mt-3 text-[11px] font-semibold text-horizon-700 inline-flex items-center gap-1">
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
      </HideInSimple>

      <EventPane
        open={eventPaneOpen}
        onClose={closeEventPane}
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
        previewBaseline={eventPaneData.previewBaseline}
        onChanged={() => router.refresh()}
      />

      <StrategieEditors
        open={openStrategy}
        onClose={closeStrategy}
        events={events}
        data={strategieData}
        readOnly={false}
      />

      {/* Feature #876 — read-only uitleg-sheet voor de tekort-lening-rij.
          Gedeelde BottomSheet (z-[70]-conventie automatisch). */}
      <BottomSheet
        open={deficitSheetOpen}
        onClose={() => setDeficitSheetOpen(false)}
        title="Tekort-lening"
        size="sm"
      >
        <div className="px-5 pb-6 space-y-4">
          <p className="text-sm text-[var(--ink-2)] leading-relaxed">
            Op je huidige plan komt er een moment waarop je uitgaven niet meer
            gedekt worden door je vermogen. Je plan rekent dat tekort door als
            een synthetische lening met rente — geen echte lening, wel een
            eerlijk signaal dat je plan hier knelt.
          </p>
          {deficitNotice && (
            <dl className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] divide-y divide-[var(--border-ed)] text-sm">
              <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                <dt className="text-[var(--ink-3)]">Ontstaat op leeftijd</dt>
                <dd className="font-semibold text-[var(--ink)]">
                  {Math.floor(deficitNotice.firstAge)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                <dt className="text-[var(--ink-3)]">Piek van het tekort</dt>
                <dd className="font-semibold text-[var(--ink)] text-right">
                  {fmtAmount(deficitNotice.peak)}
                </dd>
              </div>
              {kernelSim && (
                <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                  <dt className="text-[var(--ink-3)]">Gehanteerde rente</dt>
                  <dd className="font-semibold text-[var(--ink)]">
                    {(kernelSim.deficitLoanRate * 100).toLocaleString('nl-NL', {
                      maximumFractionDigits: 1,
                    })}
                    %/jr
                  </dd>
                </div>
              )}
            </dl>
          )}
          <Link
            href="/toekomst/voorkeuren?regel=eindstrategie"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--module-active-700)]"
          >
            Rente tekort-lening aanpassen bij je voorkeuren
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
      </BottomSheet>
    </section>
  )
}
