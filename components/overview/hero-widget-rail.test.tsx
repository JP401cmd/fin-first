import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HeroEditToggle, HeroWidgetRail } from './hero-widget-rail'
import type { DashboardData } from '@/components/widgets/widget-renderer'

/**
 * Tests voor HeroWidgetRail — power-user-feature die Voortgang-doelen +
 * Vrijheidsstrip kan vervangen door 4 configureerbare widget-slots.
 *
 * Note: WidgetRenderer-rendering hangt af van useFeatureAccess +
 * useModuleAccess providers. Voor unit-tests mocken we die zodat we
 * de rail in isolatie kunnen testen — anders bubblen module-checks
 * irrelevante errors door.
 */

vi.mock('@/components/app/feature-access-provider', () => ({
  useFeatureAccess: () => ({ features: {} }),
}))

vi.mock('@/components/widgets/widget-renderer', () => ({
  WidgetRenderer: ({ id }: { id: string }) => (
    <div data-testid={`widget-${id}`}>Widget {id}</div>
  ),
}))

const mockData = {} as DashboardData

beforeEach(() => {
  // Reset localStorage tussen tests
  window.localStorage.clear()
})

describe('HeroEditToggle — render', () => {
  it('rendert pencil-icoon wanneer niet isEditing', () => {
    const { container } = render(
      <HeroEditToggle isEditing={false} onToggle={() => {}} />,
    )
    expect(container.querySelector('svg')).toBeTruthy()
    const button = container.querySelector('button')
    expect(button?.getAttribute('aria-label')).toBe('Hero bewerken')
  })

  it('rendert check-icoon wanneer isEditing', () => {
    const { container } = render(
      <HeroEditToggle isEditing={true} onToggle={() => {}} />,
    )
    const button = container.querySelector('button')
    expect(button?.getAttribute('aria-label')).toBe('Bewerken stoppen')
  })

  it('roept onToggle bij klik', () => {
    const onToggle = vi.fn()
    render(<HeroEditToggle isEditing={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalled()
  })
})

describe('HeroWidgetRail — default content', () => {
  it('toont defaultContent wanneer geen config en niet isEditing', () => {
    render(
      <HeroWidgetRail
        config={[null, null, null, null]}
        isEditing={false}
        onSlotChange={() => {}}
        onReset={() => {}}
        dashboardData={mockData}
        defaultContent={<div data-testid="default">Default content</div>}
      />,
    )
    expect(screen.getByTestId('default')).toBeTruthy()
  })

  it('toont slot-grid bij isEditing (ook met lege config)', () => {
    render(
      <HeroWidgetRail
        config={[null, null, null, null]}
        isEditing={true}
        onSlotChange={() => {}}
        onReset={() => {}}
        dashboardData={mockData}
        defaultContent={<div data-testid="default">Default</div>}
      />,
    )
    expect(screen.queryByTestId('default')).toBeNull()
    expect(screen.getByText('Slot 1')).toBeTruthy()
    expect(screen.getByText('Slot 2')).toBeTruthy()
    expect(screen.getByText('Slot 3')).toBeTruthy()
    expect(screen.getByText('Slot 4')).toBeTruthy()
  })

  it('toont slot-grid bij gevulde config (zelfs zonder edit-mode)', () => {
    render(
      <HeroWidgetRail
        config={['doelen', null, null, null]}
        isEditing={false}
        onSlotChange={() => {}}
        onReset={() => {}}
        dashboardData={mockData}
        defaultContent={<div data-testid="default">Default</div>}
      />,
    )
    expect(screen.queryByTestId('default')).toBeNull()
    expect(screen.getByTestId('widget-doelen')).toBeTruthy()
  })
})

describe('HeroWidgetRail — slot-bewerking', () => {
  it('rendert select per slot in edit-mode', () => {
    render(
      <HeroWidgetRail
        config={[null, null, null, null]}
        isEditing={true}
        onSlotChange={() => {}}
        onReset={() => {}}
        dashboardData={mockData}
        defaultContent={<div>Default</div>}
      />,
    )
    const selects = screen.getAllByRole('combobox')
    expect(selects.length).toBe(4)
  })

  it('roept onSlotChange met widget-id bij selectie', () => {
    const onSlotChange = vi.fn()
    render(
      <HeroWidgetRail
        config={[null, null, null, null]}
        isEditing={true}
        onSlotChange={onSlotChange}
        onReset={() => {}}
        dashboardData={mockData}
        defaultContent={<div>Default</div>}
      />,
    )
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0]!, { target: { value: 'doelen' } })
    expect(onSlotChange).toHaveBeenCalledWith(0, 'doelen')
  })

  it('roept onSlotChange met null bij "— Leeg —" selectie', () => {
    const onSlotChange = vi.fn()
    render(
      <HeroWidgetRail
        config={['doelen', null, null, null]}
        isEditing={true}
        onSlotChange={onSlotChange}
        onReset={() => {}}
        dashboardData={mockData}
        defaultContent={<div>Default</div>}
      />,
    )
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0]!, { target: { value: '' } })
    expect(onSlotChange).toHaveBeenCalledWith(0, null)
  })

  it('reset-knop in edit-mode roept onReset', () => {
    const onReset = vi.fn()
    render(
      <HeroWidgetRail
        config={['doelen', null, null, null]}
        isEditing={true}
        onSlotChange={() => {}}
        onReset={onReset}
        dashboardData={mockData}
        defaultContent={<div>Default</div>}
      />,
    )
    fireEvent.click(screen.getByText('Reset slots'))
    expect(onReset).toHaveBeenCalled()
  })
})

describe('HeroWidgetRail — view-mode rendering', () => {
  it('rendert "Leeg" placeholder voor unconfigured slot in view-mode-met-config', () => {
    render(
      <HeroWidgetRail
        config={['doelen', null, null, null]}
        isEditing={false}
        onSlotChange={() => {}}
        onReset={() => {}}
        dashboardData={mockData}
        defaultContent={<div>Default</div>}
      />,
    )
    // Drie slots leeg → 3 "Leeg"-placeholders
    expect(screen.getAllByText('Leeg').length).toBe(3)
  })

  it('rendert WidgetRenderer voor gevulde slot in view-mode', () => {
    render(
      <HeroWidgetRail
        config={['doelen', 'acties', null, null]}
        isEditing={false}
        onSlotChange={() => {}}
        onReset={() => {}}
        dashboardData={mockData}
        defaultContent={<div>Default</div>}
      />,
    )
    expect(screen.getByTestId('widget-doelen')).toBeTruthy()
    expect(screen.getByTestId('widget-acties')).toBeTruthy()
  })
})
