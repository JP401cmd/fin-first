/**
 * ToekomstCanvas per katern (ADR 0179 fase 2, stroom W1).
 *
 * Rendert het echte canvas met een gestubde provider en een gestubde grafiek (de
 * grafiek zelf is elders getest) en pint:
 *  - de modus-switch is ingeplugd (drie modi, keuze gaat naar `setCanvasModus`);
 *  - boven de grafiek vier interactieve elementen (drie in de kop + zoom); de
 *    jaar-op-jaar-tabel opent vanuit Plan, niet vanuit de kop;
 *  - lagen per katern: de doelscenario-lijn is in Doelen vast, in Plan een keuze;
 *    de fasebalk alleen in Plan; Instellingen compact en niet op mobiel;
 *  - de aannamesregel alleen in Plan, met dezelfde tekst als `aannamesRegelTekst`
 *    voor dezelfde invoer;
 *  - geen pills meer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { LAAG_VOLGORDE, aannamesRegelTekst, type CanvasModus, type LaagId } from '@/lib/horizon/katern-copy'
import { DOELEN_VOLGT_PLAN_REGEL } from './canvas-kopij-voorlopig'

const h = vi.hoisted(() => ({
  segment: null as string | null,
  grafiek: { current: null as Record<string, unknown> | null },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSelectedLayoutSegment: () => h.segment,
}))

vi.mock('@/lib/hooks/use-media-query', () => ({
  useMediaQuery: vi.fn(() => true),
  useIsLgUp: vi.fn(() => true),
}))

vi.mock('@/components/app/perspective-context-label', () => ({ PerspectiveContextLabel: () => null }))

vi.mock('./canvas-grafiek', () => ({
  CanvasGrafiek: (props: Record<string, unknown>) => {
    h.grafiek.current = props
    return <div data-testid="grafiek-stub" />
  },
}))

const setCanvasModus = vi.fn()
const toggleLaag = vi.fn()
let canvasModus: CanvasModus = 'vermogen'
let keuze: Record<LaagId, boolean>

const lagenKeuze = (aan: readonly LaagId[]) =>
  Object.fromEntries(LAAG_VOLGORDE.map((id) => [id, aan.includes(id)])) as Record<LaagId, boolean>

const simResult = { fireAge: 52, fireAgeFractional: 52.3, displayEndAge: 90, vastStopLeeftijd: null, strategy: 'deplete' }
const fireParams = { grossReturn: 0.05, inflationRate: 0.02 }
const events = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

vi.mock('@/components/toekomst/state/toekomst-state-provider', () => ({
  useToekomstPerspectiefContext: () => ({
    partnerName: null,
    isPartnerView: false,
    householdMainLine: null,
    partnerLine: null,
    usePartnerMainLine: false,
    useHouseholdMainLine: false,
    perspectiveHero: null,
    hasPerspectiveHero: false,
  }),
  useToekomstOverlayContext: () => ({
    setActiveModal: vi.fn(),
    setSimModalOpen: vi.fn(),
    setActiveFaseModal: vi.fn(),
    setEventPaneOpen: vi.fn(),
    setEventPaneEditingId: vi.fn(),
    setEventPaneMode: vi.fn(),
    setClusterSheet: vi.fn(),
    setSelectedYearAge: vi.fn(),
  }),
  useToekomstScenarioContext: () => ({ hasDoelLijn: true, labZone: null, nalatenschapMarker: undefined }),
  useToekomstSimContext: () => ({
    fireParams,
    userAowAge: { fractional: 67.25 },
    events,
    canonicalDailyRate: 100,
    heroFireAge: { age: 52.3 },
    displayMode: 'full',
    simResult,
    simCashflows: [],
    kernelHousingSale: null,
    scenarioPending: false,
    stopPadPending: false,
    projectiePending: false,
    currentAge: 40,
    planAnchor: { kind: 'solve' },
    isFixedAnchorMode: false,
    eventStopAge: null,
    effectiveNetWorth: 0,
    homeExcludedFromProgress: false,
    isPensioenMode: false,
    ankerReach: null,
    ankerStop: null,
    showDualFireTarget: false,
    planningMode: 'fire',
    chartEndAge: 89,
    liquidWealthPoints: undefined,
  }),
  useToekomstLagenContext: () => ({
    scenarioData: null,
    mcData: null,
    mcPending: false,
    mcFailed: false,
    ieViewMode: 'lines',
    setIeViewMode: vi.fn(),
    canvasModus,
    setCanvasModus,
    canvasLagenKeuze: keuze,
    toggleLaag,
    bouwChartEventOverlay: (l: object) => [{ id: 'bouw', lagen: l }],
    bouwEventsForTimeline: () => [],
    lifelineAge: null,
    setLifelineAge: vi.fn(),
    overlayPrefRestored: true,
    persistOverlayVisible: vi.fn(),
    handleOverlayExit: vi.fn(),
    overlayVisible: false,
    naturalMilestones: [],
    goalChartMarkers: [{ id: 'goal-1' }],
    handleChartEventClick: vi.fn(),
    handleChartClusterOpen: vi.fn(),
    handleChartEventDragMove: vi.fn(),
    handleChartEventDragEnd: vi.fn(),
    dualBasisAvailable: false,
    effectiveChartPrimaryBasis: 'total',
    secondaryLineVisible: false,
    mcMarge: null,
    handleEventDragEnd: vi.fn(),
  }),
  useToekomstEuroContext: () => ({
    viewDisplaySimRows: [],
    viewWealthCompositionRows: [],
    viewPartnerLineRows: null,
    viewHouseholdMainLineRows: null,
    viewLiquidWealthPoints: undefined,
    viewCombinedScenarioOverlays: [{ name: 'wat-als' }, { name: 'pessimistic' }],
    viewHouseholdOverlays: null,
    viewMonteCarloOverlay: undefined,
    viewFireTarget: 1,
    viewFireTargetInclHome: null,
    viewTargetEndPortfolio: undefined,
    viewTargetInflationFactors: [],
    viewReadoutData: null,
    viewIeBreakdownResult: null,
  }),
}))

import { ToekomstCanvas } from './toekomst-canvas'

function renderIn(segment: string | null) {
  h.segment = segment
  h.grafiek.current = null
  return render(
    <DisplayModeProvider initialMode="full">
      <ToekomstCanvas />
    </DisplayModeProvider>,
  )
}

const grafiek = () => h.grafiek.current as Record<string, unknown>
const overlayNamen = () => (grafiek().viewCombinedScenarioOverlays as { name: string }[]).map((o) => o.name)

beforeEach(() => {
  canvasModus = 'vermogen'
  keuze = lagenKeuze(['gebeurtenissen', 'mijlpalen'])
  setCanvasModus.mockClear()
  toggleLaag.mockClear()
})

describe('ToekomstCanvas — modus-switch ingeplugd', () => {
  it('biedt Vermogen · Samenstelling · Geldstroom en stuurt de keuze naar de provider', () => {
    renderIn(null)
    const groep = screen.getByRole('radiogroup', { name: 'Weergave van de grafiek' })
    const radios = within(groep).getAllByRole('radio')
    expect(radios.map((r) => r.textContent)).toEqual(['Vermogen', 'Samenstelling', 'Geldstroom'])
    fireEvent.click(within(groep).getByRole('radio', { name: 'Geldstroom' }))
    expect(setCanvasModus).toHaveBeenCalledWith('geldstroom')
    expect(grafiek().modus).toBe('vermogen')
  })

  it('heeft geen pills meer', () => {
    renderIn(null)
    expect(screen.queryByRole('button', { name: /Scenario-lijnen tonen/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Pad-modus|Opbouw-modus/ })).toBeNull()
  })

  it('houdt boven de grafiek drie bedieningselementen: modus-switch, Lagen en de i (plus de zoom: vier)', () => {
    const { container } = renderIn(null)
    const rij = container.querySelector('.z-\\[46\\]') as HTMLElement
    const groepen = rij.querySelectorAll('[role="radiogroup"]').length
    const losseKnoppen = Array.from(rij.querySelectorAll('button')).filter((b) => !b.closest('[role="radiogroup"]'))
    expect(groepen + losseKnoppen.length).toBe(3)
    // De jaar-op-jaar-tabel heeft één ingang, de link in Plan (spec §4.2 regel 10).
    expect(within(rij).queryByRole('button', { name: /Details/ })).toBeNull()
  })
})

describe('ToekomstCanvas — Plan', () => {
  it('toont de aannamesregel met de tekst van de canonieke opbouw', () => {
    renderIn(null)
    const regel = screen.getByTestId('aannamesregel')
    expect(regel.textContent).toContain(
      aannamesRegelTekst(
        { stop: null, eindleeftijd: 90, inflatiePct: 2, rendementPct: 5, gebeurtenissen: 3 },
        'volledig',
      ),
    )
    expect(within(regel).getByRole('link').getAttribute('href')).toBe('/toekomst/instellingen')
  })

  it('tekent de fasebalk en laat de doelscenario-lijn weg zolang die laag uit staat', () => {
    renderIn(null)
    expect(grafiek().toonFasebalk).toBe(true)
    expect(overlayNamen()).toEqual([])
  })

  it('volgt de keuze voor de doelscenario-lijn en de markers', () => {
    keuze = lagenKeuze(['gebeurtenissen', 'doelscenario'])
    renderIn(null)
    expect(overlayNamen()).toEqual(['wat-als'])
    expect(grafiek().chartEventOverlay).toEqual([
      { id: 'bouw', lagen: { gebeurtenissen: true, mijlpalen: false, doelen: false } },
    ])
  })

  it('toont de Lagen-knop', () => {
    renderIn(null)
    expect(screen.getByTestId('lagen-knop')).toBeTruthy()
  })
})

describe('ToekomstCanvas — Doelen', () => {
  it('zet de doelscenario-lijn en de doelmarkers vast aan, zonder aannamesregel en fasebalk', () => {
    renderIn('doelen')
    expect(overlayNamen()).toEqual(['wat-als'])
    expect(grafiek().chartEventOverlay).toEqual([
      { id: 'bouw', lagen: { gebeurtenissen: true, mijlpalen: true, doelen: true } },
    ])
    expect(grafiek().toonFasebalk).toBe(false)
    expect(screen.queryByTestId('aannamesregel')).toBeNull()
  })

  it('markeert de vaste lagen als "vast" in het menu', () => {
    renderIn('doelen')
    fireEvent.click(screen.getByTestId('lagen-knop'))
    const doelscenario = screen.getByTestId('laag-doelscenario')
    expect(doelscenario.textContent).toContain('vast')
    expect((within(doelscenario).getByRole('checkbox') as HTMLInputElement).disabled).toBe(true)
  })

  it('zegt in Samenstelling dat die modus het plan volgt', () => {
    canvasModus = 'samenstelling'
    renderIn('doelen')
    expect(screen.getByTestId('doelen-volgt-plan').textContent).toBe(DOELEN_VOLGT_PLAN_REGEL)
    expect(grafiek().modus).toBe('samenstelling')
  })
})

describe('ToekomstCanvas — Instellingen', () => {
  it('is compact: alleen Vermogen, geen modus-switch, geen Lagen, geen fasebalk, geen aannamesregel', () => {
    canvasModus = 'geldstroom'
    keuze = lagenKeuze(['gebeurtenissen', 'mijlpalen', 'doelscenario', 'rendementScenarios'])
    renderIn('instellingen')
    expect(screen.queryByRole('radiogroup', { name: 'Weergave van de grafiek' })).toBeNull()
    expect(screen.queryByTestId('lagen-knop')).toBeNull()
    expect(screen.queryByTestId('aannamesregel')).toBeNull()
    expect(grafiek().modus).toBe('vermogen')
    expect(grafiek().toonFasebalk).toBe(false)
    expect(overlayNamen()).toEqual([])
    expect(grafiek().chartEventOverlay).toEqual([
      { id: 'bouw', lagen: { gebeurtenissen: true, mijlpalen: false, doelen: false } },
    ])
  })

  it('ontbreekt op mobiel (alleen desktop)', () => {
    renderIn('instellingen')
    expect(screen.getByTestId('horizon-hero').className).toContain('hidden lg:block')
  })
})
