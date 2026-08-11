/**
 * Component-test voor de rendement-cel in `PortfolioSummary`.
 *
 * Dit bestand bestond niet toen de grondslag van die cel omging van
 * `(totalValue − totalCost) / totalCost` naar de canonieke P&L-motor
 * (`totalPnL / totalInvested`). Die overstap introduceerde een tak die er
 * daarvóór niet was — een bedrag dat `null` kan zijn — en daarmee twee defecten
 * die geen enkele bestaande test raakte:
 *
 *   1. de subregel rendeerde letterlijk "null sinds aankoop";
 *   2. het rendement viel weg voor iedereen zonder transactiehistorie.
 *
 * Beide zijn hier vastgepind, samen met de bestaande regels die heel moesten
 * blijven (periode ≠ 'Alles' komt uit de benchmark-motor, streepje bij
 * ontbrekende koershistorie).
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PortfolioSummary, type PortfolioSummaryProps } from './portfolio-summary'
import { TIME_PERIODS, type ComparisonResult } from '@/lib/benchmark-comparison'
import { resolveFireParamsWithAssumptions } from '@/lib/fire-params'
import { NL_SWR } from '@/lib/constants'

// De weergavemodus-provider en de privacy-hook zitten niet in deze test-render;
// stub ze op hun neutrale stand (volledig, niet gemaskeerd).
vi.mock('@/lib/hooks/use-privacy', () => ({ useMaskedAmounts: () => ({ masked: false }) }))
vi.mock('@/lib/display-mode', () => ({ useDisplayMode: () => ({ mode: 'full' }) }))

const period = (id: string) => TIME_PERIODS.find((p) => p.id === id)!

function props(over: Partial<PortfolioSummaryProps> = {}): PortfolioSummaryProps {
  return {
    totalValue: 300000,
    totalPnL: 75000,
    totalInvested: 225000,
    openPositionsCount: 3,
    todayChangeEur: null,
    todayChangePct: null,
    forwardDividendNetNl: null,
    yearlyEssentialExpenses: 0,
    effectiveSwr: null,
    activePeriod: period('all'),
    comparison: null,
    assetClassBreakdown: [],
    concentrationTop3Pct: null,
    ...over,
  }
}

/** De tekst van de cel met de gegeven kicker (kicker + bedrag + subregel). */
function cellText(kicker: string): string {
  const label = screen.getByText(kicker)
  const cell = label.parentElement
  if (!cell) throw new Error(`Geen cel rond kicker "${kicker}"`)
  return (cell.textContent || '').replace(/\s+/g, ' ').trim()
}

describe('PortfolioSummary — rendement bij periode "Alles"', () => {
  it('rekent het rendement over de hele historie uit de P&L-motor', () => {
    render(<PortfolioSummary {...props()} />)
    // 75.000 / 225.000 = 33,3%
    expect(cellText('Rendement')).toContain('+33.3%')
    expect(cellText('Rendement')).toContain('sinds aankoop')
  })

  it('toont een negatief rendement met het juiste teken', () => {
    render(<PortfolioSummary {...props({ totalPnL: -22500, totalInvested: 225000 })} />)
    expect(cellText('Rendement')).toContain('-10.0%')
  })

  it('zegt "nog geen inleg bekend" in plaats van het woord null', () => {
    // Regressie: zonder inleg is het bedrag null en plakte de subregel dat
    // letterlijk in de tekst.
    render(<PortfolioSummary {...props({ totalPnL: 0, totalInvested: 0 })} />)
    const text = cellText('Rendement')
    expect(text).not.toContain('null')
    expect(text).toContain('nog geen inleg bekend')
  })
})

describe('PortfolioSummary — rendement bij een gekozen periode', () => {
  const comparison = {
    portfolio: { returnPct: 8 },
  } as unknown as ComparisonResult

  it('neemt het periode-rendement uit de benchmark-motor, niet uit de eigen som', () => {
    render(<PortfolioSummary {...props({ activePeriod: period('1y'), comparison })} />)
    const text = cellText('Rendement')
    expect(text).toContain('+8.0%')
    expect(text).toContain(period('1y').windowLabel)
    // Niet het sinds-aankoop-getal.
    expect(text).not.toContain('33.3')
  })

  it('toont een streepje wanneer de koershistorie ontbreekt', () => {
    const zonder = { portfolio: { returnPct: null } } as unknown as ComparisonResult
    render(<PortfolioSummary {...props({ activePeriod: period('6m'), comparison: zonder })} />)
    expect(cellText('Rendement')).toContain('koershistorie ontbreekt')
  })

  it('meldt dat er nog gerekend wordt zolang de vergelijking niet binnen is', () => {
    render(<PortfolioSummary {...props({ activePeriod: period('3m'), comparison: null })} />)
    expect(cellText('Rendement')).toContain('wordt berekend')
  })
})

describe('PortfolioSummary — marktwaarde-subregel', () => {
  it('noemt het aantal open posities in plaats van een inleg-bedrag', () => {
    render(<PortfolioSummary {...props({ openPositionsCount: 14 })} />)
    const text = cellText('Marktwaarde')
    expect(text).toContain('14 posities')
    expect(text).not.toContain('ingelegd')
  })

  it('vervoegt het enkelvoud', () => {
    render(<PortfolioSummary {...props({ openPositionsCount: 1 })} />)
    expect(cellText('Marktwaarde')).toContain('1 positie')
  })
})

/**
 * FIRE-deck-regel — de SWR-grondslag.
 *
 * De hero deelde eerder door de app-brede constante `NL_SWR` (de no-profiel-
 * fallback), terwijl élk ander FIRE-oppervlak — inclusief de SWR-monitor-widget
 * die náást deze pagina zichtbaar kan zijn — de gepersonaliseerde
 * `effectiveSwr` gebruikt. Dezelfde gebruiker zag daardoor twee verschillende
 * "veilige onttrekking"-percentages. Deze suite pint vast dat het getoonde
 * percentage uit de doorgegeven grondslag komt en nergens anders vandaan.
 */
describe('PortfolioSummary — FIRE-deck SWR-grondslag', () => {
  const fireDeck = (over: Partial<PortfolioSummaryProps> = {}) =>
    props({ totalValue: 1_000_000, yearlyEssentialExpenses: 24_000, ...over })

  /** De regel met de FIRE-framing (italic deck onder de allocatie-strip). */
  const deckText = () =>
    (screen.getByText(/portefeuille/i).textContent || '').replace(/\s+/g, ' ').trim()

  it('toont de onttrekkingsvoet van DE GEBRUIKER, niet de NL-standaard', () => {
    // Precies de call die `loadHoldingsData` doet: profielkeuze wint van de
    // jaarlaag, jaarlaag wint van de TS-constanten. Geen los getal in de test —
    // als de keten verandert, beweegt de verwachting mee.
    const { effectiveSwr } = resolveFireParamsWithAssumptions(
      { expected_return: 0.09, inflation_rate: 0.02 },
      [],
    )
    render(<PortfolioSummary {...fireDeck({ effectiveSwr })} />)

    const pct = (effectiveSwr * 100).toFixed(1).replace('.', ',')
    expect(deckText()).toContain(`Bij ${pct}% onttrekking`)

    // En expliciet NIET de oude grondslag: dit is de drift die de kaart meldde.
    const oud = (NL_SWR * 100).toFixed(1).replace('.', ',')
    expect(pct).not.toBe(oud)
    expect(deckText()).not.toContain(`Bij ${oud}% onttrekking`)
  })

  it('rekent de jaren-dekking met diezelfde voet door', () => {
    const { effectiveSwr } = resolveFireParamsWithAssumptions(
      { expected_return: 0.09, inflation_rate: 0.02 },
      [],
    )
    render(<PortfolioSummary {...fireDeck({ effectiveSwr })} />)
    const jaren = (1_000_000 / (24_000 / effectiveSwr)).toFixed(1).replace('.', ',')
    expect(deckText()).toContain(`${jaren} jaar`)
  })

  it('blijft byte-identiek aan vroeger voor een default-profiel', () => {
    // Leeg profiel + lege jaarlaag ⇒ de keten valt per constructie op NL_SWR
    // uit. Voor die (grootste) groep verandert er dus niets op het scherm.
    const { effectiveSwr } = resolveFireParamsWithAssumptions({}, [])
    expect(effectiveSwr).toBeCloseTo(NL_SWR, 12)
    render(<PortfolioSummary {...fireDeck({ effectiveSwr })} />)
    expect(deckText()).toContain(`Bij ${(NL_SWR * 100).toFixed(1).replace('.', ',')}% onttrekking`)
  })

  it('valt zonder grondslag terug op de SWR-vrije bruto-framing', () => {
    // Geen server-load ⇒ geen grondslag. Dan liever géén percentage dan een
    // percentage dat niet van deze gebruiker is.
    render(<PortfolioSummary {...fireDeck({ effectiveSwr: null })} />)
    expect(deckText()).toContain('zonder rendement-aanname')
    expect(deckText()).not.toContain('onttrekking')
  })

  it('verbergt de deck-regel zonder essentiële uitgaven', () => {
    render(<PortfolioSummary {...props({ effectiveSwr: NL_SWR })} />)
    expect(screen.queryByText(/onttrekking|essentiële uitgaven/i)).toBeNull()
  })
})

describe('PortfolioSummary — Box 3 staat niet meer op dit oppervlak', () => {
  it('rendert geen Box 3-rij', () => {
    render(<PortfolioSummary {...props()} />)
    expect(screen.queryByText(/box 3/i)).toBeNull()
  })
})
