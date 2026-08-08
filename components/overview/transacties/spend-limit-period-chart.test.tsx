import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { PrivacyProvider, PRIVACY_MASKED_STORAGE_KEY } from '@/lib/hooks/use-privacy'
import {
  calculateFreedomTime,
  formatCurrency,
  formatFreedomTimeString,
  MASKED_AMOUNT_PLACEHOLDER,
} from '@/lib/format'
import {
  buildSpendLimitReport,
  type SpendLimitAggregateRow,
  type SpendLimitReport,
} from '@/lib/spend-limits/engine'
import { SpendLimitPeriodChart } from './spend-limit-period-chart'

/**
 * SpendLimitPeriodChart — maskering, voorlopig-markering en NaN-vrijheid.
 *
 * ── WAAROM DEZE SUITE TEGEN DE ECHTE MOTOR DRAAIT ───────────────────────────
 * De invoer wordt NIET met de hand verzonnen: `buildSpendLimitReport` uit
 * lib/spend-limits/engine.ts rekent hem uit synthetische aggregaat-rijen door, en
 * de assertions pinnen de GERENDERDE tekst tegen exact die motoruitvoer. Zo vangt
 * de suite weergave-drift (verkeerd veld, verkeerde grondslag, stale mapping) —
 * niet alleen "er staat een getal".
 *
 * ── DE MASKERINGS-BIJT-PROEF (§4.4) ─────────────────────────────────────────
 * De eerste test faalt zodra de maskering in de chart wordt uitgezet: hij eist
 * dat er GEEN euroteken in de gerenderde output staat. Vervang in
 * spend-limit-period-chart.tsx `const { masked } = useMaskedAmounts()` tijdelijk
 * door `const masked = false` en deze test wordt rood — uitgevoerd en
 * teruggedraaid tijdens de bouw.
 */

const NOW = new Date(2026, 7, 15) // 15 augustus 2026 — augustus is de lopende maand
const LIMIT = 50

/** Netto uitgave `amount` in kalendermaand `month`, in de vorm van de RPC. */
function row(month: string, amount: number): SpendLimitAggregateRow {
  return { month, transactionType: null, sumPositief: 0, sumNegatief: -amount, count: 2 }
}

function buildReport(rows: SpendLimitAggregateRow[], windowPeriods = 13): SpendLimitReport {
  return buildSpendLimitReport({
    rule: { ruleType: 'counterparty', limitAmount: LIMIT, period: 'month' },
    rows,
    now: NOW,
    windowPeriods,
  })
}

/** Twaalf afgesloten maanden + de lopende, met twee overschrijdingen. */
const FULL_ROWS: SpendLimitAggregateRow[] = [
  row('2025-08', 40),
  row('2025-09', 45),
  row('2025-10', 70), // boven de grens
  row('2025-11', 30),
  row('2025-12', 35),
  row('2026-01', 20),
  row('2026-02', 25),
  row('2026-03', 90), // boven de grens
  row('2026-04', 30),
  row('2026-05', 28),
  row('2026-06', 26),
  row('2026-07', 24),
  row('2026-08', 12), // lopende maand
]

/** Alle SVG-`<text>`-inhouden, ONgenormaliseerd (nbsp uit formatCurrency blijft staan). */
function svgTextContents(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll('text')).map((t) => t.textContent)
}

const DAILY_RATE = 40

function renderChart(
  report: SpendLimitReport,
  masked: boolean,
  onSelectPeriod: (periodKey: string) => void = () => {},
) {
  if (masked) window.localStorage.setItem(PRIVACY_MASKED_STORAGE_KEY, 'true')
  const outcomes = [...report.closedPeriods, report.currentPeriod]
  return render(
    <PrivacyProvider>
      <SpendLimitPeriodChart
        outcomes={outcomes}
        limitAmount={LIMIT}
        trend={report.trend}
        closedPeriodCount={report.streaks.closedPeriodCount}
        exceededPeriodCount={report.streaks.exceededPeriodCount}
        dailyExpenseRate={DAILY_RATE}
        onSelectPeriod={onSelectPeriod}
      />
    </PrivacyProvider>,
  )
}

describe('SpendLimitPeriodChart', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('maskering aan: geen enkel euro-bedrag, geen Y-ticks, grenslijn zonder bedrag', () => {
    const report = buildReport(FULL_ROWS)
    const { container } = renderChart(report, true)

    // BIJT-PROEF-ASSERTIE: één euroteken waar dan ook = maskering lekt.
    expect(container.textContent).not.toContain('€')
    // ... en dat geldt óók voor de aria-labels van de trefvlakken.
    for (const el of Array.from(container.querySelectorAll('[aria-label]'))) {
      expect(el.getAttribute('aria-label')).not.toContain('€')
    }

    // Bedragen staan er wél, als placeholder.
    expect(container.textContent).toContain(MASKED_AMOUNT_PLACEHOLDER)
    // De grenslijn houdt haar naam, verliest haar bedrag. (`getByText` zou hier
    // ook de legenda vinden; we kijken dus naar het SVG-label zelf.)
    expect(svgTextContents(container)).toContain('je grens')
    // Verhoudingen en tellingen blijven zichtbaar (laag 3).
    expect(
      screen.getByText(
        `${report.streaks.exceededPeriodCount} van de ${report.streaks.closedPeriodCount} afgesloten periodes boven je grens`,
      ),
    ).toBeInTheDocument()
    expect(container.textContent).not.toContain('NaN')
  })

  it('maskering aan: ook de tooltip toont status en aantal, maar geen bedrag', () => {
    const report = buildReport(FULL_ROWS)
    const { container } = renderChart(report, true)

    const current = report.currentPeriod
    const hit = screen.getByRole('button', { name: new RegExp(current.label, 'i') })
    fireEvent.focus(hit)

    expect(screen.getByText(/transactie/)).toBeInTheDocument()
    expect(container.textContent).not.toContain('€')
  })

  it('maskering uit: Y-ticks en het grensbedrag zijn zichtbaar, en de staaflabels komen uit de motor', () => {
    const report = buildReport(FULL_ROWS)
    const { container } = renderChart(report, false)

    expect(container.textContent).toContain('€')
    // Rauwe textContent-vergelijking: `getByText` normaliseert de non-breaking
    // space uit `formatCurrency` weg en zou hier nooit matchen.
    expect(svgTextContents(container)).toContain(`je grens · ${formatCurrency(LIMIT)}`)

    // Pin de gerenderde staaflabels op EXACT de motoruitvoer — geen eigen som.
    expect(svgTextContents(container)).toContain(
      formatCurrency(report.currentPeriod.periodMatchedAmount),
    )
    expect(report.currentPeriod.periodMatchedAmount).toBe(12)
  })

  it('markeert de lopende periode als voorlopig', () => {
    const report = buildReport(FULL_ROWS)
    renderChart(report, false)
    expect(screen.getByText('voorlopig')).toBeInTheDocument()
    expect(report.currentPeriod.isOpen).toBe(true)
    // De lopende periode telt niet mee voor de reeks-context.
    expect(report.streaks.closedPeriodCount).toBe(report.closedPeriods.length)
  })

  it('minder dan drie afgesloten periodes: geen NaN, geen gemiddelde-lijn', () => {
    // Venster van 3 ⇒ 2 afgesloten periodes ⇒ trend zonder gemiddelde.
    const report = buildReport([row('2026-06', 20), row('2026-07', 30), row('2026-08', 10)], 3)
    expect(report.trend.recentAvgMatchedAmount).toBeNull()

    const { container } = renderChart(report, false)
    expect(container.textContent).not.toContain('NaN')
    // Geen voortschrijdend-gemiddelde-pad zolang er geen gemiddelde bestaat.
    expect(container.querySelectorAll('path').length).toBe(0)
  })

  /**
   * AC-B1-16 — de tooltip mag niet hover-only zijn.
   *
   * Elk trefvlak is een echt bedienbaar element: `tabIndex={0}` zet het in de
   * tab-volgorde, `onFocus`/`onBlur` openen en sluiten dezelfde tooltip als de
   * muis, en `onKeyDown` maakt Enter/Spatie gelijkwaardig aan een klik. Zonder
   * deze drie is de inhoud van de tooltip — bedrag, status, percentage,
   * vrijheidstijd — voor een toetsenbord- of schermlezergebruiker onbereikbaar.
   */
  it('elk datapoint is toetsenbord-bereikbaar: focus opent de tooltip, Enter/Spatie selecteert (AC-B1-16)', () => {
    const report = buildReport(FULL_ROWS)
    const gekozen: string[] = []
    const { container } = renderChart(report, false, (k) => gekozen.push(k))

    const outcomes = [...report.closedPeriods, report.currentPeriod]
    const hits = Array.from(container.querySelectorAll('rect[role="button"]'))
    expect(hits).toHaveLength(outcomes.length)
    for (const hit of hits) expect(hit.getAttribute('tabindex')).toBe('0')

    const maart = outcomes.find((o) => o.periodKey === '2026-03')
    if (!maart) throw new Error('maart 2026 hoort in het venster te zitten')
    const hit = screen.getByRole('button', { name: new RegExp(`^${maart.label}:`, 'i') })

    // Geen muis in het spel: focus alleen opent de tooltip al.
    fireEvent.focus(hit)
    expect(screen.getByText(maart.label)).toBeInTheDocument()
    const verwachteTijd = formatFreedomTimeString(
      calculateFreedomTime(maart.periodMatchedAmount, DAILY_RATE),
      'long',
    )
    expect(screen.getByText(`≈ ${verwachteTijd} vrijheid`)).toBeInTheDocument()

    fireEvent.blur(hit)
    expect(screen.queryByText(`≈ ${verwachteTijd} vrijheid`)).toBeNull()

    // Enter en Spatie doen wat een klik doet — en niets anders.
    fireEvent.keyDown(hit, { key: 'Enter' })
    fireEvent.keyDown(hit, { key: ' ' })
    expect(gekozen).toEqual([maart.periodKey, maart.periodKey])

    // Een willekeurige andere toets selecteert niet.
    fireEvent.keyDown(hit, { key: 'a' })
    expect(gekozen).toHaveLength(2)
  })
})
