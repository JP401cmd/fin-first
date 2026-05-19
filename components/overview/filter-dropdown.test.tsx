import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterDropdown, type FilterItem } from './filter-dropdown'

/**
 * Tests voor FilterDropdown — gedeelde generic dropdown. Beide
 * wrapper-componenten (schulden/bezittingen) hebben eigen tests; deze
 * suite verifieert het basis-gedrag los van de wrappers.
 */

type TestKey = 'foo' | 'bar' | 'baz'

const ITEMS: FilterItem<TestKey>[] = [
  { key: 'foo', label: 'Foo-item' },
  { key: 'bar', label: 'Bar-item' },
  { key: 'baz', label: 'Baz-item' },
]

const mockOnSelect = vi.fn()

beforeEach(() => {
  mockOnSelect.mockReset()
})

describe('FilterDropdown', () => {
  it('toont allLabel als trigger-tekst wanneer activeKey null is', () => {
    render(
      <FilterDropdown<TestKey>
        items={ITEMS}
        activeKey={null}
        allLabel="Alle items"
        onSelect={mockOnSelect}
      />,
    )
    expect(screen.getByText('Alle items')).toBeTruthy()
  })

  it('toont active-item label wanneer activeKey gezet is', () => {
    render(
      <FilterDropdown<TestKey>
        items={ITEMS}
        activeKey="bar"
        allLabel="Alle"
        onSelect={mockOnSelect}
      />,
    )
    expect(screen.getByText('Bar-item')).toBeTruthy()
  })

  it('opent dropdown bij klik', () => {
    render(
      <FilterDropdown<TestKey>
        items={ITEMS}
        activeKey={null}
        allLabel="Alle"
        onSelect={mockOnSelect}
      />,
    )
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.click(screen.getByText('Alle'))
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('roept onSelect met key bij item-selectie', () => {
    render(
      <FilterDropdown<TestKey>
        items={ITEMS}
        activeKey={null}
        allLabel="Alle"
        onSelect={mockOnSelect}
      />,
    )
    fireEvent.click(screen.getByText('Alle'))
    fireEvent.click(screen.getByText('Foo-item'))
    expect(mockOnSelect).toHaveBeenCalledWith('foo')
  })

  it('roept onSelect met null bij "Alle"-keuze', () => {
    render(
      <FilterDropdown<TestKey>
        items={ITEMS}
        activeKey="bar"
        allLabel="Alle"
        onSelect={mockOnSelect}
      />,
    )
    fireEvent.click(screen.getByText('Bar-item'))
    const allOptions = screen.getAllByRole('option')
    fireEvent.click(allOptions[0]!) // "Alle"
    expect(mockOnSelect).toHaveBeenCalledWith(null)
  })

  it('sluit dropdown na selectie', () => {
    render(
      <FilterDropdown<TestKey>
        items={ITEMS}
        activeKey={null}
        allLabel="Alle"
        onSelect={mockOnSelect}
      />,
    )
    fireEvent.click(screen.getByText('Alle'))
    expect(screen.getByRole('listbox')).toBeTruthy()
    fireEvent.click(screen.getByText('Foo-item'))
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('respecteert minWidth-prop', () => {
    const { container } = render(
      <FilterDropdown<TestKey>
        items={ITEMS}
        activeKey={null}
        allLabel="Alle"
        onSelect={mockOnSelect}
        minWidth="320px"
      />,
    )
    fireEvent.click(screen.getByText('Alle'))
    const listbox = container.querySelector('[role="listbox"]') as HTMLElement
    expect(listbox?.style.minWidth).toBe('320px')
  })

  it('default minWidth = 220px', () => {
    const { container } = render(
      <FilterDropdown<TestKey>
        items={ITEMS}
        activeKey={null}
        allLabel="Alle"
        onSelect={mockOnSelect}
      />,
    )
    fireEvent.click(screen.getByText('Alle'))
    const listbox = container.querySelector('[role="listbox"]') as HTMLElement
    expect(listbox?.style.minWidth).toBe('220px')
  })

  it('aria-selected reflecteert active-state', () => {
    render(
      <FilterDropdown<TestKey>
        items={ITEMS}
        activeKey="foo"
        allLabel="Alle"
        onSelect={mockOnSelect}
      />,
    )
    fireEvent.click(screen.getByText('Foo-item'))
    const options = screen.getAllByRole('option')
    // 'Alle' = false, 'Foo-item' = true, 'Bar' = false, 'Baz' = false
    expect(options[0]?.getAttribute('aria-selected')).toBe('false')
    expect(options[1]?.getAttribute('aria-selected')).toBe('true')
    expect(options[2]?.getAttribute('aria-selected')).toBe('false')
  })
})
