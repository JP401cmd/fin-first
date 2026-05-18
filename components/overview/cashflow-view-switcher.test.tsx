import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CashflowViewSwitcher } from './cashflow-view-switcher'

/**
 * Tests voor CashflowViewSwitcher met mocked next/navigation hooks.
 * Verifieert view-state-switching tussen budget / transacties / vaste-lasten
 * via URL-param ?view= en correcte render van child-props.
 */

const mockReplace = vi.fn()
const mockSearchParams = new Map<string, string>()

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key) ?? null,
    toString: () =>
      Array.from(mockSearchParams.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('&'),
  }),
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/overzicht/cashflow',
}))

function renderSwitcher() {
  return render(
    <CashflowViewSwitcher
      budgetView={<div data-testid="budget-view">BUDGET</div>}
      transactiesView={<div data-testid="transacties-view">TRANSACTIES</div>}
      vasteLastenView={<div data-testid="vaste-lasten-view">VASTE LASTEN</div>}
    />,
  )
}

describe('CashflowViewSwitcher', () => {
  beforeEach(() => {
    mockReplace.mockClear()
    mockSearchParams.clear()
  })

  it('rendert alle 3 segment-buttons', () => {
    renderSwitcher()
    expect(screen.getByText('Budget')).toBeTruthy()
    expect(screen.getByText('Transacties')).toBeTruthy()
    expect(screen.getByText('Vaste lasten')).toBeTruthy()
  })

  it('default toont budget-view (geen ?view=)', () => {
    renderSwitcher()
    expect(screen.getByTestId('budget-view')).toBeTruthy()
    expect(screen.queryByTestId('transacties-view')).toBeNull()
    expect(screen.queryByTestId('vaste-lasten-view')).toBeNull()
  })

  it('toont transacties-view bij ?view=transacties', () => {
    mockSearchParams.set('view', 'transacties')
    renderSwitcher()
    expect(screen.getByTestId('transacties-view')).toBeTruthy()
    expect(screen.queryByTestId('budget-view')).toBeNull()
  })

  it('toont vaste-lasten-view bij ?view=vaste-lasten', () => {
    mockSearchParams.set('view', 'vaste-lasten')
    renderSwitcher()
    expect(screen.getByTestId('vaste-lasten-view')).toBeTruthy()
    expect(screen.queryByTestId('budget-view')).toBeNull()
  })

  it('onbekende ?view= valt terug op budget (graceful)', () => {
    mockSearchParams.set('view', 'invalid-view')
    renderSwitcher()
    expect(screen.getByTestId('budget-view')).toBeTruthy()
  })

  it('klik op Transacties roept router.replace met ?view=transacties', () => {
    renderSwitcher()
    fireEvent.click(screen.getByText('Transacties'))
    expect(mockReplace).toHaveBeenCalledWith(
      '/overzicht/cashflow?view=transacties',
      expect.objectContaining({ scroll: false }),
    )
  })

  it('klik op Budget verwijdert ?view (canonieke URL)', () => {
    mockSearchParams.set('view', 'transacties')
    renderSwitcher()
    fireEvent.click(screen.getByText('Budget'))
    expect(mockReplace).toHaveBeenCalledWith(
      '/overzicht/cashflow',
      expect.objectContaining({ scroll: false }),
    )
  })

  it('aria-pressed correct per button-state', () => {
    mockSearchParams.set('view', 'vaste-lasten')
    const { container } = renderSwitcher()
    const buttons = container.querySelectorAll('button')
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('false') // Budget
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('false') // Transacties
    expect(buttons[2]?.getAttribute('aria-pressed')).toBe('true')  // Vaste lasten
  })

  it('nav heeft aria-label', () => {
    const { container } = renderSwitcher()
    const nav = container.querySelector('nav')
    expect(nav?.getAttribute('aria-label')).toBe('Cashflow-view')
  })
})
