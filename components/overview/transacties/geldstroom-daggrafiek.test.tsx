/**
 * UR3-28 fase 2b — de daggrafiek op de transactiepagina.
 *
 * Runtime-assertie op de getóónde cijfers: de footer-KPI's worden gepind tegen
 * `summarizeFlow` over dezelfde input, en de staven tegen `summarizeFlow` per
 * dag. Zo is weergave-drift (verkeerd veld, verkeerde grondslag, transfers die
 * alsnog meetellen) zichtbaar in de suite in plaats van pas op het scherm.
 *
 * Verder vastgelegd:
 *  · de maandlimiet onder "Uitgaven" telt alleen BLADEREN (een parent met
 *    kinderen zou dubbeltellen);
 *  · de y-as-labels lopen door de privacy-maskering — op de cashflow-hub stond
 *    daar een kale `formatCurrency` die dwars door de privacy-modus heen las.
 *
 * ── DE FORECAST-TAK (UR3, dekkingskaart) ─────────────────────────────────────
 * De acht oorspronkelijke tests renderden állemaal met `priorTransactions={[]}`
 * en een `NOW` búiten de getoonde maand. Daardoor was `isCurrentMonth` altijd
 * `false` en sloeg de vroege `return` in `forecast` het complete forecastblok
 * over — dagpatroon, forecastpad, `projectedExpenses`, Snelheid, vandaag-marker
 * en de over/ruimte-regel. Precies dáár zat de rekenfout die de eindreview vond
 * (transfers verdunden `monthCount` in `historicalDayPattern`; gerepareerd in
 * 96d26b6c9 met `isRealAggRow`). De suite was groen en dat groen zei niets.
 *
 * Het blok "forecast-tak — lopende maand" hieronder loopt daarom met een `NOW`
 * BINNEN de maand. T2 is de bijtende toets op die rekenfout: haal `isRealAggRow`
 * uit `historicalDayPattern` weg en de prognose zakt van € 400,00 naar € 300,00.
 * Waarneempunt is steeds het Prognose-blok in de footer — nooit
 * `container.textContent`, want de y-as-ticks dragen óók bedragen en maken een
 * bedrag-assertie stil vals-positief.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { PrivacyProvider, useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { PRIVACY_MASKED_STORAGE_KEY } from '@/lib/hooks/use-privacy'
import { MASKED_AMOUNT_PLACEHOLDER, formatCurrencyDecimals } from '@/lib/format'
import { summarizeFlow, type AnalysisTransaction } from '@/lib/transaction-insights'
import type { Budget } from '@/lib/budget-data'
import { GeldstroomDaggrafiek } from './geldstroom-daggrafiek'

// `PrivacyProvider` bewaart de maskeer-voorkeur in `localStorage`, en die
// overleeft `cleanup()`. De privacy-test hieronder zet 'm dus aan voor élke test
// die daarná draait: die rendert dan '••••••' in plaats van bedragen en elke
// `toContain(formatCurrencyDecimals(...))` wordt stil onhaalbaar. Zonder deze
// opruiming is de suite volgorde-afhankelijk.
afterEach(() => {
  cleanup()
  try {
    window.localStorage.removeItem(PRIVACY_MASKED_STORAGE_KEY)
  } catch {
    // localStorage kan geweigerd zijn — de in-memory state is dan al schoon.
  }
})

function tx(id: string, date: string, amount: number, type: string | null = null): AnalysisTransaction {
  return {
    id,
    date,
    amount,
    description: 'Boeking',
    counterparty_name: null,
    counterparty_iban: null,
    budget_id: null,
    category: null,
    account_id: 'acc-1',
    account_name: 'Betaalrekening',
    is_income: amount > 0,
    transaction_type: type,
    bank_code: null,
    running_balance: null,
    creditor_id: null,
    fx_amount: null,
    fx_currency: null,
    fx_rate: null,
  }
}

function budget(over: Partial<Budget> & { id: string; name: string }): Budget {
  return {
    user_id: 'u1',
    parent_id: null,
    slug: null,
    icon: '',
    description: null,
    default_limit: 0,
    budget_type: 'expense',
    interval: 'monthly',
    rollover_type: 'reset',
    limit_type: 'soft',
    alert_threshold: 0,
    max_single_transaction_amount: 0,
    is_essential: false,
    priority_score: 0,
    is_inflation_indexed: false,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    ownership: 'personal',
    household_id: null,
    goal_type: null,
    ...over,
  } as Budget
}

// Juni 2026, een AFGESLOTEN maand gezien vanaf `NOW` — dan is de forecast
// 'actual' en toont de footer de netto eindstand in plaats van een prognose.
const NOW = new Date(2026, 7, 12) // 12 augustus 2026
const MONTH_START = '2026-06-01'

const TXNS: AnalysisTransaction[] = [
  tx('t1', '2026-06-01', 2400),
  tx('t2', '2026-06-03', -900),
  tx('t3', '2026-06-03', -120),
  tx('t4', '2026-06-17', -240),
  tx('t5', '2026-06-28', -60),
  tx('t8', '2026-06-20', -1320), // duwt het netto negatief — een échte uitgave
  tx('t6', '2026-06-05', -5000, 'transfer'), // eigen rekening → telt nergens mee
  tx('t7', '2026-06-09', -4000, 'joint_transfer'), // naar de partner → telt evenmin mee
]

// Parent mét kinderen (mag niet dubbeltellen) + één blad.
const BUDGETS = [
  budget({ id: 'b-parent', name: 'Boodschappen', default_limit: 999 }),
  budget({ id: 'b-child', name: 'Supermarkt', parent_id: 'b-parent', default_limit: 300 }),
  budget({ id: 'b-wonen', name: 'Wonen', default_limit: 900 }),
  budget({ id: 'b-spaar', name: 'Sparen', budget_type: 'savings', default_limit: 500 }),
]

const SUMMARY = summarizeFlow(TXNS)

function renderChart(extra?: React.ReactNode) {
  return render(
    <PrivacyProvider>
      {extra}
      <GeldstroomDaggrafiek
        transactions={TXNS}
        priorTransactions={[]}
        budgets={BUDGETS}
        summary={SUMMARY}
        monthStart={MONTH_START}
        monthLabel="juni 2026"
        now={NOW}
      />
    </PrivacyProvider>,
  )
}

/**
 * Vrije variant van `renderChart` — elke prop overschrijfbaar, `summary` volgt
 * standaard uit `summarizeFlow(transactions)` zodat de grafiek en de meegegeven
 * samenvatting per constructie dezelfde populatie beschrijven.
 */
function renderWith(over: {
  transactions?: AnalysisTransaction[]
  priorTransactions?: AnalysisTransaction[]
  budgets?: Budget[]
  monthStart?: string
  monthLabel?: string
  now?: Date
}) {
  const transactions = over.transactions ?? TXNS
  return render(
    <PrivacyProvider>
      <GeldstroomDaggrafiek
        transactions={transactions}
        priorTransactions={over.priorTransactions ?? []}
        budgets={over.budgets ?? BUDGETS}
        summary={summarizeFlow(transactions)}
        monthStart={over.monthStart ?? MONTH_START}
        monthLabel={over.monthLabel ?? 'juni 2026'}
        now={over.now ?? NOW}
      />
    </PrivacyProvider>,
  )
}

describe('GeldstroomDaggrafiek — footer-KPI\'s', () => {
  it('toont exact summarizeFlow(...).income / .expense / .net', () => {
    const { container } = renderChart()
    const text = container.textContent ?? ''

    expect(text).toContain(formatCurrencyDecimals(SUMMARY.income))
    expect(text).toContain(formatCurrencyDecimals(SUMMARY.expense))
    // Afgesloten maand → 'Netto', niet 'Prognose'.
    expect(screen.getByText('Netto')).toBeTruthy()
    expect(screen.queryByText('Prognose')).toBeNull()
    expect(SUMMARY.net).toBeLessThan(0) // negatief → geen '+'-prefix
    expect(text).toContain(formatCurrencyDecimals(SUMMARY.net))
  })

  it('telt alleen blad-budgetten mee in de maandlimiet', () => {
    const { container } = renderChart()
    // Blad-expense-budgetten: Supermarkt (300) + Wonen (900) = 1.200.
    // De parent (999) telt niet mee, het savings-budget (500) evenmin.
    expect(container.textContent).toContain(formatCurrencyDecimals(1200))
    expect(container.textContent).not.toContain(formatCurrencyDecimals(2199))
  })

  // WAS: `expect(container.textContent).not.toContain(formatCurrencyDecimals(5000))`.
  // Die toets was VACUÜM: € 5.000,00 wordt nergens als tekst gerenderd — de
  // KPI's komen uit de `summary`-prop (die de test zélf al transfer-vrij maakt)
  // en de staven zijn `<rect>`, geen tekst. De y-as gebruikt bovendien
  // `formatCurrency` zónder decimalen, dus zelfs een tick op −5000 kan de string
  // "€ 5.000,00" niet bevatten. De assertie kón niet falen. Wat de uitsluiting
  // werkelijk bewaakt is de staaf-telling — dus toetsen we die, expliciet en
  // mét controlegroep zodat de assertie aantoonbaar bijt.
  it('geeft een dag met uitsluitend een overboeking géén staaf', () => {
    const rows = [
      tx('n1', '2026-06-03', -100),
      tx('n2', '2026-06-05', -5000, 'transfer'),
      tx('n3', '2026-06-09', -4000, 'joint_transfer'),
    ]

    const { container } = renderWith({ transactions: rows })
    const negatief = (root: HTMLElement) =>
      Array.from(root.querySelectorAll('svg rect')).filter(
        (r) => r.getAttribute('fill') === 'var(--negative)',
      ).length
    // Alleen 3 juni draagt een échte uitgave; 5 en 9 juni zijn overboekingen.
    expect(negatief(container)).toBe(1)

    // Controlegroep: dezelfde drie dagen zónder transfer-type geven wél drie
    // staven. Zonder deze helft zou een component die überhaupt geen staven
    // tekent de assertie hierboven ook halen.
    cleanup()
    const zonderType = rows.map((r) => ({ ...r, transaction_type: null }))
    const { container: c2 } = renderWith({ transactions: zonderType })
    expect(negatief(c2)).toBe(3)
  })
})

describe('GeldstroomDaggrafiek — staven per dag', () => {
  it('tekent één staaf per dag met beweging, met dezelfde dagtotalen als summarizeFlow', () => {
    const { container } = renderChart()
    const svg = container.querySelector('svg')!
    const rects = Array.from(svg.querySelectorAll('rect'))

    const dagenMetInkomen = new Set(
      TXNS.filter((t) => summarizeFlow([t]).income > 0).map((t) => t.date),
    )
    const dagenMetUitgave = new Set(
      TXNS.filter((t) => summarizeFlow([t]).expense > 0).map((t) => t.date),
    )

    expect(rects.filter((r) => r.getAttribute('fill') === 'var(--positive)')).toHaveLength(
      dagenMetInkomen.size,
    )
    expect(rects.filter((r) => r.getAttribute('fill') === 'var(--negative)')).toHaveLength(
      dagenMetUitgave.size,
    )

    // 3 juni draagt twee uitgaven; die horen op één staaf te staan.
    expect(dagenMetUitgave.has('2026-06-03')).toBe(true)
    expect(summarizeFlow(TXNS.filter((t) => t.date === '2026-06-03')).expense).toBe(1020)
  })

  it('rendert 30 x-as-slots voor juni (maand-vormig)', () => {
    const { container } = renderChart()
    // Dag-labels: 1, 5, 10, 15, 20, 25, 30 (30 valt samen met de laatste dag).
    const labels = Array.from(container.querySelectorAll('svg text'))
      .map((t) => t.textContent)
      .filter((t) => t && /^\d+$/.test(t))
    expect(labels).toEqual(['1', '5', '10', '15', '20', '25', '30'])
  })
})

describe('GeldstroomDaggrafiek — privacy', () => {
  function MaskToggle() {
    const { setMasked } = useMaskedAmounts()
    return (
      <button type="button" data-testid="mask-on" onClick={() => setMasked(true)}>
        masker
      </button>
    )
  }

  it('maskeert ook de y-as-labels in de privacy-modus', () => {
    const { container } = renderChart(<MaskToggle />)
    const axisBefore = Array.from(container.querySelectorAll('svg text'))
      .map((t) => t.textContent ?? '')
      .filter((t) => t.includes('€'))
    expect(axisBefore.length).toBeGreaterThan(0)

    fireEvent.click(screen.getByTestId('mask-on'))

    const axisAfter = Array.from(container.querySelectorAll('svg text'))
      .map((t) => t.textContent ?? '')
      .filter((t) => t.trim().length > 0 && !/^\d+$/.test(t.trim()))
    expect(axisAfter.every((t) => t.includes(MASKED_AMOUNT_PLACEHOLDER))).toBe(true)
    expect(container.textContent).not.toContain(formatCurrencyDecimals(SUMMARY.income))
  })
})

// ── De forecast-tak: NOW BINNEN de getoonde maand ───────────────────────────
//
// Gedeelde fixture: augustus 2026 (31 dagen), `NOW` = 10 augustus, twee rijen
// (+2000 op 08-01, −100 op 08-05). Daarmee is `dayOfMonth` = 10,
// `daysRemaining` = 21 en `cumulativeToday` = 1900.
//
// Alle verwachte bedragen hieronder zijn met de hand herleid uit de bron:
//  · historische tak — projectedExpenses = expense + Σ avgExpense over d 11..31
//  · tempo-tak       — projectedExpenses = expense + (expense / dayOfMonth) × 21

const LOPEND_START = '2026-08-01'
const NOW_IN_MAAND = new Date(2026, 7, 10) // 10 augustus 2026
const LOPEND_TXNS: AnalysisTransaction[] = [tx('a1', '2026-08-01', 2000), tx('a2', '2026-08-05', -100)]

/**
 * Het Prognose-blok uit de footer — NIET `container.textContent`. De y-as-ticks
 * dragen ook bedragen, dus een bedrag-assertie op de hele container kan
 * toevallig een tick raken en daarmee stil vals-positief worden.
 */
function prognoseBlok(): string {
  return screen.getByText('Prognose').parentElement?.textContent ?? ''
}

function renderLopend(over: { priorTransactions?: AnalysisTransaction[]; budgets?: Budget[] } = {}) {
  return renderWith({
    transactions: LOPEND_TXNS,
    priorTransactions: over.priorTransactions ?? [],
    budgets: over.budgets ?? [],
    monthStart: LOPEND_START,
    monthLabel: 'augustus 2026',
    now: NOW_IN_MAAND,
  })
}

describe('GeldstroomDaggrafiek — forecast-tak (lopende maand)', () => {
  it('T1 · bereikt de tak: prognose-KPI, gestippeld pad tot maandeinde en één vandaag-marker', () => {
    const { container } = renderLopend()

    // De tak zelf: in een afgesloten maand staat hier 'Netto'.
    expect(screen.getByText('Prognose')).toBeTruthy()
    expect(screen.queryByText('Netto')).toBeNull()

    const svg = container.querySelector('svg')!

    // Precies één gestippeld forecastpad, met één segment per resterende dag:
    // daysInMonth (31) − dayOfMonth (10) = 21.
    const forecastPaden = Array.from(svg.querySelectorAll('path[stroke-dasharray="3 3"]'))
    expect(forecastPaden).toHaveLength(1)
    expect((forecastPaden[0].getAttribute('d') ?? '').match(/L /g) ?? []).toHaveLength(21)

    // Precies één VERTICALE stippellijn (de vandaag-marker). Filteren op
    // x1 === x2 is essentieel: de y-as-gridlines dragen dezelfde dasharray.
    const stippelLijnen = Array.from(svg.querySelectorAll('line[stroke-dasharray="2 3"]'))
    expect(stippelLijnen.length).toBeGreaterThan(1) // gridlines + marker
    const verticaal = stippelLijnen.filter((l) => l.getAttribute('x1') === l.getAttribute('x2'))
    expect(verticaal).toHaveLength(1)
  })

  it('T2 · een maand met alléén een overboeking verdunt de dagpatroon-gemiddelden niet', () => {
    // Mei draagt uitsluitend een overboeking en mag dus NIET als "maand met €0"
    // in `monthCount` belanden. Juni en juli dragen elk € 300 op dag 20.
    //   correct : avgExpense(dag 20) = 600 / 2 = 300 → prognose 100 + 300 = 400
    //   verdund : avgExpense(dag 20) = 600 / 3 = 200 → prognose 100 + 200 = 300
    // Dit is de bijtende toets op de rekenfout uit 96d26b6c9: haal
    // `isRealAggRow` uit `historicalDayPattern` weg en deze test wordt rood.
    renderLopend({
      priorTransactions: [
        tx('p1', '2026-06-20', -300),
        tx('p2', '2026-07-20', -300),
        tx('p3', '2026-05-20', -5000, 'transfer'),
      ],
    })

    const blok = prognoseBlok()
    expect(blok).toContain(formatCurrencyDecimals(400))
    expect(blok).not.toContain(formatCurrencyDecimals(300))
    expect(blok).toContain('o.b.v. 12 mnd')
  })

  it('T3 · alleen overboekingen in de historie → terugval op het huidige tempo', () => {
    // Geen enkele échte rij in de historie → `historicalDayPattern` is null en
    // de curve valt terug op het tempo: 100 + (100 / 10) × 21 = 310.
    // Zonder de transfer-uitsluiting ontstaat hier een nullen-patroon dat zich
    // als "o.b.v. 12 mnd" presenteert en op € 100,00 blijft staan.
    const { container } = renderLopend({
      priorTransactions: [
        tx('p1', '2026-05-04', -400, 'transfer'),
        tx('p2', '2026-06-04', -400, 'joint_transfer'),
        tx('p3', '2026-07-04', 400, 'transfer'),
      ],
    })

    const blok = prognoseBlok()
    expect(blok).toContain(formatCurrencyDecimals(310))
    expect(blok).toContain('o.b.v. tempo')
    expect(blok).not.toContain('o.b.v. 12 mnd')

    // De curve bestaat wél — de terugval is geen leeg pad.
    expect(container.querySelectorAll('path[stroke-dasharray="3 3"]')).toHaveLength(1)
  })

  it('T6 · prognose boven de maandlimiet kleurt het pad rood en toont de over-regel', () => {
    // Uitsluitend een MAANDELIJKS budget: `totalMonthlyBudget` deelt kwartaal-
    // en jaarbudgetten niet door 3/12 (bekende afwijking, aparte bugkaart) —
    // die grondslag mag deze test niet cementeren.
    const { container } = renderLopend({
      budgets: [budget({ id: 'b-eten', name: 'Eten', default_limit: 200 })],
    })

    // Prognose 310 tegen een limiet van 200 → € 110,00 over.
    const blok = prognoseBlok()
    expect(blok).toContain(formatCurrencyDecimals(310))
    expect(blok).toContain(formatCurrencyDecimals(110))
    expect(blok).toContain('over')
    expect(blok).not.toContain('ruimte')

    // Snelheid = expense / (limiet × dayOfMonth / daysInMonth)
    //          = 100 / (200 × 10 / 31) = 155%.
    const snelheid = screen.getByText('Snelheid').parentElement?.textContent ?? ''
    expect(snelheid).toContain('155%')
    expect(snelheid).toContain('te snel')

    const forecastPad = container.querySelector('path[stroke-dasharray="3 3"]')!
    expect(forecastPad.getAttribute('stroke')).toBe('var(--negative)')
  })
})
