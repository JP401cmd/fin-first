import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
import { CashflowSection } from './cashflow-section'
import type { CashflowSectionScalars } from '@/lib/cashflow-kpis'

/**
 * S5 (V2) — `CashflowSection` is modus-bewust geworden.
 *
 * Het was het enige blok op /overzicht/cashflow/forecast dat de weergavemodus
 * negeerde: in Eenvoudig stonden er drie kale KPI-kaarten met twee losse
 * percentages. Nu zegt Eenvoudig hetzelfde in één kaart en in woorden — het
 * bedrag blijft, de percentages worden zinnen. Volledig verandert niet.
 *
 * De uitgaventrend-zin en het uitgaventrend-percentage staan op ÉÉN afleiding
 * (`expenseTrendDelta`); de laatste test pint dat vast, zodat de zin nooit iets
 * anders kan beweren dan het percentage.
 */

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
})

function mkData(over: Partial<CashflowSectionScalars> = {}): CashflowSectionScalars {
  return {
    monthlyIncome: 4200,
    monthlyExpenses: 3100,
    savingsRate6m: 22.4,
    savingsHistory: [
      { month: '2026-06', value: 20 },
      { month: '2026-07', value: 22 },
    ],
    // Uitgaven dalen: 3.200 → 3.100 = −3,1%
    expenseHistory: [
      { month: '2026-06', value: 3200 },
      { month: '2026-07', value: 3100 },
    ],
    ...over,
  }
}

function renderSection(mode: DisplayMode, data = mkData()) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <CashflowSection data={data} />
    </DisplayModeProvider>,
  )
}

describe('CashflowSection — Volledig blijft ongewijzigd', () => {
  it('toont de drie KPI-kaarten met hun percentages', () => {
    renderSection('full')
    expect(screen.getByText(/Spaarquote/)).toBeTruthy()
    expect(screen.getByText('22.4%')).toBeTruthy()
    expect(screen.getByText('Maandelijks netto')).toBeTruthy()
    expect(screen.getByText('Uitgaventrend')).toBeTruthy()
    expect(screen.getByText('-3% t.o.v. vorige maand')).toBeTruthy()
  })
})

describe('CashflowSection — Eenvoudig zegt het in woorden (S5)', () => {
  it('vervangt de drie kaarten door één kaart met het maandbedrag', () => {
    const { container } = renderSection('simple')
    expect(screen.queryByText('Maandelijks netto')).toBeNull()
    expect(screen.queryByText('Uitgaventrend')).toBeNull()
    expect(screen.getByText('Wat je per maand overhoudt')).toBeTruthy()
    // Eén kaart, niet drie.
    expect(
      container.querySelectorAll('div[class*="rounded-"][class*="border"]').length,
    ).toBe(1)
  })

  it('zet de spaarquote in een zin MÉT zijn venster, geen kaal percentage', () => {
    renderSection('simple')
    // Geen losse percentage-KPI meer …
    expect(screen.queryByText('22.4%')).toBeNull()
    // … maar wel dezelfde maat, met de grondslag erbij (ADR 0073).
    expect(
      screen.getByText(/Over de laatste zes maanden hield je gemiddeld 22% van je inkomen over/),
    ).toBeTruthy()
  })

  it('zegt bij een negatieve spaarquote wat er gebeurde, zonder minteken-percentage', () => {
    renderSection('simple', mkData({ savingsRate6m: -12 }))
    expect(
      screen.getByText(/gaf je gemiddeld meer uit dan er binnenkwam/),
    ).toBeTruthy()
  })

  it('noemt het tekort als tekort wanneer de uitgaven hoger zijn', () => {
    renderSection('simple', mkData({ monthlyIncome: 3000, monthlyExpenses: 3400 }))
    expect(screen.getByText('Wat je per maand tekortkomt')).toBeTruthy()
  })

  it('laat de trendzin weg zonder twee maanden historie', () => {
    renderSection('simple', mkData({ expenseHistory: [{ month: '2026-07', value: 3100 }] }))
    expect(screen.queryByText(/uitgaven/i)).toBeNull()
  })
})

describe('CashflowSection — trendzin en trendpercentage komen uit dezelfde afleiding', () => {
  const cases: { history: CashflowSectionScalars['expenseHistory']; woorden: RegExp; pct: string }[] = [
    {
      history: [
        { month: '2026-06', value: 3000 },
        { month: '2026-07', value: 3300 },
      ],
      woorden: /uitgaven lagen hoger dan vorige maand/,
      pct: '+10% t.o.v. vorige maand',
    },
    {
      history: [
        { month: '2026-06', value: 3300 },
        { month: '2026-07', value: 3000 },
      ],
      woorden: /uitgaven lagen lager dan vorige maand/,
      pct: '-9% t.o.v. vorige maand',
    },
    {
      history: [
        { month: '2026-06', value: 3000 },
        { month: '2026-07', value: 3010 },
      ],
      woorden: /ongeveer gelijk gebleven aan vorige maand/,
      pct: 'Stabiel t.o.v. vorige maand',
    },
  ]

  for (const c of cases) {
    it(`"${c.pct}" ⇒ dezelfde richting in woorden`, () => {
      renderSection('full', mkData({ expenseHistory: c.history }))
      expect(screen.getByText(c.pct)).toBeTruthy()
      cleanup()
      renderSection('simple', mkData({ expenseHistory: c.history }))
      expect(screen.getByText(c.woorden)).toBeTruthy()
    })
  }
})
