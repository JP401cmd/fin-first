'use client'

/**
 * Gedeelde aflossings-engine UI — wordt zowel door de globale "Schuldenprofiel
 * & Aflosroute"-kaart op `/core/debts` als door de Hypotheekplanner-app
 * gebruikt. Bevat de hele strategie-vergelijking: 4-strategie segmented
 * control, extra-aflos-slider, projectie-chart, vergelijkings-message en
 * lening-tabel.
 *
 * Bewuste keuze: deze component is presentatie-only. Hij raakt geen API
 * aan, doet geen fetches en kent geen toggle-flow — die leeft in de
 * detail-sheet van een schuld. De caller bepaalt zelf welke debts hij
 * doorgeeft (alle actieve schulden, of alleen één hypotheek + andere
 * schulden) via `debts` + optionele `focusDebtId`.
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

import { memo, useCallback, useDeferredValue, useMemo, useState } from 'react'
import type { Debt } from '@/lib/debt-data'
import { simulatePayoff, payoffSummary, type PayoffStrategy } from '@/lib/debt-data'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { MaskedAmount } from '@/components/app/masked-amount'
import {
  DebtPayoffTrajectoryChart,
  StrategyComparisonMessage,
} from '@/components/app/core/debts/debt-comparison-chart'
import { ChartTips } from '@/components/editorial/chart-tips'
import { getDebtPayoffStrategyTips } from '@/lib/chart-tips'

// ── Types ────────────────────────────────────────────────────

export interface DebtPayoffStrategyProps {
  /**
   * Schulden die de engine moet meenemen. Caller bepaalt de filter: de
   * globale "Schuldenprofiel & Aflosroute"-kaart op `/core/debts` levert
   * alle actieve schulden, Hypotheekplanner levert de hypotheek + andere
   * actieve schulden voor context.
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
  /**
   * Initiele strategie-keuze. Volgt de uitgebreide `PayoffStrategy`-set:
   * snowball, avalanche, highest_balance of custom. Default `avalanche` —
   * bespaart meestal het meest aan rente.
   */
  initialStrategy?: PayoffStrategy
  /**
   * Optioneel — kicker-tekst boven de header. Globale kaart gebruikt
   * "Aflosroute", Hypotheekplanner gebruikt "Aflosplan".
   */
  kicker?: string
  /**
   * Optionele callback die wordt aangeroepen wanneer de gebruiker van
   * strategie wisselt. Gebruikt door `/core/debts` om de keuze als
   * `?strategie=...` query-param te persisteren (deeplink-vriendelijk).
   * Hypotheekplanner laat dit weg — de strategie blijft local state daar.
   */
  onStrategyChange?: (strategy: PayoffStrategy) => void
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
 * Strategy-toggle als 4-optie segmented control. Volgt het krant-pattern:
 * scherpe hoeken, kern-bruin voor de actieve knop, géén radio-vinkjes — de
 * visuele "ingedrukt" state is genoeg. Op smal scherm (< sm) klappen de
 * vier knoppen naar een 2×2 grid om de subkop leesbaar te houden; op
 * desktop staan ze op één rij.
 *
 * `current` zit bewust niet in de UI: dat is een interne strategie die
 * `simulatePayoff()` gebruikt voor "huidig schema". Eindgebruikers kiezen
 * altijd één van de vier targeting-strategieën.
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
      id: 'snowball',
      label: 'Sneeuwbal',
      sub: 'Kleinste eerst — snelle wins',
    },
    {
      id: 'avalanche',
      label: 'Avalanche',
      sub: 'Hoogste rente — bespaart meest',
    },
    {
      id: 'highest_balance',
      label: 'Grootste eerst',
      sub: 'Hoogste saldo — band-aid eraf',
    },
    {
      id: 'custom',
      label: 'Eigen volgorde',
      sub: 'Volgt jouw schuld-volgorde',
    },
  ]

  return (
    <div
      role="radiogroup"
      aria-label="Aflossingsstrategie"
      className="grid grid-cols-2 gap-px bg-[var(--border-ed)] sm:grid-cols-4"
    >
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
 * uitleg, geen primaire CTA — schuld toevoegen leeft op de hoofdpagina.
 */
function DebtPayoffEmpty() {
  return (
    <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-8 text-center">
      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        Geen actieve schulden
      </p>
      <p className="mt-2 font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
        Voeg een schuld toe om hier je schuldvrije route te zien.
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
  onStrategyChange,
}: DebtPayoffStrategyProps) {
  // ── Controlled vs uncontrolled strategy ──
  // Wanneer de parent `onStrategyChange` levert, gedraagt de component zich
  // controlled: `initialStrategy` is de single source of truth en lokale
  // state is overbodig (de parent bepaalt wanneer en wat er verandert via
  // bv. URL-sync op `/core/debts`). Anders (zoals in Hypotheekplanner) blijft
  // de keuze lokaal — daar leeft de strategie volledig binnen de tab.
  //
  // Deze splitsing voorkomt het anti-pattern "setState binnen useEffect bij
  // prop-wijziging" dat React Compiler/strict-mode oppakt als cascading
  // render. De controlled-pad doet 0 setState; de uncontrolled-pad doet
  // alleen setState bij user-interactie.
  const isControlled = onStrategyChange != null
  const [localStrategy, setLocalStrategy] = useState<PayoffStrategy>(initialStrategy)
  const strategy = isControlled ? initialStrategy : localStrategy
  const [extraPayment, setExtraPayment] = useState<number>(initialExtraPayment)
  // Slider-defer (alléén scheduling; geen formule/parameter-wijziging). De zware sim (4×
  // simulatePayoff, tot 600 mnd elk) + chart + vergelijking keyen op de DEFERRED extra-
  // aflossing, zodat de slider-thumb en het live €-label (`extraPayment`) responsief blijven
  // terwijl chart/tabel/vergelijking de settelde waarde volgen. Elke sim-beschrijvende
  // consument (chart-subtitel, vergelijkings-tekst, impact-label-poorten) leest óók de
  // deferred waarde, zodat er geen "€X extra → €0-traject"-transient ontstaat. Op de initiële
  // render is de deferred waarde gelijk aan de huidige.
  const deferredExtraPayment = useDeferredValue(extraPayment)
  const { masked } = useMaskedAmounts()

  // Toggle-callback: in controlled-modus delegeren aan parent, in
  // uncontrolled-modus eigen state updaten. Visuele update is in beide
  // gevallen synchroon — controlled via re-render door parent, uncontrolled
  // via lokale setState.
  const handleStrategyChange = useCallback(
    (next: PayoffStrategy) => {
      if (isControlled) {
        onStrategyChange(next)
      } else {
        setLocalStrategy(next)
      }
    },
    [isControlled, onStrategyChange],
  )

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
  // We runnen alle vier targeting-strategieën met de huidige `extraPayment`
  // — die voeden de chart als `StrategyTrajectory[]`, waarbij de actieve
  // strategie dik gerenderd wordt en de andere drie als dunne contextlijnen.
  // Daarnaast runnen we per strategie de €0-baseline zodat de
  // <StrategyComparisonMessage> kan vergelijken (active+extra vs active+€0,
  // of bij €0 vs de andere baselines).
  //
  // Vier × twee = acht simulaties. `simulatePayoff` is goedkoop genoeg
  // (<5ms voor typische schuld-portfolios) en `useMemo` zorgt dat het alleen
  // herhaalt bij `activeDebts`/`extraPayment` wijzigingen.

  const PAYOFF_STRATEGIES: PayoffStrategy[] = useMemo(
    () => ['snowball', 'avalanche', 'highest_balance', 'custom'],
    [],
  )

  const strategyTrajectories = useMemo(
    () =>
      PAYOFF_STRATEGIES.map((id) => {
        const months = simulatePayoff(activeDebts, id, deferredExtraPayment)
        return {
          id,
          months,
          summary: payoffSummary(months),
        }
      }),
    [activeDebts, deferredExtraPayment, PAYOFF_STRATEGIES],
  )

  const baselineSummariesByStrategy = useMemo(() => {
    const map: Partial<Record<PayoffStrategy, ReturnType<typeof payoffSummary>>> = {}
    for (const id of PAYOFF_STRATEGIES) {
      const months = simulatePayoff(activeDebts, id, 0)
      map[id] = payoffSummary(months)
    }
    return map
  }, [activeDebts, PAYOFF_STRATEGIES])

  const selectedWithExtra = useMemo(
    () => strategyTrajectories.find((s) => s.id === strategy)?.months ?? [],
    [strategyTrajectories, strategy],
  )
  const selectedSummary = useMemo(
    () => strategyTrajectories.find((s) => s.id === strategy)?.summary ?? payoffSummary([]),
    [strategyTrajectories, strategy],
  )

  // ── Per-debt payoff map voor de tabel ──────────────────────
  const perDebtPayoff = useMemo(
    () => buildPerDebtPayoffMap(selectedWithExtra, activeDebts),
    [selectedWithExtra, activeDebts],
  )

  // ── Impact-label voor de slider ───────────────────────────
  // Vergelijk de actieve strategie met-extra tegen dezelfde strategie
  // zonder extra. Toont alleen wanneer extra > 0.
  const baselineSummary =
    baselineSummariesByStrategy[strategy] ?? payoffSummary([])

  const monthsSaved = Math.max(0, baselineSummary.totalMonths - selectedSummary.totalMonths)
  const interestSaved = Math.max(0, baselineSummary.totalInterest - selectedSummary.totalInterest)

  const betterMonthsLabel: string | null =
    deferredExtraPayment > 0 && selectedSummary.payoffDate
      ? `schuldvrij in ${formatPayoffDate(selectedSummary.payoffDate)}${
          monthsSaved > 0 ? ` (${formatMonthSpan(monthsSaved)} eerder)` : ''
        }`
      : null

  const betterInterestLabel: string | null =
    deferredExtraPayment > 0 && interestSaved > 0
      ? formatMaskedCurrency(interestSaved, masked)
      : null

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
      {/* ── Header — kicker + KPI-strip + ChartTips ────────── */}
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
        <ChartTips
          storageKey="debt_payoff_strategy"
          tips={getDebtPayoffStrategyTips({
            strategy,
            debtCount: activeDebts.length,
            hasFocusDebt: !!focusDebtId,
          })}
          align="right"
        />
      </header>

      {/* ── Strategie-toggle ───────────────────────────────── */}
      <StrategyToggle value={strategy} onChange={handleStrategyChange} />

      {/* ── Extra-aflos-slider ─────────────────────────────── */}
      <ExtraPaymentSlider
        value={extraPayment}
        onChange={setExtraPayment}
        betterMonthsLabel={betterMonthsLabel}
        betterInterestLabel={betterInterestLabel}
      />

      {/* ── Trajectvergelijkings-chart ─────────────────────── */}
      {/* Alle vier strategieën worden als lijn gerenderd, waarbij de
          actieve strategie dik wordt getekend met fill-area en payoff-
          marker, en de andere drie dun-en-doorzichtig als context. Bij
          slider-verandering re-runt de hele set zodat de chart de
          extra-aflos-impact 1:1 reflecteert. */}
      <DebtPayoffTrajectoryChart
        strategies={strategyTrajectories}
        activeStrategyId={strategy}
        extraPayment={deferredExtraPayment}
      />

      {/* ── Strategie-vergelijking ─────────────────────────── */}
      {/* dailyExpenses=0 → freedom-time hint blijft achterwege; dat is
          context die per pagina anders ligt en hier niet thuis hoort. */}
      <StrategyComparisonMessage
        baselineSummaries={baselineSummariesByStrategy}
        activeStrategyId={strategy}
        activeWithExtraSummary={selectedSummary}
        extraPayment={deferredExtraPayment}
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
