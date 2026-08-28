/**
 * S3 — "Transacties in Eenvoudig: niet de meter als enige duiding".
 *
 * `GeldstroomZin` is de Eenvoudig-tegenhanger van `GeldstroomGauge`. Wat hier
 * hard vastligt:
 *  1. de vier takken renderen de juiste waarneming;
 *  2. er staat GEEN spaarquote-oordeel zolang het venster loopt;
 *  3. de zin doet geen VOORSPELLING ("salaris komt nog") — alleen waarneming;
 *  4. alle bedragen lopen door `MaskedAmount`, dus de privacy-modus werkt;
 *  5. de meter draagt in Volledig zijn venster-label.
 *
 * De call-site-gating (`simple ? Zin : Gauge`) wordt op de bron gepind: de
 * volledige render van `TransactiesAnalyse` vraagt geladen data en leeft in
 * `transacties-analyse.test.tsx`, dat bewust op de laadstaat blijft staan.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { PrivacyProvider, useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'
import { GeldstroomGauge, GeldstroomZin } from './geldstroom-gauge'
import {
  describeFlow,
  resolvePeriodWindow,
  type FlowSummary,
  type PeriodKind,
} from '@/lib/transaction-insights'

afterEach(cleanup)

const NOW = new Date(2026, 7, 12) // 12 augustus 2026

function flow(income: number, expense: number): FlowSummary {
  const net = income - expense
  return {
    income,
    expense,
    net,
    savingsRate: income > 0 ? Math.round((net / income) * 100) : 0,
    count: (income > 0 ? 1 : 0) + (expense > 0 ? 1 : 0),
  }
}

function renderZin(
  current: FlowSummary,
  prev: FlowSummary,
  period: PeriodKind = 'month',
  offset = 0,
) {
  const w = resolvePeriodWindow(period, offset, NOW)
  const description = describeFlow(current, prev, period, offset, w, NOW)
  return render(<GeldstroomZin description={description} summary={current} />)
}

function MaskToggle() {
  const { setMasked } = useMaskedAmounts()
  return (
    <button type="button" data-testid="mask-on" onClick={() => setMasked(true)}>
      masker
    </button>
  )
}

describe('GeldstroomZin — de waarneming per tak', () => {
  it('lopende maand zonder inkomen: meldt wat er is, niet wat er komt', () => {
    const { container } = renderZin(flow(0, 800), flow(3000, 2500))
    expect(container.textContent).toContain('augustus tot nu toe')
    expect(container.textContent).toContain('Er is nog niets binnengekomen')
    expect(container.textContent).toContain('Vorige periode kwam er')
    // WAARNEMING, GEEN VOORSPELLING — de app kan geen salaris beloven (Wft).
    expect(container.textContent).not.toMatch(/salaris/i)
    expect(container.textContent).not.toMatch(/komt nog|verwacht|wordt nog/i)
  })

  it('laat de vergelijkzin weg als er vorige periode ook niets binnenkwam', () => {
    const { container } = renderZin(flow(0, 800), flow(0, 0))
    expect(container.textContent).toContain('Er is nog niets binnengekomen')
    expect(container.textContent).not.toContain('Vorige periode')
  })

  it('lopende maand met in- én uitstroom: zegt dat de periode nog loopt', () => {
    const { container } = renderZin(flow(3000, 1200), flow(3000, 2500))
    expect(container.textContent).toContain('Deze periode loopt nog')
    expect(container.textContent).toContain('over')
  })

  it('toont GEEN spaarquote zolang het venster loopt', () => {
    const { container } = renderZin(flow(3000, 1200), flow(3000, 2500))
    // 60% zou de quote zijn; over een halve maand is dat het valse oordeel
    // waar deze kaart om begon.
    expect(container.textContent).not.toMatch(/\d+%/)
  })

  it('afgesloten maand: eindstand mét spaarquote', () => {
    const { container } = renderZin(flow(2800, 1000), flow(2800, 2000), 'month', -1)
    expect(container.textContent).toContain('juli 2026')
    expect(container.textContent).toContain('je hield')
    expect(container.textContent).toContain('64% van wat er binnenkwam')
  })

  it('afgesloten venster met een tekort: benoemt het tekort, zonder quote', () => {
    const { container } = renderZin(flow(1000, 1600), flow(2800, 2000), 'month', -1)
    expect(container.textContent).toContain('meer uit dan er binnenkwam')
    expect(container.textContent).not.toMatch(/van wat er binnenkwam/)
  })

  it('rendert niets bij een lege periode — de call-site houdt daar zijn eigen regel', () => {
    const { container } = renderZin(flow(0, 0), flow(0, 0))
    expect(container.textContent).toBe('')
  })

  it('houdt de Inkomen/Uitgaven/Saldo-strip: Eenvoudig verliest de naald, niet de cijfers', () => {
    renderZin(flow(3000, 1200), flow(3000, 2500))
    expect(screen.getByText('Inkomen')).toBeTruthy()
    expect(screen.getByText('Uitgaven')).toBeTruthy()
    expect(screen.getByText('Saldo')).toBeTruthy()
    // Geen naald-meter in deze tak.
    expect(screen.queryByRole('img', { name: /Spaarquote/ })).toBeNull()
  })
})

describe('GeldstroomZin — privacy-modus', () => {
  it('maskeert élk bedrag in de zin', () => {
    const w = resolvePeriodWindow('month', 0, NOW)
    const current = flow(0, 800)
    const description = describeFlow(current, flow(3000, 2500), 'month', 0, w, NOW)
    const { container } = render(
      <PrivacyProvider>
        <MaskToggle />
        <GeldstroomZin description={description} summary={current} />
      </PrivacyProvider>,
    )
    fireEvent.click(screen.getByTestId('mask-on'))
    expect(container.textContent).toContain(MASKED_AMOUNT_PLACEHOLDER)
    expect(container.textContent).not.toContain('800')
    expect(container.textContent).not.toContain('3.000')
    // De duiding zelf blijft leesbaar.
    expect(container.textContent).toContain('Er is nog niets binnengekomen')
  })
})

describe('GeldstroomGauge — venster-onderschrift (Volledig)', () => {
  it('benoemt het venster waarover de meter leest', () => {
    render(<GeldstroomGauge summary={flow(2800, 1000)} windowLabel="augustus tot nu toe" />)
    expect(screen.getByText('augustus tot nu toe')).toBeTruthy()
  })

  it('blijft zonder label werken (prop is optioneel)', () => {
    render(<GeldstroomGauge summary={flow(2800, 1000)} />)
    expect(screen.getByRole('img', { name: /Spaarquote/ })).toBeTruthy()
  })
})

describe('S3 — call-site gating en de C6-grens', () => {
  const analyse = readFileSync(
    join(process.cwd(), 'components/overview/transacties/transacties-analyse.tsx'),
    'utf8',
  )

  it('kiest de zin in Eenvoudig en de meter in Volledig, op de call-site', () => {
    // Alleen het fragment rond de keuze meenemen — een falende assertie op de
    // volle bestandsinhoud maakt de testoutput onleesbaar.
    const i = analyse.indexOf('<GeldstroomZin')
    expect(i).toBeGreaterThan(-1)
    const fragment = analyse.slice(Math.max(0, i - 200), i + 400)
    expect(/simple \? \(\s*<GeldstroomZin/.test(fragment)).toBe(true)
    expect(/<GeldstroomGauge[\s\S]{0,160}windowLabel=/.test(fragment)).toBe(true)
  })

  it('raakt summarizeFlow niet aan — dat is C6-terrein', () => {
    const lib = readFileSync(join(process.cwd(), 'lib/transaction-insights.ts'), 'utf8')
    // De clamp hoort in de gauge te blijven zitten, niet in de motor.
    expect(lib).not.toContain('Math.max(-100, Math.min(100')
    // En de motor levert nog steeds de kale quote uit savingsRateFromAggregates.
    expect(lib).toContain('savingsRateFromAggregates(income, expense, 0)')
  })
})
