'use client'

/**
 * SpendLimitPerformancePane — het leesoppervlak van één grenzenpot: verloop,
 * reeks, trend en de uitsplitsing achter het bedrag.
 *
 * euro-view: exempt (gerealiseerde historie)
 *
 * ── VORM: <ShellOverlay kind="pane"> (D5, ADR 0039) ─────────────────────────
 * De sectie gebruikt `sheet` voor het formulier en `confirm` voor archiveren; die
 * vorm-scheiding (sheet = bewerken, pane = lezen) blijft betekenisvol. Direct
 * `BottomSheet` gebruiken is verboden — het bestaande directe gebruik in
 * transacties-analyse.tsx is grandfathered en wordt hier NIET gespiegeld.
 *
 * ── DATAPAD (D6 / NFR-B1-01) ────────────────────────────────────────────────
 * Het volledige standaardbeeld komt uit de `SpendLimitWithReport`-prop die al op
 * de pagina staat: NUL extra fetches. Alleen de per-naam-uitsplitsing van een
 * tegenpartij-pot is on-demand, via GET /api/spend-limits/[id]/breakdown — een
 * API-route, geen client-directe Supabase-read (ADR 0058).
 *
 * ── CONSUME, DON'T RECOMPUTE ────────────────────────────────────────────────
 * Bedragen, status, reeksen en de trend komen uit `lib/spend-limits/engine.ts`.
 * De verleiding om hier een gemiddelde te rekenen is reëel — budget-trend-widget
 * doet dat wél lokaal — maar dat patroon geldt hier niet: `report.trend` is de
 * enige bron. De vrijheidstijd komt uit `dailyExpenseRate` (loader) plus de
 * canonieke helpers uit lib/format.ts; nooit een eigen deling.
 *
 * ── DEEPLINK (D7) ───────────────────────────────────────────────────────────
 * De pane accepteert `limitId`/`initialPeriodKey` als props en is los van de
 * sectie aanroepbaar. Het opruimen van de query-parameters bij sluiten gebeurt
 * bewust NIET hier maar bij de aanroeper (de sectie bezit de URL-staat).
 *
 * ── PERSPECTIEF-NEUTRAAL (D47) ──────────────────────────────────────────────
 * De pane reageert niet op de perspectief-cookie; gedeelde huishoudboekingen
 * tellen ongeschaald mee, net als in het overzicht. Dat staat er letterlijk bij.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Flame, Info } from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { MaskedAmount } from '@/components/app/masked-amount'
import { Kicker } from '@/components/editorial'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { useSpendLimitCopy } from '@/lib/hooks/use-spend-limit-alias'
import { calculateFreedomTime, formatFreedomTimeString, formatMaskedCurrency } from '@/lib/format'
import type { SpendLimitPeriodOutcome, SpendLimitTrend } from '@/lib/spend-limits/engine'
import type { SpendLimitBudgetSplitRow, SpendLimitWithReport } from '@/lib/spend-limits/types'
import { SpendLimitPeriodChart } from './spend-limit-period-chart'
import { SpendLimitHeatmap } from './spend-limit-heatmap'

// ── Props-contract (W3-SECTION consumeert dit) ──────────────────────────────

export interface SpendLimitPerformancePaneProps {
  open: boolean
  onClose: () => void
  /** De pot waarvan het verloop getoond wordt; `null` ⇒ de pane blijft leeg. */
  limit: SpendLimitWithReport | null
  /** `null` ⇒ render het bedrag zónder vrijheidstijd-regel (D-P1). */
  dailyExpenseRate: number | null
  /** Voorselectie uit de deeplink (`?periode=`). */
  initialPeriodKey?: string | null
  /** Een aggregaat-chunk raakte de max_rows-cap: de sommen kunnen te laag zijn. */
  aggregateTruncationSuspected?: boolean
}

interface BreakdownName {
  name: string
  matchedAmount: number
  count: number
}

interface BreakdownResponse {
  periodKey: string
  label: string
  names: BreakdownName[]
  restMatchedAmount: number
  restCount: number
}

type BreakdownState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: BreakdownResponse }

// ── Hulpstukken ─────────────────────────────────────────────────────────────

/**
 * Alle periodes in het venster, oud → nieuw. De motor garandeert dat de laatste
 * slice de lopende periode is; `closedPeriods` is de rest, in volgorde.
 */
function allOutcomes(limit: SpendLimitWithReport): SpendLimitPeriodOutcome[] {
  return [...limit.report.closedPeriods, limit.report.currentPeriod]
}

/**
 * Verberg LEGE VOORLOOP-periodes (AC-B4-08).
 *
 * Een kwartaal- of jaarpot die pas twee periodes bestaat zou anders zeven lege
 * staven tonen die suggereren dat je toen "binnen je grens" bleef — terwijl er
 * simpelweg nog niets was. We knippen dus alles vóór de eerste periode met een
 * gematchte transactie weg. De teller "X van de Y afgesloten periodes" telt
 * bewust wél over het HELE venster (dat is `report.streaks.closedPeriodCount`,
 * de canonieke bron) — de UI zegt dat er expliciet bij, zodat het verschil tussen
 * "wat je ziet" en "wat er geteld is" geen stille tegenspraak wordt.
 *
 * Is er in het hele venster niets gematcht, dan blijft alleen de lopende periode
 * staan: een rij lege staven is geen informatie.
 */
function visiblePeriods(outcomes: SpendLimitPeriodOutcome[]): SpendLimitPeriodOutcome[] {
  const first = outcomes.findIndex((o) => o.matchedTransactionCount > 0)
  if (first <= 0) {
    return first === 0 ? outcomes : outcomes.slice(-1)
  }
  return outcomes.slice(first)
}

/** Vrijheidstijd bij een bedrag; `null` zodra het niet eerlijk te tonen is. */
function freedomFor(amount: number, dailyExpenseRate: number | null): string | null {
  if (dailyExpenseRate === null || !(dailyExpenseRate > 0)) return null
  if (!(Math.abs(amount) > 0)) return null
  return formatFreedomTimeString(calculateFreedomTime(amount, dailyExpenseRate), 'long')
}

/** De regel die het bedrag in vrijheidstijd uitdrukt. Verdwijnt onder maskering. */
function FreedomLine({
  amount,
  dailyExpenseRate,
  prefix,
}: {
  amount: number
  dailyExpenseRate: number | null
  prefix: string
}) {
  const { masked } = useMaskedAmounts()
  // Vrijheidstijd is bedrag ÷ dagtarief: onder maskering zou hij het verborgen
  // bedrag alsnog uitspellen. Dus geen uitzondering — hij verdwijnt mee.
  if (masked) return null
  const time = freedomFor(amount, dailyExpenseRate)
  if (!time) return null
  return (
    <p className="mt-0.5 font-serif text-xs italic text-[var(--ink-3)]">
      {prefix} ≈ {time} vrijheid
    </p>
  )
}

function ruleSentence(limit: SpendLimitWithReport): string {
  const { config } = limit
  if (config.ruleType === 'budget') {
    const naam = config.budgetName ?? 'een budget dat niet meer beschikbaar is'
    return config.includeChildBudgets
      ? `Uitgaven in ${naam} (inclusief subbudgetten)`
      : `Uitgaven in ${naam}`
  }
  return `Uitgaven bij ${config.counterpartyLabel ?? 'een tegenpartij'}`
}

/**
 * De staat van het gekoppelde budget — TWEE gebeurtenissen, twee boodschappen
 * (AC-B1-02). Ze samenvatten tot één "niet meer beschikbaar" zou het archiveren
 * van een budget als dataverlies laten klinken terwijl er niets kwijt is:
 *
 *  - budget WEG (`budgetName === null`): de pot kan structureel niets meer
 *    tellen. Dit is een defect-achtige toestand waar de gebruiker iets aan moet
 *    doen.
 *  - budget GEARCHIVEERD: alles klopt nog, alleen komt er waarschijnlijk niets
 *    nieuws meer bij. Dit is een verwachtingsregel, geen waarschuwing.
 *
 * De volgorde is betekenisvol: een weg budget wint, want dan zegt "gearchiveerd"
 * niets meer.
 */
function BudgetStateNotice({ limit }: { limit: SpendLimitWithReport }) {
  const { config } = limit
  if (config.ruleType !== 'budget') return null

  if (config.budgetName === null) {
    return (
      <p className="text-xs text-[var(--ink-3)]">
        Het gekoppelde budget is niet meer beschikbaar. De historie hieronder klopt nog wel, maar
        nieuwe uitgaven kunnen niet meer worden toegerekend.
      </p>
    )
  }

  if (config.budgetArchived) {
    return (
      <p className="text-xs text-[var(--ink-3)]">
        Het budget {config.budgetName} is gearchiveerd. Je historie en je reeks blijven kloppen; er
        komen alleen waarschijnlijk geen nieuwe uitgaven meer bij.
      </p>
    )
  }

  return null
}

// ── Pane ────────────────────────────────────────────────────────────────────

export function SpendLimitPerformancePane({
  open,
  onClose,
  limit,
  dailyExpenseRate,
  initialPeriodKey = null,
  aggregateTruncationSuspected = false,
}: SpendLimitPerformancePaneProps) {
  const copy = useSpendLimitCopy()

  return (
    <ShellOverlay
      open={open && limit !== null}
      onClose={onClose}
      kind="pane"
      title={limit?.config.name ?? copy.singular}
      // Bewust GEEN primaryAction: dit is een leesoppervlak. Een "Sluiten"-knop
      // zou een vierde close-affordance zijn naast de ✕, Esc en de backdrop —
      // en "Sluiten" is per de kwaliteitstoets nooit een primaire actie.
    >
      {/* Pas monteren als de pane écht open is: dat houdt de fetch-staat en de
          chart-animatie per opening vers, en voorkomt dat een gesloten
          SlideInPane zijn inhoud alvast rendert. */}
      {open && limit ? (
        <PaneBody
          limit={limit}
          dailyExpenseRate={dailyExpenseRate}
          initialPeriodKey={initialPeriodKey}
          aggregateTruncationSuspected={aggregateTruncationSuspected}
        />
      ) : null}
    </ShellOverlay>
  )
}

function PaneBody({
  limit,
  dailyExpenseRate,
  initialPeriodKey,
  aggregateTruncationSuspected,
}: {
  limit: SpendLimitWithReport
  dailyExpenseRate: number | null
  initialPeriodKey: string | null
  aggregateTruncationSuspected: boolean
}) {
  const { config, report } = limit
  const { masked } = useMaskedAmounts()

  const outcomes = useMemo(() => allOutcomes(limit), [limit])
  const visible = useMemo(() => visiblePeriods(outcomes), [outcomes])
  const hiddenLeading = outcomes.length - visible.length

  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string | null>(() =>
    initialPeriodKey && outcomes.some((o) => o.periodKey === initialPeriodKey)
      ? initialPeriodKey
      : null,
  )
  const [breakdowns, setBreakdowns] = useState<Record<string, BreakdownState>>({})

  const selected = useMemo(
    () => outcomes.find((o) => o.periodKey === selectedPeriodKey) ?? null,
    [outcomes, selectedPeriodKey],
  )

  const togglePeriod = useCallback((periodKey: string) => {
    setSelectedPeriodKey((prev) => (prev === periodKey ? null : periodKey))
  }, [])

  // Welke periodes al zijn opgevraagd. Bewust een ref en geen afgeleide van
  // `breakdowns`: dat laatste zou de effect-dependency laten wisselen zodra de
  // laadstaat gezet is, waarna de cleanup de eigen, nog lopende fetch afbreekt en
  // de uitsplitsing eeuwig op "laden" blijft staan.
  const requested = useRef<Set<string>>(new Set())
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // On-demand uitsplitsing per naam — alleen voor tegenpartij-potten, alleen bij
  // een geselecteerde periode, en per periode maar één keer (NFR-B1-01).
  useEffect(() => {
    const key = selectedPeriodKey
    if (!key) return
    if (config.ruleType !== 'counterparty') return
    if (requested.current.has(key)) return
    requested.current.add(key)

    setBreakdowns((prev) => ({ ...prev, [key]: { status: 'loading' } }))

    const write = (state: BreakdownState) => {
      if (!alive.current) return
      setBreakdowns((prev) => ({ ...prev, [key]: state }))
    }

    fetch(`/api/spend-limits/${config.id}/breakdown?periode=${encodeURIComponent(key)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          requested.current.delete(key)
          write({
            status: 'error',
            message: json?.error || 'De uitsplitsing kon niet worden geladen.',
          })
          return
        }
        write({ status: 'ready', data: json as BreakdownResponse })
      })
      .catch(() => {
        requested.current.delete(key)
        write({
          status: 'error',
          message: 'De uitsplitsing kon niet worden geladen. Controleer je verbinding.',
        })
      })
  }, [selectedPeriodKey, config.ruleType, config.id])

  const current = report.currentPeriod
  const last = report.lastClosedPeriod
  const streaks = report.streaks
  const over = current.status === 'exceeded'

  /* Padding alleen ónder lg. ShellOverlay kind="pane" rendert vanaf lg de
     SlideInPane, en die wrapt children zélf al in `px-7 py-6 lg:px-8 lg:py-7`;
     eigen padding zou de desktop-inset verdubbelen t.o.v. de zusterpanes. Onder
     lg valt hij terug op BottomSheet, en die geeft children géén padding — daar
     is deze dus wél nodig. */
  return (
    <div className="space-y-6 p-5 sm:p-6 lg:p-0">
      {/* ── Wat deze grens is ─────────────────────────────────────────────── */}
      <header className="space-y-1">
        <p className="text-sm text-[var(--ink-2)]">{ruleSentence(limit)}</p>
        {config.purpose && (
          <p className="font-serif text-sm italic text-[var(--ink-3)]">{config.purpose}</p>
        )}
        {!config.isActive && (
          <p className="text-xs font-medium text-[var(--ink-3)]">
            Gepauzeerd — je ziet nog steeds wat er gebeurde.
          </p>
        )}
        <BudgetStateNotice limit={limit} />
      </header>

      {aggregateTruncationSuspected && (
        <div
          role="status"
          className="flex items-start gap-2 border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 text-xs text-[var(--ink-2)]"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-negative" />
          <span>
            Je transactiehistorie is zo groot dat we niet zeker weten of alles is meegeteld. De
            bedragen hieronder kunnen te laag zijn — we zeggen het liever dan dat je een stil
            verkeerd getal ziet.
          </span>
        </div>
      )}

      {/* ── De lopende periode ────────────────────────────────────────────── */}
      <section className="space-y-2">
        <Kicker>Nu</Kicker>
        <div className="border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs text-[var(--ink-3)]">
              {current.label} · voorlopig, telt niet mee voor je reeks
            </span>
            {/* Drie standen — zie spend-limits-section.tsx en spend-limit-widget.tsx. */}
            <span
              className={`text-xs font-medium ${
                over ? 'text-negative' : current.isNearLimit ? 'text-warning' : 'text-positive'
              }`}
            >
              {over ? 'Boven je grens' : current.isNearLimit ? 'Dicht bij je grens' : 'Binnen je grens'}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--ink)]">
            <MaskedAmount value={current.periodMatchedAmount} tone="kern" /> van{' '}
            <MaskedAmount value={current.limitAmount} tone="kern" />
          </p>
          <p className="mt-1 text-xs text-[var(--ink-2)]">
            {over ? (
              <>
                <MaskedAmount
                  value={current.periodOverAmount}
                  tone="inherit"
                  className="text-negative"
                />{' '}
                eroverheen
              </>
            ) : (
              <>
                nog <MaskedAmount value={current.periodHeadroom} tone="inherit" /> ruimte
              </>
            )}
          </p>
          <FreedomLine
            amount={over ? current.periodOverAmount : current.periodHeadroom}
            dailyExpenseRate={dailyExpenseRate}
            prefix={over ? 'Die overschrijding is' : 'Die ruimte is'}
          />
        </div>
      </section>

      {/* ── Verloop ───────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <Kicker>Verloop per periode</Kicker>
        <SpendLimitPeriodChart
          outcomes={visible}
          limitAmount={config.limitAmount}
          trend={report.trend}
          closedPeriodCount={streaks.closedPeriodCount}
          exceededPeriodCount={streaks.exceededPeriodCount}
          dailyExpenseRate={dailyExpenseRate}
          selectedPeriodKey={selectedPeriodKey}
          onSelectPeriod={togglePeriod}
        />
        <p className="text-[11px] text-[var(--ink-3)]">
          De grenslijn is je huidige grens en geldt ook voor afgesloten periodes — een grens die je
          nu wijzigt, verandert dus ook het beeld van toen.
        </p>
        {hiddenLeading > 0 && (
          <p className="text-[11px] text-[var(--ink-3)]">
            {hiddenLeading} periode{hiddenLeading === 1 ? '' : 's'} vóór je eerste gematchte
            transactie {hiddenLeading === 1 ? 'is' : 'zijn'} weggelaten. De teller hierboven kijkt
            wél naar het hele venster van {streaks.closedPeriodCount} afgesloten periode
            {streaks.closedPeriodCount === 1 ? '' : 's'}.
          </p>
        )}
      </section>

      {/* ── Trend ─────────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <Kicker>Richting</Kicker>
        <TrendSummary trend={report.trend} dailyExpenseRate={dailyExpenseRate} />
      </section>

      {/* ── Reeks ─────────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <Kicker>Je reeks</Kicker>
        <SpendLimitHeatmap
          outcomes={visible}
          selectedPeriodKey={selectedPeriodKey}
          onSelectPeriod={togglePeriod}
        />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
          <Stat label="Huidige reeks">
            <span className="inline-flex items-center gap-1">
              {streaks.currentStreak > 0 && (
                <Flame className="h-3.5 w-3.5 text-[var(--color-kern-500)]" />
              )}
              {streaks.currentStreak}
            </span>
          </Stat>
          <Stat label="Langste reeks">{streaks.longestStreak}</Stat>
          <Stat label="Laatst binnen">
            {streaks.lastWithinPeriodKey ?? <span className="text-[var(--ink-3)]">—</span>}
          </Stat>
          <Stat label={`Overschreden (van ${streaks.closedPeriodCount})`}>
            {streaks.exceededPeriodCount}
          </Stat>
        </dl>
        {last && (
          <p className="text-[11px] text-[var(--ink-3)]">
            Laatst afgesloten: {last.label} ·{' '}
            <span className="font-mono tabular-nums">
              {formatMaskedCurrency(last.periodMatchedAmount, masked)}
            </span>{' '}
            · {last.status === 'exceeded' ? 'boven je grens' : 'binnen je grens'}
          </p>
        )}
      </section>

      {/* ── Uitsplitsing van de gekozen periode ───────────────────────────── */}
      <section className="space-y-2">
        <Kicker>Waar zat het in</Kicker>
        {!selected ? (
          <p className="text-sm text-[var(--ink-3)]">
            Kies een periode in de grafiek of het rooster om te zien waar het bedrag vandaan komt.
          </p>
        ) : config.ruleType === 'budget' ? (
          <BudgetSplitList
            rows={limit.budgetSplit.filter((r) => r.periodKey === selected.periodKey)}
            label={selected.label}
          />
        ) : (
          <NameBreakdownList
            state={breakdowns[selected.periodKey]}
            label={selected.label}
            periodMatchedAmount={selected.periodMatchedAmount}
            dailyExpenseRate={dailyExpenseRate}
          />
        )}
      </section>

      <p className="flex items-start gap-2 text-[11px] text-[var(--ink-3)]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Gedeelde huishoudboekingen tellen hier ongeschaald mee, net als in je overzicht. Deze
          weergave verandert niet mee met je perspectiefkeuze.
        </span>
      </p>
    </div>
  )
}

// ── Trend ───────────────────────────────────────────────────────────────────

const DIRECTION_WORD: Record<SpendLimitTrend['direction'], string> = {
  improving: 'Je geeft minder uit dan in de periodes daarvóór.',
  worsening: 'Je geeft meer uit dan in de periodes daarvóór.',
  stable: 'Je geeft ongeveer evenveel uit als daarvóór.',
  unknown: '',
}

function TrendSummary({
  trend,
  dailyExpenseRate,
}: {
  trend: SpendLimitTrend
  dailyExpenseRate: number | null
}) {
  // Geen lokale gemiddelden: `report.trend` is de canonieke bron (NFR-B0-02).
  if (trend.recentAvgMatchedAmount === null) {
    return (
      <p className="text-sm text-[var(--ink-3)]">
        Nog niet genoeg historie voor een richting — daar zijn minstens {trend.windowPeriods}{' '}
        afgesloten periodes voor nodig.
      </p>
    )
  }

  if (trend.priorAvgMatchedAmount === null) {
    return (
      <p className="text-sm text-[var(--ink-2)]">
        Gemiddeld <MaskedAmount value={trend.recentAvgMatchedAmount} tone="kern" /> per periode over
        je laatste {trend.windowPeriods} afgesloten periodes. Voor een vergelijking met de periodes
        daarvóór heb je er {trend.windowPeriods * 2} nodig.
      </p>
    )
  }

  const pct = trend.avgMatchedAmountChangePct
  const toneClass =
    trend.direction === 'improving'
      ? 'text-positive'
      : trend.direction === 'worsening'
        ? 'text-negative'
        : 'text-[var(--ink-2)]'

  return (
    <div className="space-y-1">
      <p className={`text-sm font-medium ${toneClass}`}>{DIRECTION_WORD[trend.direction]}</p>
      <p className="text-xs text-[var(--ink-2)]">
        Laatste {trend.windowPeriods} periodes gemiddeld{' '}
        <MaskedAmount value={trend.recentAvgMatchedAmount} tone="kern" />, de {trend.windowPeriods}{' '}
        daarvóór <MaskedAmount value={trend.priorAvgMatchedAmount} tone="kern" />
        {pct !== null && (
          <>
            {' '}
            — een verschil van {Math.abs(Math.round(pct))}%
          </>
        )}
        .
      </p>
      <FreedomLine
        amount={Math.abs(trend.avgMatchedAmountChange ?? 0)}
        dailyExpenseRate={dailyExpenseRate}
        prefix={trend.direction === 'improving' ? 'Dat scheelt je' : 'Dat kost je'}
      />
    </div>
  )
}

// ── Uitsplitsingen ──────────────────────────────────────────────────────────

function BudgetSplitList({ rows, label }: { rows: SpendLimitBudgetSplitRow[]; label: string }) {
  const { masked } = useMaskedAmounts()
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--ink-3)]">
        Geen uitgaven in <span className="capitalize">{label}</span>.
      </p>
    )
  }
  const sorted = [...rows].sort((a, b) => b.matchedAmount - a.matchedAmount)
  return (
    <ul className="divide-y divide-[var(--border-ed)] border-y border-[var(--border-ed)]">
      {sorted.map((r) => (
        <li key={r.budgetId} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
          <span className="min-w-0 truncate text-[var(--ink)]">
            {r.budgetName ?? 'Onbekend budget'}
            <span className="ml-1.5 text-[11px] text-[var(--ink-3)]">
              {r.matchedTransactionCount}×
            </span>
          </span>
          <span className="shrink-0 font-mono tabular-nums text-[var(--ink)]">
            {formatMaskedCurrency(r.matchedAmount, masked)}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * De uitsplitsing per naam achter één periode.
 *
 * CONSUME, DON'T RECOMPUTE — `periodMatchedAmount` is het CANONIEKE periodebedrag
 * uit de motor (`SpendLimitPeriodOutcome`), en dát is wat de vrijheidstijd-regel
 * uitdrukt. De verleiding om hier `namen + rest` op te tellen is groot (het staat
 * immers regel voor regel op het scherm), maar die som is niet dezelfde grootheid:
 * de route KLEMT de restpost op 0 zodra een refund-only schrijfwijze buiten de
 * top-50 valt, waarna `namen + rest` boven het canonieke bedrag uitkomt. De
 * gebruiker zou dan meer vrijheidstijd zien dan de periode hem werkelijk kostte.
 * De uitsplitsing is uitleg, geen tweede optelling.
 */
function NameBreakdownList({
  state,
  label,
  periodMatchedAmount,
  dailyExpenseRate,
}: {
  state: BreakdownState | undefined
  label: string
  /** Canoniek periodebedrag uit de motor — nooit de som van de regels hieronder. */
  periodMatchedAmount: number
  dailyExpenseRate: number | null
}) {
  const { masked } = useMaskedAmounts()

  if (!state || state.status === 'loading') {
    return (
      <p aria-live="polite" className="text-sm text-[var(--ink-3)]">
        Uitsplitsing van <span className="capitalize">{label}</span> wordt opgehaald…
      </p>
    )
  }
  if (state.status === 'error') {
    return (
      <p role="alert" className="text-sm text-negative">
        {state.message}
      </p>
    )
  }

  const { names, restMatchedAmount, restCount } = state.data
  if (names.length === 0 && restCount === 0) {
    return (
      <p className="text-sm text-[var(--ink-3)]">
        Geen uitgaven in <span className="capitalize">{label}</span>.
      </p>
    )
  }

  return (
    <div className="space-y-1.5">
      <ul className="divide-y divide-[var(--border-ed)] border-y border-[var(--border-ed)]">
        {names.map((n) => (
          <li key={n.name} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
            <span className="min-w-0 truncate text-[var(--ink)]">
              {n.name}
              <span className="ml-1.5 text-[11px] text-[var(--ink-3)]">{n.count}×</span>
            </span>
            <span className="shrink-0 font-mono tabular-nums text-[var(--ink)]">
              {formatMaskedCurrency(n.matchedAmount, masked)}
            </span>
          </li>
        ))}
        {restCount > 0 && (
          <li className="flex items-baseline justify-between gap-3 py-1.5 text-sm text-[var(--ink-2)]">
            <span>
              Overige namen
              <span className="ml-1.5 text-[11px] text-[var(--ink-3)]">{restCount}×</span>
            </span>
            <span className="shrink-0 font-mono tabular-nums">
              {formatMaskedCurrency(restMatchedAmount, masked)}
            </span>
          </li>
        )}
      </ul>
      <FreedomLine
        amount={periodMatchedAmount}
        dailyExpenseRate={dailyExpenseRate}
        prefix="Samen is dat"
      />
      <p className="text-[11px] text-[var(--ink-3)]">
        Dit zijn de namen zoals je bank ze doorgeeft. We tonen er maximaal 50; de rest staat
        samengevat op één regel.
      </p>
    </div>
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
