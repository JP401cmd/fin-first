'use client'

/**
 * Grenzenpotten op /overzicht/cashflow/transacties — beheer + stand.
 *
 * euro-view: exempt (gerealiseerde historie)
 *
 * DATAPAD (ADR 0058): dit component KRIJGT zijn gegevens als props van de
 * server-page (loadSpendLimitsSection) en haalt zelf niets op om te tonen.
 * Muteren gaat via /api/spend-limits; na een geslaagde mutatie doet
 * `router.refresh()` de server-loader opnieuw draaien, zodat de getoonde stand
 * altijd uit dezelfde rekenmotor komt als bij een volle paginalading. De twee
 * eigen fetches zijn allebei ON-DEMAND en allebei geen weergavedata: de
 * tegenpartij-keuzelijst en de match-preview — beide pas zodra het formulier
 * openstaat.
 *
 * CONSUME, DON'T RECOMPUTE: er wordt hier geen enkel bedrag, overschrijding,
 * reeks of trend berekend. Alles komt kant-en-klaar uit
 * lib/spend-limits/engine.ts (via de loader) of uit de preview-route, die
 * dezelfde motorfuncties draait. De enige omrekening die hier gebeurt is
 * €→vrijheidstijd, en die loopt door de canonieke helpers uit lib/format.ts op
 * het dagtarief dat de loader meelevert — nooit een eigen /30.
 *
 * OVERLAYS: uitsluitend via <ShellOverlay> (ADR 0039) — `sheet` voor het
 * formulier, `confirm` voor archiveren, `pane` voor het lezen van het verloop.
 * Primaire acties staan in de sticky footer, óók op klein scherm.
 *
 * DEEPLINK (D7): de server-page leest `?limit=<uuid>[&periode=<periodKey>]` en
 * geeft dat door als `openLimitId`/`openPeriodKey`. Deze sectie bezit de
 * URL-staat: zij opent de pane, scrollt de kaart in beeld en ruimt de
 * parameters bij sluiten op met `router.replace`. Een onbekend of gearchiveerd
 * id levert bewust GEEN foutmelding op — de pane blijft simpelweg dicht.
 *
 * KLEUR: module-identiteit via `kern-*` (dit leeft op /overzicht). De status
 * binnen/dichtbij/boven de grens is SEMANTIEK en volgt de accentkeuze dus niet —
 * `text-positive` / `text-negative`.
 *
 * NAAM: de weergavenaam (Grenzenpot ⇄ Schaamtepot) komt uit
 * `useSpendLimitCopy()`, niet uit de niet-reactieve constante — een wissel op
 * /mijn/uiterlijk flipt dit oppervlak direct, zonder herladen (AC-B5-01).
 *
 * PRIVACY: elk euro-bedrag rendert via <MaskedAmount>, inclusief de bedragen in
 * het formulier-overzicht, de preview en de keuzelijst.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  ChevronRight,
  Flame,
  Pause,
  Pencil,
  Play,
  Plus,
  Target,
  Trash2,
} from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import { MaskedAmount } from '@/components/app/masked-amount'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { useSpendLimitCopy } from '@/lib/hooks/use-spend-limit-alias'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { SPEND_LIMIT_WINDOW_BY_PERIOD } from '@/lib/spend-limits/engine'
import type { SpendLimitTrendDirection } from '@/lib/spend-limits/engine'
import type { SpendLimitOverlap } from '@/lib/spend-limits/overlap'
import type { SpendLimitPreviewResponse } from '@/app/api/spend-limits/preview/route'
import type {
  SpendLimitBudgetOption,
  SpendLimitConfig,
  SpendLimitCounterpartyOption,
  SpendLimitPeriodKind,
  SpendLimitsSectionData,
  SpendLimitWithReport,
} from '@/lib/spend-limits/types'
import { SpendLimitPerformancePane } from './spend-limit-performance-pane'

// ── Periodesoorten ──────────────────────────────────────────────────────────

const PERIODS: readonly SpendLimitPeriodKind[] = ['month', 'quarter', 'year']

/** Hoe de gebruiker de periodesoort noemt. Enkelvoud, meervoud, en de tab-tekst. */
const PERIOD_WORDS: Record<
  SpendLimitPeriodKind,
  { tab: string; singular: string; plural: string }
> = {
  month: { tab: 'Per maand', singular: 'maand', plural: 'maanden' },
  quarter: { tab: 'Per kwartaal', singular: 'kwartaal', plural: 'kwartalen' },
  year: { tab: 'Per jaar', singular: 'jaar', plural: 'jaren' },
}

/**
 * Hoeveel AFGESLOTEN periodes de reeks-context van een periodesoort beslaat.
 * Afgeleid van de motor-constante (die telt de lopende periode mee) — nooit een
 * eigen getal, anders loopt de waarschuwingstekst weg van wat de reeks doet.
 */
function closedPeriodContext(period: SpendLimitPeriodKind): number {
  return SPEND_LIMIT_WINDOW_BY_PERIOD[period] - 1
}

// ── Formulierstaat ──────────────────────────────────────────────────────────

interface FormState {
  id: string | null
  name: string
  purpose: string
  ruleType: 'budget' | 'counterparty'
  budgetId: string
  includeChildBudgets: boolean
  counterpartyLabel: string
  limitAmount: string
  period: SpendLimitPeriodKind
  /**
   * De periodesoort waarmee deze pot de sheet in kwam; `null` bij een nieuwe pot.
   * Alleen nodig om te zien of de gebruiker WISSELT — dan verandert namelijk ook
   * de lengte van de reeks-context, en dat hoort in de waarschuwing (AC-B4-09).
   */
  originalPeriod: SpendLimitPeriodKind | null
  isActive: boolean
}

function emptyForm(budgetOptions: SpendLimitBudgetOption[]): FormState {
  return {
    id: null,
    name: '',
    purpose: '',
    ruleType: 'budget',
    budgetId: budgetOptions[0]?.id ?? '',
    includeChildBudgets: true,
    counterpartyLabel: '',
    limitAmount: '',
    period: 'month',
    originalPeriod: null,
    isActive: true,
  }
}

function formFromConfig(config: SpendLimitConfig): FormState {
  return {
    id: config.id,
    name: config.name,
    purpose: config.purpose ?? '',
    ruleType: config.ruleType,
    budgetId: config.budgetId ?? '',
    includeChildBudgets: config.includeChildBudgets,
    counterpartyLabel: config.counterpartyLabel ?? '',
    limitAmount: String(config.limitAmount),
    period: config.period,
    originalPeriod: config.period,
    isActive: config.isActive,
  }
}

/** Vertaalt de regel naar één leesbare zin. */
function ruleSentence(config: SpendLimitConfig): string {
  if (config.ruleType === 'budget') {
    const naam = config.budgetName ?? 'een budget dat niet meer beschikbaar is'
    return config.includeChildBudgets
      ? `Uitgaven in ${naam} (inclusief subbudgetten)`
      : `Uitgaven in ${naam}`
  }
  return `Uitgaven bij ${config.counterpartyLabel ?? 'een tegenpartij'}`
}

/**
 * De €→vrijheidstijd-regel. Bewust een LOKALE helper en geen import uit
 * spend-limit-performance-pane.tsx: dat bestand heeft een andere eigenaar, en
 * een gedeelde export ertussen zou een naad maken waar er geen hoeft te zijn.
 * De rekenkant is identiek — dezelfde twee helpers uit lib/format.ts op hetzelfde
 * dagtarief uit de loader.
 *
 * Onder maskering verdwijnt hij: vrijheidstijd is bedrag ÷ dagtarief en zou het
 * verborgen bedrag alsnog uitspellen.
 */
function FreedomLine({
  amount,
  dailyExpenseRate,
  prefix,
  className = '',
}: {
  amount: number
  dailyExpenseRate: number | null
  prefix: string
  className?: string
}) {
  const { masked } = useMaskedAmounts()
  if (masked) return null
  if (dailyExpenseRate === null || !(dailyExpenseRate > 0)) return null
  if (!(Math.abs(amount) > 0)) return null
  const time = formatFreedomTimeString(calculateFreedomTime(amount, dailyExpenseRate), 'short')
  return (
    <p className={`font-serif text-[11px] italic text-[var(--ink-3)] ${className}`}>
      {prefix} ≈ {time} vrijheid
    </p>
  )
}

// ── Sectie ──────────────────────────────────────────────────────────────────

export function SpendLimitsSection({
  data,
  openLimitId = null,
  openPeriodKey = null,
}: {
  data: SpendLimitsSectionData
  /** `?limit=` uit de URL — opent de prestatieweergave voor die pot (AC-B1-09). */
  openLimitId?: string | null
  /** `?periode=` uit de URL — voorselectie binnen die weergave. */
  openPeriodKey?: string | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const copy = useSpendLimitCopy()
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>(() => emptyForm(data.budgetOptions))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState<SpendLimitConfig | null>(null)
  const [counterparties, setCounterparties] = useState<SpendLimitCounterpartyOption[] | null>(null)
  const [paneLimitId, setPaneLimitId] = useState<string | null>(null)
  const [panePeriodKey, setPanePeriodKey] = useState<string | null>(null)
  /**
   * Wat de screenreader hoort bij openen én sluiten van de prestatieweergave.
   * Bewust een eigen staat en niet afgeleid van `paneLimit`: een leeggemaakte
   * live-regio kondigt niets aan, dus zonder dit blijft "gesloten" onhoorbaar.
   * Start leeg, zodat de eerste render niets roept.
   */
  const [paneAnnouncement, setPaneAnnouncement] = useState('')

  const paneLimit = useMemo(
    () => data.limits.find((l) => l.config.id === paneLimitId) ?? null,
    [data.limits, paneLimitId],
  )

  // Kaart-elementen per pot-id, zodat een deeplink de juiste kaart in beeld kan
  // scrollen (AC-B1-09) zonder dat de kaart zelf iets van de URL hoeft te weten.
  const cardEls = useRef(new Map<string, HTMLLIElement>())
  const registerCard = useCallback((id: string, el: HTMLLIElement | null) => {
    if (el) cardEls.current.set(id, el)
    else cardEls.current.delete(id)
  }, [])

  // Tegenpartij-keuzelijst: pas ophalen als het formulier open is én de
  // tegenpartij-tak gekozen is. Eén keer per paginabezoek.
  useEffect(() => {
    if (!formOpen || form.ruleType !== 'counterparty' || counterparties !== null) return
    let cancelled = false
    fetch('/api/spend-limits/counterparties')
      .then((r) => (r.ok ? r.json() : { options: [] }))
      .then((json) => {
        if (!cancelled) setCounterparties(json.options ?? [])
      })
      .catch(() => {
        if (!cancelled) setCounterparties([])
      })
    return () => {
      cancelled = true
    }
  }, [formOpen, form.ruleType, counterparties])

  // ── Deeplink → pane ──────────────────────────────────────────────────────
  // Eén keer per id afhandelen: sluit de gebruiker de pane, dan strippen we de
  // parameters en mag hetzelfde id niet meteen opnieuw openen.
  const handledDeeplink = useRef<string | null>(null)
  useEffect(() => {
    if (!openLimitId) {
      handledDeeplink.current = null
      return
    }
    if (handledDeeplink.current === openLimitId) return
    handledDeeplink.current = openLimitId

    // Onbekend of gearchiveerd id: stil laten liggen (AC-B1-10). Een foutmelding
    // zou de gebruiker straffen voor een oude link uit zijn eigen historie.
    const target = data.limits.find((l) => l.config.id === openLimitId)
    if (!target) return

    setPaneLimitId(openLimitId)
    setPanePeriodKey(openPeriodKey)
    setPaneAnnouncement(`Verloop van ${target.config.name} geopend.`)
    cardEls.current.get(openLimitId)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }, [openLimitId, openPeriodKey, data.limits])

  const openPane = useCallback(
    (id: string) => {
      setPaneLimitId(id)
      setPanePeriodKey(null)
      const naam = data.limits.find((l) => l.config.id === id)?.config.name
      setPaneAnnouncement(naam ? `Verloop van ${naam} geopend.` : '')
    },
    [data.limits],
  )

  /**
   * Sluiten ruimt de deeplink-parameters op (AC-B1-11), zodat terug-navigatie
   * niet op een half-open staat blijft plakken. Alleen `replace` als er
   * daadwerkelijk iets te strippen valt — anders zou elke sluiting een
   * server-rondje kosten.
   */
  const closePane = useCallback(() => {
    setPaneLimitId(null)
    setPanePeriodKey(null)
    setPaneAnnouncement('Verloop gesloten.')
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    if (!params.has('limit') && !params.has('periode')) return
    params.delete('limit')
    params.delete('periode')
    const qs = params.toString()
    router.replace(`/overzicht/cashflow/transacties${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [router, searchParams])

  const openNew = useCallback(() => {
    setForm(emptyForm(data.budgetOptions))
    setError(null)
    setFormOpen(true)
  }, [data.budgetOptions])

  const openEdit = useCallback((config: SpendLimitConfig) => {
    setForm(formFromConfig(config))
    setError(null)
    setFormOpen(true)
  }, [])

  /** Bouwt de request-body die het zod-schema van de route verwacht. */
  const buildBody = useCallback((state: FormState) => {
    const limitAmount = Number(state.limitAmount.replace(',', '.'))
    const shared = {
      name: state.name.trim(),
      purpose: state.purpose.trim() || null,
      limitAmount,
      period: state.period,
      isActive: state.isActive,
    }
    return state.ruleType === 'budget'
      ? {
          ...shared,
          ruleType: 'budget' as const,
          budgetId: state.budgetId,
          includeChildBudgets: state.includeChildBudgets,
        }
      : {
          ...shared,
          ruleType: 'counterparty' as const,
          counterpartyLabel: state.counterpartyLabel.trim(),
        }
  }, [])

  const submit = useCallback(
    async (state: FormState, closeAfter: boolean) => {
      setSaving(true)
      setError(null)
      try {
        const res = await fetch(
          state.id ? `/api/spend-limits/${state.id}` : '/api/spend-limits',
          {
            method: state.id ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildBody(state)),
          },
        )
        if (!res.ok) {
          const json = await res.json().catch(() => null)
          setError(json?.error || 'Opslaan is niet gelukt.')
          return
        }
        if (closeAfter) setFormOpen(false)
        router.refresh()
      } catch {
        setError('Opslaan is niet gelukt. Controleer je verbinding.')
      } finally {
        setSaving(false)
      }
    },
    [buildBody, router],
  )

  const togglePause = useCallback(
    (limit: SpendLimitWithReport) => {
      const state = formFromConfig(limit.config)
      void submit({ ...state, isActive: !limit.config.isActive }, false)
    },
    [submit],
  )

  const archive = useCallback(async () => {
    if (!confirmArchive) return
    setSaving(true)
    try {
      const res = await fetch(`/api/spend-limits/${confirmArchive.id}`, { method: 'DELETE' })
      if (res.ok) {
        setConfirmArchive(null)
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }, [confirmArchive, router])

  const canSubmit =
    form.name.trim().length > 0 &&
    form.limitAmount.trim().length > 0 &&
    Number.isFinite(Number(form.limitAmount.replace(',', '.'))) &&
    (form.ruleType === 'budget' ? form.budgetId.length > 0 : form.counterpartyLabel.trim().length >= 2)

  return (
    <section className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="font-serif text-lg text-[var(--ink)]">{copy.plural}</h2>
          <p className="mt-1 text-sm text-[var(--ink-2)]">{copy.intro}</p>
        </div>
        <button
          onClick={openNew}
          className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-kern-700"
        >
          <Plus className="h-4 w-4" />
          Nieuwe {copy.singularLower}
        </button>
      </div>

      {/* Truncatie-kanarie: liever "dit kan te laag zijn" dan stil een te laag
          getal (AC-B1-15 / AC-B4-07). */}
      {data.aggregateTruncationSuspected && (
        <div
          role="status"
          className="mt-4 flex items-start gap-2 border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 text-xs text-[var(--ink-2)]"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-negative" aria-hidden />
          <span>
            Je transactiehistorie is zo groot dat we niet zeker weten of alles is meegeteld. De
            bedragen hieronder kunnen te laag zijn — we zeggen het liever dan dat je een stil
            verkeerd getal ziet.
          </span>
        </div>
      )}

      {data.limits.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-[var(--border-ed)] px-4 py-6 text-center text-sm text-[var(--ink-3)]">
          Nog geen {copy.pluralLower}. Stel er een in voor een budget of een tegenpartij waar je
          uitgaven graag onder een grens houdt.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {data.limits.map((limit) => (
            <SpendLimitCard
              key={limit.config.id}
              limit={limit}
              dailyExpenseRate={data.dailyExpenseRate}
              registerEl={registerCard}
              onOpenPane={() => openPane(limit.config.id)}
              onEdit={() => openEdit(limit.config)}
              onTogglePause={() => togglePause(limit)}
              onArchive={() => setConfirmArchive(limit.config)}
            />
          ))}
        </ul>
      )}

      {/* Screenreader-aankondiging bij openen/sluiten van de prestatieweergave.
          Altijd gemount, zodat de regio bestaat vóór de tekst erin verschijnt. */}
      <p aria-live="polite" className="sr-only">
        {paneAnnouncement}
      </p>

      {/* ── Prestatieweergave ───────────────────────────────────────────── */}
      <SpendLimitPerformancePane
        open={paneLimit !== null}
        onClose={closePane}
        limit={paneLimit}
        dailyExpenseRate={data.dailyExpenseRate}
        initialPeriodKey={panePeriodKey}
        aggregateTruncationSuspected={data.aggregateTruncationSuspected}
      />

      {/* ── Formulier ───────────────────────────────────────────────────── */}
      <ShellOverlay
        open={formOpen}
        onClose={() => setFormOpen(false)}
        kind="sheet"
        size="md"
        title={form.id ? `${copy.singular} bewerken` : `Nieuwe ${copy.singularLower}`}
        footer={
          <ModalFooter
            primary={{
              label: 'Opslaan',
              onClick: () => void submit(form, true),
              loading: saving,
              disabled: !canSubmit,
            }}
            secondary={{ label: 'Annuleer', onClick: () => setFormOpen(false) }}
          />
        }
      >
        <SpendLimitForm
          form={form}
          setForm={setForm}
          budgetOptions={data.budgetOptions}
          counterparties={counterparties}
          dailyExpenseRate={data.dailyExpenseRate}
          error={error}
        />
      </ShellOverlay>

      {/* ── Archiveren ──────────────────────────────────────────────────── */}
      <ShellOverlay
        open={confirmArchive !== null}
        onClose={() => setConfirmArchive(null)}
        kind="confirm"
        destructive
        title={`${copy.singular} archiveren`}
        footer={
          <ModalFooter
            align="end"
            primary={{ label: 'Archiveren', onClick: () => void archive(), loading: saving }}
            secondary={{ label: 'Annuleer', onClick: () => setConfirmArchive(null) }}
          />
        }
      >
        <p className="p-5 text-sm text-[var(--ink-2)]">
          <strong className="text-[var(--ink)]">{confirmArchive?.name}</strong> verdwijnt uit je
          overzicht. Je transacties veranderen niet — er wordt niets verwijderd.
        </p>
      </ShellOverlay>
    </section>
  )
}

// ── Kaart per pot ───────────────────────────────────────────────────────────

/**
 * Wat de trend in één regel zegt. Richting is omgekeerd t.o.v. een gewone
 * uitgaven-trend: minder uitgeven is `improving` (zie SpendLimitTrend).
 */
const TREND_WORD: Record<SpendLimitTrendDirection, string> = {
  improving: 'Je geeft minder uit dan in de periodes daarvóór.',
  worsening: 'Je geeft meer uit dan in de periodes daarvóór.',
  stable: 'Je geeft ongeveer evenveel uit als daarvóór.',
  unknown: '',
}

const TREND_TONE: Record<SpendLimitTrendDirection, string> = {
  improving: 'text-positive',
  worsening: 'text-negative',
  stable: 'text-[var(--ink-2)]',
  unknown: '',
}

function SpendLimitCard({
  limit,
  dailyExpenseRate,
  registerEl,
  onOpenPane,
  onEdit,
  onTogglePause,
  onArchive,
}: {
  limit: SpendLimitWithReport
  dailyExpenseRate: number | null
  registerEl: (id: string, el: HTMLLIElement | null) => void
  onOpenPane: () => void
  onEdit: () => void
  onTogglePause: () => void
  onArchive: () => void
}) {
  const { config, report } = limit
  const current = report.currentPeriod
  const last = report.lastClosedPeriod
  const streaks = report.streaks
  const trend = report.trend
  const over = current.status === 'exceeded'

  return (
    <li
      ref={(el) => registerEl(config.id, el)}
      className={`rounded-xl border border-[var(--border-ed)] p-4 ${config.isActive ? '' : 'opacity-60'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium text-[var(--ink)]">{config.name}</h3>
          <p className="mt-0.5 text-xs text-[var(--ink-3)]">{ruleSentence(config)}</p>
          {config.purpose && (
            <p className="mt-1 text-xs italic text-[var(--ink-3)]">{config.purpose}</p>
          )}
          {/* Gearchiveerd budget: geen waarschuwing, wel een verwachting —
              de historie klopt, er komt alleen niets nieuws bij (AC-B1-02). */}
          {config.ruleType === 'budget' && config.budgetName !== null && config.budgetArchived && (
            <p className="mt-1 text-xs text-[var(--ink-3)]">
              Dit budget is gearchiveerd. Je historie en reeks blijven kloppen.
            </p>
          )}
          {!config.isActive && (
            <p className="mt-1 text-xs font-medium text-[var(--ink-3)]">Gepauzeerd</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label={config.isActive ? 'Pauzeren' : 'Hervatten'} onClick={onTogglePause}>
            {config.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </IconButton>
          <IconButton label="Bewerken" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </IconButton>
          <IconButton label="Archiveren" onClick={onArchive}>
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      {/* Lopende periode — expliciet als voorlopig gemarkeerd. */}
      <div className="mt-3 rounded-lg bg-[var(--subtle)] px-3 py-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs text-[var(--ink-3)]">
            {current.label} · nog niet afgesloten, telt niet mee voor je reeks
          </span>
          {/* Stoplicht in DRIE standen, gelijk aan spend-limit-widget.tsx. Een
              binaire ternary kleurde "Dicht bij je grens" groen — geruststellend
              terwijl de tegel amber waarschuwde voor dezelfde toestand. */}
          <span
            className={`text-xs font-medium ${
              over ? 'text-negative' : current.isNearLimit ? 'text-warning' : 'text-positive'
            }`}
          >
            {over ? 'Boven je grens' : current.isNearLimit ? 'Dicht bij je grens' : 'Binnen je grens'}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-sm text-[var(--ink)]">
            <MaskedAmount value={current.periodMatchedAmount} tone="kern" /> van{' '}
            <MaskedAmount value={current.limitAmount} tone="kern" />
          </span>
          <span className="text-xs text-[var(--ink-2)]">
            {over ? (
              <>
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-negative" />
                <MaskedAmount value={current.periodOverAmount} tone="inherit" className="text-negative" />{' '}
                eroverheen
              </>
            ) : (
              <>
                nog <MaskedAmount value={current.periodHeadroom} tone="inherit" /> ruimte
              </>
            )}
          </span>
        </div>
        {/* Geld is opgeslagen tijd: de ruimte of de overschrijding ook in
            vrijheidstijd, op het dagtarief uit de loader. */}
        <FreedomLine
          className="mt-0.5"
          amount={over ? current.periodOverAmount : current.periodHeadroom}
          dailyExpenseRate={dailyExpenseRate}
          prefix={over ? 'Die overschrijding is' : 'Die ruimte is'}
        />
        {config.ruleType === 'counterparty' && current.matchedCounterpartyNames.length > 0 && (
          <p className="mt-1 truncate text-[11px] text-[var(--ink-3)]">
            Meegeteld: {current.matchedCounterpartyNames.join(' · ')}
          </p>
        )}
      </div>

      {/* Laatste afgesloten periode + de vier reeks-getallen. */}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-5">
        <Stat label={last ? `${last.label} (afgesloten)` : 'Vorige periode'}>
          {last ? (
            <span className={last.status === 'exceeded' ? 'text-negative' : 'text-positive'}>
              <MaskedAmount value={last.periodMatchedAmount} tone="inherit" />
            </span>
          ) : (
            <span className="text-[var(--ink-3)]">—</span>
          )}
        </Stat>
        <Stat label="Huidige reeks">
          <span className="inline-flex items-center gap-1">
            {streaks.currentStreak > 0 && <Flame className="h-3.5 w-3.5 text-[var(--color-kern-500)]" />}
            {streaks.currentStreak}
          </span>
        </Stat>
        <Stat label="Langste reeks">{streaks.longestStreak}</Stat>
        <Stat label="Laatst binnen">
          {streaks.lastWithinPeriodKey ?? <span className="text-[var(--ink-3)]">—</span>}
        </Stat>
        <Stat label={`Overschreden (van ${streaks.closedPeriodCount})`}>{streaks.exceededPeriodCount}</Stat>
      </dl>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {/* Richting rechtstreeks uit report.trend — nooit een lokaal gemiddelde. */}
        {trend.direction !== 'unknown' ? (
          <p className={`text-[11px] ${TREND_TONE[trend.direction]}`}>
            {TREND_WORD[trend.direction]}
          </p>
        ) : (
          <p className="text-[11px] text-[var(--ink-3)]">
            Nog niet genoeg afgesloten periodes voor een richting.
          </p>
        )}
        <button
          type="button"
          onClick={onOpenPane}
          aria-label={`Bekijk verloop van ${config.name}`}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1 text-xs font-medium text-kern-700 hover:underline"
        >
          Bekijk verloop
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </li>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-[var(--ink-3)]">{label}</dt>
      <dd className="font-mono tabular-nums text-[var(--ink)]">{children}</dd>
    </div>
  )
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] hover:bg-[var(--subtle)]"
    >
      {children}
    </button>
  )
}

// ── Formulier ───────────────────────────────────────────────────────────────

/**
 * De budget-kiezer als BOOM. `parentId` staat op elke optie; een optie waarvan
 * de ouder niet in de lijst voorkomt (gearchiveerde ouder) hoort op hoofdniveau
 * te blijven staan in plaats van te verdwijnen — anders raakt de gebruiker een
 * bruikbaar subbudget kwijt.
 */
function budgetOptionRows(
  options: SpendLimitBudgetOption[],
): { option: SpendLimitBudgetOption; depth: number }[] {
  const byId = new Map(options.map((o) => [o.id, o]))
  const childrenByParent = new Map<string, SpendLimitBudgetOption[]>()
  const roots: SpendLimitBudgetOption[] = []
  for (const o of options) {
    if (o.parentId && byId.has(o.parentId)) {
      const list = childrenByParent.get(o.parentId) ?? []
      list.push(o)
      childrenByParent.set(o.parentId, list)
    } else {
      roots.push(o)
    }
  }
  const rows: { option: SpendLimitBudgetOption; depth: number }[] = []
  const seen = new Set<string>()
  const walk = (o: SpendLimitBudgetOption, depth: number) => {
    if (seen.has(o.id)) return
    seen.add(o.id)
    rows.push({ option: o, depth })
    for (const child of childrenByParent.get(o.id) ?? []) walk(child, depth + 1)
  }
  for (const r of roots) walk(r, 0)
  // Vangnet tegen een cyclische parent-keten: nooit een optie kwijtraken.
  for (const o of options) if (!seen.has(o.id)) rows.push({ option: o, depth: 0 })
  return rows
}

function SpendLimitForm({
  form,
  setForm,
  budgetOptions,
  counterparties,
  dailyExpenseRate,
  error,
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  budgetOptions: SpendLimitBudgetOption[]
  counterparties: SpendLimitCounterpartyOption[] | null
  dailyExpenseRate: number | null
  error: string | null
}) {
  const selectedBudget = budgetOptions.find((b) => b.id === form.budgetId)
  const rows = useMemo(() => budgetOptionRows(budgetOptions), [budgetOptions])
  const periodWords = PERIOD_WORDS[form.period]
  const periodChanged = form.originalPeriod !== null && form.originalPeriod !== form.period

  return (
    <div className="space-y-4 p-5 sm:p-6">
      {error && (
        <div role="alert" className="rounded-xl border border-negative/30 bg-negative-bg px-3 py-2 text-xs text-negative">
          {error}
        </div>
      )}

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-[var(--ink-2)]">Naam</span>
        <input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Tanken"
          maxLength={60}
          className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:border-[var(--ink-3)] focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-[var(--ink-2)]">
          Waarom deze grens <span className="font-normal text-[var(--ink-3)]">(optioneel)</span>
        </span>
        <input
          value={form.purpose}
          onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
          placeholder="Ik wil vaker de fiets pakken"
          maxLength={240}
          className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:border-[var(--ink-3)] focus:outline-none"
        />
      </label>

      {/* Regelbasis: budget of tegenpartij. */}
      <fieldset>
        <legend className="mb-1 text-xs font-semibold text-[var(--ink-2)]">Waar geldt de grens voor?</legend>
        <div className="flex gap-2">
          <SegmentTab
            active={form.ruleType === 'budget'}
            onClick={() => setForm((f) => ({ ...f, ruleType: 'budget' }))}
            icon={<Target className="h-4 w-4" />}
            label="Een budget"
          />
          <SegmentTab
            active={form.ruleType === 'counterparty'}
            onClick={() => setForm((f) => ({ ...f, ruleType: 'counterparty' }))}
            icon={<Flame className="h-4 w-4" />}
            label="Een tegenpartij"
          />
        </div>
      </fieldset>

      {form.ruleType === 'budget' ? (
        <div className="space-y-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--ink-2)]">Budget</span>
            <select
              value={form.budgetId}
              onChange={(e) => setForm((f) => ({ ...f, budgetId: e.target.value }))}
              className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:border-[var(--ink-3)] focus:outline-none"
            >
              {rows.length === 0 && <option value="">Nog geen uitgavenbudgetten</option>}
              {rows.map(({ option, depth }) => (
                <option key={option.id} value={option.id}>
                  {depth > 0 ? `${' '.repeat(depth * 3)}└ ` : ''}
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          {selectedBudget?.hasChildren && (
            <label className="flex items-center gap-2 text-xs text-[var(--ink-2)]">
              <input
                type="checkbox"
                checked={form.includeChildBudgets}
                onChange={(e) => setForm((f) => ({ ...f, includeChildBudgets: e.target.checked }))}
              />
              Subbudgetten meetellen
            </label>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--ink-2)]">Tegenpartij</span>
            <input
              value={form.counterpartyLabel}
              onChange={(e) => setForm((f) => ({ ...f, counterpartyLabel: e.target.value }))}
              placeholder="Shell"
              list="spend-limit-counterparties"
              maxLength={120}
              className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:border-[var(--ink-3)] focus:outline-none"
            />
            <datalist id="spend-limit-counterparties">
              {(counterparties ?? []).map((c) => (
                <option key={c.key} value={c.label} />
              ))}
            </datalist>
          </label>
          {/* Eerlijk over de beperking: dit is vrije tekst uit je bank. */}
          <p className="text-[11px] text-[var(--ink-3)]">
            We vergelijken je zoekterm met de tegenpartij zoals je bank die doorgeeft — hoofdletters,
            spaties en leestekens doen niet mee. Een transactie telt mee zodra de naam je zoekterm
            bevat, dus “Shell” vangt ook “Shell Express 1032”. Hieronder zie je meteen wat deze
            regel raakt.
          </p>
        </div>
      )}

      {/* Periodesoort — de motor rekent alle drie de kalenderperiodes uit. */}
      <fieldset>
        <legend className="mb-1 text-xs font-semibold text-[var(--ink-2)]">
          Over welke periode telt de grens?
        </legend>
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <SegmentTab
              key={p}
              active={form.period === p}
              onClick={() => setForm((f) => ({ ...f, period: p }))}
              label={PERIOD_WORDS[p].tab}
            />
          ))}
        </div>
        <p className="mt-1 text-[11px] text-[var(--ink-3)]">
          Je reeks kijkt dan naar je laatste {closedPeriodContext(form.period)} afgesloten{' '}
          {periodWords.plural}.
        </p>
      </fieldset>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-[var(--ink-2)]">
          Grensbedrag per {periodWords.singular} (€)
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={5}
          value={form.limitAmount}
          onChange={(e) => setForm((f) => ({ ...f, limitAmount: e.target.value }))}
          placeholder="50"
          className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:border-[var(--ink-3)] focus:outline-none"
        />
        <span className="mt-1 block text-[11px] text-[var(--ink-3)]">
          Geen spaardoel — alleen de grens waarboven je het wilt zien. Precies op de grens telt als
          binnen.
        </span>
      </label>

      {/* ── Match-preview: wat raakt deze regel nú? ─────────────────────── */}
      <SpendLimitPreview form={form} dailyExpenseRate={dailyExpenseRate} />

      {/* O5-A: regels worden niet geversioneerd, dus wijzigen is retroactief. */}
      {form.id && (
        <div className="space-y-1 rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 text-[11px] text-[var(--ink-2)]">
          <p>
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            Een wijziging geldt ook voor je afgesloten periodes. Je reeks kan daardoor veranderen.
          </p>
          {periodChanged && form.originalPeriod && (
            <p>
              Je wisselt van {PERIOD_WORDS[form.originalPeriod].singular} naar{' '}
              {periodWords.singular}: daarmee verandert ook de lengte van je reeks-context — van{' '}
              {closedPeriodContext(form.originalPeriod)}{' '}
              {PERIOD_WORDS[form.originalPeriod].plural} naar {closedPeriodContext(form.period)}{' '}
              {periodWords.plural}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Match-preview ───────────────────────────────────────────────────────────

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: SpendLimitPreviewResponse }

/** Waaróm twee regels elkaar raken, in gewone taal. Nooit een tweede bedrag (D38). */
const OVERLAP_REASON: Record<SpendLimitOverlap['reason'], string> = {
  counterparty_key_substring: 'dezelfde tegenpartij-namen',
  same_budget: 'hetzelfde budget',
  budget_ancestor: 'een budget waar dit onder valt',
  budget_descendant: 'een subbudget hiervan',
}

/**
 * De preview vraagt de SERVER wat deze regel raakt (FR-B3-05/NFR-B3-01) — de al
 * geladen suggestielijst client-side filteren zou een top-40 als waarheid
 * verkopen en tegenpartijen daarbuiten missen.
 *
 * 400 ms debounce plus een `AbortController` die de vorige vlucht afbreekt: bij
 * doortypen vertrekt er hooguit één request (AC-B3-06).
 */
function SpendLimitPreview({
  form,
  dailyExpenseRate,
}: {
  form: FormState
  dailyExpenseRate: number | null
}) {
  const [state, setState] = useState<PreviewState>({ status: 'idle' })

  const label = form.counterpartyLabel.trim()
  const enabled = form.ruleType === 'counterparty' ? label.length > 0 : form.budgetId.length > 0

  // De request-body als STRING: dat is meteen de effect-dependency. Een object
  // zou bij elke toetsaanslag een nieuwe identiteit krijgen en de debounce
  // zinloos maken; een string vergelijkt op inhoud.
  const payload = useMemo(
    () =>
      JSON.stringify(
        form.ruleType === 'counterparty'
          ? {
              ruleType: 'counterparty',
              counterpartyLabel: label,
              period: form.period,
              excludeLimitId: form.id,
            }
          : {
              ruleType: 'budget',
              budgetId: form.budgetId,
              includeChildBudgets: form.includeChildBudgets,
              period: form.period,
              excludeLimitId: form.id,
            },
      ),
    [form.ruleType, form.budgetId, form.includeChildBudgets, form.period, form.id, label],
  )

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle' })
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setState({ status: 'loading' })
      fetch('/api/spend-limits/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: controller.signal,
      })
        .then(async (res) => {
          const json = await res.json().catch(() => null)
          if (!res.ok) {
            setState({
              status: 'error',
              message: json?.error || 'De preview kon niet worden opgehaald.',
            })
            return
          }
          setState({ status: 'ready', data: json as SpendLimitPreviewResponse })
        })
        .catch((err: unknown) => {
          // Een afgebroken vlucht is geen fout — er komt een nieuwe achteraan.
          if (err instanceof DOMException && err.name === 'AbortError') return
          setState({
            status: 'error',
            message: 'De preview kon niet worden opgehaald. Controleer je verbinding.',
          })
        })
    }, 400)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [enabled, payload])

  if (!enabled) return null

  return (
    <section
      aria-label="Wat deze regel raakt"
      className="space-y-1.5 rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5"
    >
      <h3 className="text-xs font-semibold text-[var(--ink-2)]">Wat deze regel nu zou raken</h3>
      <div aria-live="polite" className="space-y-1.5">
        <PreviewBody state={state} form={form} dailyExpenseRate={dailyExpenseRate} />
      </div>
    </section>
  )
}

function PreviewBody({
  state,
  form,
  dailyExpenseRate,
}: {
  state: PreviewState
  form: FormState
  dailyExpenseRate: number | null
}) {
  if (state.status === 'idle' || state.status === 'loading') {
    return <p className="text-[11px] text-[var(--ink-3)]">We kijken het na…</p>
  }
  if (state.status === 'error') {
    return (
      <p role="alert" className="text-[11px] text-negative">
        {state.message}
      </p>
    )
  }

  const preview = state.data

  // Expliciete "te kort"-uitkomst i.p.v. een misleidend "0 matches" halverwege
  // het typen (AC-B3-03).
  if (preview.status === 'too_short') {
    return (
      <p className="text-[11px] text-[var(--ink-3)]">
        Nog te kort om op te matchen — tik iets meer, dan zoeken we mee.
      </p>
    )
  }

  const periods = preview.matchedAmountByPeriod
  const closed = periods.filter((p) => !p.isOpen)
  const lastClosed = closed.length > 0 ? closed[closed.length - 1] : null

  return (
    <>
      {preview.matchedTransactionCount === 0 ? (
        <p className="text-[11px] text-[var(--ink-3)]">
          In je laatste {periods.length} {PERIOD_WORDS[form.period].plural} raakt deze regel nog
          niets.
        </p>
      ) : (
        <>
          <p className="text-[11px] text-[var(--ink-2)]">
            {preview.matchedTransactionCount} transactie
            {preview.matchedTransactionCount === 1 ? '' : 's'} in je laatste {periods.length}{' '}
            {PERIOD_WORDS[form.period].plural}
            {preview.key && (
              <>
                {' '}
                op zoeksleutel <span className="font-mono text-[var(--ink)]">{preview.key}</span>
              </>
            )}
            .
          </p>
          {preview.matchedNames.length > 0 && (
            <p className="text-[11px] text-[var(--ink-3)]">
              Meegeteld: {preview.matchedNames.slice(0, 8).join(' · ')}
              {preview.matchedNames.length > 8 && ` · en nog ${preview.matchedNames.length - 8}`}
            </p>
          )}
          <ul className="space-y-0.5">
            {periods
              .slice(-4)
              .reverse()
              .map((p) => (
                <li
                  key={p.periodKey}
                  className="flex items-baseline justify-between gap-3 text-[11px]"
                >
                  <span className="text-[var(--ink-3)]">
                    {p.label}
                    {p.isOpen && ' · voorlopig'}
                  </span>
                  <span className="font-mono tabular-nums text-[var(--ink)]">
                    <MaskedAmount value={p.matchedAmount} tone="inherit" />
                  </span>
                </li>
              ))}
          </ul>
          {lastClosed && (
            <FreedomLine
              amount={lastClosed.matchedAmount}
              dailyExpenseRate={dailyExpenseRate}
              prefix={`${lastClosed.label} was`}
            />
          )}
        </>
      )}

      {/* Regel-observatie, geen tweede bedrag en geen prioriteit (D38). */}
      {preview.overlappingLimits.length > 0 && (
        <p className="text-[11px] text-[var(--ink-2)]">
          Deze uitgaven kunnen ook meetellen in{' '}
          {preview.overlappingLimits.map((o, i) => (
            <span key={o.id}>
              {i > 0 && (i === preview.overlappingLimits.length - 1 ? ' en ' : ', ')}
              <span className="font-medium text-[var(--ink)]">{o.name}</span> (
              {OVERLAP_REASON[o.reason]}
              {!o.isActive && ', gepauzeerd'})
            </span>
          ))}
          . Dat mag — een uitgave mag in meer dan één grens meetellen.
        </p>
      )}

      {preview.aggregateTruncationSuspected && (
        <p className="text-[11px] text-[var(--ink-3)]">
          Je historie is zo groot dat deze bedragen te laag kunnen uitvallen.
        </p>
      )}
    </>
  )
}

function SegmentTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon?: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
        active
          ? 'border-kern-600 bg-kern-50 font-medium text-kern-700'
          : 'border-[var(--border-ed)] text-[var(--ink-2)] hover:bg-[var(--subtle)]'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
