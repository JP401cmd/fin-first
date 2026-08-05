/**
 * Component-tests voor `SimChart` — de "binnenkant"-refactor uit de kaart
 * "Toekomst-grafiek: geometrie en Monte-Carlo-banden niet meer per muisbeweging
 * herbouwen".
 *
 * AC-1 (byte-identiek): een reeks mouseMoves over de crosshair-rect wijzigt geen
 *   enkel projectie-pad (`path[@d]`); alleen de crosshair-laag verschijnt.
 * AC-2 (alleen crosshair-laag): `buildSimChartGeometry` wordt precies 1× gebouwd
 *   over N mouseMoves (Monte-Carlo/banden niet herbouwd) én de gememoiseerde
 *   `ChartStaticLayers` re-rendert niet tijdens de hover-reeks.
 *
 * Mock-patroon zoals wealth-composition-chart.test.tsx: useInViewAnimation →
 * hasEntered:true met gedeelde ref, ResizeObserver-mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { SimChart } from './sim-chart'
import * as geometryModule from '@/lib/horizon/sim-chart-geometry'
import type { SimRow } from '@/lib/fire-simulation'

// ── Mocks ──────────────────────────────────────────────────────────────────

const { inViewRef, staticRenderSpy } = vi.hoisted(() => ({
  inViewRef: { current: null as HTMLElement | null },
  staticRenderSpy: { count: 0 },
}))

vi.mock('@/lib/hooks/use-in-view-animation', () => ({
  useInViewAnimation: () => ({
    ref: inViewRef,
    hasEntered: true,
    animationComplete: true,
  }),
}))

// Wrap de pure geometrie-bouwer in een spy die doorschakelt naar de echte
// implementatie (byte-identieke output) — zodat we het aantal aanroepen kunnen
// tellen (AC-2: geometrie niet herbouwd per muisbeweging).
vi.mock('@/lib/horizon/sim-chart-geometry', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/horizon/sim-chart-geometry')>()
  return {
    ...mod,
    buildSimChartGeometry: vi.fn(mod.buildSimChartGeometry),
  }
})

// Wrap ChartStaticLayers in een eigen memo met render-teller. Roept de echte
// (ongememoiseerde) inner-render aan zodat de SVG-output ongewijzigd blijft.
vi.mock('./chart-static-layers', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./chart-static-layers')>()
  const { memo } = await import('react')
  const Counting = memo((props: Parameters<typeof mod.ChartStaticLayersInner>[0]) => {
    staticRenderSpy.count++
    return mod.ChartStaticLayersInner(props)
  })
  Counting.displayName = 'ChartStaticLayers(counted)'
  return { ...mod, ChartStaticLayers: Counting }
})

class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

const boundingRect = {
  left: 0, top: 0, right: 600, bottom: 260, width: 600, height: 260, x: 0, y: 0,
  toJSON: () => ({}),
} as DOMRect

beforeEach(() => {
  global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
  inViewRef.current = null
  staticRenderSpy.count = 0
  vi.mocked(geometryModule.buildSimChartGeometry).mockClear()
  // Vaste chart-afmetingen zodat hover-x → leeftijd deterministisch is.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(boundingRect)
})

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeRow(age: number, startPortfolio: number, endPortfolio: number, phase: SimRow['phase']): SimRow {
  return {
    age, phase, startPortfolio,
    growth: Math.round(startPortfolio * 0.05),
    savings: phase === 'accumulation' ? 15000 : 0,
    withdrawal: phase === 'retirement' ? 30000 : 0,
    cashflowNet: 0, oneTimeNet: 0, endPortfolio,
    grossIncome: 0, grossExpenses: 0, flowIn: 0, flowOut: 0,
  }
}

function buildRows(startAge: number, endAge: number, retireAge: number): SimRow[] {
  const rows: SimRow[] = []
  let p = 100000
  for (let age = startAge; age < endAge; age++) {
    const phase: SimRow['phase'] = age >= retireAge ? 'retirement' : 'accumulation'
    const growth = Math.round(p * 0.05)
    const savings = phase === 'accumulation' ? 15000 : 0
    const withdrawal = phase === 'retirement' ? 30000 : 0
    const endP = p + growth + savings - withdrawal
    rows.push(makeRow(age, p, endP, phase))
    p = endP
  }
  return rows
}

/** Rijke fixture: opbouw+afbouw, baseline-ghost, 2 scenario's en Monte-Carlo. */
function richProps() {
  const mcYears = 26
  return {
    rows: buildRows(40, 65, 58),
    fireAge: 58,
    fireAgeFractional: 58.3,
    currentAge: 40,
    endAge: 65,
    cashflows: [],
    fireTarget: 800000,
    strategy: 'deplete' as const,
    targetEndPortfolio: 0,
    baselineRows: buildRows(40, 65, 60),
    scenarioOverlays: [
      { name: 'pessimist', label: 'Voorzichtig', color: '#9e6b50', points: [[40, 100000], [50, 300000], [60, 700000], [65, 500000]] as [number, number][] },
      { name: 'optimist', label: 'Optimistisch', color: '#5b8c5a', points: [[40, 100000], [50, 400000], [60, 900000], [65, 800000]] as [number, number][] },
    ],
    monteCarloOverlay: {
      startAge: 40,
      p10: Array.from({ length: mcYears }, (_, i) => 100000 + i * 8000),
      p25: Array.from({ length: mcYears }, (_, i) => 100000 + i * 10000),
      p50: Array.from({ length: mcYears }, (_, i) => 100000 + i * 13000),
      p75: Array.from({ length: mcYears }, (_, i) => 100000 + i * 16000),
      p90: Array.from({ length: mcYears }, (_, i) => 100000 + i * 20000),
    },
  }
}

function overlayRectOf(container: HTMLElement): SVGRectElement {
  const rect = Array.from(container.querySelectorAll('rect')).find(
    r => (r as SVGElement).style?.cursor === 'crosshair',
  )
  if (!rect) throw new Error('crosshair overlay-rect niet gevonden')
  return rect as SVGRectElement
}

function pathDs(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll('path')).map(p => p.getAttribute('d'))
}

// ── AC-1: byte-identieke paden ───────────────────────────────────────────────

describe('SimChart — hover raakt de projectie-paden niet (AC-1)', () => {
  it('geen enkel path[@d] wijzigt over 5 mouseMoves; alleen de crosshair verschijnt', () => {
    const { container } = render(<SimChart {...richProps()} />)

    const before = pathDs(container)
    expect(before.length).toBeGreaterThan(5) // MC-band + scenario's + baseline + acc/dec
    expect(container.querySelector('circle[r="4"]')).toBeNull() // nog geen crosshair-stip

    const overlay = overlayRectOf(container)
    for (const clientX of [120, 220, 320, 420, 520]) {
      fireEvent.mouseMove(overlay, { clientX, clientY: 100 })
    }

    const after = pathDs(container)
    expect(after).toEqual(before) // byte-identiek: geen pad herberekend
    // Crosshair-laag verscheen (verticale lijn-stip op de vermogenslijn).
    expect(container.querySelector('circle[r="4"]')).toBeTruthy()
  })
})

// ── Wat-als-variant: gestippelde ink-lijn + FIRE-stip + legenda ─────────────

/** richProps + een live wat-als-lijn (variant:'scenario') met FIRE-stip. */
function watalsProps() {
  return {
    ...richProps(),
    scenarioOverlays: [
      ...richProps().scenarioOverlays,
      {
        name: 'watals',
        label: 'Jouw wat-als',
        color: '#9e6b50',
        variant: 'scenario' as const,
        fireAgeFractional: 54.5,
        points: [[40, 100000], [54, 600000], [55, 650000], [65, 1200000]] as [number, number][],
      },
    ],
  }
}

describe('SimChart — wat-als-variant rendert dashed ink-lijn + stip + legenda', () => {
  it('gestippelde ink-lijn (var(--ink-2), dash 6 4) aanwezig', () => {
    const { container } = render(<SimChart {...watalsProps()} />)
    const inkPath = Array.from(container.querySelectorAll('path')).find(
      p => p.getAttribute('stroke') === 'var(--ink-2)' && p.getAttribute('stroke-dasharray') === '6 4',
    )
    expect(inkPath).toBeTruthy()
    expect(inkPath!.getAttribute('d')).toBeTruthy()
  })

  it('FIRE-stip als gestippelde ink-ring (paper-fill, ink-2-stroke) gerenderd', () => {
    const { container } = render(<SimChart {...watalsProps()} />)
    const fireRing = Array.from(container.querySelectorAll('circle')).find(
      c => c.getAttribute('fill') === 'var(--paper)' && c.getAttribute('stroke') === 'var(--ink-2)',
    )
    expect(fireRing).toBeTruthy()
  })

  it('legenda toont "Jouw pad" + de wat-als-rij met leeftijdssuffix', () => {
    const { getByText } = render(<SimChart {...watalsProps()} />)
    expect(getByText('Jouw pad')).toBeTruthy()
    expect(getByText('Jouw wat-als')).toBeTruthy()
    expect(getByText('(55j)')).toBeTruthy() // Math.round(54.5) = 55
  })

  it('zonder variant blijft de ink-wat-als-lijn afwezig (byte-identiek pad)', () => {
    const { container } = render(<SimChart {...richProps()} />)
    const inkPath = Array.from(container.querySelectorAll('path')).find(
      p => p.getAttribute('stroke') === 'var(--ink-2)' && p.getAttribute('stroke-dasharray') === '6 4',
    )
    expect(inkPath).toBeUndefined()
  })
})

// ── Besteedbaar-lijn (tweede grondslag naast het totale netto vermogen) ─────

/**
 * richProps + de besteedbaar-punten (liquide vermogen, uit `nettoLiquide`).
 * Waarde = leeftijd × €10.000 zodat de tooltip-assertie exact te voorspellen is;
 * de reeks start op 41 (hoofdlijn start op 40 — de kernel levert geen beginstand
 * voor het liquide vermogen).
 */
function besteedbaarProps() {
  return {
    ...richProps(),
    liquidPoints: Array.from({ length: 25 }, (_, i): [number, number] => [
      41 + i,
      (41 + i) * 10_000,
    ]),
  }
}

/** De besteedbaar-lijn: horizon-600, dunner (1.8) én GESTIPPELD ("2 3"). */
function besteedbaarPath(container: HTMLElement) {
  return Array.from(container.querySelectorAll('path')).find(
    p =>
      p.getAttribute('stroke') === 'var(--color-horizon-600, #ab8449)' &&
      p.getAttribute('stroke-dasharray') === '2 3',
  )
}

describe('SimChart — besteedbaar-lijn naast de totale vermogenslijn', () => {
  it('tekent een dunne gestreepte horizon-lijn zodra liquidPoints gezet is', () => {
    const { container } = render(<SimChart {...besteedbaarProps()} />)
    const path = besteedbaarPath(container)
    expect(path).toBeTruthy()
    expect(path!.getAttribute('d')).toBeTruthy()
    // Ook zonder kleurwaarneming te onderscheiden: dunner dan de 2.5px-hoofdlijn.
    expect(path!.getAttribute('stroke-width')).toBe('1.8')
  })

  it('legenda benoemt beide lijnen in één woordpaar (met/zonder je huis)', () => {
    const { getByText } = render(<SimChart {...besteedbaarProps()} />)
    expect(getByText('Jouw pad')).toBeTruthy()
    expect(getByText('· met je huis')).toBeTruthy()
    expect(getByText('Zonder je huis')).toBeTruthy()
  })

  it('hover-tooltip zet beide grondslagen onder elkaar in datzelfde woordpaar', () => {
    const { container, getByText, getAllByText } = render(<SimChart {...besteedbaarProps()} />)
    const overlay = overlayRectOf(container)
    // W=600, PAD.left=60, innerW=524, leeftijdsbereik 40–65 →
    // x=120 ⇒ 40 + (60/524)·25 = 42,9 ⇒ afgerond leeftijd 43.
    fireEvent.mouseMove(overlay, { clientX: 120, clientY: 100 })
    expect(getByText('Leeftijd 43')).toBeTruthy()
    expect(getByText('Met je huis')).toBeTruthy()
    // "Zonder je huis" staat nu zowel in de legenda als in de tooltip.
    expect(getAllByText('Zonder je huis').length).toBe(2)
    expect(getByText('€430K')).toBeTruthy() // 43 × €10.000
    // Geen derde register meer voor dezelfde grondslag.
    expect(container.textContent).not.toContain('Besteedbaar')
  })

  it('zonder liquidPoints blijft alles ongewijzigd (geen lijn, geen legenda, geen kwalificatie)', () => {
    const { container, queryByText } = render(<SimChart {...richProps()} />)
    expect(besteedbaarPath(container)).toBeUndefined()
    expect(queryByText('Zonder je huis')).toBeNull()
    expect(queryByText('Jouw pad')).toBeNull()
    expect(container.textContent).not.toContain('met je huis')
  })

  it('zonder tweede lijn houdt de tooltip het gewone label "Vermogen"', () => {
    const { container, getByText, queryByText } = render(<SimChart {...richProps()} />)
    fireEvent.mouseMove(overlayRectOf(container), { clientX: 120, clientY: 100 })
    expect(getByText('Vermogen')).toBeTruthy()
    expect(queryByText('Met je huis')).toBeNull()
  })

  it('leest niet als een streeplijn: punt-ritme, niet het "6 3" van de doellijnen', () => {
    const { container } = render(<SimChart {...besteedbaarProps()} fireTargetInclHome={950_000} />)
    const path = besteedbaarPath(container)!
    expect(path.getAttribute('stroke-dasharray')).toBe('2 3')
    // Geen enkele doellijn deelt dit ritme (die staan op "6 3").
    const doellijnen = Array.from(container.querySelectorAll('line')).filter(
      l => l.getAttribute('stroke-dasharray') === '6 3',
    )
    expect(doellijnen.length).toBeGreaterThan(0)
    for (const l of doellijnen) {
      expect(l.getAttribute('stroke-dasharray')).not.toBe(path.getAttribute('stroke-dasharray'))
    }
  })
})

// ── H1: elke lijn hoort bij precies één drempel ─────────────────────────────

describe('SimChart — doellijnen horen bij de getekende lijnen', () => {
  const INCL = 950_000

  it('tekent bij een besteedbaar-lijn BEIDE drempels, elk expliciet benoemd', () => {
    const { getByText } = render(
      <SimChart {...besteedbaarProps()} fireTargetInclHome={INCL} />,
    )
    // J-drempel (hoort bij de besteedbaar-lijn) + I-drempel (hoort bij het totaal).
    expect(getByText('doel zonder je huis')).toBeTruthy()
    expect(getByText('doel met je huis')).toBeTruthy()
  })

  it('zonder besteedbaar-lijn blijft de J-drempel onderdrukt (ongewijzigd gedrag)', () => {
    const { getByText, queryByText } = render(
      <SimChart {...richProps()} fireTargetInclHome={INCL} />,
    )
    expect(getByText('doel met je huis')).toBeTruthy()
    expect(queryByText('doel zonder je huis')).toBeNull()
    expect(queryByText('doel')).toBeNull()
  })

  it('één lijn, één grondslag → de drempel houdt het korte label "doel"', () => {
    const { getByText, queryByText } = render(<SimChart {...richProps()} />)
    expect(getByText('doel')).toBeTruthy()
    expect(queryByText('doel zonder je huis')).toBeNull()
    expect(queryByText('doel met je huis')).toBeNull()
  })

  it('besteedbaar-lijn zónder incl.-woningdoel (bv. volledig meetellen): één drempel, wél benoemd', () => {
    // Bij include_full/downsize levert de loader geen `fireTargetInclHome`, maar de
    // tweede lijn staat er sinds het eigenaarsbesluit wél. De enige drempel hoort
    // dan bij die tweede lijn en moet dat ook zeggen — anders leest de gebruiker
    // een J-drempel als het doel van de I-lijn.
    const { getByText, queryByText } = render(<SimChart {...besteedbaarProps()} />)
    expect(getByText('doel zonder je huis')).toBeTruthy()
    expect(queryByText('doel')).toBeNull()
    expect(queryByText('doel met je huis')).toBeNull()
  })
})

// ── AC-2: alleen de crosshair-laag reageert ─────────────────────────────────

describe('SimChart — hover herbouwt geometrie noch statische laag (AC-2)', () => {
  it('buildSimChartGeometry wordt precies 1× aangeroepen over N mouseMoves', () => {
    const build = vi.mocked(geometryModule.buildSimChartGeometry)
    const { container } = render(<SimChart {...richProps()} />)
    expect(build).toHaveBeenCalledTimes(1) // enkel op mount

    const overlay = overlayRectOf(container)
    for (const clientX of [110, 190, 270, 350, 430, 510]) {
      fireEvent.mouseMove(overlay, { clientX, clientY: 100 })
    }

    // Geen herbouw van geometrie/Monte-Carlo-banden per muisbeweging.
    expect(build).toHaveBeenCalledTimes(1)
  })

  it('ChartStaticLayers re-rendert niet tijdens de hover-reeks', () => {
    const { container } = render(<SimChart {...richProps()} />)
    const afterMount = staticRenderSpy.count
    expect(afterMount).toBe(1) // één keer gerenderd op mount

    const overlay = overlayRectOf(container)
    for (const clientX of [120, 220, 320, 420, 520]) {
      fireEvent.mouseMove(overlay, { clientX, clientY: 100 })
    }

    // memo bailt: de zware statische subtree blijft ongemoeid tijdens hover.
    expect(staticRenderSpy.count).toBe(afterMount)
  })
})
