import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HeroEditToggle, HeroWidgetRail, useHeroRailState } from './hero-widget-rail'
import { renderHook, act } from '@testing-library/react'
import type { WidgetPref } from '@/lib/widget-catalog'
import type { DashboardData } from '@/components/widgets/widget-renderer'

/**
 * Tests voor HeroWidgetRail. De rail is een dunne wrapper rond
 * DraggableWidgetGrid met twee aanpassingen: geen categoriebalk + geen
 * intro-empty-state. We mocken DraggableWidgetGrid in unit-tests zodat
 * we de rail-logica (defaultContent vs grid) in isolatie testen — de
 * volle DnD-flow heeft eigen tests in draggable-widget-grid.test.tsx.
 */

vi.mock('@/components/widgets/draggable-widget-grid', () => ({
  DraggableWidgetGrid: (props: {
    editMode?: boolean
    suppressIntroSheet?: boolean
    hideRemoveButton?: boolean
  }) => (
    <div
      data-testid="grid"
      data-edit={String(props.editMode)}
      data-suppress={String(props.suppressIntroSheet)}
      data-hideremove={String(props.hideRemoveButton ?? false)}
    >
      DraggableWidgetGrid mock
    </div>
  ),
}))

const mockData = {} as DashboardData

function makePref(id: string, enabled = true): WidgetPref {
  return { id, enabled, size: 'quarter', order: 0 }
}

describe('HeroEditToggle — render', () => {
  it('rendert pencil-icoon wanneer niet isEditing', () => {
    const { container } = render(
      <HeroEditToggle isEditing={false} onToggle={() => {}} />,
    )
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Hero bewerken',
    )
  })

  it('rendert check-icoon wanneer isEditing', () => {
    const { container } = render(
      <HeroEditToggle isEditing={true} onToggle={() => {}} />,
    )
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Bewerken stoppen',
    )
  })

  it('roept onToggle bij klik', () => {
    const onToggle = vi.fn()
    render(<HeroEditToggle isEditing={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalled()
  })
})

describe('useHeroRailState — hook', () => {
  it('start met isEditing=false', () => {
    const { result } = renderHook(() => useHeroRailState([]))
    expect(result.current.isEditing).toBe(false)
  })

  it('hasActiveWidgets=false bij lege prefs', () => {
    const { result } = renderHook(() => useHeroRailState([]))
    expect(result.current.hasActiveWidgets).toBe(false)
  })

  it('hasActiveWidgets=true wanneer minimaal 1 enabled widget', () => {
    const { result } = renderHook(() =>
      useHeroRailState([makePref('doelen', true)]),
    )
    expect(result.current.hasActiveWidgets).toBe(true)
  })

  it('hasActiveWidgets=false wanneer widgets allemaal disabled', () => {
    const { result } = renderHook(() =>
      useHeroRailState([makePref('doelen', false), makePref('acties', false)]),
    )
    expect(result.current.hasActiveWidgets).toBe(false)
  })

  it('setIsEditing wisselt isEditing-state', () => {
    const { result } = renderHook(() => useHeroRailState([]))
    act(() => result.current.setIsEditing(true))
    expect(result.current.isEditing).toBe(true)
    act(() => result.current.setIsEditing(false))
    expect(result.current.isEditing).toBe(false)
  })
})

describe('HeroWidgetRail — render-logica', () => {
  it('toont defaultContent wanneer niet isEditing EN geen widgets', () => {
    render(
      <HeroWidgetRail
        isEditing={false}
        onEditModeChange={() => {}}
        hasActiveWidgets={false}
        activeWidgets={[]}
        allPrefs={[]}
        dashboardData={mockData}
        defaultContent={<div data-testid="default">Default</div>}
      />,
    )
    expect(screen.getByTestId('default')).toBeTruthy()
    expect(screen.queryByTestId('grid')).toBeNull()
  })

  it('toont DraggableWidgetGrid bij isEditing (ook met lege prefs)', () => {
    render(
      <HeroWidgetRail
        isEditing={true}
        onEditModeChange={() => {}}
        hasActiveWidgets={false}
        activeWidgets={[]}
        allPrefs={[]}
        dashboardData={mockData}
        defaultContent={<div data-testid="default">Default</div>}
      />,
    )
    expect(screen.queryByTestId('default')).toBeNull()
    expect(screen.getByTestId('grid')).toBeTruthy()
  })

  it('toont DraggableWidgetGrid wanneer hasActiveWidgets, ook niet-edit', () => {
    render(
      <HeroWidgetRail
        isEditing={false}
        onEditModeChange={() => {}}
        hasActiveWidgets={true}
        activeWidgets={[makePref('doelen')]}
        allPrefs={[makePref('doelen')]}
        dashboardData={mockData}
        defaultContent={<div data-testid="default">Default</div>}
      />,
    )
    expect(screen.queryByTestId('default')).toBeNull()
    expect(screen.getByTestId('grid')).toBeTruthy()
  })

  it('geeft suppressIntroSheet door aan DraggableWidgetGrid', () => {
    render(
      <HeroWidgetRail
        isEditing={true}
        onEditModeChange={() => {}}
        hasActiveWidgets={false}
        activeWidgets={[]}
        allPrefs={[]}
        dashboardData={mockData}
        defaultContent={<div>Default</div>}
      />,
    )
    expect(screen.getByTestId('grid').getAttribute('data-suppress')).toBe('true')
  })

  it('geeft editMode-state door als controlled prop', () => {
    render(
      <HeroWidgetRail
        isEditing={true}
        onEditModeChange={() => {}}
        hasActiveWidgets={false}
        activeWidgets={[]}
        allPrefs={[]}
        dashboardData={mockData}
        defaultContent={<div>Default</div>}
      />,
    )
    expect(screen.getByTestId('grid').getAttribute('data-edit')).toBe('true')
  })

  it('hideRemoveButton blijft FALSE — verwijder-knop op widgets moet zichtbaar zijn bij bewerken', () => {
    // Bug-fix mei 2026: hideHeader koppelde per ongeluk de verwijder-knop
    // uit, waardoor widgets in edit-mode niet meer te verwijderen waren.
    render(
      <HeroWidgetRail
        isEditing={true}
        onEditModeChange={() => {}}
        hasActiveWidgets={false}
        activeWidgets={[]}
        allPrefs={[]}
        dashboardData={mockData}
        defaultContent={<div>Default</div>}
      />,
    )
    expect(screen.getByTestId('grid').getAttribute('data-hideremove')).toBe('false')
  })
})
