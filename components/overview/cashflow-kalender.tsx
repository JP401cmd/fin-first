'use client'

import { useMemo } from 'react'
import { formatCurrency } from '@/lib/format'
import {
  getUpcomingTransactions,
  nextOccurrenceFromSchedule,
  type RecurringSchedule,
  type RecurringTransaction,
} from '@/lib/recurring-data'

/**
 * @audit-kpi-actions skip — visualisatie-banner; actie via parent tab
 *
 * CashflowKalender — visualiseert recurring transactions over de
 * komende 30 dagen als kalender-grid. Per dag een mini-stack van
 * afschrijvings-markers (rood = uitgave) en inkomens-markers (groen).
 *
 * Plan-context: backlog "Cashflow Sankey-chart, forecast, kalender uit
 * cash-overview". Eerste stap richting Sankey (later) — deze kalender
 * geeft het gevoel "wat komt er deze maand" zonder zware visualisatie.
 *
 * Mounting: nieuwe sub-view op /overzicht/cashflow naast Budget /
 * Transacties / Vaste lasten via de CashflowViewSwitcher.
 *
 * TWEE BRONNEN, ÉÉN KALENDER (bevinding M21) — en ze blijven uit elkaar te
 * houden:
 *  · `recurrings` — BEVESTIGDE `recurring_transactions` (al gefilterd op
 *    is_active). Volle markers.
 *  · `detections` — door de app GEVONDEN maar nog niet bevestigde vaste lasten
 *    uit dezelfde `loadVasteLastenSummary` die de analyse-kaart erboven voedt.
 *    Gestippelde, gedempte markers met een `~`-voorvoegsel.
 *
 * Vóór M21 las de kalender alléén de bevestigde tabel, terwijl de analyse-kaart
 * erboven bevestigd + gedetecteerd optelde. Bij een verse koppeling stond er dus
 * "21 vaste lasten" bovenaan en "geen vaste afschrijvingen" eronder. De kalender
 * verzint niets bij: beide populaties komen uit hun eigen bron en worden
 * afzonderlijk geteld en gelabeld.
 *
 * `getUpcomingTransactions` / `nextOccurrenceFromSchedule` (lib/recurring-data.ts)
 * zijn de ENIGE datummotor — geen tweede heuristiek in deze component.
 */

/** Eén nog niet bevestigde, gedetecteerde vaste last op de kalender. */
export type CashflowDetection = {
  id: string
  name: string
  /** Gemiddeld bedrag per afschrijving, POSITIEF (detecties zijn uitgaven). */
  amount: number
  /** Roosterfeiten uit de detectie; null → niet plaatsbaar, niet tonen. */
  schedule: RecurringSchedule | null
}

type DayBucket = {
  date: Date
  expenses: { name: string; amount: number }[]
  incomes: { name: string; amount: number }[]
  /** Nog niet bevestigd — apart gehouden zodat ze apart getoond kunnen worden. */
  detections: { name: string; amount: number }[]
}

const WEEKDAYS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

/**
 * Bouw 35-cel grid (5 weken × 7 dagen) startend op de maandag van de
 * week waarin "vandaag" valt. Eerste cel = maandag van die week;
 * laatste cel = zondag 5 weken later. Bedekt minimaal 30 dagen ahead.
 */
function buildBuckets(
  recurrings: RecurringTransaction[],
  detections: CashflowDetection[],
  todayISO: string,
): DayBucket[] {
  const today = new Date(todayISO + 'T12:00:00')
  // Vind maandag van huidige week (0 = zondag, 1 = maandag, …)
  const dayOfWeek = today.getDay()
  const daysSinceMonday = (dayOfWeek + 6) % 7 // 0=Mon → 0, 1=Tue → 1, … 0=Sun → 6
  const monday = new Date(today)
  monday.setDate(today.getDate() - daysSinceMonday)

  const buckets: DayBucket[] = []
  for (let i = 0; i < 35; i++) {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    buckets.push({ date, expenses: [], incomes: [], detections: [] })
  }

  /** Bucket-index van een datum, of null buiten het 5-weken-venster. */
  const bucketFor = (date: Date): DayBucket | null => {
    const idx = Math.floor(
      (date.getTime() - monday.getTime()) / (1000 * 60 * 60 * 24),
    )
    if (idx < 0 || idx >= buckets.length) return null
    return buckets[idx] ?? null
  }

  // Get upcoming over 35 dagen (vanaf vandaag) en sorteer in buckets
  const upcoming = getUpcomingTransactions(recurrings, 35, today)
  for (const { recurring, nextDate } of upcoming) {
    const bucket = bucketFor(nextDate)
    if (!bucket) continue
    const amount = Number(recurring.amount)
    if (amount < 0) {
      bucket.expenses.push({ name: recurring.name, amount })
    } else {
      bucket.incomes.push({ name: recurring.name, amount })
    }
  }

  // Nog niet bevestigde detecties — zelfde datummotor, eigen bucket-lijst.
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() + 35)
  for (const detection of detections) {
    if (!detection.schedule) continue
    const nextDate = nextOccurrenceFromSchedule(detection.schedule, today)
    if (!nextDate || nextDate > cutoff) continue
    const bucket = bucketFor(nextDate)
    if (!bucket) continue
    bucket.detections.push({
      name: detection.name,
      amount: Math.abs(Number(detection.amount)),
    })
  }

  return buckets
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function CashflowKalender({
  recurrings,
  detections = [],
}: {
  recurrings: RecurringTransaction[]
  /** Gevonden maar nog niet bevestigde vaste lasten (M21). */
  detections?: CashflowDetection[]
}) {
  // Today gestabiliseerd op render-tijd zodat bucket-buildup pure is.
  const todayISO = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const today = useMemo(() => new Date(todayISO + 'T12:00:00'), [todayISO])

  const buckets = useMemo(
    () => buildBuckets(recurrings, detections, todayISO),
    [recurrings, detections, todayISO],
  )

  // Totalen voor de header. BEVESTIGD en NOG TE BEVESTIGEN blijven gescheiden:
  // één opgeteld bedrag zou een geschat totaal even hard laten ogen als een
  // vastgelegd totaal.
  const totalExpenses = buckets.reduce(
    (s, b) =>
      s + b.expenses.reduce((s2, e) => s2 + Math.abs(e.amount), 0),
    0,
  )
  const totalIncomes = buckets.reduce(
    (s, b) => s + b.incomes.reduce((s2, i) => s2 + i.amount, 0),
    0,
  )
  const totalDetections = buckets.reduce(
    (s, b) => s + b.detections.reduce((s2, d) => s2 + d.amount, 0),
    0,
  )

  const detectionCount = buckets.reduce((s, b) => s + b.detections.length, 0)
  const hasConfirmed = buckets.some((b) => b.expenses.length + b.incomes.length > 0)
  const hasAny = hasConfirmed || detectionCount > 0

  /**
   * Zijn er wél gevonden vaste lasten, maar viel er niets van in het venster?
   * Dan is "we vonden niets" onwaar — de lege staat moet dat verschil maken.
   */
  const undatedDetections = detections.length - detectionCount

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Cashflow — kalender
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
            Komende 5 weken
          </h2>
        </div>
        {hasAny && (
          <div className="flex items-center gap-4 text-xs">
            {hasConfirmed && (
              <>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    Verwacht uit
                  </div>
                  <div className="font-serif font-semibold text-negative tabular-nums">
                    {formatCurrency(totalExpenses)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    Verwacht in
                  </div>
                  <div className="font-serif font-semibold text-positive tabular-nums">
                    {formatCurrency(totalIncomes)}
                  </div>
                </div>
              </>
            )}
            {detectionCount > 0 && (
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                  Nog te bevestigen
                </div>
                <div className="font-serif font-semibold text-[var(--ink-3)] tabular-nums">
                  {formatCurrency(totalDetections)}
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Legenda — alleen zinvol zodra beide soorten door elkaar staan. */}
      {detectionCount > 0 && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--ink-3)]">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full bg-[var(--ink-3)]"
            />
            Bevestigd
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full border border-dashed border-[var(--ink-3)]"
            />
            Gevonden, nog te bevestigen — datum geschat uit je transacties
          </span>
        </p>
      )}

      {/* Lege staat, in gewoon Nederlands en zonder padverwijzing: de oude tekst
          stuurde je naar de pagina waar je al stond (M21). Twee gevallen, want
          "we vonden niets" is onwaar zodra de analyse hierboven wél posten telt. */}
      {!hasAny ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-6 text-center">
          <p className="text-sm text-[var(--ink-3)] italic leading-relaxed">
            {undatedDetections > 0 ? (
              <>
                We hebben{' '}
                {undatedDetections === 1
                  ? 'één terugkerende post'
                  : `${undatedDetections} terugkerende posten`}{' '}
                gevonden, maar konden er nog geen vaste afschrijfdag uit
                afleiden. Bevestig ze in de analyse hierboven, dan verschijnen ze
                hier op de kalender.
              </>
            ) : (
              <>
                Nog niets gepland voor de komende vijf weken. Zodra je
                transacties een terugkerend patroon laten zien, vullen we deze
                kalender vanzelf.
              </>
            )}
          </p>
        </div>
      ) : (
        <div>
          {/* Weekday-header */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="text-center text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]"
              >
                {d}
              </div>
            ))}
          </div>
          {/* 35-cell grid */}
          <div
            role="grid"
            aria-label="Cashflow-kalender komende 5 weken"
            className="grid grid-cols-7 gap-1 sm:gap-2"
          >
            {buckets.map((bucket) => {
              const isToday = isSameDay(bucket.date, today)
              const isPast = bucket.date < today && !isToday
              const dayMs = bucket.date.getTime()
              const todayMs = today.getTime()
              const isFuture = dayMs > todayMs
              const expCount = bucket.expenses.length
              const incCount = bucket.incomes.length
              const detCount = bucket.detections.length
              const hasItems = expCount + incCount + detCount > 0
              // Twee bevestigde markers passen; de rest telt in "+N meer".
              const shownConfirmed = Math.min(expCount, 2) + Math.min(incCount, 2)
              const shownDetections = detCount > 0 && shownConfirmed < 2 ? 1 : 0
              const hiddenCount =
                expCount + incCount + detCount - shownConfirmed - shownDetections
              const dayNum = bucket.date.getDate()
              const monthDay = bucket.date.getDate() === 1
              return (
                <div
                  key={bucket.date.toISOString()}
                  role="gridcell"
                  className={`relative rounded-xl border min-h-[64px] sm:min-h-[80px] p-1 sm:p-1.5 flex flex-col ${
                    isToday
                      ? 'border-[var(--module-active-500)] bg-[var(--module-active-50)]/40'
                      : isPast
                        ? 'border-[var(--border-ed)] bg-[var(--subtle)]/30 opacity-60'
                        : isFuture && hasItems
                          ? 'border-[var(--border-ed)] bg-[var(--paper)]'
                          : 'border-[var(--border-ed)] bg-[var(--paper)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`text-[10px] sm:text-xs font-mono tabular-nums ${
                        isToday
                          ? 'text-[var(--module-active-700)] font-bold'
                          : 'text-[var(--ink-3)]'
                      }`}
                    >
                      {dayNum}
                    </span>
                    {monthDay && (
                      <span className="text-[8px] uppercase tracking-[0.08em] text-[var(--ink-4)] font-semibold">
                        {bucket.date.toLocaleDateString('nl-NL', { month: 'short' })}
                      </span>
                    )}
                  </div>
                  {hasItems && (
                    <div className="mt-1 flex flex-col gap-0.5">
                      {bucket.expenses.slice(0, 2).map((e, i) => (
                        <div
                          key={`exp-${i}`}
                          className="text-[8px] sm:text-[9px] text-negative font-mono tabular-nums truncate"
                          title={`${e.name}: ${formatCurrency(Math.abs(e.amount))}`}
                        >
                          −{formatCurrency(Math.abs(e.amount)).replace(/\s/g, '')}
                        </div>
                      ))}
                      {bucket.incomes.slice(0, 2).map((i, idx) => (
                        <div
                          key={`inc-${idx}`}
                          className="text-[8px] sm:text-[9px] text-positive font-mono tabular-nums truncate"
                          title={`${i.name}: ${formatCurrency(i.amount)}`}
                        >
                          +{formatCurrency(i.amount).replace(/\s/g, '')}
                        </div>
                      ))}
                      {/* Nog te bevestigen: gestippelde rand + `~` én een
                          expliciete titel — de vorm alléén is geen boodschap. */}
                      {bucket.detections.slice(0, shownDetections).map((d, idx) => (
                        <div
                          key={`det-${idx}`}
                          className="border-l border-dashed border-[var(--ink-4)] pl-1 text-[8px] sm:text-[9px] text-[var(--ink-3)] font-mono tabular-nums truncate"
                          title={`${d.name}: ${formatCurrency(d.amount)} — gevonden, nog te bevestigen`}
                        >
                          ~{formatCurrency(d.amount).replace(/\s/g, '')}
                        </div>
                      ))}
                      {hiddenCount > 0 && (
                        <div className="text-[8px] text-[var(--ink-4)]">
                          +{hiddenCount} meer
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-[11px] italic text-[var(--ink-3)]">
        {detectionCount > 0
          ? 'Bevestigde vaste lasten staan vast; gevonden posten zijn een schatting op basis van je transactiegeschiedenis. Bevestig ze in de analyse hierboven en de schatting wordt een afspraak.'
          : 'Afschrijvingen uit je bevestigde vaste lasten. Voor het budget-overzicht zie de tab Budget, voor de categorieën de analyse hierboven.'}
      </p>
    </div>
  )
}
