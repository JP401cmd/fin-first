/**
 * Component tests for WealthCompositionChart
 *
 * Feature #363 — Regression tests for wealth composition chart rendering
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WealthCompositionChart } from './wealth-composition-chart'
import type { StackedRow } from '@/lib/wealth-composition'

// ── Mocks ──────────────────────────────────────────────────────

// Gedeelde ref zodat tests kunnen verifiëren dat de chart `ref` op ELK
// render-pad koppelt (ook de empty-state). Mist een pad de ref, dan koppelen
// de Intersection-/ResizeObserver niet aan — hun effects draaien enkel
// on-mount — en blijven bars na de Pad→Opbouw-toggle op hoogte 0 staan met de
// verkeerde (mobiele) zoom.
const { inViewRef } = vi.hoisted(() => ({
  inViewRef: { current: null as HTMLElement | null },
}))

vi.mock('@/lib/hooks/use-in-view-animation', () => ({
  useInViewAnimation: () => ({
    ref: inViewRef,
    hasEntered: true,
    animationComplete: true,
  }),
}))

class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

beforeEach(() => {
  global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
  inViewRef.current = null
})

// ── Helpers ────────────────────────────────────────────────────

function makeRows(count: number, startAge: number): StackedRow[] {
  return Array.from({ length: count }, (_, i) => ({
    age: startAge + i,
    spaargeld: 20000 + i * 1000,
    beleggingen: 100000 + i * 5000,
    pensioen: 50000 + i * 2000,
    vastgoed: 300000 + i * 3000,
    overig: 10000 + i * 500,
    schulden: i < count / 2 ? -(80000 - i * 3000) : 0,
  }))
}

function makeMinimalRows(): StackedRow[] {
  return [
    { age: 35, spaargeld: 10000, beleggingen: 50000, pensioen: 0, vastgoed: 0, overig: 0, schulden: 0 },
    { age: 36, spaargeld: 12000, beleggingen: 55000, pensioen: 0, vastgoed: 0, overig: 0, schulden: 0 },
  ]
}

// ── Step 7: Renders SVG, bars, legend ──────────────────────────

describe('WealthCompositionChart — rendering', () => {
  it('renders an SVG element', () => {
    const { container } = render(
      <WealthCompositionChart
        stackedRows={makeRows(10, 35)}
        currentAge={35}
        endAge={44}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  it('renders stacked bar rects for each visible row', () => {
    const rows = makeRows(5, 35)
    const { container } = render(
      <WealthCompositionChart
        stackedRows={rows}
        currentAge={35}
        endAge={39}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    // Each row should have multiple rects (one per wealth group with value > 0)
    const rects = svg!.querySelectorAll('rect')
    // At minimum: bars + debt bars + tooltip bg (if hovered)
    // Each row has up to 5 positive groups + 1 debt = 6 rects per bar
    expect(rects.length).toBeGreaterThan(0)
  })

  it('renders legend items for groups that have data', () => {
    const rows = makeRows(5, 35)
    const { container } = render(
      <WealthCompositionChart
        stackedRows={rows}
        currentAge={35}
        endAge={39}
      />
    )

    // Should show legend labels for groups that appear in data
    expect(screen.getByText('Beleggingen')).toBeTruthy()
    expect(screen.getByText('Spaargeld')).toBeTruthy()
    expect(screen.getByText('Vastgoed')).toBeTruthy()
    expect(screen.getByText('Overig')).toBeTruthy()
    // Schulden legend should appear since we have negative schulden values
    expect(screen.getByText('Schulden')).toBeTruthy()
  })

  it('does not render legend for groups with no data', () => {
    // Only spaargeld and beleggingen have data
    const rows = makeMinimalRows()
    const { container } = render(
      <WealthCompositionChart
        stackedRows={rows}
        currentAge={35}
        endAge={36}
      />
    )

    expect(screen.getByText('Spaargeld')).toBeTruthy()
    expect(screen.getByText('Beleggingen')).toBeTruthy()
    // These should NOT appear
    expect(screen.queryByText('Pensioen')).toBeNull()
    expect(screen.queryByText('Vastgoed')).toBeNull()
    expect(screen.queryByText('Overig')).toBeNull()
    expect(screen.queryByText('Schulden')).toBeNull()
  })

  it('renders FIRE age vertical line when fireAge is provided', () => {
    const { container } = render(
      <WealthCompositionChart
        stackedRows={makeRows(30, 35)}
        currentAge={35}
        endAge={64}
        fireAge={55}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    // Should render FIRE label text — jsdom may use lowercase attributes
    const texts = svg!.querySelectorAll('text')
    const fireText = Array.from(texts).find(t => t.textContent?.includes('FIRE'))
    expect(fireText).toBeTruthy()
    expect(fireText!.textContent).toContain('55')
  })

  it('does not render FIRE line when fireAge is null', () => {
    const { container } = render(
      <WealthCompositionChart
        stackedRows={makeRows(5, 35)}
        currentAge={35}
        endAge={39}
        fireAge={null}
      />
    )

    const svg = container.querySelector('svg')
    const texts = svg!.querySelectorAll('text')
    const fireText = Array.from(texts).find(t => t.textContent?.includes('FIRE'))
    expect(fireText).toBeFalsy()
  })

  it('renders a housing-sale marker when housingSaleAge is provided', () => {
    const { container } = render(
      <WealthCompositionChart
        stackedRows={makeRows(30, 35)}
        currentAge={35}
        endAge={64}
        housingSaleAge={60}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    // Label "Huis verkocht" moet als SVG-text verschijnen
    const texts = svg!.querySelectorAll('text')
    const saleText = Array.from(texts).find(t => t.textContent?.includes('Huis verkocht'))
    expect(saleText).toBeTruthy()

    // Duiding "hypotheek afgelost" moet via <title>/aria-label toegankelijk zijn
    const saleGroup = svg!.querySelector('[aria-label="Huis verkocht — hypotheek afgelost"]')
    expect(saleGroup).toBeTruthy()
    expect(svg!.querySelector('title')?.textContent).toContain('hypotheek afgelost')
  })

  it('does not render the housing-sale marker when housingSaleAge is null', () => {
    const { container } = render(
      <WealthCompositionChart
        stackedRows={makeRows(5, 35)}
        currentAge={35}
        endAge={39}
        housingSaleAge={null}
      />
    )

    const svg = container.querySelector('svg')
    const texts = svg!.querySelectorAll('text')
    const saleText = Array.from(texts).find(t => t.textContent?.includes('Huis verkocht'))
    expect(saleText).toBeFalsy()
  })

  it('does not render the housing-sale marker when the sale age is outside the visible range', () => {
    // Verkoop op 80, maar zichtbaar venster is 45–55 → marker buiten bereik.
    const { container } = render(
      <WealthCompositionChart
        stackedRows={makeRows(50, 35)}
        currentAge={35}
        endAge={84}
        visibleMinAge={45}
        visibleMaxAge={55}
        housingSaleAge={80}
      />
    )

    const svg = container.querySelector('svg')
    const texts = svg!.querySelectorAll('text')
    const saleText = Array.from(texts).find(t => t.textContent?.includes('Huis verkocht'))
    expect(saleText).toBeFalsy()
  })

  it('shows "Geen gegevens beschikbaar" when rows are empty', () => {
    render(
      <WealthCompositionChart
        stackedRows={[]}
        currentAge={35}
        endAge={44}
      />
    )

    expect(screen.getByText('Geen gegevens beschikbaar')).toBeTruthy()
  })

  it('survives an empty→data rerender without a hooks-count mismatch (Pad↔Opbouw toggle)', () => {
    // Reproduceert de chartMode-toggle op /toekomst: de chart wordt altijd
    // gemount, eerst met lege stackedRows (Pad-modus → wealthCompositionRows
    // = []) en daarna met data (Opbouw-modus). Vóór de hook-fix verschoof het
    // aantal aangeroepen hooks tussen die twee renders (de useCallback-hover-
    // handlers stonden ná de empty early-return), wat React de fout
    // "Rendered more hooks than during the previous render" liet gooien —
    // waardoor de toggle in de praktijk niets meer deed.
    const { rerender, container } = render(
      <WealthCompositionChart stackedRows={[]} currentAge={35} endAge={44} />
    )
    expect(screen.getByText('Geen gegevens beschikbaar')).toBeTruthy()

    // Toggle naar Opbouw: zelfde component-instance, nu mét data.
    expect(() =>
      rerender(
        <WealthCompositionChart stackedRows={makeRows(10, 35)} currentAge={35} endAge={44} />
      ),
    ).not.toThrow()

    expect(screen.queryByText('Geen gegevens beschikbaar')).toBeNull()
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('wires the in-view ref on the empty-state path (observers attach before data arrives)', () => {
    // De empty-state-return moet dezelfde `ref` dragen als de data-render.
    // Mist die ref, dan koppelen de Intersection-/ResizeObserver nooit aan
    // (hun effects draaien enkel on-mount) en blijven bars na de Pad→Opbouw-
    // toggle op hoogte 0 staan met de mobiele 600px-zoom.
    render(
      <WealthCompositionChart stackedRows={[]} currentAge={35} endAge={44} />
    )
    expect(inViewRef.current).toBe(screen.getByText('Geen gegevens beschikbaar'))
  })
})

// ── Step 8: Zoom sync ──────────────────────────────────────────

describe('WealthCompositionChart — zoom synchronization', () => {
  it('filters bars by visibleMinAge/visibleMaxAge', () => {
    const rows = makeRows(30, 35)
    const { container } = render(
      <WealthCompositionChart
        stackedRows={rows}
        currentAge={35}
        endAge={64}
        visibleMinAge={45}
        visibleMaxAge={55}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    // X-axis labels should only show ages within the visible range
    const textElements = svg!.querySelectorAll('text')
    const ageLabels = Array.from(textElements)
      .map(t => parseInt(t.textContent || '', 10))
      .filter(n => !isNaN(n) && n >= 30 && n <= 100) // filter to plausible age values

    for (const age of ageLabels) {
      expect(age).toBeGreaterThanOrEqual(45)
      expect(age).toBeLessThanOrEqual(55)
    }
  })

  it('uses full range when visibleMinAge/visibleMaxAge not provided', () => {
    const rows = makeRows(10, 35)
    const { container } = render(
      <WealthCompositionChart
        stackedRows={rows}
        currentAge={35}
        endAge={44}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    // Should render bars for the full range
    const rects = svg!.querySelectorAll('rect')
    expect(rects.length).toBeGreaterThan(0)
  })
})

// ── Step 9: Responsive height ──────────────────────────────────

describe('WealthCompositionChart — responsive', () => {
  it('uses mobile height (180) when containerW defaults < 768', () => {
    const { container } = render(
      <WealthCompositionChart
        stackedRows={makeRows(5, 35)}
        currentAge={35}
        endAge={39}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    const viewBox = svg!.getAttribute('viewBox')
    expect(viewBox).toBeTruthy()

    // Default containerW is 600 (< 768) → mobile height = 180
    const parts = viewBox!.split(/\s+/)
    const height = parseFloat(parts[3])
    expect(height).toBe(180)
  })

  it('viewBox width matches default container width (600)', () => {
    const { container } = render(
      <WealthCompositionChart
        stackedRows={makeRows(5, 35)}
        currentAge={35}
        endAge={39}
      />
    )

    const svg = container.querySelector('svg')
    const viewBox = svg!.getAttribute('viewBox')
    const parts = viewBox!.split(/\s+/)
    const width = parseFloat(parts[2])
    expect(width).toBe(600) // default containerW
  })
})

// ── Y-axis and debt rendering ──────────────────────────────────

describe('WealthCompositionChart — debt layer', () => {
  it('renders debt bars below zero line when schulden < 0', () => {
    const rows: StackedRow[] = [
      { age: 35, spaargeld: 10000, beleggingen: 50000, pensioen: 0, vastgoed: 0, overig: 0, schulden: -100000 },
      { age: 36, spaargeld: 12000, beleggingen: 55000, pensioen: 0, vastgoed: 0, overig: 0, schulden: -95000 },
    ]

    const { container } = render(
      <WealthCompositionChart
        stackedRows={rows}
        currentAge={35}
        endAge={36}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    // Should render debt bars (red rects)
    const rects = Array.from(svg!.querySelectorAll('rect'))
    const redRects = rects.filter(r => r.getAttribute('fill') === '#ef4444')
    expect(redRects.length).toBeGreaterThan(0)
  })

  it('renders SVG with correct structure when debts exist', () => {
    const rows: StackedRow[] = [
      { age: 35, spaargeld: 10000, beleggingen: 50000, pensioen: 0, vastgoed: 0, overig: 0, schulden: -50000 },
      { age: 36, spaargeld: 12000, beleggingen: 55000, pensioen: 0, vastgoed: 0, overig: 0, schulden: -45000 },
    ]

    const { container } = render(
      <WealthCompositionChart
        stackedRows={rows}
        currentAge={35}
        endAge={36}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    // With debts, we should have more SVG elements (zero line, debt bars)
    const lines = svg!.querySelectorAll('line')
    expect(lines.length).toBeGreaterThan(0) // grid lines + zero line
  })
})

// ── Bugmelding 18-09-2026 — eigen huis gedempt bij "Uitsluiten" ─────────────

/**
 * Given een gebruiker met woonstrategie "Uitsluiten" (`exclude_from_fire`),
 * When de opbouw-grafiek zijn vermogen toont,
 * Then staat het eigen huis er wél in (het is echt bezit), maar GEDEMPT — het
 * telt niet mee voor het doelbedrag waar de rest van de pagina op staat.
 * Beleggingsvastgoed en een hypotheek op een ánder pand tellen wél mee en
 * blijven dus op volle sterkte.
 */
describe('WealthCompositionChart — eigen huis gedempt bij uitgesloten woning', () => {
  function rowsMetEigenHuis(): StackedRow[] {
    return [35, 36].map(age => ({
      age,
      spaargeld: 20000,
      beleggingen: 100000,
      pensioen: 0,
      vastgoed: 550000,
      vastgoedEigenHuis: 350000,
      overig: 0,
      schulden: -270000,
      schuldHypotheek: -270000,
      schuldEigenHuisHypotheek: -180000,
    }))
  }

  function segment(container: HTMLElement, naam: string): SVGRectElement | null {
    return container.querySelector(`rect[data-wealth-segment="${naam}"]`)
  }

  it('tekent het eigen huis als eigen, gedempt segment binnen de vastgoedband', () => {
    const { container } = render(
      <WealthCompositionChart
        stackedRows={rowsMetEigenHuis()}
        currentAge={35}
        endAge={36}
        homeExcludedFromFire
      />
    )
    const huis = segment(container, 'eigen-huis')
    const vastgoed = segment(container, 'vastgoed')
    expect(huis, 'eigen huis krijgt een eigen segment').toBeTruthy()
    expect(vastgoed, 'het overige vastgoed blijft een eigen segment').toBeTruthy()
    expect(Number(huis!.getAttribute('opacity'))).toBeLessThan(
      Number(vastgoed!.getAttribute('opacity')),
    )
  })

  it('dempt ook de hypotheek van datzelfde huis, niet de andere hypotheek', () => {
    const { container } = render(
      <WealthCompositionChart
        stackedRows={rowsMetEigenHuis()}
        currentAge={35}
        endAge={36}
        homeExcludedFromFire
      />
    )
    const huisHyp = segment(container, 'eigen-huis-hypotheek')
    const hyp = segment(container, 'schuld-hypotheek')
    expect(huisHyp).toBeTruthy()
    expect(hyp).toBeTruthy()
    expect(Number(huisHyp!.getAttribute('opacity'))).toBeLessThan(
      Number(hyp!.getAttribute('opacity')),
    )
  })

  it('benoemt de demping in de legenda, zodat het geen renderfout lijkt', () => {
    render(
      <WealthCompositionChart
        stackedRows={rowsMetEigenHuis()}
        currentAge={35}
        endAge={36}
        homeExcludedFromFire
      />
    )
    expect(screen.getByText('Eigen huis'), 'het huis krijgt een eigen legenda-regel').toBeTruthy()
    expect(screen.getByText('Hypotheek eigen huis')).toBeTruthy()
    expect(
      screen.getByText(/telt niet mee voor je doel/i),
      'de demping wordt geduid, anders leest ze als renderfout',
    ).toBeTruthy()
  })

  it('dempt NIETS wanneer de woning gewoon meetelt — de staaf blijft zoals hij was', () => {
    const { container } = render(
      <WealthCompositionChart
        stackedRows={rowsMetEigenHuis()}
        currentAge={35}
        endAge={36}
      />
    )
    expect(segment(container, 'eigen-huis'), 'geen apart huis-segment').toBeNull()
    expect(segment(container, 'eigen-huis-hypotheek')).toBeNull()
    expect(segment(container, 'vastgoed'), 'één ongedeelde vastgoedband').toBeTruthy()
  })
})

/**
 * Review-bevinding H1 (18-09-2026): sinds legenda en tooltip beide reeksen in
 * ÉÉN array samenvoegen, kunnen de twee sleutelruimtes botsen — `'overig'`
 * bestaat zowel als `WealthGroup` ("Overig" bezit) als als `DebtLayer`
 * ("Overige schulden"). Een gebruiker met een auto én een persoonlijke lening
 * kreeg dan twee React-children met dezelfde key: geen verkeerd getal, wél een
 * legenda-regel die bij een re-render kan verdwijnen of verwisselen.
 */
describe('WealthCompositionChart — sleutels van bezit en schuld botsen niet', () => {
  it('geeft overig bezit en overige schulden elk een eigen segment-sleutel', () => {
    const rows: StackedRow[] = [35, 36].map(age => ({
      age,
      spaargeld: 10000,
      beleggingen: 0,
      pensioen: 0,
      vastgoed: 0,
      overig: 25000,
      schulden: -8000,
      schuldHypotheek: 0,
      schuldOverig: -8000,
    }))
    const { container } = render(
      <WealthCompositionChart stackedRows={rows} currentAge={35} endAge={36} />
    )
    const sleutels = [...container.querySelectorAll('rect[data-wealth-segment]')].map(r =>
      r.getAttribute('data-wealth-segment'),
    )
    // Drie soorten segmenten (spaargeld, overig bezit, overige schulden) — en
    // bezit en schuld dragen elk hun eigen sleutel, geen gedeelde 'overig'.
    expect([...new Set(sleutels)].sort()).toEqual(['overig', 'schuld-overig', 'spaargeld'])
  })
})
