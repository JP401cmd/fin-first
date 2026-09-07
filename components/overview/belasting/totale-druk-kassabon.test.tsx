import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TotaleDrukKassabon, TotaleDrukKassabonTrigger } from './totale-druk-kassabon'
import { buildTaxOverview } from '@/lib/tax-overview'
import { computeBox1Tax } from '@/lib/box1-tax'
import { calculateFreedomTime, formatCurrency, formatFreedomTimeString } from '@/lib/format'

/**
 * UR3-14 deel D — de bon achter het hero-bedrag van `HubTotaleDruk`.
 *
 * De pinning: elke regel én het totaal komen uit `buildTaxOverview` voor
 * dezelfde input, niet uit een som in de bon. En de twee tarieven blijven
 * pass-through uit `computeBox1Tax` — geen eigen schijf- of afbouwpercentage
 * (bevinding C9).
 */

const GROSS = 93_369
const BOX3_TAX = 599
const BOX2_TAX = 12_400
const DAILY_EXPENSES = 100

const motor = computeBox1Tax({ grossYearlyIncome: GROSS, year: 2026 })

function overview(box2: number | null) {
  return buildTaxOverview({
    box1Tax: Math.round(motor.tax),
    box2Tax: box2,
    box3Tax: BOX3_TAX,
    effectiveRate: motor.effectiveRate,
    marginalRate: motor.marginalRate,
    dailyExpenses: DAILY_EXPENSES,
  })
}

describe('TotaleDrukKassabon — regels komen uit buildTaxOverview', () => {
  it('toont per box het bedrag dat de aggregator draagt', () => {
    const ov = overview(BOX2_TAX)
    render(<TotaleDrukKassabon overview={ov} dailyExpenses={DAILY_EXPENSES} />)

    expect(screen.getByText('Box 1 · werk en woning')).toBeTruthy()
    expect(screen.getByText('Box 2 · aanmerkelijk belang')).toBeTruthy()
    expect(screen.getByText('Box 3 · sparen en beleggen')).toBeTruthy()
    expect(screen.getByTestId('druk-kassabon-totaal').textContent).toContain(
      formatCurrency(Math.round(ov.total)),
    )
  })

  it('pint het totaal op overview.total en niet op de som van de regels', () => {
    // Een overview waarvan het totaal bewust afwijkt van de boxen: zou de bon
    // zelf optellen, dan viel dit verschil weg in plaats van op te vallen.
    const gemanipuleerd = { ...overview(null), total: 40_000 }
    render(<TotaleDrukKassabon overview={gemanipuleerd} dailyExpenses={DAILY_EXPENSES} />)
    expect(screen.getByTestId('druk-kassabon-totaal').textContent).toContain(
      formatCurrency(40_000),
    )
  })

  it('vertaalt het jaarbedrag naar vrijheidstijd via het meegegeven dagtarief', () => {
    const ov = overview(null)
    render(<TotaleDrukKassabon overview={ov} dailyExpenses={DAILY_EXPENSES} />)
    const verwacht = formatFreedomTimeString(
      calculateFreedomTime(ov.total, DAILY_EXPENSES),
      'long',
    )
    expect(
      screen.getByText(new RegExp(verwacht.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
    ).toBeTruthy()
  })

  it('toont de tarieven kant-en-klaar uit de Box 1-motor, met hun grondslag', () => {
    const ov = overview(null)
    render(<TotaleDrukKassabon overview={ov} dailyExpenses={DAILY_EXPENSES} />)
    expect(
      screen.getByText(`${Math.round(motor.effectiveRate * 1000) / 10}%`),
    ).toBeTruthy()
    expect(
      screen.getByText(`${Math.round(motor.marginalRate * 1000) / 10}%`),
    ).toBeTruthy()
    expect(screen.getByText(/gaan over je inkomen in Box 1/i)).toBeTruthy()
  })

  it('benoemt de weglating in plaats van een lege Box 2-regel te tonen', () => {
    render(
      <TotaleDrukKassabon overview={overview(null)} dailyExpenses={DAILY_EXPENSES} exclBox2 />,
    )
    expect(screen.queryByText('Box 2 · aanmerkelijk belang')).toBeNull()
    expect(screen.getByText(/Box 2 \(aanmerkelijk belang\) telt hier niet mee/i)).toBeTruthy()
  })
})

describe('TotaleDrukKassabonTrigger', () => {
  it('opent de bon en houdt het bedrag als toegankelijke naam van de knop', () => {
    render(
      <TotaleDrukKassabonTrigger overview={overview(null)} dailyExpenses={DAILY_EXPENSES}>
        <span>{formatCurrency(Math.round(overview(null).total))}</span>
      </TotaleDrukKassabonTrigger>,
    )
    const knop = screen.getByTestId('totale-druk-hero')
    expect(knop.textContent).toContain(formatCurrency(Math.round(overview(null).total)))
    expect(screen.queryByTestId('druk-kassabon-totaal')).toBeNull()
    fireEvent.click(knop)
    expect(screen.getByTestId('druk-kassabon-totaal')).toBeTruthy()
  })
})
