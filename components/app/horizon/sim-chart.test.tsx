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
import { MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'
import type { SimRow } from '@/lib/fire-simulation'

// ── Mocks ──────────────────────────────────────────────────────────────────

// Stuurbare privacy-mock — default zichtbaar; per test op masked te zetten
// (zelfde patroon als scenario-kaarten.test.tsx).
const mockPrivacy = { masked: false }
vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => mockPrivacy,
}))

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
  mockPrivacy.masked = false
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

  // ── Rolomkering bij woonstrategie "Uitsluiten" (ADR 0114) ────────────────
  //
  // Daar is de J-reeks de HOOFDLIJN en de totaallijn de dunne tweede lijn. De
  // grafiek moet dan overal hetzelfde zeggen: legenda, tooltip-volgorde en de
  // grondslagkop boven de bewegingsregels.

  /** Zelfde vorm als `besteedbaarProps`, maar mét het J(0)-anker op leeftijd 40. */
  function uitsluitenProps() {
    return {
      ...richProps(),
      primaryBasis: 'liquid' as const,
      liquidPoints: Array.from({ length: 26 }, (_, i): [number, number] => [
        40 + i,
        (40 + i) * 10_000,
      ]),
    }
  }

  it('benoemt de hoofdlijn als "zonder je huis" en de tweede lijn als "Met je huis"', () => {
    const { container, getByText } = render(<SimChart {...uitsluitenProps()} />)
    expect(getByText('Jouw pad')).toBeTruthy()
    expect(getByText('· zonder je huis')).toBeTruthy()
    expect(getByText('Met je huis')).toBeTruthy()
    // De dunne gestippelde lijn bestaat nog steeds — hij draagt nu het totaal.
    expect(besteedbaarPath(container)).toBeTruthy()
  })

  it('zet in de tooltip het besteedbare bedrag bovenaan, met het totaal eronder', () => {
    const { container, getByText, getAllByText } = render(<SimChart {...uitsluitenProps()} />)
    fireEvent.mouseMove(overlayRectOf(container), { clientX: 120, clientY: 100 })
    expect(getByText('Leeftijd 43')).toBeTruthy()
    // Het J-bedrag hoort bij de PRIMAIRE regel — hetzelfde getal waar de
    // crosshair-stip op staat (beide lezen `allPts`).
    expect(getByText('€430K')).toBeTruthy() // 43 × €10.000
    // "Zonder je huis" staat nu in de legenda-kwalificatie én als tooltip-kop;
    // "Met je huis" in de legenda-entry én als tweede tooltip-regel.
    expect(getAllByText('Zonder je huis').length).toBe(1)
    expect(getAllByText('Met je huis').length).toBe(2)
  })

  it('benoemt de grondslag van de drijvers/drukkers zodra de hoofdlijn J is', () => {
    // De zes posten decomponeren de TOTALE beweging; `SimRow` draagt geen
    // liquide tegenhanger. Zonder deze kop zou de gebruiker ze bij het
    // J-bedrag erboven optellen (ADR 0114 D4).
    const { container, getByText } = render(<SimChart {...uitsluitenProps()} />)
    fireEvent.mouseMove(overlayRectOf(container), { clientX: 120, clientY: 100 })
    expect(getByText('Wat er dit jaar gebeurde (mét je huis)')).toBeTruthy()
  })

  it('laat die grondslagkop WEG zolang de hoofdlijn het totaal is', () => {
    const { container } = render(<SimChart {...besteedbaarProps()} />)
    fireEvent.mouseMove(overlayRectOf(container), { clientX: 120, clientY: 100 })
    expect(container.textContent).not.toContain('Wat er dit jaar gebeurde')
  })

  it('verbergt met secondaryLineVisible: false de tweede lijn, niet de kwalificatie', () => {
    const { container, getByText, queryByText } = render(
      <SimChart {...uitsluitenProps()} secondaryLineVisible={false} />,
    )
    expect(besteedbaarPath(container)).toBeUndefined()
    expect(queryByText('Met je huis')).toBeNull()
    // De hoofdlijn blijft benoemd: een onbenoemd "Jouw pad" dat het huis niet
    // meetelt leest als het totaal.
    expect(getByText('· zonder je huis')).toBeTruthy()
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

// ── Euro-weergave: de doellijn (T7 / AC-C1) ─────────────────────────────────
//
// De grafiek weet NIETS van de euro-weergave: hij tekent de bedragen die hij
// binnenkrijgt. Het contract met de render-grens (`horizon-client.tsx`) is dat
// in huidige euro's een UNIT-factorlijst binnenkomt bij een al gedeflateerd
// doelbedrag. Dat is bewust géén `undefined`: zonder factoren geeft de
// geometrie `targetLine === null` en verdwíjnt de doellijn volledig.

const DOEL_REEEL_NU = 200_000
/** 26 jaarfactoren (40 t/m 65) bij 2% inflatie — de nominale doorsnee-situatie. */
const NOMINALE_FACTOREN = Array.from({ length: 26 }, (_, i) => ({
  age: 40 + i,
  factor: Math.pow(1.02, i),
}))
const DOEL_NOMINAAL_EIND = DOEL_REEEL_NU * Math.pow(1.02, 25)

/** Toekomstige euro's: oplopende factoren + de nominale eindwaarde. */
function doellijnNominaalProps() {
  return {
    ...richProps(),
    strategy: 'legacy' as const,
    targetEndPortfolio: DOEL_NOMINAAL_EIND,
    targetInflationFactors: NOMINALE_FACTOREN,
  }
}

/** Huidige euro's: unit-factorlijst + het al gedeflateerde doelbedrag (N2b). */
function doellijnReeelProps() {
  return {
    ...richProps(),
    strategy: 'legacy' as const,
    targetEndPortfolio: DOEL_REEEL_NU,
    targetInflationFactors: NOMINALE_FACTOREN.map(f => ({ age: f.age, factor: 1 })),
  }
}

/** Toekomstige euro's mét een wat-als op 0% inflatie: de kernel levert dan
 *  `inflationFactor = (1+0)^k = 1` voor élk jaar (lib/horizon-kernel/bridge.ts),
 *  bij het ongedeflateerde doelbedrag — dat is nominaal het bedrag-van-nu. */
function doellijnNominaalNulInflatieProps() {
  return {
    ...richProps(),
    strategy: 'legacy' as const,
    targetEndPortfolio: DOEL_REEEL_NU,
    targetInflationFactors: NOMINALE_FACTOREN.map(f => ({ age: f.age, factor: 1 })),
  }
}

/** 0,002% inflatie: de WAARDEN verschillen (200.100 vs 200.000), maar op het
 *  scherm staat twee keer hetzelfde afgeronde getal ("€200k"). */
const MINI_FACTOREN = Array.from({ length: 26 }, (_, i) => ({
  age: 40 + i,
  factor: Math.pow(1.00002, i),
}))
const DOEL_NOMINAAL_MINI = DOEL_REEEL_NU * Math.pow(1.00002, 25)

function doellijnNominaalMiniInflatieProps() {
  return {
    ...richProps(),
    strategy: 'legacy' as const,
    targetEndPortfolio: DOEL_NOMINAAL_MINI,
    targetInflationFactors: MINI_FACTOREN,
  }
}

/** De erfenis-/koopkracht-doellijn: kern-bruin, gestreept, als `path`. */
function doelPath(container: HTMLElement): SVGPathElement | undefined {
  return Array.from(container.querySelectorAll('path')).find(
    p =>
      p.getAttribute('stroke') === 'var(--kern-t, #58362d)' &&
      p.getAttribute('stroke-dasharray') === '6 3',
  ) as SVGPathElement | undefined
}

/** Y-coördinaten uit een `M x y L x y …`-pad. */
function pathYs(d: string): number[] {
  const nums = d.split(/[ ]+/).filter(t => t !== 'M' && t !== 'L').map(Number)
  return nums.filter((_, i) => i % 2 === 1)
}

describe('SimChart — doellijn onder de euro-weergave (T7 / AC-C1)', () => {
  it('toekomstige euro\'s: de doellijn loopt op en draagt het "nu"-sublabel', () => {
    const { container } = render(<SimChart {...doellijnNominaalProps()} />)
    const path = doelPath(container)
    expect(path).toBeTruthy()
    const ys = pathYs(path!.getAttribute('d')!)
    expect(ys.length).toBeGreaterThan(2)
    // Oplopend bedrag = dalende y in SVG-coördinaten.
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(1)
    // Het eindlabel (nominaal) en het "nu"-sublabel staan er allebei.
    expect(leesbareTeksten(container).some(t => /\snu$/.test(t))).toBe(true)
    expect(container.textContent).toContain('erfenis')
  })

  it('huidige euro\'s: de doellijn is er nog én is vlak op het reële doel-van-nu', () => {
    const { container } = render(<SimChart {...doellijnReeelProps()} />)
    const path = doelPath(container)
    // AC-C1 eist AANWEZIGHEID, niet alleen vlakheid: `targetInflationFactors`
    // weglaten zou de lijn laten verdwijnen en dat leest als "hij is nu vlak".
    expect(path).toBeTruthy()
    const ys = pathYs(path!.getAttribute('d')!)
    expect(ys.length).toBeGreaterThan(2)
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.11) // vlak (1 decimaal afronding)
    // Woordlabel blijft, maar geen tweede "€… nu"-regel met hetzelfde getal.
    expect(container.textContent).toContain('erfenis')
    expect(leesbareTeksten(container).some(t => /\snu$/.test(t))).toBe(false)
  })

  it('0% inflatie in toekomstige euro\'s: doellijn blijft, sublabel valt weg (bewuste uitzondering)', () => {
    // De onderdrukking loopt op de GETOONDE tekst: staat er twee keer hetzelfde
    // getal, dan is de tweede regel ruis. Bij 0% inflatie levert de nominale
    // weergave LETTERLIJK dezelfde invoer als de reële (unit-factorlijst +
    // ongedeflateerd doel) — er is dus geen data-signaal om de twee uit elkaar
    // te houden zonder de euro-weergave de grafiek in te lekken (N2). Dit
    // asserteert die gelijkheid expliciet, zodat de uitzondering zichtbaar
    // blijft in plaats van te verdwijnen in een toevallige assertie.
    expect(doellijnNominaalNulInflatieProps()).toEqual(doellijnReeelProps())

    const { container } = render(<SimChart {...doellijnNominaalNulInflatieProps()} />)
    const path = doelPath(container)
    expect(path).toBeTruthy()
    const ys = pathYs(path!.getAttribute('d')!)
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.11) // vlak: geen inflatie
    expect(container.textContent).toContain('erfenis')
    expect(leesbareTeksten(container).some(t => /\snu$/.test(t))).toBe(false)
  })

  it('verwaarloosbare inflatie: geen tweede regel met hetzelfde afgeronde bedrag', () => {
    // Waarden verschillen wél — de oude waarde-conditie zou hier een sublabel
    // tonen dat exact hetzelfde leest als het eindlabel erboven.
    expect(DOEL_NOMINAAL_MINI).not.toBe(DOEL_REEEL_NU)
    const { container } = render(<SimChart {...doellijnNominaalMiniInflatieProps()} />)
    expect(doelPath(container)).toBeTruthy()
    // Eindlabel toont "€200k"; een "€200k nu"-regel eronder voegt niets toe.
    expect(leesbareTeksten(container).some(t => t.includes('erfenis €200k'))).toBe(true)
    expect(leesbareTeksten(container).some(t => /\snu$/.test(t))).toBe(false)
  })

  it('perpetual houdt hetzelfde woordlabel ("koopkracht") in beide weergaven', () => {
    const { container: nominaal } = render(
      <SimChart {...doellijnNominaalProps()} strategy="perpetual" />,
    )
    expect(nominaal.textContent).toContain('koopkracht')
    const { container: reeel } = render(
      <SimChart {...doellijnReeelProps()} strategy="perpetual" />,
    )
    expect(reeel.textContent).toContain('koopkracht')
  })

  it('tekent exact het bedrag uit de rows-prop — geen eigen deflatie in de grafiek', () => {
    // De crosshair leest `rows` en niets anders: wat de render-grens levert,
    // staat op het scherm. Daardoor toont jaar 0 (factor 1,0) in beide
    // weergaven hetzelfde bedrag, zonder knik op de naad.
    const rows = buildRows(40, 65, 58).map(r =>
      r.age === 43 ? { ...r, startPortfolio: 250_000 } : r,
    )
    const { container, getByText } = render(<SimChart {...richProps()} rows={rows} />)
    fireEvent.mouseMove(overlayRectOf(container), { clientX: 120, clientY: 100 })
    expect(getByText('Leeftijd 43')).toBeTruthy()
    expect(getByText('€250K')).toBeTruthy()
  })
})

// ── Bedragmaskering (T8 / AC-C2 t/m C4, ADR 0091) ───────────────────────────

/** Alle tekst die een gebruiker of screenreader kan oppikken. */
function leesbareTeksten(container: HTMLElement): string[] {
  const uit: string[] = []
  container.querySelectorAll('text, title').forEach(el => uit.push(el.textContent ?? ''))
  container.querySelectorAll('[aria-label], [title]').forEach(el => {
    uit.push(el.getAttribute('aria-label') ?? '')
    uit.push(el.getAttribute('title') ?? '')
  })
  return uit.filter(Boolean)
}

/** Posities van gridlijnen + doellijnen (y1/y2 van elke `line`). */
function lijnPosities(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('line')).map(
    l => `${l.getAttribute('x1')}|${l.getAttribute('x2')}|${l.getAttribute('y1')}|${l.getAttribute('y2')}`,
  )
}

function maskeerbareProps() {
  return {
    ...besteedbaarProps(),
    ...doellijnNominaalProps(),
    liquidPoints: besteedbaarProps().liquidPoints,
    fireTargetInclHome: 950_000,
  }
}

describe('SimChart — bedragmaskering (T8 / AC-C2)', () => {
  it('geen enkel euro-bedrag in <text>, title of aria-label onder maskering', () => {
    mockPrivacy.masked = true
    const { container } = render(<SimChart {...maskeerbareProps()} />)
    fireEvent.mouseMove(overlayRectOf(container), { clientX: 120, clientY: 100 })

    for (const tekst of leesbareTeksten(container)) {
      expect(tekst).not.toContain('€')
    }
    // Ook de HTML-tooltip (buiten de SVG) lekt niets.
    expect(container.textContent).not.toContain('€')
  })

  it('elk bedrag dat ongemaskeerd zichtbaar is, is gemaskeerd afwezig', () => {
    const { container: zichtbaar } = render(<SimChart {...maskeerbareProps()} />)
    fireEvent.mouseMove(overlayRectOf(zichtbaar), { clientX: 120, clientY: 100 })
    const bedragen = [
      ...leesbareTeksten(zichtbaar),
      ...Array.from(zichtbaar.querySelectorAll('span')).map(s => s.textContent ?? ''),
    ].filter(t => t.includes('€'))
    expect(bedragen.length).toBeGreaterThan(4) // y-as + doellijnen + tooltip

    mockPrivacy.masked = true
    const { container: gemaskeerd } = render(<SimChart {...maskeerbareProps()} />)
    fireEvent.mouseMove(overlayRectOf(gemaskeerd), { clientX: 120, clientY: 100 })
    for (const bedrag of bedragen) {
      expect(gemaskeerd.textContent).not.toContain(bedrag)
    }
  })

  it('geometrie blijft: gridlijn- en doellijn-posities identiek aan ongemaskeerd', () => {
    const { container: zichtbaar } = render(<SimChart {...maskeerbareProps()} />)
    const lijnenZichtbaar = lijnPosities(zichtbaar)
    const padenZichtbaar = pathDs(zichtbaar)

    mockPrivacy.masked = true
    const { container: gemaskeerd } = render(<SimChart {...maskeerbareProps()} />)
    expect(lijnPosities(gemaskeerd)).toEqual(lijnenZichtbaar)
    expect(pathDs(gemaskeerd)).toEqual(padenZichtbaar)
  })

  it('de doellijnen houden hun woordlabel, zonder bedrag', () => {
    mockPrivacy.masked = true
    const { getByText } = render(<SimChart {...maskeerbareProps()} />)
    expect(getByText('doel zonder je huis')).toBeTruthy()
    expect(getByText('doel met je huis')).toBeTruthy()
    expect(getByText('erfenis')).toBeTruthy() // woord alleen, geen "erfenis €497k"
  })

  it('de Y-as toont geen ticks meer (bullets op een as zijn ruis)', () => {
    const { container: zichtbaar } = render(<SimChart {...maskeerbareProps()} />)
    const tellingZichtbaar = zichtbaar.querySelectorAll('text').length

    mockPrivacy.masked = true
    const { container: gemaskeerd } = render(<SimChart {...maskeerbareProps()} />)
    // Vier y-ticks weg (en de losse bedrag-regels bij de doellijnen), maar de
    // x-as (leeftijden) blijft volledig staan — laag 3 van ADR 0091.
    expect(gemaskeerd.querySelectorAll('text').length).toBeLessThan(tellingZichtbaar)
    for (const el of Array.from(gemaskeerd.querySelectorAll('text'))) {
      expect(el.textContent ?? '').not.toContain(MASKED_AMOUNT_PLACEHOLDER)
    }
    expect(gemaskeerd.textContent).toContain('45') // x-as-leeftijd blijft
  })

  it('de crosshair-tooltip maskeert vermogen, besteedbaar, drijvers/drukkers, MC en scenario\'s', () => {
    mockPrivacy.masked = true
    const { container, getAllByText } = render(<SimChart {...watalsProps()} liquidPoints={besteedbaarProps().liquidPoints} />)
    fireEvent.mouseMove(overlayRectOf(container), { clientX: 120, clientY: 100 })
    // Elke bedrag-regel toont de bullets; de labels blijven leesbaar.
    expect(getAllByText(MASKED_AMOUNT_PLACEHOLDER).length).toBeGreaterThan(6)
    expect(container.textContent).toContain('Leeftijd 43')
    expect(container.textContent).toContain('Rendement')
    expect(container.textContent).toContain('MONTE CARLO')
  })
})

/**
 * Fixture waarin álle tekendragende regels tegelijk zichtbaar zijn: op leeftijd
 * 62 (onttrekkingsfase) staan er zowel een drijver (rendement, `+`) als een
 * drukker (onttrekking, `−`), én een wat-als-punt op diezelfde leeftijd zodat
 * de delta-regel met haar `±` meedoet.
 */
function tekenProps() {
  const base = richProps()
  return {
    ...base,
    scenarioOverlays: [
      ...base.scenarioOverlays,
      {
        name: 'watals',
        label: 'Jouw wat-als',
        color: '#9e6b50',
        variant: 'scenario' as const,
        fireAgeFractional: 54.5,
        points: [[40, 100000], [54, 600000], [62, 900000], [65, 1200000]] as [number, number][],
      },
    ],
  }
}

/** x=520 ⇒ 40 + ((520−60)/524)·25 = 61,95 ⇒ afgerond leeftijd 62. */
const HOVER_ONTTREKKING = 520

describe('SimChart — richting zonder teken (AC-C4)', () => {
  it('geen los + of − vóór een gemaskeerd bedrag', () => {
    mockPrivacy.masked = true
    const { container } = render(<SimChart {...tekenProps()} />)
    fireEvent.mouseMove(overlayRectOf(container), { clientX: HOVER_ONTTREKKING, clientY: 100 })
    const tekst = container.textContent ?? ''
    expect(tekst).toContain(MASKED_AMOUNT_PLACEHOLDER)
    expect(tekst).not.toContain(`+${MASKED_AMOUNT_PLACEHOLDER}`)
    expect(tekst).not.toContain(`−${MASKED_AMOUNT_PLACEHOLDER}`)
    // Richting blijft: het ▲/▼-icoon en de groepskop-regels.
    expect(tekst).toContain('▲')
    expect(tekst).toContain('▼')
  })

  it('ongemaskeerd blijven de tekens staan (byte-identiek aan vandaag)', () => {
    const { container } = render(<SimChart {...tekenProps()} />)
    fireEvent.mouseMove(overlayRectOf(container), { clientX: HOVER_ONTTREKKING, clientY: 100 })
    const tekst = container.textContent ?? ''
    expect(tekst).toContain('+€')
    expect(tekst).toContain('−€')
  })
})

describe('SimChart — maskering en euro-weergave zijn onafhankelijke assen (AC-C3)', () => {
  it('gemaskeerd én in huidige euro\'s: lijn vlak en aanwezig, bedragen weg', () => {
    mockPrivacy.masked = true
    const { container } = render(<SimChart {...doellijnReeelProps()} />)
    const path = doelPath(container)
    expect(path).toBeTruthy()
    const ys = pathYs(path!.getAttribute('d')!)
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.11)
    expect(container.textContent).toContain('erfenis')
    expect(container.textContent).not.toContain('€')
  })
})

// ── AC-C6: het propcontract blijft ongewijzigd ──────────────────────────────

describe('SimChart — propcontract (AC-C6, naad N2)', () => {
  it('kent geen `masked`- of `euroView`-prop: maskering komt uit de hook', () => {
    const props = richProps()
    // @ts-expect-error — `masked` is GEEN prop van SimChart (N2): zou dit
    // compileren, dan was het propcontract stilzwijgend verbreed.
    const metMasked = <SimChart {...props} masked />
    // @ts-expect-error — en de euro-weergave reist evenmin als prop mee (D9).
    const metView = <SimChart {...props} euroView="real" />
    expect(metMasked).toBeTruthy()
    expect(metView).toBeTruthy()
  })
})
