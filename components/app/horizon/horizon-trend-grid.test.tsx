/**
 * Smoke tests voor HorizonTrendGrid — de eerste UI-component die uit de
 * horizon-client-monoliet is geëxtraheerd (sectie 5b: verloop-grid).
 *
 * We stubben de trend-charts/-messages (die hebben eigen tests) en de
 * FeatureGate, zodat dit puur de structuur + callback-bedrading van
 * HorizonTrendGrid toetst.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { SnapshotForTrend } from '@/components/app/horizon/horizon-helpers'
import { HorizonTrendGrid } from './horizon-trend-grid'

// FeatureGate → render children onvoorwaardelijk (gating wordt elders getest).
vi.mock('@/components/app/feature-gate', () => ({
  FeatureGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

// Stub de trend-charts/-messages — we toetsen HorizonTrendGrid's eigen
// structuur + callbacks, niet het render-gedrag van de kinderen.
vi.mock('@/components/app/horizon/horizon-helpers', () => ({
  ResilienceContextMessage: () => <div data-testid="resilience-context" />,
  ResilienceTrendChart: () => <div data-testid="resilience-chart" />,
  FireAgeContextMessage: () => <div data-testid="fireage-context" />,
  FireAgeTrendChart: () => <div data-testid="fireage-chart" />,
}))

function makeSnapshots(n: number): SnapshotForTrend[] {
  return Array.from({ length: n }, (_, i) => ({
    snapshot_date: `2026-0${(i % 9) + 1}-01`,
    resilience_score: 60 + i,
    net_worth: 100_000 + i * 1_000,
    freedom_percentage: 30 + i,
    fire_age: 55 - i,
  }))
}

function baseProps() {
  return {
    resilienceSnapshots: makeSnapshots(3),
    snapshotResilience: 72,
    healthScoreTotal: 80,
    healthChartOpen: false,
    onToggleHealth: vi.fn(),
    fireAgeChartOpen: false,
    onToggleFireAge: vi.fn(),
    onOpenResilienceReceipt: vi.fn(),
  }
}

describe('HorizonTrendGrid', () => {
  it('rendert beide verloop-secties', () => {
    render(<HorizonTrendGrid {...baseProps()} />)
    expect(screen.getByTestId('health-trend-section')).toBeTruthy()
    expect(screen.getByTestId('fire-age-trend-section')).toBeTruthy()
  })

  it('toont de snapshot-resilience-score (override op healthScoreTotal)', () => {
    render(<HorizonTrendGrid {...baseProps()} />)
    expect(screen.getByText('72/100')).toBeTruthy()
  })

  it('valt terug op healthScoreTotal wanneer geen snapshot-resilience', () => {
    render(<HorizonTrendGrid {...baseProps()} snapshotResilience={null} />)
    expect(screen.getByText('80/100')).toBeTruthy()
  })

  it('toont de laatste FIRE-leeftijd wanneer ≥2 snapshots fire_age hebben', () => {
    // makeSnapshots(3): fire_age = 55, 54, 53 → laatste = 53
    render(<HorizonTrendGrid {...baseProps()} />)
    expect(screen.getByText('53 jr')).toBeTruthy()
  })

  it('roept onToggleHealth aan bij klik op de gezondheids-header', () => {
    const props = baseProps()
    render(<HorizonTrendGrid {...props} />)
    fireEvent.click(screen.getByText('Gezondheidsverloop'))
    expect(props.onToggleHealth).toHaveBeenCalledTimes(1)
  })

  it('roept onToggleFireAge aan bij klik op de FIRE-header', () => {
    const props = baseProps()
    render(<HorizonTrendGrid {...props} />)
    fireEvent.click(screen.getByText('FIRE-verloop'))
    expect(props.onToggleFireAge).toHaveBeenCalledTimes(1)
  })

  it('roept onOpenResilienceReceipt aan bij klik op de score-badge', () => {
    const props = baseProps()
    render(<HorizonTrendGrid {...props} />)
    fireEvent.click(screen.getByTestId('health-score-card'))
    expect(props.onOpenResilienceReceipt).toHaveBeenCalledTimes(1)
  })

  it('rendert de resilience-trendchart wanneer health open is en ≥2 scores', () => {
    render(<HorizonTrendGrid {...baseProps()} healthChartOpen />)
    expect(screen.getByTestId('resilience-chart')).toBeTruthy()
  })

  it('rendert de fire-age-trendchart wanneer fire open is en trend bestaat', () => {
    render(<HorizonTrendGrid {...baseProps()} fireAgeChartOpen />)
    expect(screen.getByTestId('fireage-chart')).toBeTruthy()
  })
})
