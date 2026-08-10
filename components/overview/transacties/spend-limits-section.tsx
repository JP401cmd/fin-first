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
 * Primaire acties staan in de sticky footer, óók op klein scherm. Ook een
 * suggestielijst is een overlay: het tegenpartij-veld gebruikt daarom bewust
 * GEEN native <datalist> maar <CounterpartyField> — zie de toelichting daar.
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
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { MaskedAmount } from '@/components/app/masked-amount'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { useSpendLimitCopy } from '@/lib/hooks/use-spend-limit-alias'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import {
  counterpartyMatchesKey,
  spendLimitCounterpartyKey,
} from '@/lib/spend-limits/counterparty-key'
import { SPEND_LIMIT_WINDOW_BY_PERIOD } from '@/lib/spend-limits/engine'
import type { SpendLimitTrendDirection } from '@/lib/spend-limits/engine'
import { budgetAttention, describeLimitShort, describeRule } from '@/lib/spend-limits/describe'
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

const PERIODS: readonly SpendLimitPeriodKind[] = ['day', 'week', 'month', 'quarter', 'year']

/**
 * De periodesoorten die ook in de EENVOUDIGE weergave kiesbaar zijn.
 *
 * Dag, week en maand zijn de ritmes waarin mensen hun uitgaven beleven ("niet
 * meer dan €10 per dag aan koffie"); kwartaal en jaar zijn boekhoudkundige
 * eenheden en blijven diepte voor Volledig. Vóór 10-08-2026 stond hier alleen
 * `month`, waardoor de periodekiezer in Eenvoudig één enkele, onveranderlijke tab
 * toonde — een keuze die geen keuze was.
 */
const SIMPLE_PERIODS: readonly SpendLimitPeriodKind[] = ['day', 'week', 'month']

/** Hoe de gebruiker de periodesoort noemt. Enkelvoud, meervoud, en de tab-tekst. */
const PERIOD_WORDS: Record<
  SpendLimitPeriodKind,
  { tab: string; singular: string; plural: string }
> = {
  day: { tab: 'Per dag', singular: 'dag', plural: 'dagen' },
  week: { tab: 'Per week', singular: 'week', plural: 'weken' },
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

/**
 * Eén regel in het formulier.
 *
 * `key` is GEEN database-id maar een stabiele React-sleutel. Bij een bestaande
 * regel is dat het rij-id, bij een nieuwe een oplopende teller: een index als
 * sleutel zou bij het verwijderen van een regel de staat van de regels eronder
 * laten opschuiven (een aangevinkt budget dat naar de verkeerde regel verhuist),
 * en `Math.random()` zou elke render een nieuwe sleutel geven.
 *
 * De volgorde in deze lijst is BETEKENISDRAGEND: de server schrijft 'm als
 * `sort_order`, en de ontdubbeling in SQL rekent een transactie die twee regels
 * raakt toe aan de eerste. Slepen/sorteren zit er (nog) niet in — verwijderen en
 * opnieuw toevoegen is de weg om te herordenen.
 */
interface FormRule {
  key: string
  budgetIds: string[]
  includeChildBudgets: boolean
  counterpartyLabels: string[]
}

let ruleKeySeq = 0
function nextRuleKey(): string {
  ruleKeySeq += 1
  return `new-${ruleKeySeq}`
}

/**
 * Minimale lengte van een tegenpartij-zoekterm vóór hij zinnig is.
 *
 * Spiegelt `SPEND_LIMIT_MIN_MATCH_KEY_LENGTH` (lib/spend-limits/overlap.ts) en de
 * `min(2)` in het zod-schema — één teken matcht als normalised-contains zo
 * ongeveer alles. Hier staat het als LOKALE constante omdat het formulier de
 * RUWE tekst toetst (vóór normalisatie) en de server de sleutel; de server heeft
 * en houdt het laatste woord.
 */
const MIN_COUNTERPARTY_LENGTH = 2

interface FormState {
  id: string | null
  name: string
  purpose: string
  rules: FormRule[]
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

/**
 * Een verse regel. Het eerste budget staat voorgeselecteerd, precies zoals vóór
 * de regel-uitbreiding: zo toont het formulier meteen een preview in plaats van
 * een leeg vlak, en is "wat gaat dit tellen" vanaf de eerste seconde zichtbaar.
 */
function emptyRule(budgetOptions: SpendLimitBudgetOption[]): FormRule {
  return {
    key: nextRuleKey(),
    budgetIds: budgetOptions[0] ? [budgetOptions[0].id] : [],
    includeChildBudgets: true,
    counterpartyLabels: [],
  }
}

function emptyForm(budgetOptions: SpendLimitBudgetOption[]): FormState {
  return {
    id: null,
    name: '',
    purpose: '',
    rules: [emptyRule(budgetOptions)],
    limitAmount: '',
    period: 'month',
    originalPeriod: null,
    isActive: true,
  }
}

function formFromConfig(config: SpendLimitConfig, budgetOptions: SpendLimitBudgetOption[]): FormState {
  return {
    id: config.id,
    name: config.name,
    purpose: config.purpose ?? '',
    // Een pot zonder regels kan via de API niet ontstaan; komt hij toch voor, dan
    // is een lege startregel de enige bewerkbare uitkomst.
    rules:
      config.rules.length > 0
        ? config.rules.map((rule) => ({
            key: rule.id,
            budgetIds: rule.budgets.map((b) => b.id),
            includeChildBudgets: rule.includeChildBudgets,
            counterpartyLabels: rule.counterparties.map((c) => c.label || c.key),
          }))
        : [emptyRule(budgetOptions)],
    limitAmount: String(config.limitAmount),
    period: config.period,
    originalPeriod: config.period,
    isActive: config.isActive,
  }
}

/** De regels van de FORMULIERSTAAT in gewone taal — dezelfde formulering als `describeRule`. */
function formRuleSentence(rule: FormRule, budgetOptions: SpendLimitBudgetOption[]): string {
  const byId = new Map(budgetOptions.map((b) => [b.id, b.name]))
  return describeRule({
    id: rule.key,
    budgets: rule.budgetIds.map((id) => ({ id, name: byId.get(id) ?? null, archived: false })),
    includeChildBudgets: rule.includeChildBudgets,
    counterparties: rule.counterpartyLabels.map((label) => ({ key: label, label })),
  })
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

  // Tegenpartij-keuzelijst: pas ophalen als het formulier openstaat. Eén keer per
  // paginabezoek.
  //
  // Vóór de regel-uitbreiding hing dit aan "de tegenpartij-tak is gekozen". Die
  // tak bestaat niet meer: ELKE regel kan op elk moment een tegenpartij krijgen,
  // dus wachten tot er één getikt is zou de suggestielijst pas laten arriveren
  // wanneer hij niets meer te suggereren heeft.
  useEffect(() => {
    if (!formOpen || counterparties !== null) return
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
  }, [formOpen, counterparties])

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

  const openEdit = useCallback(
    (config: SpendLimitConfig) => {
      setForm(formFromConfig(config, data.budgetOptions))
      setError(null)
      setFormOpen(true)
    },
    [data.budgetOptions],
  )

  /**
   * Bouwt de request-body die het zod-schema van de route verwacht.
   *
   * Regels zonder enige dimensie vallen eruit: het schema wijst ze af (en de
   * CHECK in de database ook), en een halfingevulde regel die de gebruiker heeft
   * laten staan mag het opslaan van de rest niet blokkeren. Blijft er niets over,
   * dan stuurt de route een begrijpelijke 400 terug — die is er al.
   */
  const buildBody = useCallback((state: FormState) => {
    return {
      name: state.name.trim(),
      purpose: state.purpose.trim() || null,
      limitAmount: Number(state.limitAmount.replace(',', '.')),
      period: state.period,
      isActive: state.isActive,
      rules: state.rules
        .map((rule) => ({
          budgetIds: rule.budgetIds,
          includeChildBudgets: rule.includeChildBudgets,
          counterpartyLabels: rule.counterpartyLabels.map((l) => l.trim()).filter(Boolean),
        }))
        .filter((rule) => rule.budgetIds.length > 0 || rule.counterpartyLabels.length > 0),
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
      const state = formFromConfig(limit.config, data.budgetOptions)
      void submit({ ...state, isActive: !limit.config.isActive }, false)
    },
    [submit, data.budgetOptions],
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

  // Minstens één regel moet daadwerkelijk iets kiezen. Halfingevulde regels
  // eronder blokkeren het opslaan niet — die worden in `buildBody` weggelaten.
  const hasUsableRule = form.rules.some(
    (r) =>
      r.budgetIds.length > 0 ||
      r.counterpartyLabels.some((l) => l.trim().length >= MIN_COUNTERPARTY_LENGTH),
  )

  const canSubmit =
    form.name.trim().length > 0 &&
    form.limitAmount.trim().length > 0 &&
    Number.isFinite(Number(form.limitAmount.replace(',', '.'))) &&
    hasUsableRule

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
          <p className="mt-0.5 text-xs text-[var(--ink-3)]">{describeLimitShort(config)}</p>
          {config.purpose && (
            <p className="mt-1 text-xs italic text-[var(--ink-3)]">{config.purpose}</p>
          )}
          {/* Gearchiveerd budget: geen waarschuwing, wel een verwachting —
              de historie klopt, er komt alleen niets nieuws bij (AC-B1-02).
              Een WEG budget krijgt hier bewust geen regel: dat is de zwaardere
              boodschap en die staat voluit in de prestatieweergave, waar ook de
              uitleg past over wat er wél nog klopt. */}
          {budgetAttention(config).archivedNames.length > 0 && (
            <p className="mt-1 text-xs text-[var(--ink-3)]">
              {budgetAttention(config).archivedNames.length === 1
                ? 'Eén gekoppeld budget is gearchiveerd.'
                : 'Meerdere gekoppelde budgetten zijn gearchiveerd.'}{' '}
              Je historie en reeks blijven kloppen.
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
  const { mode } = useDisplayMode()
  const rows = useMemo(() => budgetOptionRows(budgetOptions), [budgetOptions])
  const periodWords = PERIOD_WORDS[form.period]
  const periodChanged = form.originalPeriod !== null && form.originalPeriod !== form.period

  /**
   * TXN-3 — in EENVOUDIG zijn dag, week en maand kiesbaar; kwartaal en jaar zijn
   * diepte en blijven aan Volledig. In VOLLEDIG staan alle vijf.
   *
   * Eén uitzondering, bewust: bewerk je een pot die in Volledig op kwartaal of
   * jaar is gezet, dan blijft díé tab zichtbaar en actief. De keuze stilzwijgend
   * naar 'maand' terugzetten zou de pot bij de eerste keer opslaan van eenheid
   * laten wisselen — een gegevenswijziging, geen weergave-vereenvoudiging. Zo is
   * er ook nooit een tab-rij zonder actieve tab.
   */
  const visiblePeriods = useMemo(
    () =>
      mode === 'simple'
        ? PERIODS.filter((p) => SIMPLE_PERIODS.includes(p) || p === form.period)
        : PERIODS,
    [mode, form.period],
  )

  /** Muteer één regel op zijn plek; de overige regels blijven ongemoeid. */
  const updateRule = useCallback(
    (key: string, patch: Partial<Omit<FormRule, 'key'>>) => {
      setForm((f) => ({
        ...f,
        rules: f.rules.map((r) => (r.key === key ? { ...r, ...patch } : r)),
      }))
    },
    [setForm],
  )

  const addRule = useCallback(() => {
    // Een NIEUWE regel start leeg, niet met het eerste budget voorgeselecteerd:
    // wie een tweede regel toevoegt, weet wat hij wil toevoegen, en een
    // stilzwijgend meegekozen budget zou zomaar extra uitgaven meetellen.
    setForm((f) => ({
      ...f,
      rules: [
        ...f.rules,
        { key: nextRuleKey(), budgetIds: [], includeChildBudgets: true, counterpartyLabels: [] },
      ],
    }))
  }, [setForm])

  const removeRule = useCallback(
    (key: string) => {
      setForm((f) => (f.rules.length <= 1 ? f : { ...f, rules: f.rules.filter((r) => r.key !== key) }))
    },
    [setForm],
  )

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

      {/* ── De regels ────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h3 className="text-xs font-semibold text-[var(--ink-2)]">Waar geldt de grens voor?</h3>
          <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
            Kies budgetten, tegenpartijen, of allebei. Meerdere budgetten betekent{' '}
            <em>één van deze</em>; zet je er ook een tegenpartij bij, dan moet die er óók op kloppen.
            Meerdere regels tellen samen op tegen hetzelfde grensbedrag — een uitgave telt daarbij
            hoogstens één keer mee.
          </p>
        </div>

        {form.rules.map((rule, index) => (
          <SpendLimitRuleEditor
            key={rule.key}
            rule={rule}
            index={index}
            total={form.rules.length}
            budgetRows={rows}
            budgetOptions={budgetOptions}
            counterparties={counterparties}
            dailyExpenseRate={dailyExpenseRate}
            period={form.period}
            excludeLimitId={form.id}
            onChange={updateRule}
            onRemove={removeRule}
          />
        ))}

        <button
          type="button"
          onClick={addRule}
          className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[var(--border-ed)] px-3 py-2 text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Regel toevoegen
        </button>
      </section>

      {/* Periodesoort — de motor rekent alle drie de kalenderperiodes uit. */}
      <fieldset>
        <legend className="mb-1 text-xs font-semibold text-[var(--ink-2)]">
          Over welke periode telt de grens?
        </legend>
        <div className="flex gap-2">
          {visiblePeriods.map((p) => (
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

      {/* De match-preview staat PER REGEL, bij de regel waar hij over gaat —
          één preview onderaan zou bij meerdere regels niet meer te plaatsen zijn
          ("wat raakt dit?" — welke van de drie?). Zie <SpendLimitRuleEditor>. */}

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

// ── Regel-editor ────────────────────────────────────────────────────────────

/**
 * Eén regel: welke budgetten, welke tegenpartijen, en wat dat nú zou raken.
 *
 * ── WAAROM HET GEEN KEUZE TUSSEN TWEE TAKKEN MEER IS ───────────────────────
 * Tot 09-08-2026 stond hier een segmented control "Een budget / Een tegenpartij"
 * en zag je maar één van beide velden. Dat kán niet meer: een regel mag beide
 * dimensies tegelijk dragen, en een tab-keuze zou de EN-combinatie onbereikbaar
 * maken. Beide velden staan er nu altijd, met de zin eronder die vertelt wat de
 * combinatie betekent — die zin is de enige plek waar de gebruiker de logica
 * hoeft te lezen, en hij komt uit dezelfde `describeRule` die de kaart en de
 * prestatieweergave gebruiken.
 *
 * ── BUDGETTEN ALS AANVINKLIJST, NIET ALS <select multiple> ─────────────────
 * Een native multi-select vraagt ctrl/cmd-klikken en is op mobiel vrijwel
 * onbedienbaar. Een aanvinklijst in een scrollvak werkt met de vinger, houdt de
 * boomstructuur zichtbaar via inspringing, en laat de gekozen budgetten
 * bovendien als tekst samenvatten.
 */
function SpendLimitRuleEditor({
  rule,
  index,
  total,
  budgetRows,
  budgetOptions,
  counterparties,
  dailyExpenseRate,
  period,
  excludeLimitId,
  onChange,
  onRemove,
}: {
  rule: FormRule
  index: number
  total: number
  budgetRows: { option: SpendLimitBudgetOption; depth: number }[]
  budgetOptions: SpendLimitBudgetOption[]
  counterparties: SpendLimitCounterpartyOption[] | null
  dailyExpenseRate: number | null
  period: SpendLimitPeriodKind
  excludeLimitId: string | null
  onChange: (key: string, patch: Partial<Omit<FormRule, 'key'>>) => void
  onRemove: (key: string) => void
}) {
  const chosen = new Set(rule.budgetIds)
  // "Subbudgetten meetellen" heeft alleen betekenis als er een gekozen budget
  // daadwerkelijk kinderen heeft — anders is het een schakelaar zonder effect.
  const anyChosenHasChildren = budgetOptions.some((b) => chosen.has(b.id) && b.hasChildren)

  const toggleBudget = (id: string) => {
    onChange(rule.key, {
      budgetIds: chosen.has(id) ? rule.budgetIds.filter((b) => b !== id) : [...rule.budgetIds, id],
    })
  }

  const addCounterparty = (label: string) => {
    const trimmed = label.trim()
    if (trimmed.length < MIN_COUNTERPARTY_LENGTH) return
    // Ontdubbelen op de GENORMALISEERDE sleutel en niet op de letterlijke tekst:
    // "Shell" en "shell " zouden anders twee keer in de lijst staan terwijl ze
    // exact dezelfde transacties matchen.
    const key = spendLimitCounterpartyKey(trimmed)
    if (rule.counterpartyLabels.some((l) => spendLimitCounterpartyKey(l) === key)) return
    onChange(rule.key, { counterpartyLabels: [...rule.counterpartyLabels, trimmed] })
  }

  const removeCounterparty = (label: string) => {
    onChange(rule.key, { counterpartyLabels: rule.counterpartyLabels.filter((l) => l !== label) })
  }

  return (
    <fieldset className="space-y-3 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] p-3">
      <legend className="sr-only">Regel {index + 1}</legend>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">
          Regel {index + 1}
        </span>
        {/* De laatste regel is niet te verwijderen: een pot zonder regels telt
            niets, en het formulier hoort die staat niet te kunnen maken. */}
        {total > 1 && (
          <button
            type="button"
            onClick={() => onRemove(rule.key)}
            aria-label={`Regel ${index + 1} verwijderen`}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[var(--ink-3)] transition-colors hover:bg-[var(--paper)] hover:text-negative"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {/* Budgetten — meerdere mogelijk (OF). */}
      <div className="space-y-1.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-2)]">
          <Target className="h-3.5 w-3.5" aria-hidden />
          Budgetten <span className="font-normal text-[var(--ink-3)]">(meerdere mogelijk)</span>
        </span>
        {budgetRows.length === 0 ? (
          <p className="text-[11px] text-[var(--ink-3)]">Nog geen uitgavenbudgetten.</p>
        ) : (
          <div className="max-h-44 overflow-y-auto rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-1.5">
            {budgetRows.map(({ option, depth }) => (
              <label
                key={option.id}
                style={{ paddingLeft: `${depth * 14}px` }}
                className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded px-1.5 text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
              >
                <input
                  type="checkbox"
                  checked={chosen.has(option.id)}
                  onChange={() => toggleBudget(option.id)}
                />
                <span className="min-w-0 truncate">{option.name}</span>
              </label>
            ))}
          </div>
        )}
        {anyChosenHasChildren && (
          <label className="flex items-center gap-2 text-xs text-[var(--ink-2)]">
            <input
              type="checkbox"
              checked={rule.includeChildBudgets}
              onChange={(e) => onChange(rule.key, { includeChildBudgets: e.target.checked })}
            />
            Subbudgetten meetellen
          </label>
        )}
      </div>

      {/* Tegenpartijen — meerdere mogelijk (OF), samen met de budgetten een EN. */}
      <div className="space-y-1.5">
        <CounterpartyField
          idPrefix={`spend-limit-cp-${rule.key}`}
          options={counterparties}
          onAdd={addCounterparty}
        />
        {rule.counterpartyLabels.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {rule.counterpartyLabels.map((label) => (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => removeCounterparty(label)}
                  aria-label={`${label} verwijderen`}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 text-xs text-[var(--ink-2)] transition-colors hover:border-negative/40 hover:text-negative"
                >
                  <Flame className="h-3 w-3" aria-hidden />
                  {label}
                  <span aria-hidden>×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* Eerlijk over de beperking: dit is vrije tekst uit je bank. */}
        <p className="text-[11px] text-[var(--ink-3)]">
          We vergelijken je zoekterm met de tegenpartij zoals je bank die doorgeeft — hoofdletters,
          spaties en leestekens doen niet mee. Een transactie telt mee zodra de naam je zoekterm
          bevat, dus &ldquo;Shell&rdquo; vangt ook &ldquo;Shell Express 1032&rdquo;.
        </p>
      </div>

      {/* De regel in één zin — dezelfde formulering als op de kaart. */}
      <p className="rounded-lg bg-[var(--paper)] px-2.5 py-1.5 text-xs text-[var(--ink-2)]">
        {formRuleSentence(rule, budgetOptions)}
      </p>

      <SpendLimitPreview
        rule={rule}
        period={period}
        excludeLimitId={excludeLimitId}
        dailyExpenseRate={dailyExpenseRate}
      />
    </fieldset>
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
  rule,
  period,
  excludeLimitId,
  dailyExpenseRate,
}: {
  rule: FormRule
  period: SpendLimitPeriodKind
  excludeLimitId: string | null
  dailyExpenseRate: number | null
}) {
  const [state, setState] = useState<PreviewState>({ status: 'idle' })

  const enabled = rule.budgetIds.length > 0 || rule.counterpartyLabels.length > 0

  // De request-body als STRING: dat is meteen de effect-dependency. Een object
  // zou bij elke render een nieuwe identiteit krijgen en de debounce zinloos
  // maken; een string vergelijkt op inhoud. Twee regels met dezelfde inhoud
  // sturen dus ook dezelfde body — en krijgen hetzelfde antwoord.
  const payload = useMemo(
    () =>
      JSON.stringify({
        budgetIds: rule.budgetIds,
        includeChildBudgets: rule.includeChildBudgets,
        counterpartyLabels: rule.counterpartyLabels.map((l) => l.trim()).filter(Boolean),
        period,
        excludeLimitId,
      }),
    [rule.budgetIds, rule.includeChildBudgets, rule.counterpartyLabels, period, excludeLimitId],
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
      className="space-y-1.5 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2.5"
    >
      <h3 className="text-xs font-semibold text-[var(--ink-2)]">Wat deze regel nu zou raken</h3>
      <div aria-live="polite" className="space-y-1.5">
        <PreviewBody state={state} period={period} dailyExpenseRate={dailyExpenseRate} />
      </div>
    </section>
  )
}

function PreviewBody({
  state,
  period,
  dailyExpenseRate,
}: {
  state: PreviewState
  period: SpendLimitPeriodKind
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
          In je laatste {periods.length} {PERIOD_WORDS[period].plural} raakt deze regel nog niets.
        </p>
      ) : (
        <>
          <p className="text-[11px] text-[var(--ink-2)]">
            {preview.matchedTransactionCount} transactie
            {preview.matchedTransactionCount === 1 ? '' : 's'} in je laatste {periods.length}{' '}
            {PERIOD_WORDS[period].plural}
            {preview.keys.length > 0 && (
              <>
                {' '}
                op zoeksleutel{preview.keys.length === 1 ? '' : 's'}{' '}
                <span className="font-mono text-[var(--ink)]">{preview.keys.join(' · ')}</span>
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

/** Hoeveel suggesties we hoogstens tonen — daarboven is scrollen zinloos werk. */
const MAX_COUNTERPARTY_SUGGESTIONS = 40

/**
 * Tegenpartij-veld met een eigen suggestielijst.
 *
 * BEWUST GEEN native `<input list>` + `<datalist>`: die dropdown tekent de
 * browser zelf, buiten React en buiten het ShellOverlay-z-index-systeem om. Op
 * Android Chrome viel dat native paneel zichtbaar over het onderliggende blok
 * "Over welke periode telt de grens?" van deze sheet heen (testmelding 8a28dc,
 * 9 aug 2026). De lijst hieronder leeft binnen de sheet, is gestyled als de rest
 * van het formulier en sluit bij keuze, buiten-klik, Tab-weg en Escape — conform
 * de overlay-conventie bovenaan dit bestand (ADR 0039).
 *
 * FILTEREN loopt door `spendLimitCounterpartyKey`/`counterpartyMatchesKey`:
 * exact dezelfde genormaliseerde contains-match als de motor en de SQL gebruiken
 * om te bepalen wélke transacties meetellen. De suggestielijst toont daardoor
 * nooit een naam die de grens daarna niet zou vangen — een native datalist deed
 * hier een eigen, ruwere tekstvergelijking.
 */
function CounterpartyField({
  idPrefix,
  options,
  onAdd,
}: {
  /**
   * Uniek per regel. De ids waren tot 09-08-2026 vaste strings; met meerdere
   * regels op één scherm zouden `<label for>` en `aria-controls` dan allemaal
   * naar het EERSTE veld wijzen — de screenreader leest dan de verkeerde
   * combobox voor en een klik op het label springt naar de verkeerde regel.
   */
  idPrefix: string
  options: SpendLimitCounterpartyOption[] | null
  onAdd: (label: string) => void
}) {
  // De tekst in het veld is nu PUUR invoer: hij hoort niet bij de regel, want de
  // regel bewaart een LIJST. Zodra de gebruiker kiest of bevestigt, verhuist de
  // tekst naar die lijst en is het veld weer leeg voor de volgende.
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const listId = `${idPrefix}-list`
  const inputId = `${idPrefix}-input`

  const suggestions = useMemo(() => {
    const all = options ?? []
    const key = spendLimitCounterpartyKey(value)
    // Een lege zoekterm levert een lege sleutel op — dan tonen we de hele lijst.
    const matched = key ? all.filter((c) => counterpartyMatchesKey(c.label, key)) : all
    return matched.slice(0, MAX_COUNTERPARTY_SUGGESTIONS)
  }, [options, value])

  const listOpen = open && suggestions.length > 0

  const select = useCallback(
    (label: string) => {
      onAdd(label)
      setValue('')
      setOpen(false)
      setActiveIndex(-1)
    },
    [onAdd],
  )

  // Buiten-klik sluit de lijst — zelfde patroon als components/overview/filter-dropdown.tsx.
  useEffect(() => {
    if (!listOpen) return
    function onPointerDown(e: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [listOpen])

  // Toetsenbordnavigatie houdt de actieve optie in beeld.
  useEffect(() => {
    if (!listOpen || activeIndex < 0) return
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [listOpen, activeIndex])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        setActiveIndex(0)
        return
      }
      if (suggestions.length === 0) return
      setActiveIndex((i) => (i + 1) % suggestions.length)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!listOpen) return
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
      return
    }
    if (e.key === 'Enter') {
      // Enter bevestigt: de gemarkeerde suggestie als er één actief is, anders de
      // getikte tekst zelf. Vrije tekst MOET blijven werken — de suggestielijst
      // is een top-40 en een tegenpartij daarbuiten is een geldige zoekterm.
      if (listOpen && activeIndex >= 0 && suggestions[activeIndex]) {
        e.preventDefault()
        select(suggestions[activeIndex].label)
        return
      }
      if (value.trim().length >= MIN_COUNTERPARTY_LENGTH) {
        // Anders zou Enter in een sheet-formulier de sheet kunnen submitten
        // terwijl de gebruiker alleen een tegenpartij wilde toevoegen.
        e.preventDefault()
        select(value)
        return
      }
    }
    if (e.key === 'Escape' && listOpen) {
      // Alleen de suggestielijst sluiten, niet de hele sheet: BottomSheet luistert
      // op document-niveau op Escape, dus die listener moet hier stoppen.
      e.preventDefault()
      e.stopPropagation()
      e.nativeEvent.stopImmediatePropagation()
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onBlur={(e) => {
        // Tab-weg sluit de lijst; een klik op een optie niet (die blijft binnen de wrapper,
        // en houdt de focus vast via preventDefault op mousedown).
        if (!wrapperRef.current?.contains(e.relatedTarget as Node | null)) {
          setOpen(false)
          setActiveIndex(-1)
        }
      }}
    >
      <label
        htmlFor={inputId}
        className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-2)]"
      >
        <Flame className="h-3.5 w-3.5" aria-hidden />
        Tegenpartijen <span className="font-normal text-[var(--ink-3)]">(meerdere mogelijk)</span>
      </label>
      <div className="flex gap-1.5">
        <input
          id={inputId}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setActiveIndex(-1)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Shell"
          maxLength={120}
          autoComplete="off"
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            listOpen && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
          }
          className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:border-[var(--ink-3)] focus:outline-none"
        />
        {/* Een zichtbare knop naast Enter: op mobiel is er geen toetsenbord-Enter
            die vanzelf voor de hand ligt, en zonder knop is niet te zien dat de
            getikte tekst nog TOEGEVOEGD moet worden. */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => select(value)}
          disabled={value.trim().length < MIN_COUNTERPARTY_LENGTH}
          aria-label="Tegenpartij toevoegen"
          className="inline-flex h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[var(--border-ed)] text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {listOpen && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Tegenpartij-suggesties"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] shadow-lg"
        >
          {suggestions.map((c, i) => (
            <button
              key={c.key}
              type="button"
              role="option"
              id={`${listId}-${i}`}
              data-index={i}
              aria-selected={i === activeIndex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(c.label)}
              className={`block min-h-[44px] w-full px-3 py-2 text-left text-sm transition-colors ${
                i === activeIndex
                  ? 'bg-kern-50 font-medium text-kern-700'
                  : 'text-[var(--ink-2)] hover:bg-[var(--subtle)]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
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
