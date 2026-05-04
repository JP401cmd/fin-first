'use client'

/**
 * Gedeelde aflossings-engine UI — wordt door zowel de Aflosstrategie-app
 * (fase 4) als de Hypotheekplanner-app (fase 5) gebruikt. Bevat de hele
 * strategie-vergelijking: avalanche/snowball-toggle, extra-aflos-slider,
 * projectie-chart, vergelijkings-message en lening-tabel.
 *
 * Bewuste keuze: deze component is presentatie-only. Hij raakt geen API
 * aan, doet geen fetches en kent geen toggle-flow — die leeft in de
 * detail-sheet van een schuld. De caller bepaalt zelf welke debts hij
 * doorgeeft (alle getrackte schulden, of alleen één hypotheek + getrackte
 * andere schulden) via `debts` + optionele `focusDebtId`.
 *
 * Hergebruikt:
 *  - `simulatePayoff()` + `payoffSummary()` uit `lib/debt-data.ts` voor de
 *    maand-op-maand projectie en totalen.
 *  - `<DebtPayoffTrajectoryChart>` + `<StrategyComparisonMessage>` uit
 *    `components/app/core/debts/debt-comparison-chart.tsx` — bestaande
 *    componenten worden niet gerefactored, alleen geconsumeerd.
 *
 * ── Krant-discipline ──
 * Geen `rounded-*` (behalve `rounded-full` voor de slider-thumb), DM Mono +
 * `tabular-nums` voor alle bedragen, kickers `text-[10px] uppercase
 * tracking-[0.08em]`, kern-bruin als module-kleur voor actieve elementen,
 * `var(--negative)` alleen voor schuld-saldi. Tabel volgt het bestaande
 * pattern uit `components/app/doorrekening/savings-tables.tsx`: alleen
 * horizontale `border-b border-[var(--border-ed)]`, hover-rij
 * `hover:bg-[var(--subtle)]`.
 */

import { memo, useMemo, useState } from 'react'
import type { Debt } from '@/lib/debt-data'
import { simulatePayoff, payoffSummary, type PayoffStrategy } from '@/lib/debt-data'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { MaskedAmount } from '@/components/app/masked-amount'
import {
  DebtPayoffTrajectoryChart,
  StrategyComparisonMessage,
} from '@/components/app/core/debts/debt-comparison-chart'

// ── Types ────────────────────────────────────────────────────

export interface DebtPayoffStrategyProps {
  /**
   * Schulden die de engine moet meenemen. Caller bepaalt de filter:
   * Aflosstrategie-app levert alle actieve schulden waar
   * `has_strategy_tracking === true`, Hypotheekplanner levert óf alleen
   * deze hypotheek óf de hypotheek + andere getrackte schulden.
   */
  debts: Debt[]
  /**
   * Optioneel — wanneer geleverd focust de UI op één specifieke debt
   * (bijv. de mortgage in Hypotheekplanner). Andere debts verschijnen dan
   * onder een "Andere getrackte schulden"-sectie in de tabel.
   */
  focusDebtId?: string
  /** Default extra payment (€/maand). Default 0. */
  initialExtraPayment?: number
  /** Default strategy. Default `avalanche` — bespaart meestal het meest. */
  initialStrategy?: 'avalanche' | 'snowball'
  /**
   * Optioneel — kicker-tekst boven de header. Aflosstrategie-app gebruikt
   * "AFLOSSTRATEGIE", Hypotheekplanner gebruikt "AFLOSPLAN".
   */
  kicker?: string
}

// ── Constants ────────────────────────────────────────────────

/**
 * Drempelwaarden voor de extra-aflos-slider. We laten standaard tot €1500
 * toe (zie spec-fragment "€0 t/m €1000 (of meer)") — €1500 dekt de meeste
 * household-cashflow zonder dat de slider onleesbaar wordt. De caller kan
 * deze niet overschrijven; bewust beperkt om het pattern uniform te houden
 * tussen beide call-sites.
 */
const SLIDER_MIN = 0
const SLIDER_MAX = 1500
const SLIDER_STEP = 25

/** Sortering voor de lening-tabel. Default `interest` zodat de duurste
 *  schuld bovenaan staat — sluit aan bij de avalanche-default. */
type SortKey = 'interest' | 'balance' | 'payoff'
type SortDir = 'asc' | 'desc'

// ── Helpers ──────────────────────────────────────────────────

/**
 * Format een payoff-datum (ISO-string) naar krant-stijl: `MMM yyyy`.
 * Bewust geen relatief ("over 3 jaar") — dat doorbreekt de krant-toon
 * volgens de UI/UX-skill.
 */
function formatPayoffDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
}

/**
 * Format een tijdsverschil in jaren+maanden. Bv. 18 → "1j 6m", 7 → "7m",
 * 24 → "2j". Sluit aan bij de x-as labels van de bestaande chart.
 */
function formatMonthSpan(months: number): string {
  if (months <= 0) return '—'
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `${m}m`
  if (m === 0) return `${y}j`
  return `${y}j ${m}m`
}

/**
 * Bereken per-debt projectie op basis van een simulatie. We mappen de
 * laatst-niet-nul maand per debt naar een `payoffDate`. Dit is wat de
 * tabel toont — exclusief verleden, exclusief aflossingsvrij (die hebben
 * geen payoff binnen de simulatie en krijgen `null`).
 */
function buildPerDebtPayoffMap(
  months: ReturnType<typeof simulatePayoff>,
  debts: Debt[],
): Map<string, { payoffDate: string | null; remainingMonths: number }> {
  const map = new Map<string, { payoffDate: string | null; remainingMonths: number }>()

  for (const debt of debts) {
    const isInterestOnly = debt.repayment_type === 'aflossingsvrij'
    if (isInterestOnly) {
      // Aflossingsvrij wordt nooit afbetaald in de simulatie — toon dat.
      map.set(debt.id, { payoffDate: null, remainingMonths: 0 })
      continue
    }
    // Loop vooruit en pak de eerste maand waarin balance ≤ 0.01 — dat is
    // de payoff-maand. Werkt ook bij multi-debt: snowball/avalanche
    // hebben per debt een eigen payoff-moment binnen de gedeelde
    // simulatie.
    let payoffMonth: typeof months[number] | null = null
    for (const m of months) {
      const entry = m.debts.find((d) => d.id === debt.id)
      if (entry && entry.balance <= 0.01) {
        payoffMonth = m
        break
      }
    }
    map.set(debt.id, {
      payoffDate: payoffMonth?.date ?? null,
      remainingMonths: payoffMonth?.month ?? months.length,
    })
  }

  return map
}

// ── Subcomponenten ───────────────────────────────────────────

/**
 * Strategy-toggle als segmented control. Twee opties (avalanche, snowball)
 * met scherpe hoeken, kern-bruin voor de actieve knop. Geen radio-buttons
 * met vinkjes — de visuele "ingedrukt" state is genoeg.
 */
function StrategyToggle({
  value,
  onChange,
}: {
  value: PayoffStrategy
  onChange: (v: PayoffStrategy) => void
}) {
  const options: { id: PayoffStrategy; label: string; sub: string }[] = [
    {
      id: 'avalanche',
      label: 'Avalanche',
      sub: 'Hoogste rente eerst — bespaart meeste rente',
    },
    {
      id: 'snowball',
      label: 'Sneeuwbal',
      sub: 'Kleinste eerst — geeft motivatie door snelle wins',
    },
  ]

  return (
    <div role="radiogroup" aria-label="Aflossingsstrategie" className="grid grid-cols-2 gap-px bg-[var(--border-ed)]">
      {options.map((opt) => {
        const active = value === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.id)}
            className={[
              'min-h-[44px] px-3 py-2.5 text-left transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-kern-500',
              active
                ? 'bg-kern-50/60 text-kern-700'
                : 'bg-[var(--paper)] text-[var(--ink-2)] hover:bg-[var(--subtle)]',
            ].join(' ')}
          >
            <span className="block text-sm font-semibold">{opt.label}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-[var(--ink-3)]">
              {opt.sub}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Extra-aflos-slider met live re-calc label. €0–€1500, step €25. Gebruikt
 * de bestaande `.slider-touch` classes met een kern-accent override via
 * inline style — zo hoeven we geen nieuwe globale CSS-klasse toe te
 * voegen voor één call-site. (Tailwind's `accent-*` werkt niet op
 * webkit-thumb in alle browsers, vandaar de bestaande slider-touch utils
 * met inline kleur-override.)
 */
function ExtraPaymentSlider({
  value,
  onChange,
  betterMonthsLabel,
  betterInterestLabel,
}: {
  value: number
  onChange: (v: number) => void
  /** Bv. "schuldvrij in mei 2031 (1j 6m eerder)" — null bij €0 extra. */
  betterMonthsLabel: string | null
  /** Bv. "€1.240 minder rente totaal" — null bij €0 extra. */
  betterInterestLabel: string | null
}) {
  return (
    <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Extra aflossen
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--ink-3)]">
            Bovenop de minimum-betaling. Verdeling volgt je gekozen strategie.
          </p>
        </div>
        <p className="text-kern-700">
          <MaskedAmount value={value} tone="kern" className="text-base font-semibold" />
          <span className="ml-1 text-[11px] font-normal text-[var(--ink-3)]">/mnd</span>
        </p>
      </div>

      <input
        type="range"
        min={SLIDER_MIN}
        max={SLIDER_MAX}
        step={SLIDER_STEP}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Extra maandelijkse aflossing"
        // Gebruik de bestaande .slider-touch utility en overschrijf de
        // wil-paarse accent met kern-bruin via een CSS variable. De
        // `accentColor` property dekt zowel webkit als firefox in
        // moderne browsers en valt netjes terug op de globale CSS bij
        // oudere user-agents.
        className="slider-touch mt-3 w-full"
        style={{ accentColor: 'var(--color-kern-600)' }}
      />

      <div className="mt-1 flex justify-between text-[10px] text-[var(--ink-4)]">
        <span>€ 0</span>
        <span>€ {SLIDER_MAX.toLocaleString('nl-NL')}</span>
      </div>

      {/* Live impact-label — alleen bij value > 0. Bij €0 toont de chart
          gewoon het basis-schema en is er niets te vergelijken. */}
      {value > 0 && (betterMonthsLabel || betterInterestLabel) && (
        <p className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-3 text-[12px] leading-relaxed text-[var(--ink-2)]">
          {betterMonthsLabel && (
            <span className="block">
              Bij <MaskedAmount value={value} tone="kern" /> extra:{' '}
              <span className="text-[var(--ink)]">{betterMonthsLabel}</span>
            </span>
          )}
          {betterInterestLabel && (
            <span className="mt-0.5 block text-[var(--ink-3)]">
              <span className="font-mono tabular-nums text-[var(--ink-2)]">
                {betterInterestLabel}
              </span>{' '}
              minder rente totaal
            </span>
          )}
        </p>
      )}
    </div>
  )
}

/**
 * Lening-tabel met sorteer-kolommen. Geen externe table-library — de
 * sortering is local state, de rijen blijven plain `<tr>` in de
 * krant-stijl: alleen horizontale borders, rechts-uitgelijnde numerieke
 * kolommen, `hover:bg-[var(--subtle)]` voor scanbaar browsen.
 *
 * In `focusDebtId`-modus krijgt de focus-debt een eigen "Hoofd-lening"
 * sectie en verschijnen de rest onder "Andere getrackte schulden".
 * Sorteer-state werkt op de niet-focus rest; de focus-debt blijft altijd
 * bovenaan (het is per definitie het onderwerp van de pagina).
 */
function DebtTable({
  debts,
  focusDebtId,
  perDebtPayoff,
}: {
  debts: Debt[]
  focusDebtId?: string
  perDebtPayoff: Map<string, { payoffDate: string | null; remainingMonths: number }>
}) {
  const [sortKey, setSortKey] = useState<SortKey>('interest')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      // Default richtingen die aansluiten bij intuïtie: rente desc (duurste
      // bovenaan), saldo desc (grootste eerst), payoff asc (eerstvolgende
      // payoff bovenaan).
      setSortDir(key === 'payoff' ? 'asc' : 'desc')
    }
  }

  const focusDebt = focusDebtId ? debts.find((d) => d.id === focusDebtId) : undefined
  const others = focusDebt ? debts.filter((d) => d.id !== focusDebt.id) : debts

  const sorted = useMemo(() => {
    const list = [...others]
    list.sort((a, b) => {
      let av = 0
      let bv = 0
      if (sortKey === 'interest') {
        av = Number(a.interest_rate)
        bv = Number(b.interest_rate)
      } else if (sortKey === 'balance') {
        av = Number(a.current_balance)
        bv = Number(b.current_balance)
      } else {
        // payoff: ISO-strings sorteren als datum; nulls (aflossingsvrij)
        // achteraan ongeacht richting.
        const aDate = perDebtPayoff.get(a.id)?.payoffDate ?? ''
        const bDate = perDebtPayoff.get(b.id)?.payoffDate ?? ''
        if (!aDate && !bDate) return 0
        if (!aDate) return 1
        if (!bDate) return -1
        av = new Date(aDate).getTime()
        bv = new Date(bDate).getTime()
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return list
  }, [others, sortKey, sortDir, perDebtPayoff])

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <div className="border border-[var(--border-ed)] bg-[var(--paper)]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]/50">
            <th
              scope="col"
              className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]"
            >
              Lening
            </th>
            <th scope="col" className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">
              <button
                type="button"
                onClick={() => toggleSort('interest')}
                className="hover:text-kern-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kern-500"
                aria-label={`Sorteren op rente${sortIndicator('interest')}`}
              >
                Rente{sortIndicator('interest')}
              </button>
            </th>
            <th scope="col" className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">
              <button
                type="button"
                onClick={() => toggleSort('balance')}
                className="hover:text-kern-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kern-500"
                aria-label={`Sorteren op saldo${sortIndicator('balance')}`}
              >
                Saldo{sortIndicator('balance')}
              </button>
            </th>
            <th scope="col" className="hidden px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)] sm:table-cell">
              Maandlast
            </th>
            <th scope="col" className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">
              <button
                type="button"
                onClick={() => toggleSort('payoff')}
                className="hover:text-kern-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kern-500"
                aria-label={`Sorteren op schuldvrij-datum${sortIndicator('payoff')}`}
              >
                Schuldvrij{sortIndicator('payoff')}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Focus-debt prominent bovenaan, met een sub-kicker. Bewust
              geen visueel zware highlight — een dunne kern-bruine
              left-border + kicker volstaat. */}
          {focusDebt && (
            <>
              <tr>
                <td colSpan={5} className="border-t border-[var(--border-ed)] bg-kern-50/30 px-3 py-1.5 text-[10px] uppercase tracking-[0.08em] text-kern-700">
                  Hoofdlening
                </td>
              </tr>
              <DebtTableRow
                debt={focusDebt}
                payoff={perDebtPayoff.get(focusDebt.id)}
                isFocus
              />
            </>
          )}

          {/* Andere debts. Bij focus-modus krijgen ze een eigen header. */}
          {focusDebt && sorted.length > 0 && (
            <tr>
              <td colSpan={5} className="border-t border-[var(--border-ed)] bg-[var(--subtle)]/40 px-3 py-1.5 text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Andere getrackte schulden
              </td>
            </tr>
          )}
          {sorted.map((d) => (
            <DebtTableRow key={d.id} debt={d} payoff={perDebtPayoff.get(d.id)} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Eén tabel-rij voor een schuld. Numerieke kolommen rechts, font-mono +
 * tabular-nums. Maandlast verbergen we op mobiel (`sm:table-cell`) — op
 * smalle schermen is rente + saldo + payoff genoeg, de maandlast staat
 * elders in de detail-sheet.
 */
function DebtTableRow({
  debt,
  payoff,
  isFocus,
}: {
  debt: Debt
  payoff: { payoffDate: string | null; remainingMonths: number } | undefined
  isFocus?: boolean
}) {
  const balance = Number(debt.current_balance)
  const rate = Number(debt.interest_rate)
  const monthly = Number(debt.monthly_payment)
  const isInterestOnly = debt.repayment_type === 'aflossingsvrij'

  return (
    <tr
      className={[
        'border-t border-[var(--border-ed)] hover:bg-[var(--subtle)]',
        isFocus ? 'border-l-2 border-l-kern-500' : '',
      ].join(' ')}
    >
      <td className="px-3 py-2.5">
        <p className="text-sm font-medium text-[var(--ink)]">{debt.name}</p>
        {debt.creditor && (
          <p className="text-[11px] text-[var(--ink-3)]">{debt.creditor}</p>
        )}
      </td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-sm text-[var(--ink-2)]">
        {rate.toFixed(rate < 1 ? 2 : 1)}%
      </td>
      <td className="px-3 py-2.5 text-right text-negative">
        <MaskedAmount value={balance} tone="kern" className="text-sm font-semibold" />
      </td>
      <td className="hidden px-3 py-2.5 text-right text-[var(--ink-2)] sm:table-cell">
        <MaskedAmount value={monthly} tone="kern" className="text-sm" />
      </td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-xs text-[var(--ink-2)]">
        {isInterestOnly ? (
          <span className="italic text-[var(--ink-4)]">aflossingsvrij</span>
        ) : payoff?.payoffDate ? (
          <>
            <span className="block text-[var(--ink)]">
              {formatPayoffDate(payoff.payoffDate)}
            </span>
            <span className="block text-[10px] text-[var(--ink-4)]">
              {formatMonthSpan(payoff.remainingMonths)}
            </span>
          </>
        ) : (
          <span className="italic text-[var(--ink-4)]">—</span>
        )}
      </td>
    </tr>
  )
}

/**
 * Empty state voor wanneer er geen actieve schulden zijn (of geen schulden
 * met balance > 0). Volgt de empty-state-gids: kicker + serif italic
 * uitleg, geen primaire CTA — de toggle-flow leeft per spec in de
 * detail-sheet.
 */
function DebtPayoffEmpty() {
  return (
    <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-8 text-center">
      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        Geen actieve schulden
      </p>
      <p className="mt-2 font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
        Activeer aflossingstracking op een lening om hier je schuldvrije
        route te zien.
      </p>
    </div>
  )
}

// ── Hoofd-component ──────────────────────────────────────────

/**
 * `DebtPayoffStrategy` is gemarkeerd als `memo` — de simulatie-berekening
 * is gevoelig voor onnodige re-renders bij parent-state-veranderingen die
 * niets met deze sub-tree te maken hebben (bv. focus-state op een
 * sibling). Een memoized oppervlak schermt dat af. De props zijn
 * primitieven + één `Debt[]`-array; bij stabiele referentie blijft de
 * memo geldig.
 */
export const DebtPayoffStrategy = memo(function DebtPayoffStrategy({
  debts,
  focusDebtId,
  initialExtraPayment = 0,
  initialStrategy = 'avalanche',
  kicker = 'Aflosstrategie',
}: DebtPayoffStrategyProps) {
  const [strategy, setStrategy] = useState<PayoffStrategy>(initialStrategy)
  const [extraPayment, setExtraPayment] = useState<number>(initialExtraPayment)
  const { masked } = useMaskedAmounts()

  // Filter de "echt actieve" debts éénmaal per props-wijziging — wordt
  // hergebruikt door header (totaal/aantal), simulatie en tabel.
  const activeDebts = useMemo(
    () => debts.filter((d) => d.is_active && Number(d.current_balance) > 0),
    [debts],
  )

  const totalBalance = useMemo(
    () => activeDebts.reduce((s, d) => s + Number(d.current_balance), 0),
    [activeDebts],
  )

  // ── Simulaties ────────────────────────────────────────────
  // We runnen drie simulaties: de geselecteerde strategie + extra
  // (current view), en beide strategieën met €0 extra (voor de bestaande
  // <DebtPayoffTrajectoryChart> en <StrategyComparisonMessage>). Bij
  // `extraPayment > 0` runnen we ook de baseline-versie van de gekozen
  // strategie zodat het impact-label kan vergelijken.

  const snowballBaseline = useMemo(
    () => simulatePayoff(activeDebts, 'snowball', 0),
    [activeDebts],
  )
  const avalancheBaseline = useMemo(
    () => simulatePayoff(activeDebts, 'avalanche', 0),
    [activeDebts],
  )
  const selectedWithExtra = useMemo(
    () => simulatePayoff(activeDebts, strategy, extraPayment),
    [activeDebts, strategy, extraPayment],
  )

  const snowballSummary = useMemo(() => payoffSummary(snowballBaseline), [snowballBaseline])
  const avalancheSummary = useMemo(() => payoffSummary(avalancheBaseline), [avalancheBaseline])
  const selectedSummary = useMemo(() => payoffSummary(selectedWithExtra), [selectedWithExtra])

  // ── Per-debt payoff map voor de tabel ──────────────────────
  const perDebtPayoff = useMemo(
    () => buildPerDebtPayoffMap(selectedWithExtra, activeDebts),
    [selectedWithExtra, activeDebts],
  )

  // ── Impact-label voor de slider ───────────────────────────
  // Vergelijk de geselecteerde strategie met-extra tegen dezelfde
  // strategie zonder extra. Toont alleen wanneer extra > 0.
  const baselineForStrategy = strategy === 'avalanche' ? avalancheBaseline : snowballBaseline
  const baselineSummary = strategy === 'avalanche' ? avalancheSummary : snowballSummary

  const monthsSaved = Math.max(0, baselineSummary.totalMonths - selectedSummary.totalMonths)
  const interestSaved = Math.max(0, baselineSummary.totalInterest - selectedSummary.totalInterest)

  const betterMonthsLabel: string | null =
    extraPayment > 0 && selectedSummary.payoffDate
      ? `schuldvrij in ${formatPayoffDate(selectedSummary.payoffDate)}${
          monthsSaved > 0 ? ` (${formatMonthSpan(monthsSaved)} eerder)` : ''
        }`
      : null

  const betterInterestLabel: string | null =
    extraPayment > 0 && interestSaved > 0
      ? formatMaskedCurrency(interestSaved, masked)
      : null

  // Suppress unused-variable warning: `baselineForStrategy` kan in
  // toekomstige uitbreidingen handig zijn (bv. losse lijn op de chart).
  // Voorlopig onderdrukken we via void-assignment; ESLint pakt dat op.
  void baselineForStrategy

  // ── Empty state ───────────────────────────────────────────
  if (activeDebts.length === 0) {
    return (
      <section data-testid="debt-payoff-strategy" className="space-y-4">
        <header>
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            {kicker}
          </p>
        </header>
        <DebtPayoffEmpty />
      </section>
    )
  }

  // ── Hoofd-render ──────────────────────────────────────────
  return (
    <section data-testid="debt-payoff-strategy" className="space-y-4">
      {/* ── Header — kicker + KPI-strip ────────────────────── */}
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            {kicker}
          </p>
          <p className="mt-1 text-sm text-[var(--ink-2)]">
            <span className="font-mono tabular-nums">
              {activeDebts.length} {activeDebts.length === 1 ? 'lening' : 'leningen'} open
            </span>{' '}
            ·{' '}
            <span className="text-negative">
              <MaskedAmount value={totalBalance} tone="kern" />
            </span>{' '}
            totaal
          </p>
        </div>
      </header>

      {/* ── Strategie-toggle ───────────────────────────────── */}
      <StrategyToggle value={strategy} onChange={setStrategy} />

      {/* ── Extra-aflos-slider ─────────────────────────────── */}
      <ExtraPaymentSlider
        value={extraPayment}
        onChange={setExtraPayment}
        betterMonthsLabel={betterMonthsLabel}
        betterInterestLabel={betterInterestLabel}
      />

      {/* ── Trajectvergelijkings-chart ─────────────────────── */}
      {/* De bestaande <DebtPayoffTrajectoryChart> verwacht beide
          strategieën als baseline. Hij is bewust niet gevoelig voor
          extra-aflos — hij toont de strategiekeuze, niet de slider-
          impact. De slider-impact zit in het label boven (live cijfers)
          + de <StrategyComparisonMessage> hieronder. Dit voorkomt dat
          de hoofd-chart bij elke slider-tick herrendert. */}
      <DebtPayoffTrajectoryChart
        snowballMonths={snowballBaseline}
        avalancheMonths={avalancheBaseline}
        snowballSummary={snowballSummary}
        avalancheSummary={avalancheSummary}
      />

      {/* ── Strategie-vergelijking ─────────────────────────── */}
      {/* dailyExpenses=0 → freedom-time hint blijft achterwege; dat is
          context die per pagina anders ligt en hier niet thuis hoort. */}
      <StrategyComparisonMessage
        snowballSummary={snowballSummary}
        avalancheSummary={avalancheSummary}
        dailyExpenses={0}
      />

      {/* ── Lening-tabel ───────────────────────────────────── */}
      <DebtTable
        debts={activeDebts}
        focusDebtId={focusDebtId}
        perDebtPayoff={perDebtPayoff}
      />
    </section>
  )
})
