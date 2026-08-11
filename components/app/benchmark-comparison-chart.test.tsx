import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BenchmarkComparisonChart } from './benchmark-comparison-chart'
import {
  TIME_PERIODS,
  type ComparisonResult,
  type BenchmarkDataPoint,
} from '@/lib/benchmark-comparison'

/**
 * Regressie bij testbug-ffa902 (/core/assets/holdings — benchmarkvergelijking).
 *
 * De melder zag "1J" geselecteerd, een X-as van sep '23 tot aug '26, en de zin
 * "De beste benchmark (S&P 500) behaalde +85.0%" onder een legenda met een
 * portfolio op +352,2%. Deze suite pint het zichtbare resultaat vast: de as
 * blijft binnen het venster, de percentages dragen hun periode, en zonder
 * koershistorie verdwijnt het portfoliogetal in plaats van te liegen.
 */

const PERIOD_1Y = TIME_PERIODS.find(p => p.id === '1y')!

/**
 * Maandreeks vanaf `fromYear`-`fromMonth`, lineair van 100 naar `endValue`.
 * De reeks staat model voor wat de motor ná het knippen oplevert: hij begint
 * op `WINDOW_START` en loopt precies het venster uit.
 */
function series(
  fromYear: number,
  fromMonth: number,
  months: number,
  endValue: number,
): BenchmarkDataPoint[] {
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(fromYear, fromMonth - 1 + i, 1)
    return {
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
      value: Math.round((100 + ((endValue - 100) * i) / (months - 1)) * 100) / 100,
    }
  })
}

/** Vensterstart van de fixture: 1J-selectie, sep '25 t/m aug '26. */
const WINDOW_START = '2025-09-01'

function comparison(overrides: Partial<ComparisonResult> = {}): ComparisonResult {
  return {
    period: PERIOD_1Y,
    windowStart: WINDOW_START,
    windowFallback: false,
    windowClipped: false,
    portfolio: {
      returnPct: 8.4,
      dataPoints: series(2025, 9, 12, 108.4).map(p => ({ date: p.date, value: p.value })),
      observedShare: 1,
    },
    benchmarks: [
      { id: 'aex', name: 'AEX', color: '#3b82f6', returnPct: 5.2, dataPoints: series(2025, 9, 12, 105.2), alpha: 3.2, dataSource: 'yahoo_finance' },
      { id: 'msci_world', name: 'MSCI World', color: '#8b5cf6', returnPct: 7.1, dataPoints: series(2025, 9, 12, 107.1), alpha: 1.3, dataSource: 'yahoo_finance' },
      { id: 'sp500', name: 'S&P 500', color: '#10b981', returnPct: 9.6, dataPoints: series(2025, 9, 12, 109.6), alpha: -1.2, dataSource: 'yahoo_finance' },
    ],
    ...overrides,
  }
}

function renderChart(result: ComparisonResult | null) {
  return render(
    <BenchmarkComparisonChart
      comparison={result}
      onPeriodChange={vi.fn()}
      activePeriod={PERIOD_1Y}
    />,
  )
}

/**
 * Jaartallen uit de X-as-labels van de SVG. Bewust op de eigen testid en niet
 * op "elk <text>": de Y-as-ticks zijn óók losse getallen, en die zouden een
 * jaar-achtig patroon meematchen en de assertie stilletjes groen houden.
 * Het label zelf is `nl-NL` short/2-digit ("sep 25").
 */
function axisYears(): string[] {
  const labels = screen.getAllByTestId('benchmark-x-label')
  return labels.map(t => {
    const match = /(\d{2})$/.exec((t.textContent ?? '').trim())
    if (!match) throw new Error(`X-as-label zonder jaartal: "${t.textContent}"`)
    return match[1]
  })
}

describe('BenchmarkComparisonChart — venster', () => {
  it('houdt de X-as binnen het gekozen jaar', () => {
    renderChart(comparison())
    // De melding toonde sep '23 t/m aug '26 bij een 1J-selectie: vier
    // jaartallen op de as van een jaargrafiek. Binnen het venster kunnen er
    // per definitie maar twee zijn.
    const years = axisYears()
    expect(years.length).toBeGreaterThan(0)
    expect(new Set(years)).toEqual(new Set(['25', '26']))
  })

  it('benoemt het venster bij de percentages', () => {
    renderChart(comparison())
    expect(screen.getByTestId('benchmark-window-label')).toHaveTextContent('Rendement over 1 jaar')
  })

  it('zegt het wanneer op de volledige historie is teruggevallen', () => {
    renderChart(comparison({ windowFallback: true }))
    expect(screen.getByTestId('benchmark-window-label')).toHaveTextContent(
      'Rendement over de beschikbare historie',
    )
  })
})

describe('BenchmarkComparisonChart — copy', () => {
  it('noemt de sterkste index in deze periode, niet "de beste benchmark"', () => {
    renderChart(comparison())
    const message = screen.getByTestId('benchmark-context-message')
    expect(message).toHaveTextContent('De sterkste index in deze periode was S&P 500 met +9.6%')
    expect(message.textContent).not.toContain('De beste benchmark')
  })

  it('koppelt het portfoliorendement aan het venster', () => {
    renderChart(comparison())
    expect(screen.getByTestId('benchmark-context-message')).toHaveTextContent(
      'Je portfolio deed +8.4% over 1 jaar',
    )
  })
})

describe('BenchmarkComparisonChart — geen koershistorie', () => {
  const zonderRendement = comparison({
    portfolio: { returnPct: null, gap: 'no_price_history', dataPoints: [], observedShare: null },
    benchmarks: comparison().benchmarks.map(b => ({ ...b, alpha: null })),
  })

  it('toont geen portfoliopercentage en geen alpha', () => {
    renderChart(zonderRendement)
    expect(screen.queryByTestId('benchmark-portfolio-legend')).toBeNull()
    expect(screen.queryByTestId('alpha-summary')).toBeNull()
    expect(screen.queryByTestId('benchmark-context-message')).toBeNull()
  })

  it('legt uit wat er ontbreekt en houdt de indices leesbaar', () => {
    renderChart(zonderRendement)
    const note = screen.getByTestId('benchmark-portfolio-unavailable')
    expect(note).toHaveTextContent('Je eigen lijn ontbreekt nog')
    expect(note).toHaveTextContent('marktkoers van je posities')
    expect(note).toHaveTextContent('S&P 500')
    // De benchmarks staan er nog gewoon, over het juiste venster.
    expect(screen.getByTestId('benchmark-window-label')).toHaveTextContent('over 1 jaar')
  })

  // Given een venster waarin meer is opgenomen dan er stond;
  // When de motor daarom weigert te meten;
  // Then zegt het scherm wélke van de twee oorzaken speelt — "je koershistorie
  // ontbreekt" zou hier de gebruiker een verkeerde actie in sturen.
  it('onderscheidt een onmeetbaar venster van ontbrekende koershistorie', () => {
    renderChart(comparison({
      portfolio: { returnPct: null, gap: 'unmeasurable_window', dataPoints: [], observedShare: null },
      benchmarks: comparison().benchmarks.map(b => ({ ...b, alpha: null })),
    }))
    const note = screen.getByTestId('benchmark-portfolio-unavailable')
    expect(note).toHaveTextContent('Dit venster is niet te meten')
    expect(note).not.toHaveTextContent('Je eigen lijn ontbreekt nog')
  })
})

describe('BenchmarkComparisonChart — dekking van het rendement', () => {
  // Given een portefeuille waarvan een deel geen marktkoers heeft (turbo's,
  // delistings); When er wél een rendement is; Then zegt het scherm hoe hard
  // dat getal is — de dekking is contract, geen voetnoot (ADR 0098).
  it('noemt het aandeel van de waarde waarover gemeten is', () => {
    renderChart(comparison({
      portfolio: {
        returnPct: 8.4,
        dataPoints: series(2025, 9, 12, 108.4).map(p => ({ date: p.date, value: p.value })),
        observedShare: 0.72,
      },
    }))
    expect(screen.getByTestId('benchmark-coverage-note')).toHaveTextContent('72% van de waarde')
  })

  it('zwijgt erover zodra de hele portefeuille noteert', () => {
    renderChart(comparison())
    expect(screen.queryByTestId('benchmark-coverage-note')).toBeNull()
  })

  // Given een koershistorie die pas later dan de gekozen periode begint;
  // When het venster daarop is ingekort;
  // Then draagt het label die kortere periode, niet "over 1 jaar".
  it('benoemt een ingekort venster met de maand waarin de meting begint', () => {
    renderChart(comparison({ windowClipped: true, windowStart: '2026-05-31' }))
    expect(screen.getByTestId('benchmark-context-message')).toHaveTextContent('sinds mei 2026')
  })
})

describe('BenchmarkComparisonChart — lege staat', () => {
  it('valt terug op de uitleg zonder vergelijking', () => {
    renderChart(null)
    expect(screen.getByText('Onvoldoende data voor vergelijking')).toBeInTheDocument()
  })
})
