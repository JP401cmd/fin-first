import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PensioenAowWidget } from '../pensioen-aow-widget'
import type { DashboardData } from '../widget-renderer'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { NL_AOW_MONTHLY } from '@/lib/constants'

/**
 * Regressietests voor de PensioenAowWidget (Notion-widgetreview Pensioen / AOW).
 *
 * Dekt de drie doorgevoerde punten:
 *   1. HIGH-1 — de GETOONDE AOW-leeftijd is exact de cohort-correcte engine-uitvoer
 *      (`lookupAowAge().years`), NIET de hardcoded 67-fallback (display-drift-lock,
 *      CLAUDE.md "Testsuite als runtime-assertie voor getoonde berekeningen");
 *   2. MED-2 — dekking rekent op de canonieke rolling maanduitgave
 *      (`recentMonthlyExpenses`), niet op de losse kalendermaand-som die vroeg in de
 *      maand naar ~0 uitschiet en dan misleidend "AOW dekt 100%" zou tonen;
 *   3. optie B — verwacht aanvullend pensioen (`pensionMonthlyGross`) verschijnt.
 */

// WidgetShell full-size wikkelt content in ScrollableContent → ResizeObserver.
// matchMedia + IntersectionObserver worden al globaal gemockt (test/setup.ts).
beforeAll(() => {
  if (typeof globalThis !== 'undefined' && !globalThis.ResizeObserver) {
    class MockResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    ;(globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
      MockResizeObserver as unknown as typeof ResizeObserver
  }
})

// Cohort-rij gespiegeld uit supabase/migrations/…create_aow_leeftijd.sql:
// geboren 1985-04-01 t/m 1988-12-31 → AOW op 69 jaar (NIET 67).
const COHORT_1986: AowLeeftijdRow = {
  id: '11',
  birth_date_from: '1985-04-01',
  birth_date_through: '1988-12-31',
  aow_years: 69,
  aow_months: 0,
  is_definitive: false,
  source: 'test',
}
const EXPECTED_AOW_AGE = lookupAowAge([COHORT_1986], '1986-05-01').years // = 69

function makeData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    currentAge: 40,
    // Loader zet dit uit lookupAowAge — hier pinnen we op dezelfde engine-uitvoer.
    aowAge: EXPECTED_AOW_AGE,
    monthlyExpenses: 0, // vroeg-in-de-maand: losse maand ~0 (mag NIET de dekking sturen)
    recentMonthlyExpenses: 3000, // canonieke rolling-maand → stuurt de dekking
    dailyExpenseRate: 100,
    grossReturn: 0.07,
    inflationRate: 0.02,
    fireTarget: 500000,
    pensionMonthlyGross: null,
    ...overrides,
  } as unknown as DashboardData
}

describe('PensioenAowWidget — HIGH-1 cohort-correcte AOW-leeftijd', () => {
  it('toont de cohort-leeftijd (69) en jaren-tot-AOW = 69 − leeftijd, niet 67', () => {
    render(<PensioenAowWidget size="half" data={makeData()} />)
    // Cohort 1986 → 69, dus 69 − 40 = 29 jaar tot AOW.
    expect(EXPECTED_AOW_AGE).toBe(69)
    expect(screen.getByText('29 jaar')).toBeTruthy()
    expect(screen.getByText('tot AOW (69)')).toBeTruthy()
    // De oude hardcoded fallback (67 → 27 jaar) mag nergens meer opduiken.
    expect(screen.queryByText('tot AOW (67)')).toBeNull()
    expect(screen.queryByText('27 jaar')).toBeNull()
  })
})

describe('PensioenAowWidget — MED-2 dekking op rolling maanduitgave', () => {
  it('gebruikt recentMonthlyExpenses, niet de ~0 losse maand (geen misleidend 100%)', () => {
    render(<PensioenAowWidget size="half" data={makeData()} />)
    // round(1581,55 / 3000 × 100) = 53%.
    const pct = Math.round((NL_AOW_MONTHLY / 3000) * 100)
    expect(screen.getByText(`AOW dekt ${pct}% van je uitgaven`)).toBeTruthy()
    // De losse-maand-som (0) zou 0% of (bij deling door 0) 100% geven — beide fout.
    expect(screen.queryByText('AOW dekt 100% van je uitgaven')).toBeNull()
  })
})

describe('PensioenAowWidget — optie B aanvullend pensioen', () => {
  it('toont het verwachte aanvullend pensioen als pensionMonthlyGross gezet is', () => {
    render(<PensioenAowWidget size="full" data={makeData({ pensionMonthlyGross: 1200 })} />)
    expect(screen.getByText('Aanvullend pensioen (verwacht)')).toBeTruthy()
    expect(screen.getByText('2e pijler, bruto')).toBeTruthy()
  })

  it('verbergt de pensioensectie zonder pensioen-events', () => {
    render(<PensioenAowWidget size="full" data={makeData({ pensionMonthlyGross: null })} />)
    expect(screen.queryByText('Aanvullend pensioen (verwacht)')).toBeNull()
  })
})
