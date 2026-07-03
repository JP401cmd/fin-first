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
import { HorizonTrendGrid, detectEngineBronTransition } from './horizon-trend-grid'

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

  it('toont altijd de live healthScoreTotal in de badge (SSoT, AC-1)', () => {
    // Voorheen overschreef een snapshot-resilience dit getal (de bug). De badge
    // toont nu uitsluitend de live score; de snapshot voedt enkel de trendlijn.
    // makeSnapshots(3) levert resilience_score 60/61/62 — een AFWIJKENDE snapshot —
    // maar de badge volgt de live healthScoreTotal (80), niet die snapshot.
    render(<HorizonTrendGrid {...baseProps()} />)
    expect(screen.getByText('80/100')).toBeTruthy()
    // De afwijkende snapshot-score verschijnt NIET als huidig getal in de badge.
    expect(screen.queryByText('62/100')).toBeNull()
  })

  it('toont de live healthScoreTotal in de badge ÓÓK zonder snapshots (AC-2)', () => {
    // Geen historie: het huidige getal moet nog steeds de live score zijn.
    render(<HorizonTrendGrid {...baseProps()} resilienceSnapshots={[]} healthScoreTotal={47} />)
    expect(screen.getByText('47/100')).toBeTruthy()
  })

  it('badge-title volgt het getoonde live getal (AC-4)', () => {
    // De aria/title-context noemt exact het getoonde getal — geen snapshot-getal.
    render(<HorizonTrendGrid {...baseProps()} healthScoreTotal={47} resilienceSnapshots={[]} />)
    expect(screen.getByTitle('Financiële Gezondheid: 47 / 100')).toBeTruthy()
  })

  it('toont de "gebruik de app langer"-fallback bij <2 gezondheids-snapshots (trendhistorie ≥2-drempel)', () => {
    // Eén snapshot < drempel → géén trendchart, wél de uitleg-fallback.
    render(
      <HorizonTrendGrid
        {...baseProps()}
        resilienceSnapshots={makeSnapshots(1)}
        healthChartOpen
      />,
    )
    expect(screen.queryByTestId('resilience-chart')).toBeNull()
    expect(
      screen.getByText(/Gebruik de app langer om het verloop in je financiële gezondheid/i),
    ).toBeTruthy()
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

  it('toont GEEN "rekenwijze gewijzigd"-annotatie zonder engine_bron-overgang (V15)', () => {
    // baseProps-snapshots dragen geen engine_bron → alles telt als 'v2' → geen knik.
    render(<HorizonTrendGrid {...baseProps()} fireAgeChartOpen />)
    expect(screen.queryByTestId('engine-bron-transition-note')).toBeNull()
  })

  it('toont de "rekenwijze gewijzigd"-annotatie bij een engine_bron-overgang (V15)', () => {
    const withTransition: SnapshotForTrend[] = [
      { snapshot_date: '2026-05-01', resilience_score: 60, net_worth: 100_000, freedom_percentage: 30, fire_age: 55, score_version: 2, engine_bron: 'v2' },
      { snapshot_date: '2026-06-01', resilience_score: 61, net_worth: 101_000, freedom_percentage: 31, fire_age: 54, score_version: 2, engine_bron: 'kernel' },
    ]
    render(<HorizonTrendGrid {...baseProps()} resilienceSnapshots={withTransition} fireAgeChartOpen />)
    const note = screen.getByTestId('engine-bron-transition-note')
    // Datum-format is tijdzone-gevoelig; assert alleen op de stabiele tekst + jaar.
    expect(note.textContent).toMatch(/Rekenwijze gewijzigd op .*2026 — een knik/)
  })
})

describe('detectEngineBronTransition (V15)', () => {
  const snap = (snapshot_date: string, engine_bron: string | null) => ({ snapshot_date, engine_bron })

  it('geen overgang (één rekenwijze) → null', () => {
    expect(detectEngineBronTransition([snap('2026-05-01', 'v2'), snap('2026-06-01', 'v2')])).toBeNull()
    expect(detectEngineBronTransition([snap('2026-05-01', 'kernel'), snap('2026-06-01', 'kernel')])).toBeNull()
  })

  it('null → kernel = overgang → de datum van het kernel-punt (null telt als v2)', () => {
    expect(
      detectEngineBronTransition([snap('2026-05-01', null), snap('2026-06-01', 'kernel')]),
    ).toBe('2026-06-01')
  })

  it('kernel → v2 = ook een overgang → de datum van het v2-punt', () => {
    expect(
      detectEngineBronTransition([snap('2026-05-01', 'kernel'), snap('2026-06-01', 'v2')]),
    ).toBe('2026-06-01')
  })

  it('alles-null (allemaal v2) → null', () => {
    expect(
      detectEngineBronTransition([snap('2026-05-01', null), snap('2026-06-01', null), snap('2026-07-01', null)]),
    ).toBeNull()
  })
})
