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
