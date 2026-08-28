import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { ChartEventMarkers } from './chart-event-markers'
import type { ChartEventOverlay } from '@/lib/chart-event-overlay'

function makeEvent(
  overrides: Partial<ChartEventOverlay> & { id: string },
): ChartEventOverlay {
  const { id, sourceId, kind, age, ...rest } = overrides
  return {
    id,
    sourceId: sourceId ?? id.replace(/^event:/, ''),
    kind: kind ?? 'life_event',
    age: age ?? 40,
    icon: 'Calendar',
    color: '#000',
    label: 'Test event',
    detail: null,
    ...rest,
  } as ChartEventOverlay
}

function renderInSvg(node: React.ReactNode) {
  // ChartEventMarkers rendert SVG-elementen; wikkel in <svg> zodat
  // testing-library-DOM ze accepteert.
  return render(<svg width={800} height={400}>{node}</svg>)
}

/**
 * Voor de tests gebruiken we een eenvoudige xScale die 20-100 jaar
 * mapt op 0-800px (lineair).
 */
function xScale(age: number): number {
  return ((age - 20) / 80) * 800
}

describe('ChartEventMarkers — basis-render', () => {
  it('rendert markers voor zichtbare events', () => {
    const events = [makeEvent({ id: 'e1', age: 40 }), makeEvent({ id: 'e2', age: 60 })]
    const { queryByTestId } = renderInSvg(
      <ChartEventMarkers
        events={events}
        xScale={xScale}
        padLeft={50}
        chartTopY={20}
        chartBottomY={300}
        visibleMinAge={20}
        visibleMaxAge={100}
      />,
    )
    expect(queryByTestId('chart-event-marker-e1')).toBeTruthy()
    expect(queryByTestId('chart-event-marker-e2')).toBeTruthy()
  })

  it('filtert events buiten visibleRange', () => {
    const events = [makeEvent({ id: 'e1', age: 10 }), makeEvent({ id: 'e2', age: 40 })]
    const { queryByTestId } = renderInSvg(
      <ChartEventMarkers
        events={events}
        xScale={xScale}
        padLeft={50}
        chartTopY={20}
        chartBottomY={300}
        visibleMinAge={20}
        visibleMaxAge={100}
      />,
    )
    expect(queryByTestId('chart-event-marker-e1')).toBeNull()
    expect(queryByTestId('chart-event-marker-e2')).toBeTruthy()
  })
})

describe('ChartEventMarkers — click vs drag (F-1)', () => {
  it('pointer-down + up zonder beweging triggert onEventClick', () => {
    const onEventClick = vi.fn()
    const onEventDragEnd = vi.fn()
    const events = [makeEvent({ id: 'e1', age: 40 })]
    const { getByTestId } = renderInSvg(
      <ChartEventMarkers
        events={events}
        xScale={xScale}
        padLeft={50}
        chartTopY={20}
        chartBottomY={300}
        visibleMinAge={20}
        visibleMaxAge={100}
        onEventClick={onEventClick}
        onEventDragEnd={onEventDragEnd}
      />,
    )
    const marker = getByTestId('chart-event-marker-e1')
    fireEvent.pointerDown(marker, { pointerId: 1, clientX: 100 })
    fireEvent.pointerUp(marker, { pointerId: 1, clientX: 100 })
    fireEvent.click(marker)
    expect(onEventClick).toHaveBeenCalledOnce()
    expect(onEventDragEnd).not.toHaveBeenCalled()
  })

  it('pointer-move boven drempel + up triggert onEventDragEnd', () => {
    const onEventClick = vi.fn()
    const onEventDragEnd = vi.fn()
    const events = [makeEvent({ id: 'e1', age: 40, sourceId: 'src-1' })]
    const { getByTestId } = renderInSvg(
      <ChartEventMarkers
        events={events}
        xScale={xScale}
        padLeft={50}
        chartTopY={20}
        chartBottomY={300}
        visibleMinAge={20}
        visibleMaxAge={100}
        onEventClick={onEventClick}
        onEventDragEnd={onEventDragEnd}
      />,
    )
    const marker = getByTestId('chart-event-marker-e1')
    fireEvent.pointerDown(marker, { pointerId: 1, clientX: 100 })
    // Beweeg 50px naar rechts (50/800 × 80 ≈ 5 jaar)
    fireEvent.pointerMove(marker, { pointerId: 1, clientX: 150 })
    fireEvent.pointerUp(marker, { pointerId: 1, clientX: 150 })
    fireEvent.click(marker)
    expect(onEventDragEnd).toHaveBeenCalledOnce()
    // Click wordt onderdrukt na een drag
    expect(onEventClick).not.toHaveBeenCalled()
    // Verstuurde nieuwe leeftijd is ongeveer 45 (40 + 5)
    const [, sourceId, newAge, kind] = onEventDragEnd.mock.calls[0]!
    expect(sourceId).toBe('src-1')
    expect(kind).toBe('life_event')
    expect(newAge).toBeGreaterThanOrEqual(44)
    expect(newAge).toBeLessThanOrEqual(46)
  })

  it('natural-milestone-events zijn niet dragbaar', () => {
    const onEventDragEnd = vi.fn()
    const events = [
      makeEvent({ id: 'e1', age: 40, kind: 'natural', sourceId: 'milestone-1' }),
    ]
    const { getByTestId } = renderInSvg(
      <ChartEventMarkers
        events={events}
        xScale={xScale}
        padLeft={50}
        chartTopY={20}
        chartBottomY={300}
        visibleMinAge={20}
        visibleMaxAge={100}
        onEventDragEnd={onEventDragEnd}
      />,
    )
    const marker = getByTestId('chart-event-marker-e1')
    fireEvent.pointerDown(marker, { pointerId: 1, clientX: 100 })
    fireEvent.pointerMove(marker, { pointerId: 1, clientX: 200 })
    fireEvent.pointerUp(marker, { pointerId: 1, clientX: 200 })
    expect(onEventDragEnd).not.toHaveBeenCalled()
  })

  it('vuurt onEventDragMove per kwartaal-crossing tijdens drag (F-5 live)', () => {
    const onEventDragMove = vi.fn()
    const events = [makeEvent({ id: 'e1', age: 40, sourceId: 'src-1' })]
    const { getByTestId } = renderInSvg(
      <ChartEventMarkers
        events={events}
        xScale={xScale}
        padLeft={50}
        chartTopY={20}
        chartBottomY={300}
        visibleMinAge={20}
        visibleMaxAge={100}
        onEventDragEnd={() => {}}
        onEventDragMove={onEventDragMove}
      />,
    )
    const marker = getByTestId('chart-event-marker-e1')
    fireEvent.pointerDown(marker, { pointerId: 1, clientX: 100 })
    // 800px / 80 jaar = 10px per jaar; 2.5px = kwartaal (0.25 jaar)
    // Beweeg 30px naar rechts (3 jaar / 12 kwartalen) — verwacht 12 calls
    // maar mogelijk minder door bouncing tussen integer-snaps. We checken
    // alleen dat een meaningful aantal callbacks is gevuurd.
    fireEvent.pointerMove(marker, { pointerId: 1, clientX: 110 }) // +1 jr
    fireEvent.pointerMove(marker, { pointerId: 1, clientX: 130 }) // +3 jr
    fireEvent.pointerUp(marker, { pointerId: 1, clientX: 130 })
    expect(onEventDragMove.mock.calls.length).toBeGreaterThanOrEqual(2)
    // Eerste move-call moet een nieuwe leeftijd ≠ 40 leveren
    const [, sourceId, newAge, kind] = onEventDragMove.mock.calls[0]!
    expect(sourceId).toBe('src-1')
    expect(kind).toBe('life_event')
    expect(newAge).not.toBe(40)
  })

  it('zonder onEventDragEnd-prop is drag een no-op', () => {
    const onEventClick = vi.fn()
    const events = [makeEvent({ id: 'e1', age: 40 })]
    const { getByTestId } = renderInSvg(
      <ChartEventMarkers
        events={events}
        xScale={xScale}
        padLeft={50}
        chartTopY={20}
        chartBottomY={300}
        visibleMinAge={20}
        visibleMaxAge={100}
        onEventClick={onEventClick}
      />,
    )
    const marker = getByTestId('chart-event-marker-e1')
    fireEvent.pointerDown(marker, { pointerId: 1, clientX: 100 })
    fireEvent.pointerMove(marker, { pointerId: 1, clientX: 200 })
    fireEvent.pointerUp(marker, { pointerId: 1, clientX: 200 })
    fireEvent.click(marker)
    // Klik blijft werken in read-only modus
    expect(onEventClick).toHaveBeenCalledOnce()
  })
})

/**
 * M16 — met de duim bedienbaar. De xScale hierboven mapt 80 jaar op 800px, dus
 * 10px per jaar: gebeurtenissen in aangrenzende jaren liggen 10px uit elkaar,
 * ruim binnen de clusterdrempel van 28px. Dat is dezelfde verhouding als op de
 * echte uitgezoomde grafiek (~5-6 px/jaar), waar tien iconen van 28px vrijwel
 * volledig over elkaar heen vielen.
 */
describe('ChartEventMarkers — pixel-cluster en de uitgang naar de lijst (M16)', () => {
  // Vijf jaren op rij: 10px per stap, dus alle vijf binnen de drempel. (Een
  // zesde op leeftijd 45 zou er NET buiten vallen — de drempel wordt tegen het
  // meeschuivende zwaartepunt gemeten, zie lib/chart-event-overlay.test.ts.)
  const dichtOpElkaar = [40, 41, 42, 43, 44].map((age, i) =>
    makeEvent({ id: `c${i}`, age }),
  )

  function renderCluster(extra: Record<string, unknown> = {}) {
    return renderInSvg(
      <ChartEventMarkers
        events={dichtOpElkaar}
        xScale={xScale}
        padLeft={50}
        chartTopY={20}
        chartBottomY={300}
        visibleMinAge={20}
        visibleMaxAge={100}
        {...extra}
      />,
    )
  }

  it('stapelt aangrenzende jaren tot één cluster in plaats van zes losse markers', () => {
    const { queryByTestId } = renderCluster()

    // Drie zichtbaar (MAX_STACK_VISIBLE), de rest zit achter de badge — waar
    // vóór deze fix zes markers boven op elkaar stonden.
    expect(queryByTestId('chart-event-marker-c0')).toBeTruthy()
    expect(queryByTestId('chart-event-marker-c1')).toBeTruthy()
    expect(queryByTestId('chart-event-marker-c2')).toBeTruthy()
    expect(queryByTestId('chart-event-marker-c3')).toBeNull()
    expect(queryByTestId('chart-event-marker-c4')).toBeNull()
  })

  it('opent via de badge de VOLLEDIGE lijst, niet alleen de verborgen events', () => {
    const onClusterOpen = vi.fn()
    const { getByTestId } = renderCluster({ onClusterOpen })

    fireEvent.click(getByTestId('chart-event-cluster-c2'))

    expect(onClusterOpen).toHaveBeenCalledOnce()
    const [events, centerAge] = onClusterOpen.mock.calls[0]
    // Vijf leden — de badge telt er vijf, dus de sheet moet er vijf tonen.
    expect(events.map((e: ChartEventOverlay) => e.id).sort()).toEqual([
      'c0', 'c1', 'c2', 'c3', 'c4',
    ])
    expect(centerAge).toBeCloseTo(42, 5)
  })

  it('een tik op de badge opent de lijst en NIET de gebeurtenis eronder', () => {
    // Dit is de kern van de bevinding: welke marker een tik wint was
    // onvoorspelbaar. De badge moet zijn eigen tik houden.
    const onClusterOpen = vi.fn()
    const onEventClick = vi.fn()
    const { getByTestId } = renderCluster({ onClusterOpen, onEventClick })

    fireEvent.click(getByTestId('chart-event-cluster-c2'))

    expect(onClusterOpen).toHaveBeenCalledOnce()
    expect(onEventClick).not.toHaveBeenCalled()
  })

  it('blijft zonder onClusterOpen puur decoratief (geen valse affordance)', () => {
    const { getByTestId } = renderCluster()
    const badge = getByTestId('chart-event-cluster-c2')

    expect(badge.getAttribute('role')).toBeNull()
    expect(badge.getAttribute('aria-label')).toBeNull()
  })

  it('draagt een aria-label met het aantal en de leeftijd van het cluster', () => {
    const { getByTestId } = renderCluster({ onClusterOpen: vi.fn() })
    const badge = getByTestId('chart-event-cluster-c2')

    expect(badge.getAttribute('role')).toBe('button')
    expect(badge.getAttribute('aria-label')).toBe(
      '5 gebeurtenissen rond leeftijd 42 — open lijst',
    )
  })

  it('laat losstaande gebeurtenissen ongemoeid — geen badge, gewone klik', () => {
    const onClusterOpen = vi.fn()
    const onEventClick = vi.fn()
    const verspreid = [makeEvent({ id: 'v1', age: 30 }), makeEvent({ id: 'v2', age: 60 })]
    const { queryByTestId, getByTestId } = renderInSvg(
      <ChartEventMarkers
        events={verspreid}
        xScale={xScale}
        padLeft={50}
        chartTopY={20}
        chartBottomY={300}
        visibleMinAge={20}
        visibleMaxAge={100}
        onClusterOpen={onClusterOpen}
        onEventClick={onEventClick}
      />,
    )

    expect(queryByTestId('chart-event-cluster-v1')).toBeNull()
    fireEvent.click(getByTestId('chart-event-marker-v1'))
    expect(onEventClick).toHaveBeenCalledOnce()
    expect(onClusterOpen).not.toHaveBeenCalled()
  })
})
