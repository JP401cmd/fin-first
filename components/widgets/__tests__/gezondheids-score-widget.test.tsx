import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GezondheidScoreWidget } from '../gezondheids-score-widget'
import type { DashboardData } from '../widget-renderer'
import type { HealthPillar, HealthScore, HealthScoreInput } from '@/lib/financial-health'
import { computeHealthScoreFromInputs } from '@/lib/financial-health'

/**
 * Regressietests voor de GezondheidScoreWidget (Notion-widgetreview).
 *
 * Dekt de drie goedgekeurde polish-punten:
 *   1. het GETOONDE cijfer is exact de canonieke engine-uitvoer (display-drift-lock,
 *      CLAUDE.md "Testsuite als runtime-assertie voor getoonde berekeningen");
 *   2. een kale/starter-gebruiker krijgt duiding i.p.v. een misleidend laag rood cijfer;
 *   3. de half-size toont de ZWAKSTE 3 pijlers, niet de eerste 3 op volgorde.
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

// ── Helpers ──────────────────────────────────────────────────
function mkPillar(id: string, name: string, score: number): HealthPillar {
  return {
    id,
    name,
    score,
    weight: 1,
    explanation: `${name} uitleg`,
    improvementTip: `${name} tip`,
    actionHref: '/overzicht',
    actionLabel: 'Bekijk',
    rawValue: `${score}`,
  }
}

function bundleWith(health: HealthScore, overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    healthScore: health,
    // Niet-nul → géén starter-staat.
    totalAssets: 50_000,
    totalDebts: 0,
    monthlyIncome: 3000,
    monthlyExpenses: 2000,
    ...overrides,
  } as unknown as DashboardData
}

describe('GezondheidScoreWidget — getoond cijfer = canonieke engine', () => {
  it('mini toont exact computeHealthScoreFromInputs(...).total', () => {
    const input: HealthScoreInput = {
      savingsRate6m: 22,
      totalAssets: 80_000,
      totalDebts: 5_000,
      emergencyFundMonths: 4,
      freedomPct: 35,
      netMonthlyIncome: 3200,
      debtMonthlyPayments: 250,
      largestAssetTypeShare: 0.45,
      budgetCategories: [
        { limit: 1200, spent: 1100 },
        { limit: 300, spent: 280 },
        { limit: 250, spent: 250 },
      ],
    }
    const canonical = computeHealthScoreFromInputs(input)
    render(<GezondheidScoreWidget size="mini" data={bundleWith(canonical)} href="/toekomst" />)
    // Het cijfer op de kaart moet exact het engine-totaal zijn (geen eigen hersom).
    expect(screen.getByText(String(canonical.total))).toBeTruthy()
  })
})

describe('GezondheidScoreWidget — starter / low-data', () => {
  const emptyData = {
    healthScore: {
      total: 21,
      label: 'Kwetsbaar',
      pillars: [mkPillar('savings_rate', 'Spaarquote', 0)],
      previousMonth: null,
      trend: 0,
      activePillarCount: 1,
      budgetingActive: false,
    } as HealthScore,
    totalAssets: 0,
    totalDebts: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0,
  } as unknown as DashboardData

  it('half toont duiding + CTA i.p.v. het misleidende lage cijfer', () => {
    const { container } = render(<GezondheidScoreWidget size="half" data={emptyData} />)
    expect(screen.getByText('Te weinig gegevens')).toBeTruthy()
    const cta = container.querySelector('a[href="/overzicht/bezittingen"]')
    expect(cta).toBeTruthy()
    // Het lage rode cijfer mag NIET als score verschijnen.
    expect(screen.queryByText('21')).toBeNull()
  })

  it('mini toont een neutrale streep i.p.v. het rode cijfer', () => {
    render(<GezondheidScoreWidget size="mini" data={emptyData} href="/toekomst" />)
    expect(screen.getByText('–')).toBeTruthy()
    expect(screen.queryByText('21')).toBeNull()
  })
})

describe('GezondheidScoreWidget — half toont zwakste 3 pijlers', () => {
  const health: HealthScore = {
    total: 55,
    label: 'Redelijk',
    pillars: [
      mkPillar('a', 'Spaarquote', 90),
      mkPillar('b', 'Budget', 85),
      mkPillar('c', 'Noodfonds', 80),
      mkPillar('d', 'Schuldenlast', 20),
      mkPillar('e', 'Vrijheid', 10),
      mkPillar('f', 'Spreiding', 30),
    ],
    previousMonth: null,
    trend: 0,
    activePillarCount: 6,
    budgetingActive: true,
  }

  it('toont de drie laagst scorende pijlers, niet de eerste drie', () => {
    render(<GezondheidScoreWidget size="half" data={bundleWith(health)} />)
    // Zwakste 3: Vrijheid (10), Schuldenlast (20), Spreiding (30).
    expect(screen.getByText('Vrijheid')).toBeTruthy()
    expect(screen.getByText('Schuldenlast')).toBeTruthy()
    expect(screen.getByText('Spreiding')).toBeTruthy()
    // De sterke eerste-op-volgorde pijlers horen NIET in de half-size.
    expect(screen.queryByText('Spaarquote')).toBeNull()
    expect(screen.queryByText('Budget')).toBeNull()
  })
})

describe('GezondheidScoreWidget — trend alleen bij echte vorige-maand-data', () => {
  // Sinds de canonieke horizon-score op /overzicht trendloos is (previousMonth=
  // null), mag de widget GEEN misleidende "Stabiel"-badge tonen — hij lijnt uit
  // met de hero-kaart, die de trend ook alleen bij een echte vergelijking toont.
  const pillars = [
    mkPillar('a', 'Spaarquote', 70),
    mkPillar('b', 'Budget', 60),
    mkPillar('c', 'Noodfonds', 65),
    mkPillar('d', 'Schuldenlast', 55),
    mkPillar('e', 'Vrijheid', 40),
    mkPillar('f', 'Spreiding', 50),
  ]

  it('full zonder vorige maand toont GEEN "Stabiel"-badge en geen "was X"', () => {
    const health: HealthScore = {
      total: 58, label: 'Redelijk', pillars,
      previousMonth: null, trend: 0, activePillarCount: 6, budgetingActive: true,
    }
    render(<GezondheidScoreWidget size="full" data={bundleWith(health)} />)
    expect(screen.queryByText('Stabiel')).toBeNull()
    expect(screen.queryByText(/was /)).toBeNull()
  })

  it('full met vorige maand toont de trend (+delta en "was X")', () => {
    const health: HealthScore = {
      total: 58, label: 'Redelijk', pillars,
      previousMonth: 53, trend: 5, activePillarCount: 6, budgetingActive: true,
    }
    render(<GezondheidScoreWidget size="full" data={bundleWith(health)} />)
    expect(screen.getByText(/\+5/)).toBeTruthy()
    expect(screen.getByText(/was 53/)).toBeTruthy()
  })
})
