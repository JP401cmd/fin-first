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
    // De MÉTING (niet gerenderd) en het GETOONDE getal staan hier bewust op
    // verschillende waarden: zou de kaart terugvallen op `savingsRate6m`, dan
    // valt dat luid om in plaats van stilzwijgend te kloppen.
    savingsRate6m: 9.5,
    effectiveSavingsRatePct: 22.4,
    savingsRateIncomeBasis: 'budget',
    savingsRateExpensesBasis: 'budget',
    savingsRateIsEstimate: false,
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
  it('toont de drie KPI-kaarten; de spaarquote is de EFFECTIEVE, met grondslag i.p.v. "(6m)"', () => {
    renderSection('full')
    expect(screen.getByText(/Spaarquote/)).toBeTruthy()
    expect(screen.getByText('22.4%')).toBeTruthy()
    // Niet de rauwe 6-maands meting, en niet meer het venster-label.
    expect(screen.queryByText('9.5%')).toBeNull()
    expect(screen.getByText('volgens je budgetten')).toBeTruthy()
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

  it('zet de spaarquote in een zin MÉT zijn grondslag, geen kaal percentage', () => {
    renderSection('simple')
    // Geen losse percentage-KPI meer …
    expect(screen.queryByText('22.4%')).toBeNull()
    // … maar wel dezelfde maat, met de grondslag erbij (ADR 0103). Het venster
    // ("laatste zes maanden") is weg: het getal is de effectieve quote, geen
    // 6-maands gemiddelde.
    expect(
      screen.getByText(/Van je inkomen volgens je budgetten hou je 22% over/),
    ).toBeTruthy()
  })

  it('zegt bij een negatieve spaarquote wat er gebeurde, zonder minteken-percentage', () => {
    renderSection('simple', mkData({ effectiveSavingsRatePct: -12 }))
    expect(
      screen.getByText(/geef je meer uit dan er binnenkomt/),
    ).toBeTruthy()
  })

  it.each([
    // H1: het label werd in een lopende zin geplakt en liep stuk zodra de
    // grondslag NIET budget/transactie was. Dat waren twee van de vijf mogelijke
    // waarden — en de enige die tot nu toe getest werd, was toevallig de enige
    // die goed las. Daarom staan alle vijf hier.
    ['budget', 'budget', 'volgens je budgetten'],
    ['transaction', 'transaction', 'volgens je transacties'],
    ['manual', 'manual', 'volgens je eigen invoer'],
    ['profile', 'profile', 'volgens je profiel'],
    ['manual', 'transaction', 'volgens een gemengde grondslag'],
  ] as const)(
    'Eenvoudig: grondslag %s/%s leest als een lopende zin (%s)',
    (income, expenses, frase) => {
      renderSection(
        'simple',
        mkData({ savingsRateIncomeBasis: income, savingsRateExpensesBasis: expenses }),
      )
      expect(
        screen.getByText(new RegExp(`Van je inkomen ${frase} hou je 22% over`)),
      ).toBeTruthy()
    },
  )

  it('Volledig: de kicker draagt dezelfde frase, ook bij een gemengde grondslag', () => {
    renderSection(
      'full',
      mkData({ savingsRateIncomeBasis: 'manual', savingsRateExpensesBasis: 'transaction' }),
    )
    expect(screen.getByText('volgens een gemengde grondslag')).toBeTruthy()
  })

  it('M2: markeert een schatting alleen wanneer de kaart "transacties" belooft', () => {
    // Grondslag transactie + lege meting ⇒ de kaart zégt "volgens je transacties"
    // terwijl er een profiel-/vermogensdelta-schatting onder ligt ⇒ markeren.
    const opTransacties = {
      savingsRateIncomeBasis: 'transaction' as const,
      savingsRateExpensesBasis: 'transaction' as const,
      savingsRateIsEstimate: true,
    }
    renderSection('full', mkData(opTransacties))
    expect(screen.getByText('geschat')).toBeTruthy()
    cleanup()

    // Budgetgrondslag: het getal komt uit de eigen keuze van de gebruiker — de
    // vlag gaat over de MÉTING en zou hier liegen.
    renderSection('full', mkData({ savingsRateIsEstimate: true }))
    expect(screen.queryByText('geschat')).toBeNull()
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
