/**
 * Snapshot-tests voor `DoorrekeningChart` — verifieert dat per modus
 * de juiste curves en markers zichtbaar zijn.
 *
 * Dekking:
 *  1. Default-render ('both'): beide curves + FIRE-marker + AOW-marker.
 *  2. 'current_only': alleen opbouw-curve + AOW-marker; geen required, geen FIRE.
 *  3. 'required_only': alleen required-curve + AOW-marker; geen opbouw, geen FIRE.
 *  4. 'delta': delta-curve + FIRE-marker (zero-crossing) + AOW-marker.
 *  5. Interactie: klik op segmented tab wisselt zichtbare curves.
 *  6. Strategie-specifieke info-regel per endStrategy.
 *  7. Pensioen: required met null-punten pre-AOW wordt niet gerenderd als pad-break.
 *
 * Verifieert via `data-testid` attrs uit het component:
 *   - `segmented-control`, `segmented-tab-<mode>`
 *   - `curve-opbouw`, `curve-required`, `curve-delta`
 *   - `marker-fire`, `marker-aow`
 *   - `chart-info-text`
 */

import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DoorrekeningChart, type DoorrekeningChartProps } from '../doorrekening-chart'

// jsdom biedt geen ResizeObserver, IntersectionObserver of matchMedia.
// De chart + useInViewAnimation gebruiken deze voor responsive
// width-tracking, scroll-in-view animaties en prefers-reduced-motion
// detectie. No-op stubs volstaan voor snapshot-tests.
beforeAll(() => {
  const g = globalThis as unknown as {
    ResizeObserver?: unknown
    IntersectionObserver?: unknown
  }

  if (!g.ResizeObserver) {
    g.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }

  if (!g.IntersectionObserver) {
    g.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
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

// ── Mock-data ──────────────────────────────────────────────────────────

/** Simpele opbouw-curve: exponentiële groei van 100k → ~1.6M over 30j. */
function makeOpbouw(startAge: number, endAge: number) {
  const rows: Array<{ age: number; netWorth: number }> = []
  let nw = 100_000
  for (let age = startAge; age <= endAge; age++) {
    rows.push({ age, netWorth: Math.round(nw) })
    nw = nw * 1.07 + 15_000
  }
  return rows
}

/** Required-curve: flat 1.2M vanaf currentAge (deplete-achtig). */
function makeRequired(startAge: number, endAge: number, required = 1_200_000) {
  const rows: Array<{ age: number; requiredPortfolio: number | null }> = []
  for (let age = startAge; age <= endAge; age++) {
    rows.push({ age, requiredPortfolio: required })
  }
  return rows
}

/** Pensioen-style required: null vóór AOW, dan waarde vanaf AOW. */
function makePensioenRequired(startAge: number, endAge: number, aowAge: number) {
  const rows: Array<{ age: number; requiredPortfolio: number | null }> = []
  for (let age = startAge; age <= endAge; age++) {
    rows.push({
      age,
      requiredPortfolio: age >= Math.floor(aowAge) ? 900_000 : null,
    })
  }
  return rows
}

function baseProps(overrides: Partial<DoorrekeningChartProps> = {}): DoorrekeningChartProps {
  return {
    opbouwRows: makeOpbouw(35, 90),
    requiredSchedule: makeRequired(35, 90),
    fireAge: 58,
    fireAgeFractional: 57.6,
    aowAge: 67.25,
    endStrategy: 'deplete',
    currentAge: 35,
    endAge: 90,
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('DoorrekeningChart — mode rendering', () => {
  it('rendert in default mode (both) beide curves + FIRE-marker + AOW-marker', () => {
    render(<DoorrekeningChart {...baseProps()} />)

    expect(screen.getByTestId('segmented-control')).toBeInTheDocument()
    expect(screen.getByTestId('curve-opbouw')).toBeInTheDocument()
    expect(screen.getByTestId('curve-required')).toBeInTheDocument()
    expect(screen.getByTestId('marker-fire')).toBeInTheDocument()
    expect(screen.getByTestId('marker-aow')).toBeInTheDocument()
    expect(screen.queryByTestId('curve-delta')).not.toBeInTheDocument()
  })

  it("rendert in 'current_only' alleen opbouw + AOW; geen required, geen FIRE", () => {
    render(<DoorrekeningChart {...baseProps({ mode: 'current_only' })} />)

    expect(screen.getByTestId('curve-opbouw')).toBeInTheDocument()
    expect(screen.queryByTestId('curve-required')).not.toBeInTheDocument()
    expect(screen.queryByTestId('curve-delta')).not.toBeInTheDocument()
    expect(screen.queryByTestId('marker-fire')).not.toBeInTheDocument()
    expect(screen.getByTestId('marker-aow')).toBeInTheDocument()
  })

  it("rendert in 'required_only' alleen required + AOW; geen opbouw, geen FIRE", () => {
    render(<DoorrekeningChart {...baseProps({ mode: 'required_only' })} />)

    expect(screen.getByTestId('curve-required')).toBeInTheDocument()
    expect(screen.queryByTestId('curve-opbouw')).not.toBeInTheDocument()
    expect(screen.queryByTestId('curve-delta')).not.toBeInTheDocument()
    expect(screen.queryByTestId('marker-fire')).not.toBeInTheDocument()
    expect(screen.getByTestId('marker-aow')).toBeInTheDocument()
  })

  it("rendert in 'delta' alleen delta-curve + FIRE (zero-crossing) + AOW", () => {
    render(<DoorrekeningChart {...baseProps({ mode: 'delta' })} />)

    expect(screen.getByTestId('curve-delta')).toBeInTheDocument()
    expect(screen.queryByTestId('curve-opbouw')).not.toBeInTheDocument()
    expect(screen.queryByTestId('curve-required')).not.toBeInTheDocument()
    expect(screen.getByTestId('marker-aow')).toBeInTheDocument()
    // FIRE-marker blijft zichtbaar op de nul-crossing.
    expect(screen.getByTestId('marker-fire')).toBeInTheDocument()
  })
})

describe('DoorrekeningChart — segmented interactie', () => {
  it('wisselt curves wanneer gebruiker op segmented tab klikt', () => {
    render(<DoorrekeningChart {...baseProps()} />)

    // Start: both.
    expect(screen.getByTestId('curve-opbouw')).toBeInTheDocument()
    expect(screen.getByTestId('curve-required')).toBeInTheDocument()

    // Klik "Alleen benodigd".
    fireEvent.click(screen.getByTestId('segmented-tab-required_only'))
    expect(screen.queryByTestId('curve-opbouw')).not.toBeInTheDocument()
    expect(screen.getByTestId('curve-required')).toBeInTheDocument()

    // Klik "Verschil".
    fireEvent.click(screen.getByTestId('segmented-tab-delta'))
    expect(screen.getByTestId('curve-delta')).toBeInTheDocument()
    expect(screen.queryByTestId('curve-required')).not.toBeInTheDocument()
  })

  it('roept onModeChange aan bij controlled-usage', () => {
    const onModeChange = vi.fn()
    render(
      <DoorrekeningChart
        {...baseProps({ mode: 'both', onModeChange })}
      />,
    )

    fireEvent.click(screen.getByTestId('segmented-tab-current_only'))
    expect(onModeChange).toHaveBeenCalledWith('current_only')
  })

  it('segmented tabs hebben correcte aria-attributen (tablist pattern)', () => {
    render(<DoorrekeningChart {...baseProps()} />)

    const tablist = screen.getByTestId('segmented-control')
    expect(tablist).toHaveAttribute('role', 'tablist')

    const activeTab = screen.getByTestId('segmented-tab-both')
    expect(activeTab).toHaveAttribute('role', 'tab')
    expect(activeTab).toHaveAttribute('aria-selected', 'true')

    const inactiveTab = screen.getByTestId('segmented-tab-delta')
    expect(inactiveTab).toHaveAttribute('aria-selected', 'false')
  })
})

describe('DoorrekeningChart — strategie info-regel', () => {
  it('toont perpetual-tekst', () => {
    render(<DoorrekeningChart {...baseProps({ endStrategy: 'perpetual' })} />)
    expect(screen.getByTestId('chart-info-text')).toHaveTextContent(/eeuwigdurende/i)
  })

  it('toont pensioen-tekst met AOW-leeftijd', () => {
    render(<DoorrekeningChart {...baseProps({ endStrategy: 'pensioen', aowAge: 67.25 })} />)
    expect(screen.getByTestId('chart-info-text')).toHaveTextContent(/pensioen/i)
    expect(screen.getByTestId('chart-info-text')).toHaveTextContent('67.3')
  })

  it('toont legacy-tekst met formatted legacyAmount', () => {
    render(
      <DoorrekeningChart
        {...baseProps({ endStrategy: 'legacy', legacyAmount: 500_000 })}
      />,
    )
    expect(screen.getByTestId('chart-info-text')).toHaveTextContent(/legacy/i)
    expect(screen.getByTestId('chart-info-text')).toHaveTextContent(/inflatie/i)
  })

  it('toont deplete-tekst met endAge', () => {
    render(<DoorrekeningChart {...baseProps({ endStrategy: 'deplete', endAge: 92 })} />)
    expect(screen.getByTestId('chart-info-text')).toHaveTextContent(/deplete/i)
    expect(screen.getByTestId('chart-info-text')).toHaveTextContent('92')
  })
})

describe('DoorrekeningChart — opbouw_afbouw 5e mode (Fase G4)', () => {
  /**
   * Bouw een simpele hybrid-rij reeks met een opbouw-stijging tot fireAge
   * en een geleidelijke afbouw daarna. 'phase' wordt expliciet gezet
   * zodat het component de kleur-split correct kan uitvoeren.
   */
  function makeHybridRows(startAge: number, endAge: number, fireAge: number) {
    const rows: Array<{ age: number; netWorth: number; phase: 'opbouw' | 'afbouw' }> = []
    let nw = 100_000
    for (let age = startAge; age <= endAge; age++) {
      rows.push({
        age,
        netWorth: Math.round(nw),
        phase: age < fireAge ? 'opbouw' : 'afbouw',
      })
      // Stijgen in opbouw-fase, langzaam dalen in afbouw-fase.
      nw = age < fireAge ? nw * 1.07 + 15_000 : nw * 0.98
    }
    return rows
  }

  it('rendert in opbouw_afbouw-mode twee aparte paden (opbouw + afbouw)', () => {
    render(
      <DoorrekeningChart
        {...baseProps({
          mode: 'opbouw_afbouw',
          hybridRows: makeHybridRows(35, 90, 58),
        })}
      />,
    )

    expect(screen.getByTestId('path-opbouw')).toBeInTheDocument()
    expect(screen.getByTestId('path-afbouw')).toBeInTheDocument()
  })

  it('opbouw-pad krijgt horizon-goud stroke en afbouw-pad ink-2', () => {
    render(
      <DoorrekeningChart
        {...baseProps({
          mode: 'opbouw_afbouw',
          hybridRows: makeHybridRows(35, 90, 58),
        })}
      />,
    )

    const opbouw = screen.getByTestId('path-opbouw')
    const afbouw = screen.getByTestId('path-afbouw')
    // Opbouw-kleur matcht COLOR_OPBOUW-token (begint met 'var(--hor-t').
    expect(opbouw.getAttribute('stroke')).toMatch(/hor-t|horizon-700/)
    // Afbouw-kleur is neutraal ink-2.
    expect(afbouw.getAttribute('stroke')).toBe('var(--ink-2)')
  })

  it('default-mode is opbouw_afbouw wanneer hybridRows meegegeven is en geen mode-prop', () => {
    render(
      <DoorrekeningChart
        {...baseProps({
          hybridRows: makeHybridRows(35, 90, 58),
          // bewust GEEN mode-prop → component moet default kiezen.
        })}
      />,
    )

    // Beide hybrid-paden aanwezig.
    expect(screen.getByTestId('path-opbouw')).toBeInTheDocument()
    expect(screen.getByTestId('path-afbouw')).toBeInTheDocument()
    // De 4 legacy-curves zijn NIET zichtbaar in deze mode.
    expect(screen.queryByTestId('curve-opbouw')).not.toBeInTheDocument()
    expect(screen.queryByTestId('curve-required')).not.toBeInTheDocument()
    expect(screen.queryByTestId('curve-delta')).not.toBeInTheDocument()
  })

  it('verticale stippellijn "Kruispunt" is zichtbaar wanneer fireAgeFractional binnen bereik ligt', () => {
    render(
      <DoorrekeningChart
        {...baseProps({
          mode: 'opbouw_afbouw',
          hybridRows: makeHybridRows(35, 90, 58),
        })}
      />,
    )

    const crossover = screen.getByTestId('crossover-line')
    expect(crossover).toBeInTheDocument()
    // Label "Kruispunt" verschijnt in uppercase bovenin.
    expect(crossover.textContent).toMatch(/kruispunt/i)
  })

  it('crossover-line is ook zichtbaar in andere modes (both/delta)', () => {
    render(
      <DoorrekeningChart {...baseProps({ mode: 'both' })} />,
    )
    expect(screen.getByTestId('crossover-line')).toBeInTheDocument()
  })

  it('geen crossover-line wanneer fireAgeFractional null is', () => {
    render(
      <DoorrekeningChart
        {...baseProps({ fireAge: null, fireAgeFractional: null })}
      />,
    )
    expect(screen.queryByTestId('crossover-line')).not.toBeInTheDocument()
  })

  it('zonder crossover (fireAgeFractional null) rendert alleen opbouw-pad', () => {
    const rows = makeHybridRows(35, 90, 58).map((r) => ({
      ...r,
      // Forceer alle rijen als 'opbouw' — visualiseert het "nooit FIRE"-pad.
      phase: 'opbouw' as const,
    }))
    render(
      <DoorrekeningChart
        {...baseProps({
          mode: 'opbouw_afbouw',
          fireAge: null,
          fireAgeFractional: null,
          hybridRows: rows,
        })}
      />,
    )

    expect(screen.getByTestId('path-opbouw')).toBeInTheDocument()
    expect(screen.queryByTestId('path-afbouw')).not.toBeInTheDocument()
  })

  it('segmented control toont "Opbouw→Afbouw"-knop als eerste positie', () => {
    render(
      <DoorrekeningChart
        {...baseProps({
          mode: 'opbouw_afbouw',
          hybridRows: makeHybridRows(35, 90, 58),
        })}
      />,
    )

    const tablist = screen.getByTestId('segmented-control')
    const firstTab = tablist.querySelectorAll('[role="tab"]')[0]
    expect(firstTab).toBeTruthy()
    expect(firstTab?.getAttribute('data-testid')).toBe('segmented-tab-opbouw_afbouw')
  })
})

describe('DoorrekeningChart — pensioen null-required edge case', () => {
  it('rendert required-curve ook als vroege waarden null zijn (geen crash, curve aanwezig)', () => {
    render(
      <DoorrekeningChart
        {...baseProps({
          endStrategy: 'pensioen',
          requiredSchedule: makePensioenRequired(35, 90, 67),
          fireAge: 67,
          fireAgeFractional: 67.0,
        })}
      />,
    )

    // De curve moet bestaan — hij start gewoon pas later via path-break.
    expect(screen.getByTestId('curve-required')).toBeInTheDocument()
    expect(screen.getByTestId('marker-aow')).toBeInTheDocument()
  })
})
