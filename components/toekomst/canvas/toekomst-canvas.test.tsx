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
import {
  DOELEN_VOLGT_PLAN_REGEL,
  LAAG_VOLGORDE,
  aannamesRegelTekst,
  type CanvasModus,
  type LaagId,
} from '@/lib/horizon/katern-copy'

const h = vi.hoisted(() => ({
  segment: null as string | null,
  grafiek: { current: null as Record<string, unknown> | null },
  // De eind-vorm van het plan. Standaard een vorm mét eindleeftijd; de perpetual-test zet hem om.
  eindvorm: 'deplete' as 'deplete' | 'legacy' | 'perpetual',
  gebeurtenissen: { events: [] } as Record<string, unknown> | null,
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
vi.mock('@/components/app/horizon/lifeline-readout', () => ({
  LifelineReadout: () => <div data-testid="lifeline-readout" />,
}))

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
let displayMode: 'simple' | 'full' = 'full'
// ADR 0179 fase 4 — het doelgrootboek en het perspectief (solo = lab zichtbaar).
let doelGrootboek: Record<string, unknown> | null = null
let verkenSectieZichtbaar = true
const DOEL_STAVEN = [{ age: 41, spaargeld: 1 }]
const DOEL_RIJEN = [{ age: 41, endPortfolio: 2 }]
const DOEL_BRONNEN = { rows: [] }

const lagenKeuze = (aan: readonly LaagId[]) =>
  Object.fromEntries(LAAG_VOLGORDE.map((id) => [id, aan.includes(id)])) as Record<LaagId, boolean>

// Eeuwigdurend: de kernel rekent tot zijn horizonplafond (displayEndAge 100), terwijl
// Instellingen de ingestelde eindleeftijd noemt ("Tot 90 jaar").
const simResult = { fireAge: 52, fireAgeFractional: 52.3, displayEndAge: 100, vastStopLeeftijd: null, strategy: 'perpetual' }
const fireStrategy = { strategy: 'perpetual', endAge: 90, legacyAmount: 0 }
const fireParams = { grossReturn: 0.05, inflationRate: 0.02 }
const events = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

vi.mock('@/components/toekomst/state/toekomst-state-provider', () => ({
  // Plan krijgt de gebeurtenissen in de kolom naast de grafiek (27 sep).
  useToekomstBron: () => ({ gebeurtenissen: h.gebeurtenissen }),
  useToekomstPerspectiefContext: () => ({
    partnerName: null,
    isPartnerView: false,
    householdMainLine: null,
    partnerLine: null,
    usePartnerMainLine: false,
    useHouseholdMainLine: false,
    perspectiveHero: null,
    hasPerspectiveHero: false,
    verkenSectieZichtbaar,
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
  useToekomstScenarioContext: () => ({ hasDoelLijn: true, labZone: 'zone-plan', nalatenschapMarker: { zone: null }, doelGrootboek }),
  useToekomstSimContext: () => ({
    fireParams,
    fireStrategy,
    planEindvorm: h.eindvorm,
    userAowAge: { fractional: 67.25 },
    events,
    canonicalDailyRate: 100,
    heroFireAge: { age: 52.3 },
    displayMode,
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
    viewMonteCarloOverlay: { naam: 'marktcheck-band' },
    viewFireTarget: 1,
    viewFireTargetInclHome: null,
    viewTargetEndPortfolio: undefined,
    viewTargetInflationFactors: [],
    viewReadoutData: { age: 45 },
    viewIeBreakdownResult: null,
    viewDoelDisplaySimRows: doelGrootboek ? DOEL_RIJEN : null,
    viewDoelWealthCompositionRows: doelGrootboek ? DOEL_STAVEN : null,
    viewDoelIeBreakdownResult: doelGrootboek ? DOEL_BRONNEN : null,
  }),
}))

import { ToekomstCanvas } from './toekomst-canvas'
import { COMPACTE_PLOTHOOGTE, KOLOM_PLOTHOOGTE } from './canvas-stand'

function renderIn(segment: string | null, eindvorm: 'deplete' | 'legacy' | 'perpetual' = 'deplete') {
  h.segment = segment
  h.eindvorm = eindvorm
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
  displayMode = 'full'
  setCanvasModus.mockClear()
  toggleLaag.mockClear()
  doelGrootboek = null
  verkenSectieZichtbaar = true
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

  it('noemt de ingestelde eindleeftijd zoals Instellingen, niet het horizonplafond van de kernel', () => {
    renderIn(null)
    const regel = screen.getByTestId('aannamesregel')
    expect(regel.textContent).toContain('plan tot je 90e')
    expect(regel.textContent).not.toContain('100e')
  })

  it('noemt bij een eeuwigdurend plan geen eindleeftijd ("Mijn vermogen mag niet slinken" heeft er geen)', () => {
    renderIn(null, 'perpetual')
    const regel = screen.getByTestId('aannamesregel')
    expect(regel.textContent).toContain('je vermogen mag niet slinken')
    expect(regel.textContent).not.toMatch(/tot je \d+e/)
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

  it('één scherm (ADR 0179 D7): geen cijferbalk en geen tijdlijn, lagere grafiek; Plan houdt ze', () => {
    renderIn('doelen')
    expect(screen.queryByTestId('canvas-readout')).toBeNull()
    expect(grafiek().toonTijdlijn).toBe(false)
    expect(grafiek().toonReadout).toBe(false)
    // useIsLgUp is hier gemockt op true ⇒ de maat van de canvas-rij; zonder meting
    // (jsdom meet niets) de startwaarde. Samenstelling groeit even hard mee.
    expect(grafiek().plotHoogte).toBe(KOLOM_PLOTHOOGTE.start)
    expect(grafiek().samenstellingHoogte).toBe(KOLOM_PLOTHOOGTE.start)
    expect(grafiek().hoofdlijnGedempt).toBe(true)
    renderIn(null)
    expect(grafiek().toonTijdlijn).toBe(true)
    // Plan op desktop: dezelfde maat als Doelen (de grafiek verspringt niet bij de wissel).
    expect(grafiek().plotHoogte).toBe(KOLOM_PLOTHOOGTE.start)
    expect(grafiek().hoofdlijnGedempt).toBe(false)
  })

  it('zegt in Samenstelling dat die modus het plan volgt', () => {
    canvasModus = 'samenstelling'
    renderIn('doelen')
    expect(screen.getByTestId('doelen-volgt-plan').textContent).toBe(DOELEN_VOLGT_PLAN_REGEL)
    expect(grafiek().modus).toBe('samenstelling')
  })
})

describe('ToekomstCanvas — de canvas-rij in Doelen: grafiek links, lab rechts (ADR 0179 D7)', () => {
  function renderMetKolom(segment: string | null) {
    h.segment = segment
    return render(
      <DisplayModeProvider initialMode="full">
        <ToekomstCanvas
          zijkolom={<div data-testid="lab-kolom-stub" />}
          actierij={<div data-testid="actierij-stub" />}
        />
      </DisplayModeProvider>,
    )
  }

  it('Doelen: twee kolommen vanaf lg, het lab in de rechterkolom (alleen vanaf lg zichtbaar)', () => {
    renderMetKolom('doelen')
    const rij = screen.getByTestId('doelen-canvas-rij')
    expect(rij.className).toContain('lg:grid')
    expect(rij.className).toContain('lg:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]')
    const kolom = screen.getByTestId('doelen-canvas-zijkolom')
    expect(kolom.className).toContain('hidden')
    expect(kolom.className).toContain('lg:block')
    expect(within(kolom).getByTestId('lab-kolom-stub')).toBeTruthy()
    // De grafiek staat in de linkerkolom, niet in de zijkolom.
    expect(within(kolom).queryByTestId('grafiek-stub')).toBeNull()
    expect(within(rij).getByTestId('grafiek-stub')).toBeTruthy()
  })

  it('Doelen: de kolom is maatgevend (gewone stroom), de grafiekkolom houdt zijn natuurlijke hoogte', () => {
    renderMetKolom('doelen')
    expect(screen.getByTestId('doelen-canvas-rij').getAttribute('data-kolom')).toBe('maatgevend')
    expect(screen.getByTestId('canvas-kolom-inhoud').className).not.toContain('absolute')
    const grafiekKolom = screen.getByTestId('grafiek-stub').closest('.min-w-0') as HTMLElement
    expect(grafiekKolom.className).toContain('lg:self-start')
  })

  it('Doelen: de acties staan in een rij over de volle breedte ónder grafiek en kolom (alleen vanaf lg)', () => {
    renderMetKolom('doelen')
    const actierij = screen.getByTestId('doelen-canvas-actierij')
    expect(within(actierij).getByTestId('actierij-stub')).toBeTruthy()
    expect(actierij.className).toContain('hidden')
    expect(actierij.className).toContain('lg:block')
    // Niet in de rij en niet in de kolom: eronder, binnen dezelfde kaart.
    expect(within(screen.getByTestId('doelen-canvas-rij')).queryByTestId('actierij-stub')).toBeNull()
    expect(screen.getByTestId('horizon-hero').contains(actierij)).toBe(true)
  })

  it('Plan: dezelfde kolommen, de gebeurtenissen volgen de rijhoogte en scrollen zelf; geen actierij', () => {
    renderMetKolom(null)
    const rij = screen.getByTestId('doelen-canvas-rij')
    expect(rij.className).toContain('lg:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]')
    expect(rij.getAttribute('data-kolom')).toBe('volgend')
    const inhoud = screen.getByTestId('canvas-kolom-inhoud')
    expect(inhoud.className).toContain('absolute inset-0')
    expect(inhoud.className).toContain('overflow-y-auto')
    expect(within(inhoud).getByTestId('lab-kolom-stub')).toBeTruthy()
    expect(screen.queryByTestId('doelen-canvas-actierij')).toBeNull()
  })

  it('Plan zonder gebeurtenissen-data: geen kolom', () => {
    h.gebeurtenissen = null
    try {
      renderMetKolom(null)
      expect(screen.queryByTestId('doelen-canvas-rij')).toBeNull()
      expect(screen.queryByTestId('doelen-canvas-zijkolom')).toBeNull()
    } finally {
      h.gebeurtenissen = { events: [] }
    }
  })

  it('de kaart (27 sep): tilt niet, deelt op desktop de basislijn van de tabbladen, accentbalk alleen mobiel', () => {
    renderMetKolom('doelen')
    const kaart = screen.getByTestId('horizon-hero')
    expect(kaart.className).toContain('no-hover-lift')
    expect(kaart.className).toContain('lg:-mt-px')
    const balk = kaart.firstElementChild as HTMLElement
    expect(balk.className).toContain('h-1.5')
    expect(balk.className).toContain('lg:hidden')
  })

  it('Instellingen: geen rij, geen kolom, geen actierij', () => {
    renderMetKolom('instellingen')
    expect(screen.queryByTestId('doelen-canvas-rij')).toBeNull()
    expect(screen.queryByTestId('doelen-canvas-zijkolom')).toBeNull()
    expect(screen.queryByTestId('doelen-canvas-actierij')).toBeNull()
  })
})

describe('ToekomstCanvas — Samenstelling en Geldstroom in Doelen tonen het doelscenario (fase 4)', () => {
  const grootboek = { fireAge: 55, fireAgeFractional: 55.4, kernelHousingSale: { age: 70 } }

  it('Samenstelling: de doelfeeds uit dezelfde run, met label en zonder terugvalregel', () => {
    canvasModus = 'samenstelling'
    doelGrootboek = grootboek
    renderIn('doelen')
    const feed = grafiek().doelscenario as Record<string, unknown>
    expect(feed.viewWealthCompositionRows).toBe(DOEL_STAVEN)
    expect(feed.viewSimRows).toBe(DOEL_RIJEN)
    expect(feed.viewIeBreakdownResult).toBe(DOEL_BRONNEN)
    expect(feed.fireAge).toBe(55)
    expect(feed.fireAgeFractional).toBe(55.4)
    expect(feed.housingSaleAge).toBe(70)
    expect(screen.getByTestId('doelen-toont-doelscenario').textContent).toContain('Je doelscenario')
    expect(screen.queryByTestId('doelen-volgt-plan')).toBeNull()
  })

  it('Geldstroom: idem', () => {
    canvasModus = 'geldstroom'
    doelGrootboek = grootboek
    renderIn('doelen')
    expect((grafiek().doelscenario as Record<string, unknown>).viewSimRows).toBe(DOEL_RIJEN)
  })

  it('partner- of huishoudperspectief: het plan, met de terugvalregel', () => {
    canvasModus = 'samenstelling'
    doelGrootboek = grootboek
    verkenSectieZichtbaar = false
    renderIn('doelen')
    expect(grafiek().doelscenario).toBeNull()
    expect(screen.getByTestId('doelen-volgt-plan').textContent).toBe(DOELEN_VOLGT_PLAN_REGEL)
  })

  it('in Plan en in Vermogen: altijd het plan', () => {
    canvasModus = 'samenstelling'
    doelGrootboek = grootboek
    renderIn(null)
    expect(grafiek().doelscenario).toBeNull()
    expect(screen.queryByTestId('doelen-toont-doelscenario')).toBeNull()
    canvasModus = 'vermogen'
    renderIn('doelen')
    expect(grafiek().doelscenario).toBeNull()
  })
})

describe('ToekomstCanvas — Eenvoudig tekent alleen de lagen van zijn menu (spec §4.7)', () => {
  // Een keuze uit Volledig: Rendement hoger en lager en de doelscenario-lijn aan.
  const volledigeKeuze = () => lagenKeuze(['gebeurtenissen', 'doelscenario', 'rendementScenarios', 'marktcheck'])

  it('Volledig: de rendementsvarianten staan op de grafiek', () => {
    keuze = volledigeKeuze()
    renderIn(null)
    expect(overlayNamen()).toEqual(['wat-als', 'pessimistic'])
    expect(grafiek().viewMonteCarloOverlay).toEqual({ naam: 'marktcheck-band' })
  })

  it('Eenvoudig: dezelfde keuze tekent de rendementsvarianten niet, de doelscenario-lijn wel', () => {
    keuze = volledigeKeuze()
    displayMode = 'simple'
    renderIn(null)
    expect(overlayNamen()).toEqual(['wat-als'])
    expect(grafiek().viewMonteCarloOverlay).toBeUndefined()
  })
})

describe('ToekomstCanvas — Instellingen', () => {
  it('is compact en volgt de keuze (27 sep): modus-switch wel, geen Lagen, geen fasebalk, geen aannamesregel', () => {
    canvasModus = 'geldstroom'
    keuze = lagenKeuze(['gebeurtenissen', 'mijlpalen', 'doelscenario', 'rendementScenarios'])
    renderIn('instellingen')
    expect(screen.getByRole('radiogroup', { name: 'Weergave van de grafiek' })).toBeTruthy()
    expect(screen.queryByTestId('lagen-knop')).toBeNull()
    expect(screen.queryByTestId('aannamesregel')).toBeNull()
    expect(grafiek().modus).toBe('geldstroom')
    expect(grafiek().toonFasebalk).toBe(false)
    expect(grafiek().plotHoogte).toBe(COMPACTE_PLOTHOOGTE)
    expect(grafiek().samenstellingHoogte).toBe(COMPACTE_PLOTHOOGTE)
    expect(overlayNamen()).toEqual([])
    expect(grafiek().chartEventOverlay).toEqual([
      { id: 'bouw', lagen: { gebeurtenissen: true, mijlpalen: false, doelen: false } },
    ])
  })

  it('in Vermogen: alleen de hoofdlijn — geen doellijnen, geen verschilvlak of nalatenschap-bol, geen cijferbalk', () => {
    canvasModus = 'vermogen'
    renderIn('instellingen')
    expect(grafiek().viewFireTarget).toBeUndefined()
    expect(grafiek().showDualFireTarget).toBe(false)
    expect(grafiek().viewTargetEndPortfolio).toBeUndefined()
    expect(grafiek().viewTargetInflationFactors).toEqual([])
    expect(grafiek().labZone).toBeNull()
    expect(grafiek().nalatenschapMarker).toBeUndefined()
    expect(screen.queryByTestId('lifeline-readout')).toBeNull()
  })

  it('Plan houdt de doellijn en de cijferbalk', () => {
    renderIn(null)
    expect(grafiek().viewFireTarget).toBe(1)
    expect(grafiek().labZone).toBe('zone-plan')
    expect(grafiek().nalatenschapMarker).toEqual({ zone: null })
    expect(screen.getByTestId('lifeline-readout')).toBeTruthy()
  })

  it('ontbreekt op mobiel (alleen desktop)', () => {
    renderIn('instellingen')
    expect(screen.getByTestId('horizon-hero').className).toContain('hidden lg:block')
  })
})
