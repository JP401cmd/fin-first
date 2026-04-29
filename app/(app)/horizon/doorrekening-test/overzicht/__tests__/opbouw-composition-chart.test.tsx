/**
 * Component-tests voor `OpbouwCompositionChart` (Fases B + D —
 * `kun-je-een-mogelijkheid-glittery-waterfall.md`).
 *
 * Dekking:
 *  1. `by_type` view rendert N asset-layers + M debt-layers per leeftijd.
 *  2. `by_asset` view rendert een langere layer-lijst.
 *  3. Toggle-klik (`composition-toggle-by-asset`) roept `onViewChange` aan.
 *  4. Geen schulden → geen `debt-bar-*` in de DOM.
 *  5. `fireAgeFractional === null` → geen `marker-fire` zichtbaar.
 *  6. A11y: `role="img"` op SVG, `role="tablist"` + 2 `role="tab"` items
 *     met keyboard-cycling via `ArrowRight`/`ArrowLeft`/`Home`/`End`.
 *  7. Tooltip: focus op een age-column kolom spiegelt de breakdown naar
 *     de `aria-live` regio met de correcte bedragen.
 *  8. Fase D: meerdere debt-layers worden gestapeld gerenderd per leeftijd,
 *     met `debt-bar-{age}-{layerIdx}` testids.
 *  9. Fase D: legend is opgedeeld in asset-blok (`composition-legend-assets`)
 *     en debt-blok (`composition-legend-debts`).
 * 10. Fase D: tooltip bevat zowel asset- als debt-breakdown.
 *
 * Verifieert via `data-testid` attrs:
 *   composition-chart, composition-toggle, composition-toggle-by-type,
 *   composition-toggle-by-asset, composition-legend,
 *   composition-legend-assets, composition-legend-debts,
 *   bar-{age}, debt-bar-{age}, debt-bar-{age}-{layerIdx},
 *   marker-fire, marker-aow, netto-line, netto-toggle.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import {
  OpbouwCompositionChart,
  type OpbouwCompositionChartProps,
} from '../opbouw-composition-chart'
import type {
  CompositionResult,
  CompositionLayer,
} from '../../calc/opbouw-composition'

// ── jsdom polyfills — gelijk aan doorrekening-chart.test.tsx ───────────
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
      takeRecords() {
        return []
      }
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

const DEFAULT_COLORS = [
  '#22c55e', '#3b82f6', '#10b981', '#8b5cf6', '#d97706', '#f59e0b',
]

const DEFAULT_DEBT_COLORS = [
  '#e11d48', '#dc2626', '#f97316', '#ea580c', '#be123c', '#b91c1c',
]

function buildLayers(keys: string[], palette: string[]): CompositionLayer[] {
  return keys.map((key, i) => ({
    key,
    label: `Layer ${key}`,
    color: palette[i % palette.length],
    icon: 'Wallet',
  }))
}

/**
 * Bouw een `CompositionResult` met N asset-layers, optioneel M debt-layers,
 * en een range jaar-rijen. Waarden zijn lineair groeiend per jaar zodat
 * stacks zichtbaar onderscheid hebben bij de snapshot-test.
 */
function makeResult({
  view = 'by_type',
  assetKeys,
  debtKeys = ['hypotheek'],
  startAge = 40,
  years = 10,
  withDebt = true,
}: {
  view?: 'by_type' | 'by_asset'
  assetKeys: string[]
  debtKeys?: string[]
  startAge?: number
  years?: number
  withDebt?: boolean
}): CompositionResult {
  const assetLayers = buildLayers(assetKeys, DEFAULT_COLORS)
  const debtLayersFull = buildLayers(debtKeys, DEFAULT_DEBT_COLORS)
  const debtLayers = withDebt ? debtLayersFull : []

  const rows = Array.from({ length: years }, (_, yr) => {
    // Lineair toenemende asset-layer-waarden.
    const assetVals = assetLayers.map(
      (_l, i) => 10_000 + yr * 2_000 + i * 5_000,
    )
    // Lineair afnemende debt-layer-waarden (aflossing visualiseren).
    const debtVals = withDebt
      ? debtLayers.map((_l, i) => 25_000 - yr * 500 + i * 2_000)
      : []
    const assetsTotal = assetVals.reduce((s, v) => s + v, 0)
    const debtsTotal = debtVals.reduce((s, v) => s + v, 0)
    return {
      age: startAge + yr,
      // Fase G3: alle CompositionYearRow hebben nu een `phase`-veld. Voor
      // deze mock is altijd 'opbouw' voldoende — we testen het chart-
      // component, niet de phase-grens.
      phase: 'opbouw' as const,
      assetLayers: assetVals,
      debtLayers: debtVals,
      netWorth: assetsTotal - debtsTotal,
      cumulativeBox3Tax: 0,
    }
  })

  return { view, assetLayers, debtLayers, rows }
}

function baseProps(
  overrides: Partial<OpbouwCompositionChartProps> = {},
): OpbouwCompositionChartProps {
  return {
    result: makeResult({
      assetKeys: ['cash', 'investment', 'retirement'],
      debtKeys: ['hypotheek', 'persoonlijke_lening'],
    }),
    currentAge: 40,
    endAge: 49,
    fireAgeFractional: 45.5,
    aowAge: 67.25,
    view: 'by_type',
    onViewChange: vi.fn(),
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('OpbouwCompositionChart — by_type basis-render', () => {
  it('rendert 3 asset-layers en een debt-bar-group per leeftijd', () => {
    render(<OpbouwCompositionChart {...baseProps()} />)

    // Chart-container aanwezig.
    expect(screen.getByTestId('composition-chart')).toBeInTheDocument()

    // Voor elk van de 10 rijen een bar-group + debt-bar-group (2 layers).
    for (let age = 40; age <= 49; age++) {
      expect(screen.getByTestId(`bar-${age}`)).toBeInTheDocument()
      expect(screen.getByTestId(`debt-bar-${age}`)).toBeInTheDocument()
      // Twee debt-layers per leeftijd → indices 0 en 1.
      expect(screen.getByTestId(`debt-bar-${age}-0`)).toBeInTheDocument()
      expect(screen.getByTestId(`debt-bar-${age}-1`)).toBeInTheDocument()
    }

    // Asset-legend toont de 3 layers, debt-legend de 2 schuld-layers.
    const assetLegend = screen.getByTestId('composition-legend-assets')
    expect(within(assetLegend).getByText('Layer cash')).toBeInTheDocument()
    expect(within(assetLegend).getByText('Layer investment')).toBeInTheDocument()
    expect(within(assetLegend).getByText('Layer retirement')).toBeInTheDocument()

    const debtLegend = screen.getByTestId('composition-legend-debts')
    expect(within(debtLegend).getByText('Layer hypotheek')).toBeInTheDocument()
    expect(within(debtLegend).getByText('Layer persoonlijke_lening')).toBeInTheDocument()
  })
})

describe('OpbouwCompositionChart — by_asset met langere layer-lijst', () => {
  it('rendert N asset-layers (6) in asset-legend', () => {
    const result = makeResult({
      view: 'by_asset',
      assetKeys: ['a', 'b', 'c', 'd', 'e', 'f'],
      debtKeys: ['d1'],
    })
    render(
      <OpbouwCompositionChart {...baseProps({ result, view: 'by_asset' })} />,
    )

    const legend = screen.getByTestId('composition-legend-assets')
    for (const key of ['a', 'b', 'c', 'd', 'e', 'f']) {
      expect(within(legend).getByText(`Layer ${key}`)).toBeInTheDocument()
    }
  })
})

describe('OpbouwCompositionChart — meerdere debt-layers gestapeld (Fase D)', () => {
  it('3 debt-layers → 3 debt-bar-{age}-{layerIdx} rects per leeftijd', () => {
    const result = makeResult({
      view: 'by_type',
      assetKeys: ['cash'],
      debtKeys: ['hypotheek', 'pl', 'creditcard'],
    })
    render(<OpbouwCompositionChart {...baseProps({ result })} />)

    for (let age = 40; age <= 49; age++) {
      expect(screen.getByTestId(`debt-bar-${age}`)).toBeInTheDocument()
      for (let layerIdx = 0; layerIdx < 3; layerIdx++) {
        expect(
          screen.getByTestId(`debt-bar-${age}-${layerIdx}`),
        ).toBeInTheDocument()
      }
      // Er is GEEN vierde layer.
      expect(
        screen.queryByTestId(`debt-bar-${age}-3`),
      ).not.toBeInTheDocument()
    }
  })

  it('alle debt-layers staan als gescheiden rects in dezelfde debt-bar-group', () => {
    const result = makeResult({
      view: 'by_type',
      assetKeys: ['cash'],
      debtKeys: ['hypotheek', 'pl'],
    })
    render(<OpbouwCompositionChart {...baseProps({ result })} />)

    const group40 = screen.getByTestId('debt-bar-40')
    const rects = group40.querySelectorAll('rect[data-testid^="debt-bar-40-"]')
    expect(rects.length).toBe(2)
    // Elk heeft een eigen fill-color gebaseerd op de bijhorende layer.
    expect(rects[0].getAttribute('fill')).toBe('#e11d48')
    expect(rects[1].getAttribute('fill')).toBe('#dc2626')
  })
})

describe('OpbouwCompositionChart — toggle interactie', () => {
  it('klik op `composition-toggle-by-asset` roept onViewChange("by_asset") aan', () => {
    const onViewChange = vi.fn()
    render(
      <OpbouwCompositionChart
        {...baseProps({ onViewChange, view: 'by_type' })}
      />,
    )

    fireEvent.click(screen.getByTestId('composition-toggle-by-asset'))
    expect(onViewChange).toHaveBeenCalledWith('by_asset')
  })
})

describe('OpbouwCompositionChart — geen schulden', () => {
  it('geen debt-layers in result → geen debt-bar-* in DOM', () => {
    const result = makeResult({
      assetKeys: ['cash', 'investment'],
      withDebt: false,
    })
    render(<OpbouwCompositionChart {...baseProps({ result })} />)

    for (let age = 40; age <= 49; age++) {
      expect(screen.queryByTestId(`debt-bar-${age}`)).not.toBeInTheDocument()
      expect(screen.queryByTestId(`debt-bar-${age}-0`)).not.toBeInTheDocument()
    }
    // Debt-legend-blok is afwezig wanneer er geen debt-layers zijn.
    expect(screen.queryByTestId('composition-legend-debts')).not.toBeInTheDocument()
  })
})

describe('OpbouwCompositionChart — fireAgeFractional null', () => {
  it('geen marker-fire wanneer fireAgeFractional null is', () => {
    render(
      <OpbouwCompositionChart
        {...baseProps({ fireAgeFractional: null })}
      />,
    )

    expect(screen.queryByTestId('marker-fire')).not.toBeInTheDocument()
  })

  it('toont marker-fire wanneer fireAgeFractional binnen bereik ligt', () => {
    render(
      <OpbouwCompositionChart
        {...baseProps({ fireAgeFractional: 45.0, currentAge: 40, endAge: 49 })}
      />,
    )
    expect(screen.getByTestId('marker-fire')).toBeInTheDocument()
  })

  it('toont marker-aow wanneer aowAge binnen bereik ligt', () => {
    render(
      <OpbouwCompositionChart
        {...baseProps({
          aowAge: 45.5,
          currentAge: 40,
          endAge: 49,
          fireAgeFractional: null,
        })}
      />,
    )
    expect(screen.getByTestId('marker-aow')).toBeInTheDocument()
  })
})

describe('OpbouwCompositionChart — a11y', () => {
  it('SVG heeft role="img" met beschrijvende aria-label', () => {
    render(<OpbouwCompositionChart {...baseProps()} />)

    const svg = screen
      .getByTestId('composition-chart')
      .querySelector('svg[role="img"]')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('aria-label')
    expect(svg!.getAttribute('aria-label')).toMatch(/stacked bar chart/i)
  })

  it('toggle-container heeft role="tablist" met 2 tab-kinderen', () => {
    render(<OpbouwCompositionChart {...baseProps()} />)

    const tablist = screen.getByTestId('composition-toggle')
    expect(tablist).toHaveAttribute('role', 'tablist')

    const byType = screen.getByTestId('composition-toggle-by-type')
    const byAsset = screen.getByTestId('composition-toggle-by-asset')
    expect(byType).toHaveAttribute('role', 'tab')
    expect(byAsset).toHaveAttribute('role', 'tab')
    expect(byType).toHaveAttribute('aria-selected', 'true')
    expect(byAsset).toHaveAttribute('aria-selected', 'false')
  })

  it('ArrowRight op eerste tab roept onViewChange aan met tweede tab-key', () => {
    const onViewChange = vi.fn()
    render(
      <OpbouwCompositionChart
        {...baseProps({ onViewChange, view: 'by_type' })}
      />,
    )

    const byType = screen.getByTestId('composition-toggle-by-type')
    byType.focus()
    fireEvent.keyDown(byType, { key: 'ArrowRight' })
    expect(onViewChange).toHaveBeenCalledWith('by_asset')
  })

  it('ArrowLeft op eerste tab wrapt naar laatste', () => {
    const onViewChange = vi.fn()
    render(
      <OpbouwCompositionChart
        {...baseProps({ onViewChange, view: 'by_type' })}
      />,
    )

    const byType = screen.getByTestId('composition-toggle-by-type')
    byType.focus()
    fireEvent.keyDown(byType, { key: 'ArrowLeft' })
    expect(onViewChange).toHaveBeenCalledWith('by_asset')
  })
})

describe('OpbouwCompositionChart — tooltip via focus', () => {
  it('focus op age-column spiegelt breakdown naar aria-live region', () => {
    const { container } = render(
      <OpbouwCompositionChart {...baseProps()} />,
    )

    // Vind de focusable rect voor leeftijd 42 (role=button, aria-label bevat '42').
    const chart = screen.getByTestId('composition-chart')
    const allFocusable = chart.querySelectorAll('rect[role="button"]')
    // 10 rijen (40-49) → 10 focusable rects.
    expect(allFocusable.length).toBe(10)

    // Focus de kolom via fireEvent.focus — jsdom rekent geen echte focus uit
    // op SVG-children, dus we triggeren de handler direct.
    const age42Rect = Array.from(allFocusable).find((el) =>
      el.getAttribute('aria-label')?.includes('42'),
    )
    expect(age42Rect).toBeTruthy()

    fireEvent.focus(age42Rect!)

    // aria-live region moet nu de leeftijd + bedragen tonen.
    const liveRegion = container.querySelector('[aria-live="polite"]')
    expect(liveRegion).toBeTruthy()
    expect(liveRegion!.textContent).toMatch(/leeftijd 42/i)
    expect(liveRegion!.textContent).toMatch(/netto/i)
  })

  it('tooltip bevat debt-layer breakdown bij meerdere schulden', () => {
    const result = makeResult({
      view: 'by_type',
      assetKeys: ['cash'],
      debtKeys: ['hypotheek', 'pl'],
    })
    render(<OpbouwCompositionChart {...baseProps({ result })} />)

    const chart = screen.getByTestId('composition-chart')
    const allFocusable = chart.querySelectorAll('rect[role="button"]')
    const age40Rect = Array.from(allFocusable).find((el) =>
      el.getAttribute('aria-label')?.includes('40'),
    )
    expect(age40Rect).toBeTruthy()

    fireEvent.focus(age40Rect!)

    // De tooltip (HTML, niet SVG) bevat beide schuld-labels + "Schulden" sub-kop.
    const tooltip = chart.querySelector('[role="tooltip"]')
    expect(tooltip).toBeTruthy()
    expect(tooltip!.textContent).toMatch(/Layer hypotheek/)
    expect(tooltip!.textContent).toMatch(/Layer pl/)
    expect(tooltip!.textContent).toMatch(/Totaal schulden/i)
    expect(tooltip!.textContent).toMatch(/netto/i)
  })
})

describe('OpbouwCompositionChart — netto-overlay', () => {
  it('netto-line is standaard zichtbaar', () => {
    render(<OpbouwCompositionChart {...baseProps()} />)
    expect(screen.getByTestId('netto-line')).toBeInTheDocument()
  })

  it('netto-toggle kan de overlay uitschakelen', () => {
    render(<OpbouwCompositionChart {...baseProps()} />)
    const toggle = screen.getByTestId('netto-toggle')
    const checkbox = within(toggle).getByRole('checkbox')

    expect(checkbox).toBeChecked()
    fireEvent.click(checkbox)
    expect(screen.queryByTestId('netto-line')).not.toBeInTheDocument()
  })
})

describe('OpbouwCompositionChart — crossover-line (Fase G4)', () => {
  it('rendert crossover-line wanneer fireAgeFractional binnen bereik ligt', () => {
    render(
      <OpbouwCompositionChart
        {...baseProps({ fireAgeFractional: 45.5, currentAge: 40, endAge: 49 })}
      />,
    )

    const crossover = screen.getByTestId('crossover-line')
    expect(crossover).toBeInTheDocument()
    // Label-tekst "KRUISPUNT" in uppercase.
    expect(crossover.textContent).toMatch(/kruispunt/i)
  })

  it('geen crossover-line wanneer fireAgeFractional null is', () => {
    render(
      <OpbouwCompositionChart
        {...baseProps({ fireAgeFractional: null })}
      />,
    )
    expect(screen.queryByTestId('crossover-line')).not.toBeInTheDocument()
  })

  it('geen crossover-line wanneer fireAgeFractional buiten bereik ligt', () => {
    render(
      <OpbouwCompositionChart
        {...baseProps({ fireAgeFractional: 99, currentAge: 40, endAge: 49 })}
      />,
    )
    expect(screen.queryByTestId('crossover-line')).not.toBeInTheDocument()
  })
})

describe('OpbouwCompositionChart — savings-layer ordering (Fase G4)', () => {
  /**
   * Bouw een composition-resultaat met een virtueel savings-asset
   * op positie 0 — zoals `computeOpbouwComposition` het aanlevert.
   */
  function makeResultWithSavings() {
    const assetLayers: CompositionLayer[] = [
      {
        key: '__savings',
        label: 'Gespaarde cash',
        color: '#34d399',
        icon: 'Wallet',
        isVirtualSavings: true,
      },
      { key: 'investment', label: 'Beleggingen', color: '#3b82f6', icon: 'TrendingUp' },
      { key: 'retirement', label: 'Pensioen', color: '#10b981', icon: 'Landmark' },
    ]
    const rows = Array.from({ length: 5 }, (_, yr) => ({
      age: 40 + yr,
      phase: 'opbouw' as const,
      // Savings (index 0) lineair stijgend, andere assets constant.
      assetLayers: [5_000 + yr * 1_000, 50_000, 80_000],
      debtLayers: [],
      netWorth: 5_000 + yr * 1_000 + 50_000 + 80_000,
      cumulativeBox3Tax: 0,
    }))
    return {
      view: 'by_type' as const,
      assetLayers,
      debtLayers: [],
      rows,
    }
  }

  it('rendert een rect met data-testid="savings-layer" wanneer savings-layer aanwezig is', () => {
    const result = makeResultWithSavings()
    render(<OpbouwCompositionChart {...baseProps({ result })} />)

    const savingsRects = document.querySelectorAll('[data-testid="savings-layer"]')
    // 5 rijen → 5 savings-rects.
    expect(savingsRects.length).toBe(5)
    // Fill-kleur matcht de savings-kleur (#34d399 = emerald).
    expect(savingsRects[0].getAttribute('fill')).toBe('#34d399')
  })

  it('savings-layer zit onderaan de positieve stack (laagste y-waarde binnen positieve zone)', () => {
    const result = makeResultWithSavings()
    render(<OpbouwCompositionChart {...baseProps({ result })} />)

    // Binnen de bar-groep voor leeftijd 40 verzamelen we alle rects en
    // vergelijken y-posities. Cumulatief vanaf yZero omhoog betekent dat
    // de bottom-layer een HOGERE y-waarde heeft dan layers erboven
    // (SVG-y groeit naar beneden, stack bouwt omhoog = kleinere y).
    const bar40 = screen.getByTestId('bar-40')
    const rects = Array.from(bar40.querySelectorAll('rect'))
    expect(rects.length).toBeGreaterThanOrEqual(3)

    const savingsRect = rects.find(
      (r) => r.getAttribute('data-testid') === 'savings-layer',
    )
    expect(savingsRect).toBeTruthy()

    // De savings-rect moet de HOOGSTE y-waarde hebben (= laagst op
    // het scherm = bodem van de stack).
    const yValues = rects.map((r) => Number(r.getAttribute('y')))
    const savingsY = Number(savingsRect!.getAttribute('y'))
    expect(savingsY).toBe(Math.max(...yValues))
  })

  it('stack-hoogte daalt over tijd bij afnemende asset-waarden (deplete-simulatie)', () => {
    // Mimic deplete-strategie: post-crossover rijen tonen afnemende
    // beleggingen. We simuleren reduced-motion zodat `useInViewAnimation`
    // direct `hasEntered=true` zet en de `animProgress`-multiplier de
    // daadwerkelijke heights produceert (in jsdom triggert IntersectionObserver
    // niet automatisch).
    const originalMatchMedia = window.matchMedia
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList) as typeof window.matchMedia

    try {
      const assetLayers: CompositionLayer[] = [
        { key: 'investment', label: 'Beleggingen', color: '#3b82f6', icon: 'TrendingUp' },
      ]
      const rows = [
        { age: 58, phase: 'afbouw' as const, assetLayers: [800_000], debtLayers: [], netWorth: 800_000, cumulativeBox3Tax: 0 },
        { age: 59, phase: 'afbouw' as const, assetLayers: [700_000], debtLayers: [], netWorth: 700_000, cumulativeBox3Tax: 0 },
        { age: 60, phase: 'afbouw' as const, assetLayers: [600_000], debtLayers: [], netWorth: 600_000, cumulativeBox3Tax: 0 },
        { age: 61, phase: 'afbouw' as const, assetLayers: [500_000], debtLayers: [], netWorth: 500_000, cumulativeBox3Tax: 0 },
        { age: 62, phase: 'afbouw' as const, assetLayers: [400_000], debtLayers: [], netWorth: 400_000, cumulativeBox3Tax: 0 },
      ]
      const result = {
        view: 'by_type' as const,
        assetLayers,
        debtLayers: [],
        rows,
      }
      render(
        <OpbouwCompositionChart
          {...baseProps({
            result,
            currentAge: 58,
            endAge: 62,
            fireAgeFractional: 58,
          })}
        />,
      )

      // Haal alle rects uit bar-58 → bar-62 en vergelijk heights.
      const heights: number[] = []
      for (let age = 58; age <= 62; age++) {
        const bar = screen.getByTestId(`bar-${age}`)
        const rect = bar.querySelector('rect')
        expect(rect).toBeTruthy()
        heights.push(Number(rect!.getAttribute('height')))
      }

      // Elke opvolgende bar is kleiner dan de vorige (strikt monotoon dalend).
      for (let i = 1; i < heights.length; i++) {
        expect(heights[i]).toBeLessThan(heights[i - 1])
      }
    } finally {
      window.matchMedia = originalMatchMedia
    }
  })
})

describe('OpbouwCompositionChart — onYearClick (Fase E)', () => {
  it('klik op age-column roept onYearClick aan met juiste leeftijd', () => {
    const onYearClick = vi.fn()
    render(
      <OpbouwCompositionChart {...baseProps({ onYearClick })} />,
    )

    const chart = screen.getByTestId('composition-chart')
    const focusable = chart.querySelectorAll('rect[role="button"]')
    const age42 = Array.from(focusable).find((el) =>
      el.getAttribute('aria-label')?.includes('42'),
    )
    expect(age42).toBeTruthy()

    fireEvent.click(age42!)
    expect(onYearClick).toHaveBeenCalledWith(42)
  })

  it('Enter-toets op age-column roept onYearClick aan', () => {
    const onYearClick = vi.fn()
    render(
      <OpbouwCompositionChart {...baseProps({ onYearClick })} />,
    )

    const chart = screen.getByTestId('composition-chart')
    const focusable = chart.querySelectorAll('rect[role="button"]')
    const age44 = Array.from(focusable).find((el) =>
      el.getAttribute('aria-label')?.includes('44'),
    )
    expect(age44).toBeTruthy()

    fireEvent.keyDown(age44!, { key: 'Enter' })
    expect(onYearClick).toHaveBeenCalledWith(44)
  })

  it('Space-toets op age-column roept onYearClick aan', () => {
    const onYearClick = vi.fn()
    render(
      <OpbouwCompositionChart {...baseProps({ onYearClick })} />,
    )

    const chart = screen.getByTestId('composition-chart')
    const focusable = chart.querySelectorAll('rect[role="button"]')
    const age43 = Array.from(focusable).find((el) =>
      el.getAttribute('aria-label')?.includes('43'),
    )
    expect(age43).toBeTruthy()

    fireEvent.keyDown(age43!, { key: ' ' })
    expect(onYearClick).toHaveBeenCalledWith(43)
  })

  it('zonder onYearClick triggert klik geen callback (geen regressie)', () => {
    // Zonder onYearClick-prop blijft de rect een pure hover/focus-trigger.
    // We verifiëren dat klik niet throwen en geen handler is gebonden door
    // simpelweg een click af te vuren en niets te verwachten.
    render(<OpbouwCompositionChart {...baseProps()} />)

    const chart = screen.getByTestId('composition-chart')
    const focusable = chart.querySelectorAll('rect[role="button"]')
    expect(() => fireEvent.click(focusable[0])).not.toThrow()
    // aria-label gebruikt de oude "Jaar op leeftijd ..." variant zonder
    // klik-affordance copy.
    expect(focusable[0].getAttribute('aria-label')).toMatch(
      /Jaar op leeftijd 40/,
    )
  })

  it('met onYearClick gebruikt aria-label de klik-affordance copy', () => {
    render(
      <OpbouwCompositionChart {...baseProps({ onYearClick: vi.fn() })} />,
    )
    const chart = screen.getByTestId('composition-chart')
    const focusable = chart.querySelectorAll('rect[role="button"]')
    expect(focusable[0].getAttribute('aria-label')).toMatch(
      /Bekijk details voor leeftijd 40/,
    )
  })
})
