/**
 * Fase 3 — Tests voor het dev-only diff-panel in `OverzichtClient`.
 *
 * Scope:
 *  1. Diff-panel is standaard niet zichtbaar (SSR-safe: initieel `false`).
 *  2. Diff-panel verschijnt wanneer `NODE_ENV === 'development'` — vitest
 *     draait onder NODE_ENV='test', dus we forceren via de `?diff=1` query-
 *     parameter om de useEffect-toggle te raken.
 *  3. Summary-row + per-jaar tabel renderen met de gemockte sim-output.
 *
 * Mocking-strategie:
 *  - `useDoorrekeningSim` wordt gemockt zodat de test deterministisch is en
 *    geen runSimulation hoeft te draaien.
 *  - `DoorrekeningChart` wordt gestubbed naar een simpele div — de chart
 *    is elders al getest (`doorrekening-chart.test.tsx`).
 *  - `useInViewAnimation` en andere browser-API's worden niet gebruikt door
 *    het diff-panel zelf, maar we stubben ResizeObserver/IntersectionObserver
 *    voor de zekerheid (chart-mock neutraliseert die afhankelijkheid al).
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

// ── Mocks vóór het laden van overzicht-client ────────────────────────────

vi.mock('../../use-doorrekening-sim', () => ({
  useDoorrekeningSim: () => ({
    rows: [
      { age: 35, endPortfolio: 105_000 },
      { age: 36, endPortfolio: 112_000 },
      { age: 37, endPortfolio: 120_000 },
    ],
    fireAge: 60,
    fireAgeFractional: 60.0,
    firePortfolioAtFire: 900_000,
    requiredFirePortfolio: 850_000,
    fireReachable: true,
    implicitWithdrawalRate: 0.04,
    classic25xTarget: 1_000_000,
    strategy: 'deplete',
    targetEndPortfolio: 0,
  }),
}))

// Chart-stub — voorkomt dat we ResizeObserver en SVG-rendering moeten
// nabouwen; het diff-panel is geen chart-afhankelijk onderdeel.
vi.mock('../doorrekening-chart', () => ({
  DoorrekeningChart: () => <div data-testid="chart-stub" />,
}))

// Composition-chart-stub — dezelfde reden als bij `doorrekening-chart`:
// het diff-panel heeft geen relatie met deze chart en de SVG-rendering
// heeft eigen tests. Isoleert deze suite van Phase B-afhankelijkheden.
vi.mock('../opbouw-composition-chart', () => ({
  OpbouwCompositionChart: () => <div data-testid="composition-chart-stub" />,
}))

// Year-details sheet-stub — is afhankelijk van BottomSheet + portal, wat in
// jsdom flaky kan zijn en geen relatie heeft met het diff-panel.
vi.mock('../year-details-sheet', () => ({
  YearDetailsSheet: () => <div data-testid="year-details-sheet-stub" />,
}))

// next/link → plain anchor zodat render-tests niet afhangen van de router.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

// Ná de mocks: imports van de module-under-test en dependencies die we
// direct gebruiken in de render.
import { OverzichtClient } from '../overzicht-client'
import { DoorrekeningSettingsProvider } from '../../settings-context'

// ── Browser-API stubs (jsdom biedt deze niet) ────────────────────────────
beforeAll(() => {
  const g = globalThis as unknown as {
    ResizeObserver?: unknown
    IntersectionObserver?: unknown
  }
  if (!g.ResizeObserver) {
    g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  }
  if (!g.IntersectionObserver) {
    g.IntersectionObserver = class {
      observe() {} unobserve() {} disconnect() {}
      takeRecords() { return [] }
      root = null
      rootMargin = ''
      thresholds = []
    }
  }
  if (typeof window !== 'undefined' && !window.matchMedia) {
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
  }
})

// ── Test-helpers ─────────────────────────────────────────────────────────

/**
 * Bouwt een minimal-viable props-object voor `OverzichtClient`. Alle velden
 * zijn redelijke defaults; individuele tests kunnen velden overschrijven.
 */
function baseProps() {
  return {
    assets: [
      {
        id: 'a1',
        name: 'Beleggingen',
        current_value: 100_000,
        expected_return: 0.06,
        monthly_contribution: 500,
        asset_type: 'investment',
      },
    ],
    debts: [],
    profile: {
      date_of_birth: '1990-01-01',
      household_type: 'solo',
      net_monthly_income: 4_000,
      savings_rate: 20,
      retirement_expense_method: 'essential_budgets',
    },
    fireParams: { grossReturn: 0.06, inflationRate: 0.02, effectiveSwr: 0.04 },
    netWorth: 100_000,
    totalAssets: 100_000,
    totalDebts: 0,
    yearlyMustExpenses: 30_000,
    lifeEvents: [],
    cashflows: [],
    userAowAge: 67,
    weightedGrossReturn: 0.06,
    savingsRate6m: 20,
    estimatedYearlyIncome: 48_000,
  }
}

function renderOverzicht() {
  // Cast: `baseProps()` levert een losse shape die structureel matcht met de
  // server-side serialisatie die `page.tsx` aanroept. De lokale Asset/Debt-
  // interfaces in overzicht-client zijn expres flexibel (index-signature
  // `[key: string]: unknown`) om die losse JSON-vorm te accepteren. Voor TS
  // casten we door het props-shape van de component heen.
  const props = baseProps() as unknown as Parameters<typeof OverzichtClient>[0]
  return render(
    <DoorrekeningSettingsProvider
      defaults={{ endStrategy: 'deplete', endAge: 90, legacyAmount: 0 }}
    >
      <OverzichtClient {...props} />
    </DoorrekeningSettingsProvider>,
  )
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('OverzichtClient — dev diff-panel', () => {
  const originalLocation = window.location

  beforeEach(() => {
    // vitest-default NODE_ENV is 'test' — de dev-toggle reageert dan alleen
    // op de `?diff=1` query. We zetten die per-test.
  })

  afterEach(() => {
    // Zet window.location terug; vi.stubGlobal maakt die reset makkelijker
    // dan handmatige delete, maar jsdom laat een eenvoudige herdefinitie toe.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('toont het diff-panel niet in de default-render (geen dev, geen query-flag)', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, search: '' },
    })

    renderOverzicht()

    expect(screen.queryByTestId('diff-panel')).not.toBeInTheDocument()
  })

  it('toont het diff-panel wanneer `?diff=1` in de URL staat', () => {
    // De useEffect-toggle leest window.location.search. Door deze vóór de
    // render te stubben wordt `showDiffPanel=true` op mount.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, search: '?diff=1' },
    })

    renderOverzicht()

    expect(screen.getByTestId('diff-panel')).toBeInTheDocument()
    // Summary-row + per-jaar-uitklapper aanwezig.
    expect(screen.getByText(/Vergelijking met \/horizon/i)).toBeInTheDocument()
    expect(screen.getByText(/Δ FIRE-leeftijd/i)).toBeInTheDocument()
    expect(screen.getByText(/Δ Eindvermogen/i)).toBeInTheDocument()
    expect(screen.getByText(/Δ Benodigd nu/i)).toBeInTheDocument()
    expect(screen.getByText(/Per-jaar delta/i)).toBeInTheDocument()
  })
})
