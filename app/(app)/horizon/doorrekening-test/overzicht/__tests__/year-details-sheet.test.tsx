/**
 * Component-tests voor `YearDetailsSheet` (Fase G5 —
 * `kun-je-een-mogelijkheid-glittery-waterfall.md`).
 *
 * De sheet is fase-aware: input is een enkele `HybridYearRow` + `assetMeta`
 * + `debtMeta` uit `computeHybridProjection()`. Er wordt geen math gedaan;
 * alle bedragen komen uit de rij.
 *
 * Dekking:
 *  1. Opbouw-fase: badge "Opbouw-fase" + contribution + growth deltas +
 *     savings-asset als eerste rij wanneer `isVirtualSavings`.
 *  2. Afbouw-fase: badge "Afbouw-fase" + withdrawal + growth deltas, geen
 *     contribution-delta.
 *  3. Box3/savings/withdrawal worden alleen getoond als `> 0`.
 *  4. AOW-event zichtbaar wanneer `aowIncomeThisYear > 0`.
 *  5. PV-regels bij `inflationRate > 0 && years > 0`.
 *  6. Close-callback bij X-knop.
 *  7. A11y: `role="dialog"` + `aria-labelledby`.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { YearDetailsSheet } from '../year-details-sheet'
import type { LifeEvent } from '@/lib/horizon-data'
import type { SimCashflow } from '@/lib/fire-simulation'
import type {
  HybridAssetMeta,
  HybridDebtMeta,
  HybridYearRow,
} from '../../calc/hybrid-projection'

// ── jsdom polyfills — gelijk aan andere tests in deze map ──────────────
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
    window.matchMedia = (query: string) =>
      ({
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

// ── Fixtures ───────────────────────────────────────────────────────────

/**
 * Bouwt een `HybridAssetMeta` met savings-asset op index 0 en één echte asset
 * op index 1. Matcht de volgorde die `computeHybridProjection` genereert
 * wanneer `savingsInflow` is gezet.
 */
function makeAssetMeta({ withSavings = true }: { withSavings?: boolean } = {}): HybridAssetMeta[] {
  const meta: HybridAssetMeta[] = []
  if (withSavings) {
    meta.push({
      id: '__savings',
      label: 'Spaarquote-inleg',
      asset_type: 'cash',
      color: '#34d399',
      isVirtualSavings: true,
    })
  }
  meta.push({
    id: 'a1',
    label: 'Beleggingen',
    asset_type: 'investment',
    color: '#10b981',
    isVirtualSavings: false,
  })
  return meta
}

function makeDebtMeta({ withDebt = true }: { withDebt?: boolean } = {}): HybridDebtMeta[] {
  if (!withDebt) return []
  return [
    {
      id: 'd1',
      label: 'Hypotheek',
      debt_type: 'mortgage',
      color: '#ef4444',
    },
  ]
}

/**
 * Opbouw-rij: contribution > 0, growth > 0, withdrawal = 0. Savings op
 * index 0, echte asset op index 1. Dit matcht de shape die
 * `computeHybridProjection` genereert voor pre-fire rijen.
 */
function makeOpbouwRow(overrides: Partial<HybridYearRow> = {}): HybridYearRow {
  return {
    age: 40,
    year: 1,
    phase: 'opbouw',
    assets: 110_000,
    debts: 195_000,
    netWorth: -85_500,
    cumulativeBox3Tax: 500,
    box3TaxThisYear: 500,
    perAssetValues: [6_000, 104_000],
    perDebtValues: [195_000],
    savingsInflowThisYear: 6_000,
    eventCashflowNetThisYear: 0,
    aowIncomeThisYear: 0,
    withdrawalThisYear: 0,
    portfolioGrowthThisYear: 5_000,
    perAssetGrowth: [0, 5_000],
    perAssetContribution: [6_000, 0],
    perAssetWithdrawal: [0, 0],
    perDebtInterest: [5_000],
    perDebtRepayment: [10_000],
    ...overrides,
  }
}

/**
 * Afbouw-rij: contribution = 0, withdrawal > 0, portfolioGrowth > 0. AOW-
 * inkomen wordt separaat ingesteld zodat tests het kunnen forceren.
 */
function makeAfbouwRow(overrides: Partial<HybridYearRow> = {}): HybridYearRow {
  return {
    age: 70,
    year: 31,
    phase: 'afbouw',
    assets: 500_000,
    debts: 0,
    netWorth: 500_000,
    cumulativeBox3Tax: 15_000,
    box3TaxThisYear: 700,
    perAssetValues: [0, 500_000],
    perDebtValues: [],
    savingsInflowThisYear: 0,
    eventCashflowNetThisYear: 0,
    aowIncomeThisYear: 18_000,
    withdrawalThisYear: 20_000,
    portfolioGrowthThisYear: 25_000,
    perAssetGrowth: [0, 25_000],
    perAssetContribution: [0, 0],
    perAssetWithdrawal: [0, 20_000],
    perDebtInterest: [],
    perDebtRepayment: [],
    ...overrides,
  }
}

/**
 * Default props: opbouw-fase, 25 jaar vooruit, 2.5% inflatie. Deflatie-
 * factor ≈ 0.54 — PV van 100k → ~54k, geschikt voor PV-assertions.
 */
function baseProps(
  overrides: Partial<Parameters<typeof YearDetailsSheet>[0]> = {},
): Parameters<typeof YearDetailsSheet>[0] {
  return {
    open: true,
    onClose: vi.fn(),
    row: makeOpbouwRow(),
    assetMeta: makeAssetMeta(),
    debtMeta: makeDebtMeta(),
    currentAge: 15,
    inflationRate: 0.025,
    calendarYear: 2026,
    lifeEvents: [],
    cashflows: [],
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('YearDetailsSheet — opbouw-fase', () => {
  it('toont "Opbouw-fase" badge', () => {
    render(<YearDetailsSheet {...baseProps()} />)
    const badge = screen.getByTestId('year-details-phase-badge')
    expect(badge.textContent).toMatch(/Opbouw-fase/i)
  })

  it('toont savings-asset als eerste rij in bezittingen', () => {
    render(<YearDetailsSheet {...baseProps()} />)
    const assetsSection = screen.getByTestId('year-details-assets')
    // Beide asset-namen moeten aanwezig zijn.
    expect(assetsSection.textContent).toMatch(/Spaarquote-inleg/)
    expect(assetsSection.textContent).toMatch(/Beleggingen/)
    // Savings-asset moet eerst in de DOM staan.
    const savingsIdx = assetsSection.textContent!.indexOf('Spaarquote-inleg')
    const investIdx = assetsSection.textContent!.indexOf('Beleggingen')
    expect(savingsIdx).toBeLessThan(investIdx)
  })

  it('toont contribution + growth deltas in asset-rijen', () => {
    render(<YearDetailsSheet {...baseProps()} />)
    const assetsSection = screen.getByTestId('year-details-assets')
    expect(assetsSection.textContent).toMatch(/Bijdrage/i)
    expect(assetsSection.textContent).toMatch(/Rendement/i)
  })
})

describe('YearDetailsSheet — afbouw-fase', () => {
  it('toont "Afbouw-fase" badge', () => {
    render(
      <YearDetailsSheet
        {...baseProps({ row: makeAfbouwRow(), debtMeta: [] })}
      />,
    )
    const badge = screen.getByTestId('year-details-phase-badge')
    expect(badge.textContent).toMatch(/Afbouw-fase/i)
  })

  it('toont withdrawal + growth deltas, geen contribution', () => {
    render(
      <YearDetailsSheet
        {...baseProps({ row: makeAfbouwRow(), debtMeta: [] })}
      />,
    )
    const assetsSection = screen.getByTestId('year-details-assets')
    expect(assetsSection.textContent).toMatch(/Onttrekking/i)
    expect(assetsSection.textContent).toMatch(/Rendement/i)
    // Contribution is altijd 0 in afbouw → label moet NIET verschijnen.
    expect(assetsSection.textContent).not.toMatch(/Bijdrage/i)
  })

  it('toont withdrawal als uitgave in kosten-sectie', () => {
    render(
      <YearDetailsSheet
        {...baseProps({ row: makeAfbouwRow(), debtMeta: [] })}
      />,
    )
    const costs = screen.getByTestId('year-details-costs')
    expect(costs.textContent).toMatch(/Onttrekking uit portfolio/i)
  })
})

describe('YearDetailsSheet — conditionele kostenrijen', () => {
  it('toont Box 3 regel alleen als box3TaxThisYear > 0', () => {
    render(
      <YearDetailsSheet
        {...baseProps({
          row: makeOpbouwRow({ box3TaxThisYear: 0 }),
        })}
      />,
    )
    const costs = screen.getByTestId('year-details-costs')
    expect(costs.textContent).not.toMatch(/Box 3 belasting/i)
  })

  it('toont spaarquote-bijdrage alleen als savingsInflowThisYear > 0 in opbouw', () => {
    render(
      <YearDetailsSheet
        {...baseProps({
          row: makeOpbouwRow({ savingsInflowThisYear: 0 }),
        })}
      />,
    )
    const costs = screen.getByTestId('year-details-costs')
    expect(costs.textContent).not.toMatch(/Jaarlijkse bijdrage uit spaarquote/i)
  })

  it('verbergt onttrekking-regel wanneer withdrawalThisYear = 0', () => {
    render(
      <YearDetailsSheet
        {...baseProps({
          row: makeAfbouwRow({ withdrawalThisYear: 0 }),
          debtMeta: [],
        })}
      />,
    )
    const costs = screen.getByTestId('year-details-costs')
    expect(costs.textContent).not.toMatch(/Onttrekking uit portfolio/i)
  })
})

describe('YearDetailsSheet — debt-sectie conditioneel', () => {
  it('toont debt-sectie wanneer perDebtValues activiteit hebben', () => {
    render(<YearDetailsSheet {...baseProps()} />)
    const debts = screen.getByTestId('year-details-debts')
    expect(debts.textContent).toMatch(/Hypotheek/)
  })

  it('verbergt debt-sectie wanneer geen schulden in meta', () => {
    render(
      <YearDetailsSheet
        {...baseProps({
          debtMeta: [],
          row: makeOpbouwRow({
            perDebtValues: [],
            perDebtInterest: [],
            perDebtRepayment: [],
            debts: 0,
          }),
        })}
      />,
    )
    expect(screen.queryByTestId('year-details-debts')).not.toBeInTheDocument()
  })

  it('verbergt debt-rij wanneer alle waarden 0 zijn (volledig afgelost)', () => {
    render(
      <YearDetailsSheet
        {...baseProps({
          row: makeOpbouwRow({
            perDebtValues: [0],
            perDebtInterest: [0],
            perDebtRepayment: [0],
            debts: 0,
          }),
        })}
      />,
    )
    // Meta-rij aanwezig maar filter moet hem verbergen → hele sectie weg.
    expect(screen.queryByTestId('year-details-debts')).not.toBeInTheDocument()
  })
})

describe('YearDetailsSheet — AOW-event', () => {
  it('toont AOW-uitkering rij wanneer aowIncomeThisYear > 0', () => {
    render(
      <YearDetailsSheet
        {...baseProps({ row: makeAfbouwRow(), debtMeta: [] })}
      />,
    )
    const events = screen.getByTestId('year-details-events')
    expect(events.textContent).toMatch(/AOW-uitkering/)
    // Bedrag 18.000 (positief, income).
    expect(events.textContent).toMatch(/18\.000/)
  })

  it('verbergt AOW-rij wanneer aowIncomeThisYear = 0', () => {
    render(<YearDetailsSheet {...baseProps() /* opbouw, AOW = 0 */} />)
    expect(screen.queryByTestId('year-details-event-aow')).not.toBeInTheDocument()
  })
})

describe('YearDetailsSheet — event-sectie (overige events)', () => {
  it('toont event-rij wanneer cashflow in het jaar valt (AOW uitgesloten)', () => {
    const event: LifeEvent = {
      id: 'evt-wedding',
      name: 'Bruiloft',
      event_type: 'wedding',
      target_age: 40,
      target_date: null,
      one_time_cost: 15_000,
      monthly_cost_change: 0,
      monthly_income_change: 0,
      duration_months: 0,
      icon: '💍',
      is_active: true,
      sort_order: 0,
      is_indexed: false,
    }
    const cashflow: SimCashflow = {
      id: 'evt-wedding-cost',
      name: 'Bruiloft',
      type: 'one_time',
      direction: 'expense',
      amount: 15_000,
      fromAge: 40,
      toAge: null,
      indexed: false,
    }
    render(
      <YearDetailsSheet
        {...baseProps({ lifeEvents: [event], cashflows: [cashflow] })}
      />,
    )
    const eventsSection = screen.getByTestId('year-details-events')
    expect(eventsSection.textContent).toMatch(/Bruiloft/)
    expect(eventsSection.textContent).toMatch(/−/)
  })

  it('verbergt event-sectie zonder cashflows en zonder AOW', () => {
    render(<YearDetailsSheet {...baseProps() /* zonder events, AOW=0 */} />)
    expect(screen.queryByTestId('year-details-events')).not.toBeInTheDocument()
  })
})

describe('YearDetailsSheet — a11y', () => {
  it('rendert een dialog met aria-labelledby naar de titel', () => {
    render(<YearDetailsSheet {...baseProps()} />)

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()
    const labelId = dialog!.getAttribute('aria-labelledby')
    expect(labelId).toBeTruthy()
    const label = document.getElementById(labelId!)
    expect(label?.textContent).toMatch(/Jaar 2026.*40j/)
  })
})

describe('YearDetailsSheet — sluiten', () => {
  it('roept onClose aan bij klik op sluit-knop', () => {
    const onClose = vi.fn()
    render(<YearDetailsSheet {...baseProps({ onClose })} />)

    const closeBtn = screen.getByRole('button', { name: /sluiten/i })
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })
})

// ── Present-value (huidige waarde) weergave ────────────────────────────
//
// Default-props: age=40, currentAge=15, inflation=0.025 → factor ≈ 0.5394.

describe('YearDetailsSheet — huidige-waarde weergave', () => {
  it('toont PV-regel "≈ € … vandaag" bij asset-totaal', () => {
    render(<YearDetailsSheet {...baseProps()} />)
    const assetsSection = screen.getByTestId('year-details-assets')
    expect(assetsSection.textContent).toMatch(/≈/)
    expect(assetsSection.textContent).toMatch(/vandaag/)
  })

  it('toont géén PV-regel wanneer years = 0 (age === currentAge)', () => {
    render(
      <YearDetailsSheet
        {...baseProps({
          currentAge: 40,
          row: makeOpbouwRow({ age: 40 }),
        })}
      />,
    )
    const sheet = screen.getByTestId('year-details-sheet')
    expect(sheet.textContent).not.toMatch(/vandaag/)
  })

  it('toont géén PV-regel wanneer inflationRate = 0', () => {
    render(<YearDetailsSheet {...baseProps({ inflationRate: 0 })} />)
    const sheet = screen.getByTestId('year-details-sheet')
    expect(sheet.textContent).not.toMatch(/vandaag/)
  })

  it('toont header-deflatie-context met factor bij years > 0 en inflation > 0', () => {
    render(<YearDetailsSheet {...baseProps() /* age=40, cur=15, 2.5% */} />)
    const ctx = screen.getByTestId('year-details-deflation-context')
    expect(ctx.textContent).toMatch(/Inflatie 2\.5%/)
    expect(ctx.textContent).toMatch(/25 jaar van nu/)
    expect(ctx.textContent).toMatch(/×0\.54/)
  })

  it('header-context toont "Huidige waarde" bij years = 0', () => {
    render(
      <YearDetailsSheet
        {...baseProps({
          currentAge: 40,
          row: makeOpbouwRow({ age: 40 }),
        })}
      />,
    )
    const ctx = screen.getByTestId('year-details-deflation-context')
    expect(ctx.textContent).toBe('Huidige waarde')
  })
})

describe('YearDetailsSheet — null row', () => {
  it('toont placeholder wanneer row null is', () => {
    render(<YearDetailsSheet {...baseProps({ row: null })} />)
    const sheet = screen.getByTestId('year-details-sheet')
    expect(sheet.textContent).toMatch(/Geen data voor dit jaar/)
    // Sectie-testids mogen niet renderen.
    expect(screen.queryByTestId('year-details-assets')).not.toBeInTheDocument()
    expect(screen.queryByTestId('year-details-debts')).not.toBeInTheDocument()
    expect(screen.queryByTestId('year-details-costs')).not.toBeInTheDocument()
  })
})
