import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SimVermogenspadWidget } from './sim-vermogenspad-widget'
import type { DashboardData } from './widget-renderer'
import { WEERBAARHEID_DISPLAY_MAX } from '@/lib/constants'

// jsdom mist ResizeObserver (WidgetShell), IntersectionObserver + matchMedia
// (useInViewAnimation). De as-labels renderen los van de animatie, maar de
// hook-effecten mogen niet gooien.
beforeAll(() => {
  class MockObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = MockObserver as unknown as typeof ResizeObserver
  global.IntersectionObserver = MockObserver as unknown as typeof IntersectionObserver
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }
})

type SimRow = NonNullable<DashboardData['simRows']>[number]

/**
 * Bouwt een geclipte simRows-reeks van `startAge` t/m `lastAge`, met een FIRE-
 * omslag halverwege (accumulation → retirement). `lastAge` spiegelt de
 * clip-grens (displayEndAge − 1) uit de loader.
 */
function makeSimRows(startAge: number, lastAge: number, fireAge: number): SimRow[] {
  const rows: SimRow[] = []
  for (let age = startAge; age <= lastAge; age++) {
    const isAcc = age < fireAge
    rows.push({
      age,
      endPortfolio: 200_000 + (age - startAge) * 15_000,
      phase: isAcc ? 'accumulation' : 'retirement',
      flowIn: isAcc ? 24_000 : 0,
      flowOut: isAcc ? 0 : 30_000,
      oneTimeNet: 0,
    })
  }
  return rows
}

// De widget leest enkel simRows, fireAgeFractional en displayEndAge (+ masking).
// Rest van DashboardData is voor deze test niet relevant → smalle cast.
function makeData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    simRows: makeSimRows(46, 92, 60),
    displayEndAge: 93,
    fireAgeFractional: 59.5,
    ...overrides,
  } as unknown as DashboardData
}

describe('SimVermogenspadWidget — eind-aslabel consumeert kernel-displayEndAge (geen hardcoded 90)', () => {
  it('full-size deplete (displayEndAge 93): toont 93j + Eindvermogen (93j), nooit 90', () => {
    const data = makeData({ simRows: makeSimRows(46, 92, 60), displayEndAge: 93, fireAgeFractional: 59.5 })
    render(<SimVermogenspadWidget size="full" data={data} />)

    expect(screen.getByText('93j')).toBeInTheDocument()
    expect(screen.getByText('Eindvermogen (93j)')).toBeInTheDocument()
    expect(screen.queryByText('90j')).not.toBeInTheDocument()
    expect(screen.queryByText('Eindvermogen (90j)')).not.toBeInTheDocument()
  })

  it('half-size deplete (displayEndAge 93): as-label toont 93j, niet 90j', () => {
    const data = makeData({ simRows: makeSimRows(46, 92, 60), displayEndAge: 93, fireAgeFractional: 59.5 })
    render(<SimVermogenspadWidget size="half" data={data} />)

    expect(screen.getByText('93j')).toBeInTheDocument()
    expect(screen.queryByText('90j')).not.toBeInTheDocument()
  })

  it('perpetual/pensioen (displayEndAge 100): toont 100j', () => {
    const data = makeData({ simRows: makeSimRows(46, 99, 60), displayEndAge: 100, fireAgeFractional: 59.5 })
    render(<SimVermogenspadWidget size="full" data={data} />)

    expect(screen.getByText('100j')).toBeInTheDocument()
    expect(screen.getByText('Eindvermogen (100j)')).toBeInTheDocument()
    expect(screen.queryByText('90j')).not.toBeInTheDocument()
  })

  it('fallback: zonder displayEndAge valt het label terug op de laatste simRow-leeftijd', () => {
    const data = makeData({ simRows: makeSimRows(46, 88, 60), displayEndAge: null, fireAgeFractional: 59.5 })
    render(<SimVermogenspadWidget size="full" data={data} />)

    expect(screen.getByText('88j')).toBeInTheDocument()
    expect(screen.queryByText('90j')).not.toBeInTheDocument()
  })
})

/**
 * Borgt dat de badge de historische SLAAGKANS toont uit het canonieke
 * `data.backtestSuccessRate`-signaal (consume-don't-recompute) en NIET langer
 * een lokaal verzonnen drawdown-heuristiek die een bewuste opmaakstrategie
 * misleidend als "Hoog risico" bestempelt.
 */
describe('SimVermogenspadWidget — slaagkans-badge consumeert data.backtestSuccessRate', () => {
  // Deplete/opmaak: pot stijgt en wordt daarna bewust naar ~0 afgebouwd.
  // Onder de oude drawdown-heuristiek gaf dit altijd misleidend "Hoog risico".
  function makeDepleteRows(): SimRow[] {
    const acc: SimRow[] = Array.from({ length: 15 }, (_, i) => ({
      age: 45 + i,
      endPortfolio: 100_000 + i * 50_000,
      phase: 'accumulation',
      flowIn: 24_000,
      flowOut: 0,
      oneTimeNet: 0,
    }))
    const ret: SimRow[] = Array.from({ length: 30 }, (_, i) => ({
      age: 60 + i,
      endPortfolio: Math.max(800_000 - i * 27_000, 1_000),
      phase: 'retirement',
      flowIn: 0,
      flowOut: 30_000,
      oneTimeNet: 0,
    }))
    return [...acc, ...ret]
  }

  it('full-size deplete: toont "Slaagkans 92%", nooit een risico-label', () => {
    const data = makeData({ simRows: makeDepleteRows(), backtestSuccessRate: 92 } as Partial<DashboardData>)
    render(<SimVermogenspadWidget size="full" data={data} />)
    expect(screen.getByText('Slaagkans 92%')).toBeInTheDocument()
    expect(screen.queryByText(/risico/i)).not.toBeInTheDocument()
  })

  it('half-size: toont de canonieke slaagkans, niet de drawdown', () => {
    const data = makeData({ simRows: makeDepleteRows(), backtestSuccessRate: 64 } as Partial<DashboardData>)
    render(<SimVermogenspadWidget size="half" data={data} />)
    expect(screen.getByText('Slaagkans 64%')).toBeInTheDocument()
    expect(screen.queryByText(/risico/i)).not.toBeInTheDocument()
  })

  it('rendert geen badge wanneer het backtest-signaal ontbreekt', () => {
    const data = makeData({ simRows: makeDepleteRows(), backtestSuccessRate: null } as Partial<DashboardData>)
    render(<SimVermogenspadWidget size="full" data={data} />)
    expect(screen.queryByText(/Slaagkans/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/risico/i)).not.toBeInTheDocument()
  })

  // "Nooit 100%": de canonieke bundelwaarde (dashboard-data-loader) clampt de
  // getoonde slaagkans op WEERBAARHEID_DISPLAY_MAX. De widget consumeert dat
  // getal 1-op-1 — hier pinnen we zowel het contract (=99, nooit 100) als de
  // weergave op de gedeelde grens.
  it('display-cap: contract is 99, nooit 100 (epistemische bescheidenheid)', () => {
    expect(WEERBAARHEID_DISPLAY_MAX).toBe(99)
    // Spiegelt de loader-expressie: een ruwe fractie van 1.0 (100% van de
    // startjaren slaagde) mag nooit als 100% verschijnen.
    const clamp = (fraction: number) => Math.min(WEERBAARHEID_DISPLAY_MAX, Math.round(fraction * 100))
    expect(clamp(1.0)).toBe(99)
    expect(clamp(0.999)).toBe(99)
    expect(clamp(0.94)).toBe(94) // normale waarden passeren ongemoeid
    expect(clamp(0)).toBe(0)
  })

  it('full-size: toont de geclampte "Slaagkans 99%", nooit 100%', () => {
    const data = makeData({ simRows: makeDepleteRows(), backtestSuccessRate: WEERBAARHEID_DISPLAY_MAX } as Partial<DashboardData>)
    render(<SimVermogenspadWidget size="full" data={data} />)
    expect(screen.getByText('Slaagkans 99%')).toBeInTheDocument()
    expect(screen.queryByText('Slaagkans 100%')).not.toBeInTheDocument()
  })
})
